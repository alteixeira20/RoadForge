# Contributor guide

This guide is the shortest path from a fresh clone to a safe, reviewable
RoadForge change. The repository is the source of truth; roadmap descriptions
are plans and evidence, not proof that code exists.

RoadForge is source-available under the PolyForm Noncommercial License 1.0.0.
Contributions do not grant commercial-use rights, and the project is not
OSI-approved open source.

## Fresh-clone walkthrough

Prerequisites:

- Git;
- Node.js 20 or newer with Corepack;
- pnpm 9;
- Python 3.12 and `uv`;
- Docker with Docker Compose for PostgreSQL-backed API tests.

From a new clone:

```bash
git clone https://github.com/alteixeira20/RoadForge.git
cd RoadForge
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack enable
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm install --frozen-lockfile
cd apps/api
uv venv --python 3.12
uv pip install --python .venv/bin/python3 -e ".[dev,test,audit]"
cd ../..
```

Start the application:

```bash
make start
make status
```

The web application uses `http://localhost:3020`; the API health endpoint uses
`http://localhost:7878/api/health`. Stop the stack with `make stop`. Never use
`make reset` unless deleting the local development database is intentional.

Run the complete pre-PR gate:

```bash
make release-check
```

That target runs web tests and builds, API lint/tests, migration drift checks,
and `git diff --check`. It may start the local PostgreSQL container. A
database-free API unit run is:

```bash
cd apps/api
uv run --no-sync python3 -m pytest -q unit_tests
```

## Architecture and module ownership

RoadForge has two valid operating modes:

```text
local roadmap
  browser state → scoped localStorage → portable JSON export

synced roadmap
  browser cache → typed web service → FastAPI router/service
                → PostgreSQL canonical snapshot + history/activity
                → relational projections (derived)
                → SSE/Redis coordination (volatile)
```

| Area | Primary owner | Change boundary |
| --- | --- | --- |
| Routes and page composition | `apps/web/src/app/` | Route entry points and server/client page boundaries |
| Workspace and feature UI | `apps/web/src/components/` | Rendering, accessible interaction, and feature composition |
| Client state transitions | `apps/web/src/hooks/` and `apps/web/src/context/` | Hydration, mutations, autosync, locks, claims, realtime, and modal lifecycle |
| Portable data rules | `apps/web/src/types/roadmap.ts`, `apps/web/src/lib/roadmap-validation.ts`, `roadmap-upgrade.ts`, and import/export helpers | Types, validation, repair, compatibility, merge, and export |
| Browser persistence | `apps/web/src/lib/storage.ts` | Roadmap-scoped `localStorage`, runtime metadata, and recovery cache |
| Browser/API contracts | `apps/web/src/services/` | HTTP, collaboration, lock, sharing, and realtime boundaries |
| API transport | `apps/api/src/api/routers/` and `schemas/` | Role checks at entry points and validated request/response contracts |
| API domain behavior | `apps/api/src/api/services/` | Authorization, roadmap writes, versions, sharing, locks, events, and projections |
| Database mapping | `apps/api/src/api/models/` | SQLAlchemy persistence model; schema changes require Alembic |
| Database evolution | `apps/api/alembic/versions/` | Forward migrations and compatibility with existing stored roadmaps |
| Deployment | `deploy/`, `docker-compose.yml`, and `docs/self-hosting.md` | Containers, proxy, backup/restore, update, and rollback operations |
| Canonical bundled template | `docs/roadforge-roadmap.json` | Parser-valid first-run template and current roadmap evidence |

`Workspace` is the browser composition root. Keep state ownership in focused
hooks/components rather than moving unrelated behavior into it. API routers
should remain thin; domain and authorization behavior belongs in services.
Do not bypass services from a new route merely to shorten a change.

Start architectural work with:

- [Architecture overview](architecture/overview.md);
- [Frontend foundation](frontend-foundation.md);
- [Backend API](backend-api.md);
- [Source-of-truth rules](architecture/source-of-truth-rules.md).

## Roadmap schema and compatibility

The actual import contract is implemented by
`apps/web/src/lib/roadmap-validation.ts`, with historical normalization in
`apps/web/src/lib/roadmap-upgrade.ts`. TypeScript interfaces alone do not prove
that imported data is accepted.

The portable document contains a roadmap name, phase list, and tag registry.
Phases own ordered tasks; task dependency IDs resolve within the roadmap.
Progress is derived from completion state. Exactly one eligible task may be
marked `next`. Runtime credentials, participant sessions, edit locks, conflict
state, and other volatile collaboration metadata are not portable data.

When changing the contract:

1. update the owned TypeScript type and the real parser/repair path;
2. preserve historical input behavior or add an explicit upgrade;
3. update maximal and historical compatibility fixtures;
4. update merge, replace, export, checkpoint, and restore tests;
5. update API schemas only when the synced contract changes;
6. validate `docs/roadforge-roadmap.json` through the real parser.

Do not weaken validation to make a fixture pass. Do not add a second hard-coded
template. Preserve unknown database data and persisted contracts unless an
explicit, tested migration owns the change.

## Storage and source-of-truth boundaries

| Data | Source of truth | Safety rule |
| --- | --- | --- |
| Local-only roadmap | Browser roadmap cache | Must remain useful without API access and export portably |
| Synced phases/tasks/tags | PostgreSQL roadmap snapshot | Browser cache is an optimistic working/recovery copy |
| Relational phase/task rows | PostgreSQL projections | Derived; parity/backfill guards must pass before relying on them |
| Versions and activity | PostgreSQL | Recovery/audit records; activity must not duplicate autosync actions |
| Locks, event tickets, rate limits | Memory for one worker or Redis for multi-worker | Volatile coordination, never portable roadmap content |
| Invite/session tokens and passwords | Sharing/session boundary | Never log, export, place in task text, or put into non-invite URLs |
| GitHub issues, PRs, commits, checks | GitHub | References do not automatically mutate RoadForge task state |

Read [source-of-truth rules](architecture/source-of-truth-rules.md) before
changing import/export, partial writes, storage, or external links.

## Security boundaries

RoadForge is accountless. Owner/editor/viewer access, invite tokens, optional
roadmap passwords, participant sessions, lock ownership, and claim override
rules are security boundaries—not UI hints.

- Enforce permissions in the API even when the web UI hides an action.
- Keep bearer credentials out of logs, exports, issue reports, analytics, URLs
  other than purpose-built invite links, and error messages.
- Preserve local drafts when sessions expire or access changes.
- Require Redis before enabling multiple API workers.
- Treat imports and user-authored Markdown/links as untrusted input.
- Do not add accounts, OAuth/OIDC, personal access tokens, public API v1, MCP,
  webhooks, service accounts, billing, or automatic GitHub task mutation.

Review [Access model](access-model.md), [Security documentation](security/README.md),
and [Public deployment security](public-deployment-security.md) for relevant
changes. Vulnerabilities must follow [SECURITY.md](../SECURITY.md).

## Tests and migrations

Frontend:

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm --dir apps/web test
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm lint
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm typecheck
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm build
```

API:

```bash
cd apps/api
uv run --no-sync ruff check src
uv run --no-sync python3 -m pytest -q
cd ../..
```

Use focused tests first. Database-backed API tests require PostgreSQL; do not
convert a connection failure into a passing skip.

Changes to hydration, filtering, import/export, or autosync payloads should also
run the scale benchmark and compare against the budgets in
[performance.md](performance.md):

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm --dir apps/web benchmark:roadmap
```

For a persistence change, add a new file under `apps/api/alembic/versions/`.
Never rewrite an applied migration. Run:

```bash
make api-migrate
make api-check
make api-test
```

Inspect the migration for existing-data safety and take a backup before any
production migration. Alembic downgrades are not a substitute for a tested
restore/rollback plan.

## Pull requests

Use `.github/pull_request_template.md`. A reviewable PR:

- solves one stated user or maintenance outcome;
- names data, API, storage, security, migration, and compatibility effects;
- includes focused regression tests and exact validation results;
- updates current documentation without rewriting historical records;
- contains no credentials, roadmap exports, private logs, generated caches, or
  unrelated cleanup.

The author owns a focused self-review of the diff. Reviewers prioritize
correctness, security, data integrity, compatibility, and missing tests over
style preferences.

## Labels and triage

Issue forms apply these intake labels:

| Label | Use |
| --- | --- |
| `bug` | Reproducible behavior defect |
| `usability` | Confusing, difficult, or error-prone workflow |
| `enhancement` | Focused feature outcome |
| `documentation` | Missing or inaccurate guidance |
| `self-hosting` | Installation, upgrade, recovery, or runtime operations |
| `accessibility` | Keyboard, assistive technology, semantics, reflow, contrast, motion, or touch barrier |

Maintainers confirm reproduction and scope, remove misapplied labels, add a
priority/milestone only after evidence, and close duplicates with a link to the
canonical report. Public issues containing secrets are treated as an incident:
minimize further exposure, rotate/revoke affected credentials, and move
security discussion to the private channel.

`good first issue` is reserved for bounded, reproducible work with:

- a clear user outcome and acceptance criteria;
- named implementation area and likely tests;
- no ambiguous product decision;
- no migration, authentication/authorization, lock/realtime state machine,
  import/export compatibility, or deployment-security ownership;
- enough maintainer context for a contributor to work without private data.

Add `help wanted` only when maintainers can review the area and the issue is
ready for implementation. Never use a newcomer label to delegate undefined
architecture or release responsibility.
