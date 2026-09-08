import SwiftUI

struct TalkView: View {
    private enum Mode: String, CaseIterable, Identifiable {
        case remember
        case ask

        var id: String { rawValue }
        var title: String { self == .remember ? "Guardar" : "Preguntar" }
    }

    @EnvironmentObject private var model: NearAppModel
    @StateObject private var voice = NearVoiceTranscriber()
    @State private var mode: Mode = .remember
    @State private var selectedTenantID: String?
    @State private var answer: NearAnswer?
    @State private var confirmation: String?

    private var cleanTranscript: String {
        voice.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    }

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
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Hola, \(model.profile?.displayName ?? "")")
                            .font(.system(size: 30, weight: .light))
                        Text("Habla como lo harías normalmente. Near convierte tu voz en texto antes de guardarla o hacer una pregunta.")
                            .font(.system(size: 14))
                            .foregroundStyle(NearTheme.inkSecondary)
                    }

                    Picker("Qué quieres hacer", selection: $mode) {
                        ForEach(Mode.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: mode) {
                        answer = nil
                        confirmation = nil
                    }

                    NearCard {
                        VStack(alignment: .leading, spacing: 14) {
                            if mode == .ask {
                                NearStructuralLabel("Preguntar sobre")
                                Picker("Preguntar sobre", selection: $selectedTenantID) {
                                    Text("Mi Near completo").tag(nil as String?)
                                    ForEach(model.people) { person in
                                        Text("\(person.displayName) · solo público").tag(person.id as String?)
                                    }
                                }
                                .pickerStyle(.menu)
                                .tint(NearTheme.ink)
                            } else {
                                NearStructuralLabel("Nueva nota privada")
                                Text("Se guardará en tu propio Near. Nadie más en la familia podrá leerla.")
                                    .font(.system(size: 12))
                                    .foregroundStyle(NearTheme.inkMuted)
                            }

                            TextEditor(text: $voice.transcript)
                                .font(.system(size: 17))
                                .lineSpacing(4)
                                .scrollContentBackground(.hidden)
                                .frame(minHeight: 150)
                                .padding(8)
                                .background(NearTheme.card)
                                .overlay { RoundedRectangle(cornerRadius: 3).stroke(NearTheme.lineStrong) }
                                .accessibilityLabel(mode == .remember ? "Texto de la nota" : "Pregunta")
                                .overlay(alignment: .topLeading) {
                                    if voice.transcript.isEmpty {
                                        Text(mode == .remember ? "Cuéntale algo a Near…" : "Haz tu pregunta…")
                                            .font(.system(size: 17))
                                            .foregroundStyle(NearTheme.inkMuted)
                                            .padding(.horizontal, 13)
                                            .padding(.vertical, 17)
                                            .allowsHitTesting(false)
                                    }
                                }

                            Button {
                                Task { await voice.toggleRecording() }
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: voice.isRecording ? "stop.fill" : "mic.fill")
                                    Text(voice.isRecording ? "Terminar" : "Hablar")
                                        .fontWeight(.semibold)
                                }
                                .font(.system(size: 18))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity, minHeight: 56)
                                .background(voice.isRecording ? NearTheme.signal : NearTheme.ink)
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Near transcribirá tu voz usando el reconocimiento de Apple")

                            if let message = voice.message {
                                Text(message)
                                    .font(.system(size: 12))
                                    .foregroundStyle(NearTheme.signal)
                            }

                            Button(action: performPrimaryAction) {
                                SignalButtonLabel(primaryTitle, systemImage: mode == .remember ? "square.and.arrow.down" : "arrow.up")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.plain)
                            .disabled(cleanTranscript.isEmpty || model.isWorking || voice.isRecording)
                            .opacity(cleanTranscript.isEmpty || voice.isRecording ? 0.4 : 1)
                        }
                    }

                    if let confirmation {
                        Label(confirmation, systemImage: "checkmark.circle.fill")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(NearTheme.moss)
                    }

                    if let answer {
                        TalkAnswerCard(answer: answer)
                    }
                }
                .padding(20)
            }
            .background(NearTheme.bone)
            .navigationTitle("Near")
            .navigationBarTitleDisplayMode(.inline)
            .onDisappear { voice.stop() }
        }
    }

    private var primaryTitle: String {
        if model.isWorking { return mode == .remember ? "Guardando…" : "Leyendo…" }
        return mode == .remember ? "Guardar en mi Near" : "Preguntar a Near"
    }

    private func performPrimaryAction() {
        guard !cleanTranscript.isEmpty else { return }
        voice.stop()
        confirmation = nil
        if mode == .remember {
            let body = cleanTranscript
            Task {
                let title = "Nota hablada — \(Date.now.formatted(date: .abbreviated, time: .shortened))"
                if await model.saveFile(existing: nil, title: title, body: body, visibility: .confidential) {
                    voice.reset()
                    confirmation = "Guardado en tu Near."
                }
            }
        } else {
            let question = cleanTranscript
            Task { answer = await model.ask(question, scope: scope) }
        }
    }
}

private struct TalkAnswerCard: View {
    let answer: NearAnswer

    private var rendered: AttributedString {
        (try? AttributedString(markdown: answer.text)) ?? AttributedString(answer.text)
    }

    var body: some View {
        NearCard {
            VStack(alignment: .leading, spacing: 12) {
                NearStructuralLabel("Respuesta")
                Text(rendered)
                    .font(.system(size: 17, design: .serif))
                    .foregroundStyle(NearTheme.inkSecondary)
                    .lineSpacing(5)
                    .textSelection(.enabled)

                if !answer.citations.isEmpty {
                    Divider().overlay(NearTheme.line)
                    NearStructuralLabel("Fuentes")
                    ForEach(answer.citations) { citation in
                        Text(citation.path)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(NearTheme.inkMuted)
                    }
                }
            }
        }
    }
}
