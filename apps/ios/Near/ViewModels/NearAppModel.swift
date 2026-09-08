import Foundation

@MainActor
final class NearAppModel: ObservableObject {
    enum Phase: Equatable {
        case loading
        case signedOut
        case ready
        case failed(String)
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var profile: NearProfile?
    @Published private(set) var people: [NearProfile] = []
    @Published private(set) var files: [NearFileSummary] = []
    @Published private(set) var isWorking = false
    @Published var notice: String?

    private let repository: any NearRepository

    init(repository: any NearRepository) {
        self.repository = repository
    }

    func bootstrap() async {
        phase = .loading
        do {
            guard let restoredProfile = try await repository.restoreSession() else {
                phase = .signedOut
                return
            }
            profile = restoredProfile
            try await reload()
            phase = .ready
        } catch {
            phase = .failed(userMessage(for: error))
        }
    }

    func authenticate(
        identityToken: String,
        nonce: String,
        invitationCode: String? = nil,
        claimTenantID: String? = nil
    ) async {
        isWorking = true
        defer { isWorking = false }
        do {
            let authorization = AppleAuthorization(
                identityToken: identityToken,
                nonce: nonce,
                invitationCode: invitationCode?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                claimTenantID: claimTenantID?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            )
            profile = try await repository.authenticate(authorization)
            try await reload()
            phase = .ready
        } catch {
            notice = userMessage(for: error)
        }
    }

    func refresh() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await reload()
        } catch {
            notice = userMessage(for: error)
        }
    }

    func file(for summary: NearFileSummary) async throws -> NearFile {
        try await repository.fetchOwnFile(path: summary.path)
    }

    func publicFiles(for profile: NearProfile) async throws -> [NearFileSummary] {
        try await repository.fetchPublicFiles(profileID: profile.id)
    }

    func publicFile(for summary: NearFileSummary, profile: NearProfile) async throws -> NearFile {
        try await repository.fetchPublicFile(profileID: profile.id, path: summary.path)
    }

    func saveFile(
        existing: NearFile?,
        title: String,
        body: String,
        visibility: EntryVisibility
    ) async -> Bool {
        isWorking = true
        defer { isWorking = false }
        do {
            let saved = try await repository.saveFile(
                existing: existing,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                body: body.trimmingCharacters(in: .whitespacesAndNewlines),
                visibility: visibility
            )
            try await reload()
            notice = "Committed \(saved.path) at \(String(saved.commit.prefix(8)))."
            return true
        } catch {
            notice = userMessage(for: error)
            return false
        }
    }

    func deleteFile(_ file: NearFile) async -> Bool {
        isWorking = true
        defer { isWorking = false }
        do {
            try await repository.deleteFile(file)
            try await reload()
            notice = "Deleted in Git. Earlier versions remain in history."
            return true
        } catch {
            notice = userMessage(for: error)
            return false
        }
    }

    func ask(_ question: String, scope: QuestionScope) async -> NearAnswer? {
        isWorking = true
        defer { isWorking = false }
        do {
            return try await repository.ask(question: question, scope: scope)
        } catch {
            notice = userMessage(for: error)
            return nil
        }
    }

    func signOut() async {
        do {
            try await repository.signOut()
            profile = nil
            people = []
            files = []
            phase = .signedOut
        } catch {
            notice = userMessage(for: error)
        }
    }

    func show(_ error: Error) {
        notice = userMessage(for: error)
    }

    private func reload() async throws {
        async let loadedFiles = repository.fetchOwnFiles()
        async let loadedPeople = repository.fetchPeople()
        files = try await loadedFiles
        people = try await loadedPeople
    }

    private func userMessage(for error: Error) -> String {
        if let localized = error as? LocalizedError, let description = localized.errorDescription {
            return description
        }
        return "Near could not complete that action. Try again."
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
