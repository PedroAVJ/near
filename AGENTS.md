# Near source boundaries

This repository is the source for the Near agent plugin and its interchangeable
interfaces. It contains no person's exocortex state.

## Repository roles

- This repository is reusable plugin, client, and gateway source.
- Each user's chosen private context repository owns only that person's state.
- No person repository is assumed or embedded in source.

Never copy a person's private record into this repository, a build artifact,
telemetry, a model log, or another person's repository.

## Plugin

- The installable package lives at `plugins/near/` and must remain thin and
  state-free.
- The plugin resolves the applicable private person repository separately and
  materializes only task-relevant paths.
- Keep the Codex and Claude manifests aligned. Validate the plugin after every
  package change.
- Near is an app/context source, not an employee or persistent thread owner.
  Invoke it only for a turn that explicitly asks, addresses, uses, or consults
  Near; mentioning it or discussing the product does not invoke it. Unnamed
  follow-ups stay with the current host or employee. Return Near output with
  compact source attribution. The host has no group chat; internal Fable–Astra
  collaboration must never appear as additional chat participants.

## Web interface and gateway

- `apps/web/` is the mobile-first PWA. It never receives GitHub, model, or
  service credentials.
- `services/gateway/` is the credential and policy boundary. It selects the
  repository from the authenticated server-side tenant; clients never supply
  repository coordinates.
- Authentication is invite-only email-link sign-in. Store the durable browser
  session in an HttpOnly, Secure, SameSite cookie.
- Git-backed person repositories remain canonical. Conversation turns written
  by the web app land beneath `confidential/web/conversations/` as Git commits.
- Relationship statements always belong to the speaking person's repository.
  Do not mirror or synthesize a shared canonical relationship record.
- The web chat uses `moonshotai/kimi-k2.5` through OpenRouter.

## Privacy and observability

- PostHog receives explicit product events only. Disable autocapture, session
  recording, heatmaps, raw URL collection, and message capture.
- Sentry Logs contain stable operational event names and opaque tenant or
  conversation identifiers only. Never log emails, message text, model input or
  output, record bodies, tokens, repository paths, or filenames.
- Keep every credential in Google Secret Manager and inject it into Cloud Run.
  Commit only variable names and non-secret defaults.

## Production

- Resolve project, region, service, database, and service accounts from operator
  configuration. Never infer a deployment account from this source repository.
- The deployment workflow requires repository variables and explicit enablement.
- Preserve deployed service and database identities when upgrading an existing
  installation; keep database delete protection enabled.
- A build is not a deployment. A deployment is not shipped until the real
  browser entry points, auth boundary, Git write, Kimi response, PostHog event,
  and Sentry Logs have been exercised on the final production revision.

## Design workspaces

Keep account-specific design mappings and exports in ignored local configuration.
Resolve the user's chosen design workspace before accessing or changing it.
Do not commit private design conversations, screenshots, or account identifiers.
