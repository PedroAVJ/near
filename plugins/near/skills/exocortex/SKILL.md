---
name: exocortex
description: "Read and work with a user-chosen private Git-backed context repository while preserving ownership, attribution, and confidentiality."
---

# Exocortex

Near is a protocol and stateless routing plugin over person-owned Git repositories.
Durable records belong in the applicable person's repository, never this plugin.

## Resolve the repository

Use the repository explicitly chosen in the current request, workspace instructions,
or local `NEAR_CONTEXT_REPO=owner/repository` configuration. The server also reads
`~/.config/near/context.json` (or `NEAR_CONTEXT_CONFIG`) with a `repository` key;
the environment variable takes precedence. These are private operator settings. There is no default
person or account. If no choice is available, ask for the repository before reading
personal state. Never infer another person's repository or substitute one person's
records for another's.

The MCP tools `search_context` and `read_context` provide bounded read-only access
through the authenticated GitHub CLI. The repository's default branch is
resolved automatically. They allow only `ideas/`, `canon/`,
`context/`, `career/`, `docs/project/`, and `public/`. Root names are a read boundary,
not proof that their contents are public or non-sensitive.

For work beyond those tools, resolve the exact remote, default branch, instructions,
and existing task checkout. Create an isolated sparse clone in the task workspace
when needed, then materialize only the relevant paths. Read the chosen repository's
`AGENTS.md` and `README.md` before its records. Preserve unrelated work.

## Deliberate records

The user is the authority on their records. A discussion or plugin invocation alone
does not authorize saving or publishing it. Follow an explicit save request or a
user-defined standing filing preference stored outside this plugin. Read
`~/.config/near/preferences.md` if present, then the chosen repository's private
instructions, before deciding whether a filing action is authorized. A later
“do not file this” or “keep this as chat only” instruction takes precedence.

When authorized to file, preserve material wording, reasoning, corrections, open
questions, and attribution. Label agent contributions and uncertainty. Do not
convert an inference into a diagnosis, fact, or settled belief. Do not create no-op
records for retrieval. Respect the chosen repository's structure and checks.

For an authorized Git publication, verify the exact remote commit and relevant file
after pushing. Local edits are not publication. Preserve unpublished work if blocked.
Private filing does not authorize public publication, another person's records, an
outbound message, or product deployment.

## Relationships are directed personal state

A person's account of a relationship belongs only in that person's repository.
Never mirror, silently reconcile, or create a shared canonical relationship record.
An authorized comparison must retain the direction and provenance of each account.

## Privacy and access

Everything is confidential by default. Only explicitly published `public/` files
may be shared across a person's boundary. Read only the minimum relevant paths.
Keep private record bodies, credentials, personal identifiers, and retrieval context
out of logs, telemetry, plugin source, and unrelated repositories. A private Git
repository is not encryption from its custodian or configured model provider.

The gateway selects repositories from authenticated server-side tenant bindings.
Browser-supplied repository coordinates never establish authority. Validate changed
surfaces and report source checks, deployment, and device acceptance separately.
