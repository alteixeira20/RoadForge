# RoadForge

RoadForge by Anvilary is a local-first roadmap tool for individuals and small teams.
Create phases, tasks, dependencies, tags, and portable backups without an account.
Enable server sync only when you deliberately want sharing and realtime collaboration.

**Release target:** `0.1.0`

> [!IMPORTANT]
> The hosted RoadForge instance at `roadforge.anvilary.tools` is a convenience demo,
> not a managed storage service or the only place you should keep important work.
> Browser-local roadmaps depend on browser storage, and hosted synced roadmaps have no
> durability or recovery guarantee. **Export important roadmaps as JSON and keep that
> file somewhere you control.**

RoadForge is currently distributed under the
[PolyForm Noncommercial License 1.0.0](LICENSE). That license is source-available
for non-commercial use and is **not** an OSI-approved open-source license. The
engineering repository is being prepared for the `0.1.0` baseline independently
from any future relicensing decision.

## Product contract

RoadForge intentionally keeps its core model small:

- **Local first.** A new roadmap starts in the browser and does not require the API.
- **No accounts.** Shared access uses roadmap-scoped owner, editor, and viewer credentials.
- **Portable.** JSON is the canonical backup/import format. Markdown is a deterministic read-only export.
- **Explicit sync.** Moving a roadmap to the server is a deliberate user action.
- **Recoverable.** Local drafts survive failed saves, conflicts preserve local work, and synced roadmaps support bounded restore history.
- **Simple by default.** Start blank or from a compact three-phase example.

RoadForge is not trying to become an account-based project-management suite. Accounts,
OAuth, billing, generic webhooks, CRDT infrastructure, and automatic GitHub-to-roadmap
state mutation are outside the `0.1.0` product contract.

## Hosted demo and data ownership

The online Anvilary deployment is primarily for trying RoadForge and demonstrating
collaboration. Treat it as disposable infrastructure:

1. Create or open a roadmap.
2. Export **JSON** after meaningful work.
3. Store the JSON in your own filesystem, cloud drive, repository, or backup system.
4. Re-export periodically while the roadmap changes.

Clearing browser site data can remove local-only roadmaps. Server-side deletion is
currently soft deletion and final retention/purge behavior is still a tracked release
hardening item. Do not place secrets in roadmap content or exports.

## Access model

RoadForge has no login system or verified personal identities.

- **Owner** — edit, manage sharing and participants, restore versions, override claims, and delete the roadmap.
- **Editor** — edit roadmap content and claim tasks.
- **Viewer** — read roadmap content and activity.

Owner/editor invite links and participant sessions are bearer credentials. Share them
privately. Viewer links are intentionally read-only. Display names are collaboration
labels, not verified identities.

Task assignees and server participants are separate concepts: an assignee is roadmap
data; a participant is a joined server session.

## Data formats

Browser-local roadmaps are stored in scoped `localStorage`. A storage failure is shown
as a persistent warning rather than being treated as a successful save.

- **JSON** — complete portable roadmap data and the supported re-import format.
- **Markdown** — deterministic human/agent-readable presentation; not importable.

Exports exclude session tokens, invite tokens, passwords, edit locks, and transient
collaboration state.

The maintained import/parser contract lives in
`apps/web/src/lib/roadmap-validation.ts`; TypeScript interfaces and historical design
documents do not override the parser.

## Stack

| Layer | Technology |
| --- | --- |
| Monorepo | pnpm workspace |
| Frontend | Next.js App Router, TypeScript, Tailwind CSS |
| Client persistence | browser `localStorage` |
| Backend | FastAPI, Python 3.12 |
| Database | PostgreSQL 16 |
| Realtime | Server-Sent Events with memory or Redis coordination |
| Migrations | Alembic |
| Agent integration | repository-local stdio MCP package |
| Deployment | Docker Compose and nginx |

## Local development

Reference toolchain:

- Node.js **24** (`.nvmrc`)
- pnpm **9.15.9** (`packageManager`)
- Python **3.12**
- Docker + Docker Compose for the standard backend/test stack

The package manifests currently accept Node `>=22 <27`; Node 24 is the canonical
version used by development and CI.

```bash
git clone https://github.com/alteixeira20/RoadForge.git
cd RoadForge
corepack enable
pnpm install --frozen-lockfile
make start
```

Useful lifecycle commands:

```bash
make help
make status
make logs
make stop
```

Run the normal contributor gate before opening a pull request:

```bash
make release-check
```

The complete exact-head release evidence additionally runs in GitHub Actions, including
browser, Redis, dependency, container, deployment, and MCP checks.

Focused commands:

```bash
pnpm --dir apps/web test
pnpm --dir apps/web lint
pnpm --dir apps/web typecheck
pnpm --dir apps/web build
pnpm --dir packages/roadforge-mcp check

cd apps/api
python -m pytest -q
ruff check src/
alembic check
```

## Architecture

RoadForge supports two modes:

```text
local roadmap
  browser state -> scoped localStorage -> portable JSON

synced roadmap
  browser cache -> typed web service -> FastAPI
                -> PostgreSQL canonical snapshot + history/activity
                -> derivative relational projection
                -> SSE / Redis volatile coordination
```

For synced roadmaps, `roadmaps.snapshot_json` plus the roadmap tag registry are the
canonical current document. Relational phase/task tables are derivative and must be
rebuildable from the snapshot. Optimistic writes use an exact server revision token;
a stale or future revision does not silently overwrite newer work.

Start with:

- [Architecture overview](docs/architecture/overview.md)
- [Source-of-truth rules](docs/architecture/source-of-truth-rules.md)
- [Access model](docs/access-model.md)
- [Frontend foundation](docs/frontend-foundation.md)
- [Backend API](docs/backend-api.md)

## Health and operations

Public deployments must terminate HTTPS at a trusted edge, configure explicit CORS
origins, restrict trusted proxy addresses, and keep credentials/query strings out of
retained logs.

Health endpoints have one contract:

- `/api/health/live` — process liveness only.
- `/api/health/ready` — PostgreSQL plus configured Redis readiness.
- `/api/health` — backward-compatible alias for readiness.

Use the maintained production example under [`deploy/self-hosted`](deploy/self-hosted/README.md)
and read [Public deployment security](docs/public-deployment-security.md) before exposing
an instance.

## Known `0.1.0` boundaries

These are explicit release boundaries, not hidden guarantees:

- browser-local data can be lost when site storage is cleared;
- the hosted Anvilary instance is a demo/convenience deployment, not a managed backup service;
- Content Security Policy is report-only pending an enforced nonce-based design;
- deleted server roadmaps do not yet have the final automated purge policy;
- the Python dependency graph is audited but still needs a committed generated lock;
- MCP currently reuses participant credentials and remains experimental;
- multi-browser/deployed collaboration still requires release-candidate manual validation.

Tracked hardening work should be resolved independently rather than hidden inside new
feature development.

## Contributing

Contributions should be small, reviewable, and backed by the relevant tests. Start with
[CONTRIBUTING.md](CONTRIBUTING.md) and the
[contributor guide](docs/contributor-guide.md). Use the issue chooser for bugs,
usability, documentation, self-hosting, and accessibility reports.

Security vulnerabilities must be reported privately through [SECURITY.md](SECURITY.md).
Never publish invite links, participant session tokens, passwords, private roadmap
exports, database credentials, or unredacted private logs in an issue.

## Release evidence

A release candidate is acceptable only when the exact candidate revision has green
required CI and the relevant deployed/manual checks are complete. A historical green
run does not certify a later commit.

See:

- [Senior readiness audit](docs/senior-readiness-audit.md)
- [Manual QA](docs/manual-qa.md)
- [Performance baseline](docs/performance.md)
- [Security documentation](docs/security/README.md)
- [Self-hosting](docs/self-hosting.md)
- [Support](SUPPORT.md)

RoadForge `0.1.0` is intended to be the stable baseline from which future feature work
can proceed without changing these core data-ownership and collaboration principles.
