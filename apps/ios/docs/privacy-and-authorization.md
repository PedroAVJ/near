# Privacy and authorization

## Effective access matrix

| Surface | Own confidential paths | Own `public/` | Another person's `public/` |
| --- | --- | --- | --- |
| Files | Read/write | Read/write | No access |
| Ask: My Near | Read | Read | No access |
| People | No access | Read | Read |
| Ask: public person | No access | Read when selected | Read when selected |
| Ask Near App Intent | No access | Read when selected | Read when selected |

The gateway derives repository coordinates and role from a signed session. It
never authorizes a repository, tenant, or path supplied by the client.

## Account binding

1. First-time native users receive an invitation from the operator. The invitation
   resolves to a server-configured tenant; the app does not pick an account.
2. Sign in with Apple returns an identity token whose signature, issuer,
   audience, expiry, and nonce are validated by the gateway.
3. The gateway binds the invitation's tenant to the authenticated Apple subject.
   Existing sign-ins restore their established binding.
4. A short-lived session token contains only tenant id and role and lives in
   iOS Keychain. Git and model credentials remain in the server secret store.
5. The PWA uses an operator-configured email invitation allowlist. Public-profile
   choices are fetched through authenticated gateway endpoints.

## Honest confidentiality ceiling

Confidential files are ordinary Markdown in a private Git repository. TLS,
private repository ACLs, least-privilege server credentials, secret management,
and public-tree filtering protect them from other Near members. They are not
end-to-end encrypted from the repository custodian or from Claude when the
owner asks a private question.

This is deliberate: encrypting the file body with a device-only key would make
the canonical Git record unreadable to the agents that constitute Near. The UI
therefore says who can technically process confidential data instead of using
an inaccurate "only you" promise.

## Model path

- Private question: the signed-in owner's complete repo may be materialized and
  sent to Claude under the configured subscription-backed Agent SDK session.
- Public question: only the selected person's `public/` files are materialized.
- OpenRouter is a server-side fallback and is reported as the provider in the
  answer. No fallback widens the allowed Git tree.
- Prompts, answers, file bodies, identity tokens, and credentials are never
  written to application logs.
