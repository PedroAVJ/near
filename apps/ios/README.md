# Near for iPhone

Near for iPhone is a native door onto each person's Git-backed exocortex. The
files and commit history are the product; the app does not keep a parallel
record database.

## What ships

- Sign in with Apple using an operator-issued invitation for the first sign-in;
  existing Apple accounts keep their server-side tenant binding.
- A voice-first home screen for private spoken entries and spoken questions.
- A file browser over the signed-in person's private Near repository.
- Confidential-by-default Markdown creation and editing, committed to Git.
- Explicit moves into `public/`, with plain-language disclosure confirmation.
- Private questions over the owner's complete repo and public questions over
  another person's physically filtered `public/` tree.
- File-path and commit citations on every grounded answer.

The operator configures each person's canonical repository on the gateway. Existing
paths remain confidential by default and retain their history. New iPhone records
land under `confidential/mobile/` or `public/mobile/`. App Intents discover available
public profiles through the authenticated gateway instead of a built-in people list.

## Local build

```sh
cd apps/ios
xcodegen generate
xcodebuild -project Near.xcodeproj -scheme Near \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath .codex-artifacts/native-build/DerivedData \
  CODE_SIGNING_ALLOWED=NO build
```

Gateway tests run from `../../services/gateway/`:

```sh
npm ci
npm test
```

Demo mode uses only synthetic fixtures (`--demo`). Real Near content must never
enter screenshots, fixtures, logs, or release notes.

## Automatic TestFlight releases

Expo Application Services builds the existing native Xcode project, owns the
remote build-number counter, and submits relevant `main` changes to TestFlight.
The Expo project root is `apps/` because this native project already occupies
its conventional `apps/ios/` directory. See [`../EXPO.md`](../EXPO.md).

See [`docs/git-record-architecture.md`](docs/git-record-architecture.md) and
[`docs/privacy-and-authorization.md`](docs/privacy-and-authorization.md).
