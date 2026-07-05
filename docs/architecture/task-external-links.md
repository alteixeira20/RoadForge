# Task External Links

Status: Accepted for RF-601–RF-603  
Date: 2026-07-05

## Decision

RoadForge remains the source of truth for task and roadmap planning. GitHub
links are external work evidence and context only. A linked issue, pull
request, discussion, commit, or release does not complete, reopen, reorder, or
otherwise mutate a RoadForge task.

The URL-only v1 foundation stores small, credential-free records in the
portable task snapshot:

```ts
interface TaskExternalLink {
  id: string
  provider: "github" | "url"
  kind: "issue" | "pull" | "discussion" | "commit" | "release" | "url"
  url: string
  owner?: string
  repo?: string
  number?: number
  sha?: string
  tag?: string
  label?: string
}
```

`Task.links` is an optional array of these records. `id` is a stable,
RoadForge-local identifier. It is not a GitHub ID or credential. GitHub
records use `provider: "github"` and the matching artifact kind. Generic
HTTP(S) references use `provider: "url"` and `kind: "url"` without GitHub
identifier fields.

V1 limits each task to 20 links. Labels are optional display text. Titles,
state, authors, timestamps, checks, comments, and other fetched provider
metadata are not part of this model.

## URL normalization and validation

The client uses a pure parser with no network access. It recognizes:

- `https://github.com/{owner}/{repo}/issues/{number}`
- `https://github.com/{owner}/{repo}/pull/{number}`
- `https://github.com/{owner}/{repo}/discussions/{number}`
- `https://github.com/{owner}/{repo}/commit/{sha}`
- `https://github.com/{owner}/{repo}/releases/tag/{tag}`

Canonical URLs retain the HTTP(S) origin and artifact path while dropping
query strings, fragments, and trailing slashes. Commit SHAs are lowercased.
Unsupported GitHub pages may be retained as generic URL links; malformed URLs
that claim one of the supported artifact routes are rejected.

Non-HTTP(S) schemes, URL username/password data, and credential-shaped query
parameters or values are rejected. Provider, kind, and parsed GitHub
identifiers must agree. Duplicate IDs or canonical URLs keep the first record.

## Import, export, and browser storage

Roadmap snapshot JSON remains the portable source of truth. Export includes
valid `task.links` records. Import accepts snapshots without `links`, preserves
explicit empty arrays, normalizes valid links, and removes invalid,
duplicate, unsupported, or credential-shaped records with an import repair
notice.

Local-only and synced roadmap caches in `localStorage` may contain these URL
records because they are canonical roadmap content. They must never contain
provider credentials. Loading, editing, importing, and exporting a roadmap
must continue to work without GitHub access.

For synced roadmaps, `roadmaps.snapshot_json` remains canonical. The current
relational projection carries `links` through task `source_json`; it does not
make external links relational truth and requires no migration.

## Metadata and authentication boundary

If RoadForge later fetches GitHub metadata, the fetched data must live in a
separate, replaceable cache or projection. Cache refreshes, stale data, missing
permissions, and provider outages must not rewrite canonical roadmap fields or
portable exports.

A future GitHub App or OAuth design requires a separate security decision and
server-side credential store. Access tokens, refresh tokens, OAuth codes,
installation IDs or credentials, private keys, and equivalent secrets must
never be stored in:

- `TaskExternalLink`;
- roadmap snapshots, imports, or exports;
- browser roadmap `localStorage`;
- task descriptions or labels;
- RoadForge invite/share URLs; or
- tests and fixtures.

## Non-goals

This phase does not add:

- a GitHub linking modal or other task-link UI;
- GitHub API calls or metadata fetching;
- OAuth, a GitHub App, backend provider credentials, or tokens;
- bidirectional synchronization;
- automatic RoadForge task completion from GitHub state;
- browser automation, deployment, or a database migration.
