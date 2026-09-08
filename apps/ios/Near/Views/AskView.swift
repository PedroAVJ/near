import SwiftUI

struct AskView: View {
    @EnvironmentObject private var model: NearAppModel
    @State private var question = ""
    @State private var selectedTenantID: String?
    @State private var answer: NearAnswer?
    @FocusState private var questionFocused: Bool

    private var scope: QuestionScope {
        guard
            let selectedTenantID,
            let profile = model.people.first(where: { $0.id == selectedTenantID })
        else { return .mine }
        return .publicProfile(profile)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    NearCard {
                        VStack(alignment: .leading, spacing: 14) {
                            NearStructuralLabel("Question scope")
                            Picker("Question scope", selection: $selectedTenantID) {
                                Text("My complete Near").tag(nil as String?)
                                ForEach(model.people) { person in
                                    Text("\(person.displayName) · public only").tag(person.id as String?)
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(NearTheme.ink)

                            HStack(alignment: .top, spacing: 8) {
                                Circle()
                                    .fill(scope.isPublicOnly ? NearTheme.slate : NearTheme.moss)
                                    .frame(width: 7, height: 7)
                                    .padding(.top, 5)
                                Text(scope.isPublicOnly
                                     ? "The model receives only this person's public/ tree. It cannot fall back to confidential files."
                                     : "The model may read your complete private repository for this question.")
                                    .font(.system(size: 12))
                                    .foregroundStyle(NearTheme.inkMuted)
                            }

                            TextField("Ask about the allowed Git record…", text: $question, axis: .vertical)
                                .lineLimit(3...8)
                                .focused($questionFocused)
                                .padding(12)
                                .background(NearTheme.card)
                                .overlay { RoundedRectangle(cornerRadius: 2).stroke(NearTheme.lineStrong) }

                            Button(action: ask) {
                                SignalButtonLabel(model.isWorking ? "Reading Git…" : "Ask Near", systemImage: "arrow.up")
                            }
                            .buttonStyle(.plain)
                            .disabled(question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isWorking)
                            .opacity(question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.4 : 1)
                        }
                    }

                    if let answer {
                        AnswerCard(answer: answer)
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            NearStructuralLabel("Read, not canon")
                            Text("An answer is a model reading of committed files. It becomes durable only when you explicitly save a file.")
                                .font(.system(size: 13))
                                .foregroundStyle(NearTheme.inkMuted)
                        }
                        .padding(.horizontal, 4)
                    }
                }
                .padding(20)
            }
            .background(NearTheme.bone)
            .navigationTitle("Ask")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func ask() {
        let cleanQuestion = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanQuestion.isEmpty else { return }
        questionFocused = false
        Task { answer = await model.ask(cleanQuestion, scope: scope) }
    }
}

private struct AnswerCard: View {
    let answer: NearAnswer

    private var rendered: AttributedString {
        (try? AttributedString(markdown: answer.text)) ?? AttributedString(answer.text)
    }

    var body: some View {
        NearCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    NearStructuralLabel("Near read")
                    Spacer()
                    Text(answer.provider == "claude-agent-sdk" ? "Claude · plan" : "OpenRouter · fallback")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(NearTheme.inkMuted)
                }
                Text(rendered)
                    .font(.system(size: 16, design: .serif))
                    .foregroundStyle(NearTheme.inkSecondary)
                    .lineSpacing(5)
                    .textSelection(.enabled)

                Divider().overlay(NearTheme.line)
                NearStructuralLabel("Git citations")
                if answer.citations.isEmpty {
                    Text("No committed file supported this answer.")
                        .font(.system(size: 12))
                        .foregroundStyle(NearTheme.inkMuted)
                } else {
                    ForEach(answer.citations) { citation in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(citation.path)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(NearTheme.inkSecondary)
                            Text(String(citation.commit.prefix(12)))
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(NearTheme.inkMuted)
                        }
                    }
                }
            }
        }
    }
}
