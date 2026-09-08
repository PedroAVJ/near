import Foundation

enum EntryVisibility: String, Codable, CaseIterable, Identifiable, Sendable {
    case confidential
    case publicArea = "public"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .confidential: "Confidential"
        case .publicArea: "Public"
        }
    }

    var explanation: String {
        switch self {
        case .confidential:
            "Hidden from other Near members. The repository custodian and model provider can technically process it."
        case .publicArea:
            "Other Near members and their agents can read the complete file."
        }
    }
}

struct NearProfile: Identifiable, Codable, Hashable, Sendable {
    let id: String
    let displayName: String
    var publicSummary: String?
}

struct NearFileSummary: Identifiable, Codable, Hashable, Sendable {
    var id: String { path }
    let path: String
    let name: String
    let sha: String
    let size: Int
    let visibility: EntryVisibility
    let editable: Bool
    let repositoryCommit: String
}

struct NearFile: Identifiable, Codable, Hashable, Sendable {
    var id: String { path }
    let path: String
    let name: String
    let sha: String
    let size: Int
    let visibility: EntryVisibility
    let editable: Bool
    let repositoryCommit: String
    let content: String

    var summary: NearFileSummary {
        NearFileSummary(
            path: path,
            name: name,
            sha: sha,
            size: size,
            visibility: visibility,
            editable: editable,
            repositoryCommit: repositoryCommit
        )
    }
}

struct SavedNearFile: Codable, Hashable, Sendable {
    let id: String
    let path: String
    let visibility: EntryVisibility
    let commit: String
}

struct NearCitation: Identifiable, Codable, Hashable, Sendable {
    var id: String { "\(commit):\(path)" }
    let path: String
    let commit: String
}

struct NearAnswer: Codable, Hashable, Sendable {
    let text: String
    let citations: [NearCitation]
    let provider: String
    let scope: String
    let tenantId: String
}

enum QuestionScope: Hashable, Sendable {
    case mine
    case publicProfile(NearProfile)

    var label: String {
        switch self {
        case .mine: "My Near"
        case .publicProfile(let profile): profile.displayName
        }
    }

    var isPublicOnly: Bool {
        if case .publicProfile = self { true } else { false }
    }
}

struct AppleAuthorization: Sendable {
    let identityToken: String
    let nonce: String
    let invitationCode: String?
    let claimTenantID: String?
}

struct NearEditorContent: Equatable, Sendable {
    let recordID: String?
    let title: String
    let body: String
}

enum NearRecordParser {
    static func editorContent(from content: String) -> NearEditorContent {
        var remainder = content
        var recordID: String?
        if remainder.hasPrefix("---\n"), let closingRange = remainder.range(of: "\n---\n", range: remainder.index(remainder.startIndex, offsetBy: 4)..<remainder.endIndex) {
            let frontmatter = String(remainder[remainder.index(remainder.startIndex, offsetBy: 4)..<closingRange.lowerBound])
            recordID = frontmatter
                .split(separator: "\n")
                .first(where: { $0.hasPrefix("near_id:") })
                .map { String($0.dropFirst("near_id:".count)).trimmingCharacters(in: .whitespacesAndNewlines.union(CharacterSet(charactersIn: "\""))) }
            remainder = String(remainder[closingRange.upperBound...])
        }
        let lines = remainder.split(separator: "\n", omittingEmptySubsequences: false)
        let titleIndex = lines.firstIndex(where: { $0.hasPrefix("# ") })
        let title = titleIndex.map { String(lines[$0].dropFirst(2)).trimmingCharacters(in: .whitespacesAndNewlines) } ?? ""
        let body: String
        if let titleIndex {
            body = lines.dropFirst(titleIndex + 1).joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            body = remainder.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return NearEditorContent(recordID: recordID, title: title, body: body)
    }
}

enum NearClientError: LocalizedError, Sendable {
    case signedOut
    case invalidConfiguration
    case invalidResponse
    case server(String)
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case .signedOut: "Sign in to continue."
        case .invalidConfiguration: "This Near build is missing its gateway configuration."
        case .invalidResponse: "Near received an unreadable response. Try again."
        case .server(let message): message
        case .keychain: "Near could not securely save this sign-in on the device."
        }
    }
}
