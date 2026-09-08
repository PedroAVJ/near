# Expo and EAS release contract

Near remains a native SwiftUI interface over Git-backed per-person records.
Expo Application Services is only the build, credential, versioning, workflow,
and TestFlight delivery layer. It does not own record state. The GitHub release
job checks out only `apps/`, then runs EAS with VCS discovery disabled and
`EAS_PROJECT_ROOT=apps`; EAS receives only that bounded directory.

The native Xcode project is already in `apps/ios/`, so the Expo project root is
`apps/`. This lets EAS archive the committed project without Continuous Native
Generation, a React Native runtime, or movement of Near's canonical records.

## Automatic releases

The root `.github/workflows/near-testflight.yml` job runs only for native Near
changes on `main`. Its sparse checkout excludes every record directory before
it invokes `.eas/workflows/testflight.yml`. Ordinary exocortex commits do not
consume an iOS build, and record content does not enter a GitHub runner working
tree or an EAS archive. EAS creates a signed store build, increments the remote
Apple build number, submits it, and waits for TestFlight processing. Failed
builds are not submitted.

`cli.appVersionSource` is `remote`. Initialize it once from build `1` with
`eas build:version:set`; subsequent production builds use `autoIncrement: true`
and do not reuse an Apple build number.

## One-time account setup

1. Link `apps/` to the `@pedroavj/near` EAS project.
2. Keep the App Store Connect record `6804509012` (`Near Exocortex`) for
   `com.pedro.Near` aligned with `eas.json`. The installed app remains `Near`.
3. Initialize the EAS remote build number to 1.
4. Configure EAS-managed Apple distribution credentials, Sign in with Apple,
   and an App Store Connect API key. Never store an Apple password, private
   key, Git token, invite, model token, prompt, answer, or record body in Expo.
5. Store a scoped Expo access token as the GitHub Actions secret `EXPO_TOKEN`.
   Do not link the Near repository through Expo's GitHub integration: that
   integration checks out the whole repository instead of the sparse app tree.

The Git gateway remains its own deployment boundary under `services/gateway/`
and is not part of the EAS archive.
The release build must use an explicitly verified production gateway URL; the
placeholder `https://near.invalid` is intentionally not considered releasable.

## Privacy acceptance

- Inspect the EAS archive and confirm its root contains only the former `apps/`
  source, with no Near record directory.
- Confirm no Near record directory, record body, secret, or runtime fixture is
  present in build inputs, logs, release notes, or screenshots.
- Verify the uploaded build, processing state, intended tester group, both
  tester assignments, and physical-device install availability.

## Local checks

Run `npm test`, `npm run eas:validate`, and `npm run eas:inspect` from `apps/`.
Keep Xcode and Node test jobs serial on the 8 GB development Mac.
