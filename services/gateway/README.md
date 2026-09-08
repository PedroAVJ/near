# Near gateway

The gateway is the credential and policy boundary shared by Near's native and
web interfaces. Personal records and web conversations remain canonical Git
files in the signed-in person's repository; the browser never receives a
GitHub credential or repository coordinates.

## Enforced boundaries

- The web PWA uses managed Identity Platform email links and an HTTP-only,
  secure 30-day session cookie.
- The invite allowlist stores only `sha256("email:" + normalizedEmail)` values.
  Unknown addresses receive the same accepted response and no email.
- Existing Sign in with Apple bearer sessions remain supported for the native
  client.
- A verified identity binds to one server-selected tenant configured by the
  operator in `NEAR_TENANTS_JSON`. There is no default person or repository.
- Owner requests may read that tenant's complete private repository.
- Cross-person requests fetch only paths beneath `public/`.
- PWA conversations commit beneath
  `confidential/web/conversations/<uuid>.json`; native record edits stay under
  `confidential/mobile/` or `public/mobile/`.
- Kimi K2.5 is called server-side through OpenRouter. Prompts and responses are
  never included in analytics or operational logs.
- GitHub, Identity Platform, OpenRouter, Claude, session-signing, and telemetry
  credentials remain server-side in Secret Manager.
- Identity bindings live in the delete-protected `near-ios` Firestore database;
  the durable collection names are retained for native-client compatibility.

## Model choice

PWA chat uses `moonshotai/kimi-k2.5` exclusively. The existing read-only native
question endpoint preserves its Claude Agent SDK subscription path and explicit
OpenRouter fallback so the repository split does not break the released client.

## Local checks

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Copy `.env.example` to an untracked environment file only for local execution.
Email allowlist keys and legacy invitation values are SHA-256 digests; raw
addresses and invitation codes must not be committed. The GitHub credential
should be fine-grained to the configured repositories with metadata read and
contents read/write only.

## Deployment configuration

Set every `GCP_*` repository variable named in `.github/workflows/near-gateway.yml`,
configure cloud credentials through workload identity, and set `NEAR_DEPLOY_ENABLED`
to `true` only for an explicitly configured installation. Forks deploy nowhere by
default. Preserve an existing installation's service/database identities.

Before upgrading an existing deployment, explicitly configure `NEAR_TENANTS_JSON`
in its secret or environment store with its current tenant bindings. An omitted or
empty mapping now fails at startup instead of selecting a built-in account.
