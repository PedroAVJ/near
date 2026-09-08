import AppIntents
import Foundation

struct PublicNearPerson: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Near person")
    static let defaultQuery = PublicNearPersonQuery()

    let id: String
    let name: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

struct PublicNearPersonQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [PublicNearPerson] {
        try await suggestedEntities().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [PublicNearPerson] {
        let repository = GatewayNearRepository()
        guard try await repository.restoreSession() != nil else { return [] }
        return try await repository.fetchPeople().map {
            PublicNearPerson(id: $0.id, name: $0.displayName)
        }
    }
}

struct AskPublicNearIntent: AppIntent {
    static let title: LocalizedStringResource = "Ask a public Near"
    static let description = IntentDescription("Answers only from the selected person's explicitly public Git files.")
    static let openAppWhenRun = false

    @Parameter(title: "Person")
    var person: PublicNearPerson

    @Parameter(title: "Question")
    var question: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let repository = GatewayNearRepository()
        guard try await repository.restoreSession() != nil else {
            throw IntentFailure(message: "Open Near and sign in first.")
        }
        let people = try await repository.fetchPeople()
        guard let profile = people.first(where: { $0.id == person.id }) else {
            throw IntentFailure(message: "That person's public Near is not available from this account.")
        }
        let answer = try await repository.ask(question: question, scope: .publicProfile(profile))
        let citations = answer.citations.prefix(3).map(\.path).joined(separator: ", ")
        let suffix = citations.isEmpty ? "" : " Sources: \(citations)."
        return .result(dialog: IntentDialog(stringLiteral: answer.text + suffix))
    }
}

struct NearAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AskPublicNearIntent(),
            phrases: [
                "Ask \(.applicationName) about a public Near",
                "Ask a public person in \(.applicationName)",
            ],
            shortTitle: "Ask public Near",
            systemImageName: "text.bubble"
        )
    }
}

private struct IntentFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}
