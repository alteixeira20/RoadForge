# Architecture Overview

Anvilary Roadmaps is a local-first, accountless roadmap application.

## Browser

The Next.js client edits roadmap state immediately and caches each roadmap in scoped
`localStorage`. Local-only roadmaps work without the API. Synced roadmaps retain the
browser cache as an optimistic copy and recovery aid.

## API and access

FastAPI exposes role-scoped owner, editor, and viewer access. Invite links are bearer
credentials used once to create participant sessions. Display names are labels, not
identity. Owner/editor writes use optimistic concurrency and role checks.

## Persistence

PostgreSQL `roadmaps.snapshot_json` is canonical for phases and tasks. Relational
phase/task projection tables are derivative and support gradual partial-write and
query evolution. Projection parity checks and backfill tools protect the boundary.
The roadmap tag registry remains canonical JSONB on the roadmap row.

## Collaboration

Server-Sent Events notify clients of roadmap changes. Memory mode supports one API
worker. Redis mode shares events, locks, tickets, and rate limits across workers.
Task completion, claims, and tag registry operations have focused partial-write paths;
other edits use aggregate roadmap saves.

## Data safety

Imports are validated, repaired deterministically, previewed, and applied as replace,
new-local, or safe-additions operations. Safe merge never silently overwrites matched
tasks or tag definitions. Version history, activity, conflict metadata, and browser
cache provide recovery layers, but beta users should still export backups.

## Future platform scope

Accounts, OAuth, workspaces, public slugs, telemetry, billing, and assistant tools are
post-beta platform work. They are intentionally absent from the accountless beta
security boundary.
