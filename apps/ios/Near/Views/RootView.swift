import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: NearAppModel

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                LoadingView()
            case .signedOut:
                OnboardingView()
            case .ready:
                MainTabView()
            case .failed(let message):
                FailureView(message: message) {
                    Task { await model.bootstrap() }
                }
            }
        }
        .nearPage()
        .alert("Near", isPresented: noticeBinding) {
            Button("Close", role: .cancel) { model.notice = nil }
        } message: {
            Text(model.notice ?? "")
        }
    }

    private var noticeBinding: Binding<Bool> {
        Binding(
            get: { model.notice != nil },
            set: { if !$0 { model.notice = nil } }
        )
    }
}

private struct LoadingView: View {
    var body: some View {
        VStack(spacing: 18) {
            NearWordmark(suffix: nil)
            ProgressView()
                .controlSize(.small)
                .tint(NearTheme.ink)
            Text("Opening the Git record.")
                .font(.system(size: 13))
                .foregroundStyle(NearTheme.inkMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
    }
}

private struct FailureView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        ZStack {
            NearDotGrid()
            VStack(alignment: .leading, spacing: 20) {
                NearWordmark(suffix: "iphone")
                NearCard {
                    VStack(alignment: .leading, spacing: 12) {
                        NearStructuralLabel("Gateway unavailable")
                        Text(message)
                            .font(.system(size: 15))
                            .foregroundStyle(NearTheme.inkSecondary)
                        Button(action: retry) {
                            SignalButtonLabel("Try again")
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 480)
        }
    }
}

private struct MainTabView: View {
    var body: some View {
        TabView {
            TalkView()
                .tabItem { Label("Hablar", systemImage: "mic.fill") }
            MineView()
                .tabItem { Label("Files", systemImage: "doc.text") }
            AskView()
                .tabItem { Label("Ask", systemImage: "text.bubble") }
            PeopleView()
                .tabItem { Label("People", systemImage: "person.2") }
            SettingsView()
                .tabItem { Label("About", systemImage: "info.circle") }
        }
        .tint(NearTheme.ink)
        .toolbarBackground(NearTheme.bone, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
    }
}
