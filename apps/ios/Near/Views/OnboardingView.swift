import AuthenticationServices
import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var model: NearAppModel
    @State private var invitationCode = ""
    @State private var pendingNonce: String?

    var body: some View {
        ZStack {
            NearDotGrid()
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    NearWordmark(suffix: "iphone")

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Habla.\nPregunta.\nConstruye tu Near.")
                            .font(.system(size: 38, weight: .light))
                            .tracking(-1.1)
                        Text("Tu voz se guarda como archivos privados con historial. Tú decides qué compartir.")
                            .font(.system(size: 15))
                            .foregroundStyle(NearTheme.inkSecondary)
                            .lineSpacing(3)
                    }

                    NearCard {
                        VStack(alignment: .leading, spacing: 16) {
                            NearStructuralLabel("Tu invitación")
                            TextField("Código de invitación", text: $invitationCode)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                            Text("Usa la invitación de tu administrador la primera vez. Si ya tienes cuenta, continúa con Apple.")
                                .font(.system(size: 12))
                                .foregroundStyle(NearTheme.inkMuted)

                            SignInWithAppleButton(.continue, onRequest: configure, onCompletion: complete)
                                .signInWithAppleButtonStyle(.black)
                                .frame(height: 50)
                                .disabled(model.isWorking)
                        }
                    }

                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 13))
                            .foregroundStyle(NearTheme.moss)
                            .padding(.top, 2)
                        Text("Tus notas son privadas por defecto. Solo lo que publiques expresamente puede ser leído por otros miembros de Near.")
                            .font(.system(size: 12))
                            .foregroundStyle(NearTheme.inkMuted)
                    }
                }
                .padding(24)
                .frame(maxWidth: 540)
                .frame(maxWidth: .infinity)
            }
        }
    }

    private func configure(_ request: ASAuthorizationAppleIDRequest) {
        do {
            let nonce = try NearNonce.random()
            pendingNonce = nonce
            request.nonce = NearNonce.sha256(nonce)
        } catch {
            model.show(error)
        }
    }

    private func complete(_ result: Result<ASAuthorization, Error>) {
        do {
            guard
                let nonce = pendingNonce,
                case .success(let authorization) = result,
                let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let token = String(data: tokenData, encoding: .utf8)
            else {
                if case .failure(let error) = result { throw error }
                throw NearClientError.invalidResponse
            }
            Task {
                await model.authenticate(
                    identityToken: token,
                    nonce: nonce,
                    invitationCode: invitationCode
                )
            }
        } catch {
            model.show(error)
        }
    }
}
