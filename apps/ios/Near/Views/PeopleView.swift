import SwiftUI

struct PeopleView: View {
    @EnvironmentObject private var model: NearAppModel

    var body: some View {
        NavigationStack {
            Group {
                if model.people.isEmpty {
                    ContentUnavailableView(
                        "No other Near profiles",
                        systemImage: "person.2.slash",
                        description: Text("People appear after their private repository is configured.")
                    )
                } else {
                    List(model.people) { person in
                        NavigationLink {
                            PublicPersonView(profile: person)
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(person.displayName)
                                    .font(.system(size: 16, weight: .medium))
                                Text(person.publicSummary ?? "Explicitly published Git files only.")
                                    .font(.system(size: 12))
                                    .foregroundStyle(NearTheme.inkMuted)
                                Label("public/ only", systemImage: "lock.open")
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundStyle(NearTheme.slate)
                            }
                            .padding(.vertical, 7)
                        }
                        .listRowBackground(NearTheme.bone)
                        .listRowSeparatorTint(NearTheme.line)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(NearTheme.bone)
            .navigationTitle("People")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct PublicPersonView: View {
    @EnvironmentObject private var model: NearAppModel
    let profile: NearProfile
    @State private var files: [NearFileSummary] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Reading public/…")
            } else if let error {
                ContentUnavailableView("Public Near unavailable", systemImage: "exclamationmark.triangle", description: Text(error))
            } else if files.isEmpty {
                ContentUnavailableView(
                    "Nothing published",
                    systemImage: "lock",
                    description: Text("Near will not substitute confidential files when public/ is empty.")
                )
            } else {
                List(files) { file in
                    NavigationLink {
                        PublicFileLoaderView(profile: profile, summary: file)
                    } label: {
                        NearFileRow(file: file)
                    }
                    .listRowBackground(NearTheme.bone)
                    .listRowSeparatorTint(NearTheme.line)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .nearPage()
        .navigationTitle(profile.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            files = try await model.publicFiles(for: profile)
        } catch {
            self.error = error.localizedDescription
            model.show(error)
        }
        isLoading = false
    }
}

private struct PublicFileLoaderView: View {
    @EnvironmentObject private var model: NearAppModel
    let profile: NearProfile
    let summary: NearFileSummary
    @State private var file: NearFile?
    @State private var error: String?

    var body: some View {
        Group {
            if let file {
                NearFileDetailView(file: file, isPublicRead: true)
            } else if let error {
                ContentUnavailableView("Could not open file", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                ProgressView("Reading public Git blob…")
            }
        }
        .nearPage()
        .task(id: summary.sha) {
            do {
                file = try await model.publicFile(for: summary, profile: profile)
            } catch {
                self.error = error.localizedDescription
                model.show(error)
            }
        }
    }
}
