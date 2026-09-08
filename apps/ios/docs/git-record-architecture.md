# Git record architecture

## One person, one private repository

Every person has a private Git repository with this contract:

```text
.near/policy.json
public/                    cross-person readable
  mobile/                  public files authored on iPhone
confidential/              explicit confidential namespace
  mobile/                  confidential files authored on iPhone
...existing paths...       confidential by default
```

Existing repositories need not be reorganized. Existing paths remain confidential
unless explicitly placed under `public/`; the policy preserves history and links.
Operators configure separate repositories for each person, and each starts with
only the records that person has authorized.

## Mobile file format

```markdown
---
near_id: 018f...
subject: owner
visibility: confidential
contributor_class: subject
contributed_at: 2026-08-23T18:42:00Z
updated_at: 2026-08-23T18:42:00Z
---

# Title

Body text.
```

The gateway assigns the subject from the authenticated tenant, chooses the
write root, normalizes the filename, and commits the result. A client cannot
supply a repository, owner, subject, or arbitrary path for new records.

## Public isolation

Public file listing filters Git tree paths before returning metadata. Public
file reads reject every path outside `public/`. A public model question is
materialized into a fresh temporary directory containing only allowed public
files. The model process never receives the source repository or its Git
credential.

Private owner questions materialize that owner's complete repository into a
separate temporary directory. Both model paths are read-only and are removed
after the answer.

## Commit provenance

The Git hosting account is the technical committer. Human/agent authorship is
recorded in frontmatter and in the commit message. API responses include the
new commit hash so the app can show durable provenance.
