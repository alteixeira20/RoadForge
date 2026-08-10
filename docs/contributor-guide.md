# Contributor guide

This guide is the shortest path from a fresh clone to a safe RoadForge change. Read
[`docs/README.md`](README.md) first if you need to understand which documents are current
contracts versus design/history records.

## Reference toolchain

- Git
- Node.js **24** (`.nvmrc`)
- pnpm **9.15.9** (root `packageManager`)
- Python **3.12**
- `uv` for a direct Python development environment
- Docker + Docker Compose for the standard PostgreSQL/Redis-backed paths

The JavaScript manifests currently accept Node `>=22 <27`; Node 24 is the reference
version used for development/CI and the version contributors should use unless they are
explicitly testing compatibility.

## Fresh clone

```bash
git clone https://github.com/alteixeira20/RoadForge.git
cd RoadForge
corepack enable
pnpm install --frozen-lockfile
```

For direct API development:

```bash
cd apps/api
uv venv --python 3.12
uv pip install --python .venv/bin/python3 -e ".[dev,test,audit]"
cd ../..
```

Start the normal local stack:

```bash
make start
make status
```

RoadForge runs at `http://localhost:3020`; the local API is
`http://localhost:7878`. Stop it with `make stop`.

`make reset` destroys the local development database before starting the stack. Do not
use it merely to fix an application problem you have not understood.

## Pre-PR gate

Run:

```bash
make release-check
```

Use focused tests while iterating, but do not replace the final applicable gate with a
narrow test that happens to pass.

The exact release candidate additionally relies on GitHub Actions for browser, Redis,
dependency, container, deployment, and MCP evidence.

## Architecture in one page

RoadForge has two valid operating modes:

```text
local roadmap
  browser state -> scoped localStorage -> portable JSON export

synced roadmap
  browser cache -> typed web service -> FastAPI router/service
                -> PostgreSQL canonical snapshot + history/activity
                -> derivative relational projections
                -> memory/Redis realtime coordination
```

Important consequences:

- local-only roadmaps must remain useful without the API;
- for synced roadmaps, PostgreSQL roadmap snapshot/tag-registry data is canonical;
- phase/task relational rows are derivative and rebuildable;
- realtime events/locks/tickets are coordination state, not roadmap truth;
- optimistic writes use exact server revisions and must not silently overwrite conflicts;
- portable JSON contains roadmap planning data, never participant credentials or runtime state.

Start architectural work with:

- [`architecture/overview.md`](architecture/overview.md)
- [`architecture/source-of-truth-rules.md`](architecture/source-of-truth-rules.md)
- [`../docs/access-model.md`](access-model.md)
- [`frontend-foundation.md`](frontend-foundation.md)
- [`backend-api.md`](backend-api.md)

## Module ownership

| Area | Primary implementation boundary |
| --- | --- |
| Route/page composition | `apps/web/src/app/` |
| Workspace/feature UI | `apps/web/src/components/` |
| Client state and mutation orchestration | `apps/web/src/hooks/`, `apps/web/src/context/` |
| Portable roadmap parsing/repair | `apps/web/src/lib/roadmap-validation.ts`, `roadmap-upgrade.ts` |
| Browser persistence | `apps/web/src/lib/storage.ts` |
| Browser/API calls | `apps/web/src/services/` |
| API transport and schemas | `apps/api/src/api/routers/`, `schemas/` |
| API domain/authorization behavior | `apps/api/src/api/services/` |
| Database mapping | `apps/api/src/api/models/` |
| Schema evolution | `apps/api/alembic/versions/` |
| Production/self-hosting | `deploy/`, `docker-compose.yml`, operational docs |
| First-run starter example | `apps/web/src/data/roadforge-template.ts` |
| RoadForge project-planning snapshot | `docs/roadforge-roadmap.json` — planning only, **not** the starter template |

Keep API routers thin. Keep unrelated behavior out of `Workspace`. Components/hooks
should consume service modules rather than creating ad-hoc fetch calls.

## Roadmap data contract

The real browser import contract is owned by:

```text
apps/web/src/lib/roadmap-validation.ts
```

with historical normalization/upgrade behavior in the relevant upgrade helpers and
compatibility tests.

When changing portable roadmap data:

1. update the actual parser/repair path, not only TypeScript types;
2. preserve accepted historical inputs or add an explicit upgrade path;
3. update compatibility/maximal fixtures and round-trip tests;
4. update import merge/replace behavior;
5. update API schemas when the synced contract changes;
6. prove exports contain no runtime credentials.

Do not weaken validation only to make a sample file pass.

## Browser persistence

All browser persistence must go through the storage boundary rather than direct component
`localStorage` writes for roadmap/auth state.

Storage failures are product-visible because local-only roadmap durability depends on the
browser. A failed write must not be represented as a successful save.

Display-only preferences may have separate storage only when their value justifies a new
persistence contract; avoid creating local preference systems for trivial presentation
choices.

## Authorization and security

RoadForge is accountless, but protected server operations are authenticated and
role-scoped.

Preserve these rules:

- enforce owner/editor/viewer permissions in the API;
- never log/export raw invite tokens, participant session tokens, passwords, or Redis/database credentials;
- keep participant credentials out of normal URLs;
- preserve local drafts when access expires/revokes or server writes fail;
- use Redis before multiple API processes/instances share realtime state;
- treat imports, Markdown, and external links as untrusted input;
- do not smuggle accounts/OAuth/global API keys into an unrelated feature.

Security-sensitive changes require negative authorization tests, not only successful
owner-path coverage.

## Tests

Frontend unit/static checks:

```bash
pnpm --dir apps/web test
pnpm --dir apps/web lint
pnpm --dir apps/web typecheck
pnpm --dir apps/web build
```

Browser tests:

```bash
pnpm --dir apps/web test:browser
pnpm --dir apps/web test:browser:production
```

API:

```bash
make api-lint
make api-test
make api-check
```

MCP:

```bash
pnpm --dir packages/roadforge-mcp check
```

Performance-sensitive roadmap/import/filter/hydration changes should also run:

```bash
pnpm --dir apps/web benchmark:roadmap
```

Use [performance.md](performance.md) for the budget contract.

## Database migrations

Persisted schema changes require a new Alembic revision. Never rewrite an applied
migration.

Run:

```bash
make api-migrate
make api-check
make api-test
```

Review existing-data safety. A migration downgrade is not a generic production rollback
plan; production rollback may require the pre-migration PostgreSQL backup.

## Pull-request shape

A reviewable PR should:

- solve one stated user/maintenance outcome;
- name data/API/security/deployment compatibility effects;
- add focused regression coverage;
- update current docs when a contract changed;
- leave historical design records clearly classified rather than pretending old plans are current;
- contain no secrets/private roadmap data/generated local artifacts;
- state anything important that was not tested.

Reviewers prioritize data integrity, authorization, compatibility/recovery, and missing
tests before stylistic preference.

## Good first issues

Use `good first issue` only for work that already has:

- a bounded user outcome;
- reproducible evidence or clear acceptance criteria;
- a likely implementation area;
- a likely validation path;
- no unresolved product/security architecture decision.

Do not assign first-time contributors migrations, access-control redesign, realtime state
machines, import compatibility ownership, or production incident responsibility merely
because the code change looks small.

## Documentation rule

If you add or change documentation, classify it according to [`docs/README.md`](README.md).
Current contracts should remain concise and code-backed; implementation-history files
should state when they are implemented/superseded.
