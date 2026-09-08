import SwiftUI

struct EntryEditorView: View {
    @EnvironmentObject private var model: NearAppModel
    @Environment(\.dismiss) private var dismiss
    let existing: NearFile?

    @State private var title: String
    @State private var bodyText: String
    @State private var visibility: EntryVisibility
    @State private var confirmsPublishing = false
    @State private var confirmsDeletion = false

    init(existing: NearFile?) {
        self.existing = existing
        let parsed = existing.map { NearRecordParser.editorContent(from: $0.content) }
        _title = State(initialValue: parsed?.title ?? "")
        _bodyText = State(initialValue: parsed?.body ?? "")
        _visibility = State(initialValue: existing?.visibility ?? .confidential)
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !model.isWorking
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 8) {
                        NearStructuralLabel("Title")
                        TextField("What is this about?", text: $title)
                            .font(.system(size: 20, weight: .regular))
                            .padding(12)
                            .background(NearTheme.card)
                            .overlay { RoundedRectangle(cornerRadius: 2).stroke(NearTheme.lineStrong) }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        NearStructuralLabel("Git file body")
                        TextEditor(text: $bodyText)
                            .font(.system(size: 16))
                            .lineSpacing(4)
                            .scrollContentBackground(.hidden)
                            .padding(8)
                            .frame(minHeight: 240)
                            .background(NearTheme.card)
                            .overlay { RoundedRectangle(cornerRadius: 2).stroke(NearTheme.lineStrong) }
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        NearStructuralLabel("Visibility")
                        ForEach(EntryVisibility.allCases) { option in
                            Button {
                                visibility = option
                            } label: {
                                HStack(alignment: .top, spacing: 12) {
                                    Circle()
                                        .fill(option == .confidential ? NearTheme.moss : NearTheme.slate)
                                        .frame(width: 7, height: 7)
                                        .padding(.top, 6)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(option.title)
                                            .font(.system(size: 14, weight: .medium))
                                        Text(option.explanation)
                                            .font(.system(size: 12))
                                            .foregroundStyle(NearTheme.inkMuted)
                                    }
                                    Spacer()
                                    if visibility == option {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 12, weight: .semibold))
                                    }
                                }
                                .foregroundStyle(NearTheme.ink)
                                .padding(12)
                                .background(visibility == option ? NearTheme.selected : NearTheme.card)
                                .overlay { RoundedRectangle(cornerRadius: 2).stroke(NearTheme.line) }
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    NearCard {
                        VStack(alignment: .leading, spacing: 6) {
                            NearStructuralLabel(visibility == .publicArea ? "Disclosure" : "Custody")
                            Text(visibility == .publicArea
                                 ? "Saving moves this file under public/. Other Near members and their agents may read the complete file."
                                 : "Saving writes an ordinary Markdown file in the private repository. It is not end-to-end encrypted from the repository custodian or Claude.")
                                .font(.system(size: 13))
                                .foregroundStyle(NearTheme.inkSecondary)
                        }
                    }

                    if existing != nil {
                        Button("Delete file", role: .destructive) { confirmsDeletion = true }
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(NearTheme.signal)
                    }
                }
                .padding(20)
            }
            .background(NearTheme.bone)
            .navigationTitle(existing == nil ? "New Git file" : "Edit Git file")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.tint(NearTheme.ink)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Commit") { requestSave() }
                        .fontWeight(.medium)
                        .tint(NearTheme.signal)
                        .disabled(!canSave)
                }
            }
            .interactiveDismissDisabled(model.isWorking)
            .alert("Publish this Git file?", isPresented: $confirmsPublishing) {
                Button("Cancel", role: .cancel) {}
                Button("Publish") { performSave() }
            } message: {
                Text("The complete file will move under public/ and become readable by other Near members and their agents.")
            }
            .alert("Delete this Git file?", isPresented: $confirmsDeletion) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    guard let existing else { return }
                    Task {
                        if await model.deleteFile(existing) { dismiss() }
                    }
                }
            } message: {
                Text("A deletion commit will remove the current file. Earlier versions remain recoverable in Git history.")
            }
        }
    }

    private func requestSave() {
        let newlyPublic = visibility == .publicArea && existing?.visibility != .publicArea
        if newlyPublic { confirmsPublishing = true } else { performSave() }
    }

    private func performSave() {
        Task {
            if await model.saveFile(existing: existing, title: title, body: bodyText, visibility: visibility) {
                dismiss()
            }
        }
    }
}
