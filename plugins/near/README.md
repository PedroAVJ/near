# Near plugin

A stateless router to a user-chosen private Git-backed context repository.

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

## Private local preferences

Instead of an environment variable, create `~/.config/near/context.json` with
`{"repository":"owner/repository"}` and restrict it to mode `0600`.
`NEAR_CONTEXT_CONFIG` may select another local config file; `NEAR_CONTEXT_REPO`
takes precedence. The plugin never creates or overwrites this file.

Personal filing preferences belong in `~/.config/near/preferences.md` or the
chosen repository's private instructions. Keep both files outside public source.
They may explicitly authorize automatic filing for your own repository; absent
that choice, discussions remain unsaved until you ask to save them.
