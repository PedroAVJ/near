import AVFoundation
import Combine
import Speech

@MainActor
final class NearVoiceTranscriber: ObservableObject {
    @Published var transcript = ""
    @Published private(set) var isRecording = false
    @Published private(set) var message: String?

    private let audioEngine = AVAudioEngine()
    private let recognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var hasInstalledTap = false

    init(locale: Locale = .autoupdatingCurrent) {
        recognizer = SFSpeechRecognizer(locale: locale)
    }

    func toggleRecording() async {
        if isRecording {
            stop()
        } else {
            await start()
        }
    }

    func start() async {
        message = nil
        guard await Self.requestSpeechAccess() == .authorized else {
            message = "Activa Reconocimiento de voz para hablar con Near."
            return
        }
        guard await Self.requestMicrophoneAccess() else {
            message = "Activa el micrófono para hablar con Near."
            return
        }

        do {
            try beginRecognition()
        } catch {
            finishRecognition()
            message = "Near no pudo iniciar el micrófono. Inténtalo de nuevo."
        }
    }

    func stop() {
        finishRecognition()
    }

    func reset() {
        finishRecognition()
        transcript = ""
        message = nil
    }

    private func beginRecognition() throws {
        guard let recognizer, recognizer.isAvailable else {
            message = "El reconocimiento de voz no está disponible en este momento."
            return
        }

        finishRecognition()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        recognitionRequest = request

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor in
                guard let self else { return }
                if let result {
                    self.transcript = result.bestTranscription.formattedString
                }
                if error != nil || result?.isFinal == true {
                    self.finishRecognition()
                }
            }
        }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1_024, format: format) { [weak request] buffer, _ in
            request?.append(buffer)
        }
        hasInstalledTap = true
        audioEngine.prepare()
        try audioEngine.start()
        isRecording = true
    }

    private func finishRecognition() {
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        if hasInstalledTap {
            audioEngine.inputNode.removeTap(onBus: 0)
            hasInstalledTap = false
        }
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private static func requestSpeechAccess() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
    }

    private static func requestMicrophoneAccess() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }
}
