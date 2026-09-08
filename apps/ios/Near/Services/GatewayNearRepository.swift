import Foundation

actor GatewayNearRepository: NearRepository {
    private let baseURL: URL
    private let sessionStore: NearSessionStore
    private let urlSession: URLSession
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var accessToken: String?

    init(
        baseURL: URL? = nil,
        sessionStore: NearSessionStore = NearSessionStore(),
        urlSession: URLSession = .shared
    ) {
        if let baseURL {
            self.baseURL = baseURL
        } else if
            let rawValue = Bundle.main.object(forInfoDictionaryKey: "NearGatewayURL") as? String,
            let configuredURL = URL(string: rawValue),
            configuredURL.scheme == "https"
        {
            self.baseURL = configuredURL
        } else {
            self.baseURL = URL(string: "https://near-ios-gateway-234815354718.us-central1.run.app")!
        }
        self.sessionStore = sessionStore
        self.urlSession = urlSession
    }

    func restoreSession() async throws -> NearProfile? {
        accessToken = try sessionStore.load()
        guard accessToken != nil else { return nil }
        do {
            let response: ProfileResponse = try await send(method: "GET", path: "/v1/me")
            return response.profile
        } catch let error as HTTPError where error.status == 401 {
            try sessionStore.delete()
            accessToken = nil
            return nil
        }
    }

    func authenticate(_ authorization: AppleAuthorization) async throws -> NearProfile {
        let request = AppleAuthRequest(
            identityToken: authorization.identityToken,
            nonce: authorization.nonce,
            invitationCode: authorization.invitationCode,
            claimTenantId: authorization.claimTenantID
        )
        let response: AuthResponse = try await send(method: "POST", path: "/v1/auth/apple", body: request, authenticated: false)
        try sessionStore.save(response.accessToken)
        accessToken = response.accessToken
        return response.profile
    }

    func signOut() async throws {
        try sessionStore.delete()
        accessToken = nil
    }

    func fetchOwnFiles() async throws -> [NearFileSummary] {
        let response: FilesResponse = try await send(method: "GET", path: "/v1/files")
        return response.files
    }

    func fetchOwnFile(path: String) async throws -> NearFile {
        let response: FileResponse = try await send(
            method: "POST",
            path: "/v1/file/read",
            body: ReadFileRequest(path: path)
        )
        return response.file
    }

    func saveFile(existing: NearFile?, title: String, body: String, visibility: EntryVisibility) async throws -> SavedNearFile {
        let parsed = existing.map { NearRecordParser.editorContent(from: $0.content) }
        if existing != nil, parsed?.recordID == nil {
            throw NearClientError.server("That file is read-only because it has no mobile record id.")
        }
        let request = SaveFileRequest(
            path: existing?.path,
            id: parsed?.recordID,
            sha: existing?.sha,
            title: title,
            body: body,
            visibility: visibility
        )
        let response: SavedFileResponse = try await send(
            method: existing == nil ? "POST" : "PUT",
            path: "/v1/files",
            body: request
        )
        return response.file
    }

    func deleteFile(_ file: NearFile) async throws {
        guard let id = NearRecordParser.editorContent(from: file.content).recordID else {
            throw NearClientError.server("That file is read-only.")
        }
        let _: DeleteResponse = try await send(
            method: "DELETE",
            path: "/v1/files",
            body: DeleteFileRequest(path: file.path, id: id, sha: file.sha)
        )
    }

    func fetchPeople() async throws -> [NearProfile] {
        let response: PeopleResponse = try await send(method: "GET", path: "/v1/people")
        return response.people
    }

    func fetchPublicFiles(profileID: String) async throws -> [NearFileSummary] {
        let response: FilesResponse = try await send(
            method: "POST",
            path: "/v1/public/files",
            body: PublicFilesRequest(tenantId: profileID)
        )
        return response.files
    }

    func fetchPublicFile(profileID: String, path: String) async throws -> NearFile {
        let response: FileResponse = try await send(
            method: "POST",
            path: "/v1/public/file",
            body: PublicFileRequest(tenantId: profileID, path: path)
        )
        return response.file
    }

    func ask(question: String, scope: QuestionScope) async throws -> NearAnswer {
        let scopeRequest: AskScope
        switch scope {
        case .mine:
            scopeRequest = AskScope(type: "own", tenantId: nil)
        case .publicProfile(let profile):
            scopeRequest = AskScope(type: "public", tenantId: profile.id)
        }
        let response: AnswerResponse = try await send(
            method: "POST",
            path: "/v1/ask",
            body: AskRequest(question: question, scope: scopeRequest)
        )
        return response.answer
    }

    private func send<Response: Decodable>(
        method: String,
        path: String,
        authenticated: Bool = true
    ) async throws -> Response {
        try await sendData(method: method, path: path, body: nil, authenticated: authenticated)
    }

    private func send<Response: Decodable, Body: Encodable>(
        method: String,
        path: String,
        body: Body,
        authenticated: Bool = true
    ) async throws -> Response {
        try await sendData(
            method: method,
            path: path,
            body: try encoder.encode(body),
            authenticated: authenticated
        )
    }

    private func sendData<Response: Decodable>(
        method: String,
        path: String,
        body: Data?,
        authenticated: Bool
    ) async throws -> Response {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw NearClientError.invalidConfiguration
        }
        components.path = path
        guard let url = components.url else { throw NearClientError.invalidConfiguration }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 90
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authenticated {
            guard let accessToken else { throw NearClientError.signedOut }
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else { throw NearClientError.invalidResponse }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let message = (try? decoder.decode(ErrorResponse.self, from: data).error.message) ?? "Near could not complete that request."
            throw HTTPError(status: httpResponse.statusCode, message: message)
        }
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw NearClientError.invalidResponse
        }
    }
}

private struct HTTPError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

private struct AppleAuthRequest: Encodable {
    let identityToken: String
    let nonce: String
    let invitationCode: String?
    let claimTenantId: String?
}

private struct AuthResponse: Decodable {
    let accessToken: String
    let profile: NearProfile
}

private struct ProfileResponse: Decodable { let profile: NearProfile }
private struct FilesResponse: Decodable { let files: [NearFileSummary] }
private struct FileResponse: Decodable { let file: NearFile }
private struct SavedFileResponse: Decodable { let file: SavedNearFile }
private struct PeopleResponse: Decodable { let people: [NearProfile] }
private struct AnswerResponse: Decodable { let answer: NearAnswer }
private struct DeleteResponse: Decodable { let commit: String }

private struct SaveFileRequest: Encodable {
    let path: String?
    let id: String?
    let sha: String?
    let title: String
    let body: String
    let visibility: EntryVisibility
}

private struct DeleteFileRequest: Encodable {
    let path: String
    let id: String
    let sha: String
}

private struct ReadFileRequest: Encodable {
    let path: String
}

private struct PublicFilesRequest: Encodable {
    let tenantId: String
}

private struct PublicFileRequest: Encodable {
    let tenantId: String
    let path: String
}

private struct AskRequest: Encodable {
    let question: String
    let scope: AskScope
}

private struct AskScope: Encodable {
    let type: String
    let tenantId: String?
}

private struct ErrorResponse: Decodable {
    struct Payload: Decodable {
        let code: String
        let message: String
    }
    let error: Payload
}
