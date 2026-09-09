# Near

Near is an agent plugin for public profiles and private, Git-backed personal
context repositories. Each person chooses and owns a separate repository. This
repository contains reusable routing, client, and gateway code, never personal records.

## Public profiles

Install `near@package-manager` in Codex or Claude Code, then give your agent the
public profile repository you want to explore. The `read_public_profile` tool
reads a deliberately published `public/profile.md` through unauthenticated
GitHub HTTPS and returns a commit-pinned source. No GitHub sign-in or private
Near setup is needed. Your agent answers about the person with attribution;
it does not become them or send them your conversation.

See [installation and public profile instructions](plugins/near/README.md).

## Private setup

Install the plugin from `plugins/near/` in Codex or Claude Code. Set
`NEAR_CONTEXT_REPO=owner/repository` in the MCP server environment to choose the
repository used for bounded read-only context. There is no default account or
repository. The GitHub CLI must be authenticated with read access. The repository default branch
is resolved automatically. Keep these settings in your client configuration outside Git.

The plugin's `search_context` and `read_context` tools read only documented context
roots. Invoking Near alone does not authorize saving or publishing a conversation;
follow the user's explicit request and chosen repository's instructions.

## Applications

- `plugins/near/`: installable Codex and Claude routing package.
- `apps/web/`: mobile-first web chat.
- `apps/ios/`: native SwiftUI client source.
- `services/gateway/`: auth, model, GitHub, and policy boundary.

The gateway requires operator-supplied `NEAR_TENANTS_JSON`; no person or account
is preconfigured. See its README and `.env.example`. Browser clients receive no
GitHub or model credentials and cannot choose repository coordinates. Configure
your own deployment variables and secrets before enabling the deployment workflow.

## Private local preferences

Instead of an environment variable, create `~/.config/near/context.json` with
`{"repository":"owner/repository"}` and restrict it to mode `0600`.
`NEAR_CONTEXT_CONFIG` may select another local config file; `NEAR_CONTEXT_REPO`
takes precedence. The plugin never creates or overwrites this file.

Personal filing preferences belong in `~/.config/near/preferences.md` or the
chosen repository's private instructions. Keep both files outside public source.
They may explicitly authorize automatic filing for your own repository; absent
that choice, discussions remain unsaved until you ask to save them.
