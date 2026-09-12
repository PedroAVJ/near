# Near plugin

A stateless router for public profiles and user-chosen private Git-backed context.

## Read a public profile

Install Near through Package Manager:

```bash
codex plugin marketplace add PedroAVJ/package-manager --ref main
codex plugin add near@package-manager
```

Or in Claude Code:

```bash
claude plugin marketplace add PedroAVJ/package-manager
claude plugin install near@package-manager
```

Open a fresh task and ask: **“Use Near to read the public profile at
`owner/profile-repository`. Tell me about this person’s work and ideas, with
sources.”** Supply the repository shared by that person. Near is an app/context
source, not an employee or persistent thread owner. Invoke it explicitly on each
turn that should read or reason over Near context; unnamed follow-ups return to
the current host or employee. No message is sent to the profile owner. This host
has no group chat: Near may consult Fable and Astra internally, but they never
become additional user-facing participants. Near results use compact source
attribution.

`read_public_profile(repository)` reads one deliberately published
`public/profile.md` file, at most 32 KiB, from a public GitHub repository. It
returns the full text and a commit-pinned source link. Python 3 with HTTPS support
is required. It does not need GitHub sign-in, read or change your private Near
configuration, store the conversation, or grant access to private records.
GitHub's unauthenticated rate limits apply; retry later if requested.

To publish a profile, author that file in a separate public repository. The
repository owner controls publication. Keep reusable plugin code here and
personal profile data in its own repository. Do not derive a public profile by
automatically filtering a private repository. See the [public profile
contract](skills/exocortex/SKILL.md#public-profiles).

## Private context

Set `NEAR_CONTEXT_REPO=owner/repository` in your MCP server environment.
The repository default branch is resolved automatically. Without a configured
repository, reads fail before any GitHub request. Authenticate `gh` with the
minimum access needed to your chosen repository. Keep credentials and settings
in your local client configuration, never in this plugin.

The read-only tools are `search_context` and `read_context`. Allowed roots are
`ideas/`, `canon/`, `context/`, `career/`, `docs/project/`, and `public/`; medical
and confidential roots are excluded. These directories can still contain private
information, so read only relevant files and never treat a directory name as
permission to share its contents.

The `exocortex` skill handles deliberate repository operations under the user's
authority. Installing or invoking this plugin does not authorize record writes
or public publication.

## Two-model thinking

For ambiguous, interpretive, brainstorming, or hard-decision questions, Near
uses Fable at medium effort and GPT-6 Astra at high effort. They form
independent positions from the same bounded Near context, exchange their
reasoning as collaborators, then Fable synthesizes the answer while retaining
supported corrections and uncertainty. The synthesis follows Near's calm,
compact, probabilistic speaking style without copying character dialogue. This
adds no record-write authority.

## Private local preferences

Instead of an environment variable, create `~/.config/near/context.json` with
`{"repository":"owner/repository"}` and restrict it to mode `0600`.
`NEAR_CONTEXT_CONFIG` may select another local config file; `NEAR_CONTEXT_REPO`
takes precedence. The plugin never creates or overwrites this file.

Personal filing preferences belong in `~/.config/near/preferences.md` or the
chosen repository's private instructions. Keep both files outside public source.
They may explicitly authorize automatic filing for your own repository; absent
that choice, discussions remain unsaved until you ask to save them.
