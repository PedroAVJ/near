# Near iOS invariants

## Product boundary

- Near's durable state is Git. The iOS app and `services/gateway/` are a thin door over
  per-person repositories; do not create an app-owned record database.
- The user-chosen context repository is canonical. Preserve its paths and history.
  Existing paths outside `public/` are confidential by default.
- Each other person gets a separate private repository with the same `.near`
  policy. Never place two people's confidential roots in one repository.
- Canon does not emerge from an answer. A person explicitly saves or edits each
  durable file and remains the authority on their own Near.

## Git record contract

- The only cross-person-readable paths are those beneath `public/`. Enforce this
  on the server before file materialization; a prompt is not an access control.
- App-authored files go beneath `confidential/mobile/` or `public/mobile/` and
  contain YAML frontmatter with id, subject, visibility, contributor class, and
  timestamps. Each create, edit, move, or delete is a Git commit.
- A visibility change is a Git move between the two mobile roots. Keep the same
  record id and preserve the old location in Git history.
- Never cache record bodies in UserDefaults, Keychain, logs, analytics, crash
  reports, or notifications. The iOS client may hold a fetched body in memory.

## Authorization and custody

- Sign in with Apple proves device identity. The gateway binds an invite to a
  server-selected tenant and repository; never accept repository coordinates
  from the client.
- Session tokens carry tenant and role, expire, and live in iOS Keychain. Git,
  Claude, OpenRouter, and signing credentials remain only in server secrets.
- An owner may read/write their whole repo. Another member and the App Intent
  may read only the selected profile's `public/` tree. There is no private-data
  fallback when a public answer is empty.
- "Confidential" means hidden from other Near members. It is not end-to-end
  encrypted from the Git repository custodian or the configured model provider.
  The UI must state this ceiling instead of promising technical impossibility.

## Model boundary

- The gateway uses Claude Agent SDK subscription authentication while the user's
  plan permits it. Claude gets a temporary full repo only for an owner's own
  question and a temporary public-only tree for every cross-person question.
- Agent tools are read-only. Answers may cite files and commits but cannot write
  to Git. OpenRouter is the explicit fallback when subscription SDK use is not
  operational; the provider change must be visible in the response metadata.
- Never log prompts, answers, record bodies, materialized paths, or model tokens.

## Design

- Follow the Near Design System: warm bone paper, graphite ink, hairlines,
  near-square corners, dense rows, precise copy, and one signal-red action.
- Use Apple system type and SF Symbols as native substitutions for Geist and
  Lucide. Use SF Mono for paths, commit hashes, structural labels, and numbers.
- Model output is always a read, never a fact. Show file citations and say when
  the allowed tree does not contain an answer.

## Release

- Keep bundle id `com.pedro.Near` and team `KC2ZK3BWH7` aligned across Xcode,
  Sign in with Apple, provisioning, App Store Connect, and the gateway's Apple
  audience validation.
- A successful archive is not a release. Verify the uploaded build, processing
  status, tester groups, both tester assignments, and install availability.
