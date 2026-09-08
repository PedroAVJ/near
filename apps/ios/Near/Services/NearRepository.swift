import Foundation

protocol NearRepository: Sendable {
    func restoreSession() async throws -> NearProfile?
    func authenticate(_ authorization: AppleAuthorization) async throws -> NearProfile
    func signOut() async throws
    func fetchOwnFiles() async throws -> [NearFileSummary]
    func fetchOwnFile(path: String) async throws -> NearFile
    func saveFile(existing: NearFile?, title: String, body: String, visibility: EntryVisibility) async throws -> SavedNearFile
    func deleteFile(_ file: NearFile) async throws
    func fetchPeople() async throws -> [NearProfile]
    func fetchPublicFiles(profileID: String) async throws -> [NearFileSummary]
    func fetchPublicFile(profileID: String, path: String) async throws -> NearFile
    func ask(question: String, scope: QuestionScope) async throws -> NearAnswer
}

actor DemoNearRepository: NearRepository {
    private let ownProfile = NearProfile(id: "alex", displayName: "Alex", publicSummary: nil)
    private let samProfile = NearProfile(id: "sam", displayName: "Sam", publicSummary: "Public notes shared by Sam.")
    private var signedIn = true
    private var files: [String: NearFile]

    init() {
        let commit = "5023298bf0a6cb586714961f4f656fb08d6ca04c"
        let privatePath = "context/how-i-like-plans.md"
        let publicPath = "public/mobile/2026/08/demo-public-note.md"
        files = [
            privatePath: NearFile(
                path: privatePath,
                name: "how-i-like-plans.md",
                sha: "demo-private",
                size: 118,
                visibility: .confidential,
                editable: false,
                repositoryCommit: commit,
                content: "# How I like plans\n\nStart with the answer. Keep unknowns visible. Give me the exact next action when something is blocked."
            ),
            publicPath: NearFile(
                path: publicPath,
                name: "demo-public-note.md",
                sha: "demo-public",
                size: 94,
                visibility: .publicArea,
                editable: true,
                repositoryCommit: commit,
                content: "---\nnear_id: \"1ac2c657-37d8-46f7-938c-81fe713dc011\"\nsubject: \"alex\"\nvisibility: public\ncontributor_class: subject\ncontributed_at: \"2026-08-23T18:00:00Z\"\nupdated_at: \"2026-08-23T18:00:00Z\"\n---\n\n# What helps me use an app\n\nOne clear action at a time."
            ),
        ]
    }

    func restoreSession() async throws -> NearProfile? { signedIn ? ownProfile : nil }

    func authenticate(_ authorization: AppleAuthorization) async throws -> NearProfile {
        _ = authorization
        signedIn = true
        return ownProfile
    }

    func signOut() async throws { signedIn = false }

    func fetchOwnFiles() async throws -> [NearFileSummary] {
        files.values.map(\.summary).sorted { $0.path < $1.path }
    }

    func fetchOwnFile(path: String) async throws -> NearFile {
        guard let file = files[path] else { throw NearClientError.server("That file no longer exists.") }
        return file
    }

    func saveFile(existing: NearFile?, title: String, body: String, visibility: EntryVisibility) async throws -> SavedNearFile {
        let parsed = existing.map { NearRecordParser.editorContent(from: $0.content) }
        let id = parsed?.recordID ?? UUID().uuidString.lowercased()
        let root = visibility == .publicArea ? "public/mobile" : "confidential/mobile"
        let slug = title.lowercased().replacingOccurrences(of: " ", with: "-")
        let path = "\(root)/2026/08/23/\(id)-\(slug).md"
        if let existing { files.removeValue(forKey: existing.path) }
        let content = "---\nnear_id: \"\(id)\"\nsubject: \"alex\"\nvisibility: \(visibility.rawValue)\ncontributor_class: subject\ncontributed_at: \"2026-08-23T18:00:00Z\"\nupdated_at: \"2026-08-23T18:00:00Z\"\n---\n\n# \(title)\n\n\(body)\n"
        files[path] = NearFile(
            path: path,
            name: String(path.split(separator: "/").last ?? "note.md"),
            sha: "demo-saved",
            size: content.utf8.count,
            visibility: visibility,
            editable: true,
            repositoryCommit: "demo-commit",
            content: content
        )
        return SavedNearFile(id: id, path: path, visibility: visibility, commit: "demo-commit")
    }

    func deleteFile(_ file: NearFile) async throws { files.removeValue(forKey: file.path) }

    func fetchPeople() async throws -> [NearProfile] { [samProfile] }

    func fetchPublicFiles(profileID: String) async throws -> [NearFileSummary] {
        if profileID == ownProfile.id { return files.values.filter { $0.visibility == .publicArea }.map(\.summary) }
        return [
            NearFileSummary(
                path: "public/mobile/what-helps-me-learn.md",
                name: "what-helps-me-learn.md",
                sha: "demo-sam-public",
                size: 102,
                visibility: .publicArea,
                editable: false,
                repositoryCommit: "demo-sam-commit"
            ),
        ]
    }

    func fetchPublicFile(profileID: String, path: String) async throws -> NearFile {
        if profileID == ownProfile.id { return try await fetchOwnFile(path: path) }
        return NearFile(
            path: path,
            name: "what-helps-me-learn.md",
            sha: "demo-sam-public",
            size: 102,
            visibility: .publicArea,
            editable: false,
            repositoryCommit: "demo-sam-commit",
            content: "# What helps me learn an app\n\nShow one clear action at a time and use familiar words."
        )
    }

    func ask(question: String, scope: QuestionScope) async throws -> NearAnswer {
        _ = question
        let citation: NearCitation
        let tenantID: String
        let scopeName: String
        switch scope {
        case .mine:
            citation = NearCitation(path: "context/how-i-like-plans.md", commit: "5023298b")
            tenantID = ownProfile.id
            scopeName = "private"
        case .publicProfile(let profile):
            citation = NearCitation(path: "public/mobile/what-helps-me-learn.md", commit: "demo-other-commit")
            tenantID = profile.id
            scopeName = "public"
        }
        return NearAnswer(
            text: "The available record favors one clear action at a time, with uncertainty kept visible.",
            citations: [citation],
            provider: "claude-agent-sdk",
            scope: scopeName,
            tenantId: tenantID
        )
    }
}
