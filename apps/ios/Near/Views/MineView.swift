import SwiftUI

struct MineView: View {
    @EnvironmentObject private var model: NearAppModel
    @State private var search = ""
    @State private var presentsEditor = false

    private var visibleFiles: [NearFileSummary] {
        guard !search.isEmpty else { return model.files }
        return model.files.filter { $0.path.localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if visibleFiles.isEmpty {
                    ContentUnavailableView(
                        search.isEmpty ? "No Git files" : "No matching files",
                        systemImage: "doc.text.magnifyingglass",
                        description: Text(search.isEmpty ? "Create a confidential note to make the first mobile commit." : "Try another path or filename.")
                    )
                } else {
                    List(visibleFiles) { file in
                        NavigationLink(value: file) {
                            NearFileRow(file: file)
                        }
                        .listRowBackground(NearTheme.bone)
                        .listRowSeparatorTint(NearTheme.line)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(NearTheme.bone)
            .navigationTitle("Files")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, prompt: "Find a Git path")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        presentsEditor = true
                    } label: {
                        Image(systemName: "square.and.pencil")
                    }
                    .tint(NearTheme.signal)
                    .accessibilityLabel("New confidential file")
                }
            }
            .refreshable { await model.refresh() }
            .navigationDestination(for: NearFileSummary.self) { summary in
                OwnedFileLoaderView(summary: summary)
            }
            .sheet(isPresented: $presentsEditor) {
                EntryEditorView(existing: nil)
            }
        }
    }
}

struct NearFileRow: View {
    let file: NearFileSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text(file.name)
                    .font(.system(size: 15, weight: .medium))
                    .lineLimit(1)
                Spacer(minLength: 10)
                VisibilityMark(visibility: file.visibility)
            }
            Text(file.path)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(NearTheme.inkMuted)
                .lineLimit(2)
            Text("blob \(String(file.sha.prefix(8)))  ·  repo \(String(file.repositoryCommit.prefix(8)))")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(NearTheme.inkMuted)
        }
        .padding(.vertical, 7)
    }
}

private struct OwnedFileLoaderView: View {
    @EnvironmentObject private var model: NearAppModel
    let summary: NearFileSummary
    @State private var file: NearFile?
    @State private var error: String?

    var body: some View {
        Group {
            if let file {
                NearFileDetailView(file: file, isPublicRead: false)
            } else if let error {
                ContentUnavailableView("Could not open file", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                ProgressView("Reading Git blob…")
            }
        }
        .nearPage()
        .task(id: summary.sha) {
            do {
                file = try await model.file(for: summary)
            } catch {
                self.error = error.localizedDescription
                model.show(error)
            }
        }
    }
}

struct NearFileDetailView: View {
    let file: NearFile
    let isPublicRead: Bool
    @State private var presentsEditor = false

    private var parsed: NearEditorContent { NearRecordParser.editorContent(from: file.content) }

    private var renderedContent: AttributedString {
        let source = parsed.title.isEmpty ? file.content : parsed.body
        return (try? AttributedString(markdown: source)) ?? AttributedString(source)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    NearStructuralLabel(isPublicRead ? "Public Git file" : "Canonical Git file")
                    Text(parsed.title.isEmpty ? file.name : parsed.title)
                        .font(.system(size: 28, weight: .light))
                        .tracking(-0.4)
                    Text(file.path)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(NearTheme.inkMuted)
                        .textSelection(.enabled)
                }

                NearCard {
                    Text(renderedContent)
                        .font(.system(size: 16, design: .serif))
                        .foregroundStyle(NearTheme.inkSecondary)
                        .lineSpacing(5)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                VStack(alignment: .leading, spacing: 7) {
                    NearStructuralLabel("Provenance")
                    MetadataLine(label: "Visibility", value: file.visibility.title)
                    MetadataLine(label: "Blob", value: file.sha)
                    MetadataLine(label: "Repository commit", value: file.repositoryCommit)
                }
            }
            .padding(20)
        }
        .background(NearTheme.bone)
        .navigationTitle(file.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if file.editable && !isPublicRead {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Edit") { presentsEditor = true }
                        .tint(NearTheme.signal)
                }
            }
        }
        .sheet(isPresented: $presentsEditor) {
            EntryEditorView(existing: file)
        }
    }
}

private struct MetadataLine: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(NearTheme.inkMuted)
                .frame(width: 108, alignment: .leading)
            Text(value)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(NearTheme.inkSecondary)
                .textSelection(.enabled)
        }
    }
}
