# Architecture Overview

RoadForge is a local-first, accountless roadmap application from Anvilary.

Roadmap planning, external implementation artifacts, credentials, and portable
data follow the [source-of-truth rules](source-of-truth-rules.md).

## Browser

The Next.js client edits roadmap state immediately and caches each roadmap in scoped
`localStorage`. Local-only roadmaps work without the API. Synced roadmaps retain the
browser cache as an optimistic copy and recovery aid.

`apps/frontend/src/app` composes routes using `features/workspace`, `features/marketing`,
and the invite join feature. The synchronization feature owns the active roadmap
provider, hydration, save decisions, and SSE reconciliation. Tags, roadmaps,
sharing, history, collaboration, tasks, phases, and data transfer own their specific
operations. Their shared HTTP transport, browser storage, context slices, value
helpers, reorder coordination, and UI primitives live under `src/shared`.

`pnpm check:cycles` verifies the frontend import direction, acyclicity and shared
module isolation. The stylesheet entry point retains the ordering in `app/globals.css`.

## API and access

FastAPI exposes role-scoped owner, editor, and viewer access. Invite links are bearer
credentials used once to create participant sessions. Display names are labels, not
identity. Owner/editor writes use optimistic concurrency and role checks.

`apps/backend/src/api` keeps the `api` import root. Domain routers and services live
under `features`. The route aggregator preserves route registration order. Roadmaps
owns the canonical snapshot, validation, concurrency and projection. Tasks, phases,
tags, history, and sharing build on that foundation. The agent-client feature uses
the same mutation services for bounded MCP responses. `shared` owns transport-wide
authorization, rate limits, health, IDs, and realtime infrastructure. The backend
architecture test verifies that dependencies point toward these foundations.

Authorization can commit a throttled participant activity touch. Routers authorize
before taking domain row locks or making changes in a request session.

## Persistence

PostgreSQL `roadmaps.snapshot_json` is canonical for phases and tasks. Relational
phase/task projection tables are derivative and support gradual partial-write and
query evolution. Projection parity checks and backfill tools protect the boundary.
The roadmap tag registry remains canonical JSONB on the roadmap row.

## Collaboration

Server-Sent Events notify clients of roadmap changes. Memory mode supports one API
worker. Redis mode shares events, locks, tickets, and rate limits across workers.
Focused requests handle task, phase, tag, and roadmap metadata changes. Aggregate
writes cover full snapshot saves, imports, and restores.

The realtime stream service consumes the ticket, checks authorization before and
after subscription, and releases the request database connection before streaming.
Sharing marks revocation pending before committing, then promotes the mark and
publishes the control event. The stream service trusts a committed mark and resolves
other marks against PostgreSQL. Shutdown closes the five Redis owners and disposes
the SQLAlchemy engine after requests finish.

Focused structural writes serialize on the roadmap row lock. For two task reorders
of the same scope, the later lock holder determines the order of surviving requested
IDs. Server-only tasks and descendant blocks stay in the snapshot.

## Data safety

Imports are validated, repaired deterministically, previewed, and applied as replace,
new-local, or safe-additions operations. Safe merge never silently overwrites matched
tasks or tag definitions. Version history, activity, conflict metadata, and browser
cache provide recovery layers, but users should still export backups.

## Future platform scope

Accounts, OAuth, workspaces, public slugs, telemetry, billing, and assistant tools are
future platform work. They are intentionally absent from the current accountless
security boundary.
