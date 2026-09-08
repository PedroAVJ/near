import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: NearAppModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    NearWordmark(suffix: "git")
                    NearCard {
                        VStack(alignment: .leading, spacing: 12) {
                            NearStructuralLabel("Signed in Near")
                            Text(model.profile?.displayName ?? "Unknown")
                                .font(.system(size: 24, weight: .light))
                            Text("Each save is a Git commit. The app has no record database and never receives Git or model credentials.")
                                .font(.system(size: 13))
                                .foregroundStyle(NearTheme.inkSecondary)
                        }
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        NearStructuralLabel("Access boundary")
                        SettingsLine(path: "public/", detail: "Readable by other Near members and their agents.")
                        SettingsLine(path: "confidential/mobile/", detail: "New private iPhone-authored files.")
                        SettingsLine(path: "all legacy paths", detail: "Confidential unless explicitly moved under public/.")
                    }

                    NearCard {
                        VStack(alignment: .leading, spacing: 7) {
                            NearStructuralLabel("Model")
                            Text("Claude Agent SDK uses the user's eligible Claude plan. OpenRouter is the visible server-side fallback.")
                                .font(.system(size: 13))
                                .foregroundStyle(NearTheme.inkSecondary)
                            Text("A private question sends the allowed private repository to the configured model. A public question sends only public/.")
                                .font(.system(size: 12))
                                .foregroundStyle(NearTheme.inkMuted)
                        }
                    }

                    Button("Sign out", role: .destructive) {
                        Task { await model.signOut() }
                    }
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(NearTheme.signal)
                }
                .padding(20)
            }
            .background(NearTheme.bone)
            .navigationTitle("About")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct SettingsLine: View {
    let path: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(path)
                .font(.system(size: 12, weight: .medium, design: .monospaced))
            Text(detail)
                .font(.system(size: 12))
                .foregroundStyle(NearTheme.inkMuted)
        }
        .padding(.bottom, 4)
    }
}
