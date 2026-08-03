# RoadForge

RoadForge by Anvilary is a local-first roadmap tool for people and small teams.
Create phases, tasks, dependencies, tags, and portable backups without an
account. Enable server sync only when you need sharing and realtime
collaboration.

> **Pre-release software**
>
> Export important roadmaps regularly. Data formats and deployment requirements
> may still change before the first stable release.

RoadForge is distributed under the
[PolyForm Noncommercial License 1.0.0](LICENSE). It is source-available for
non-commercial use, not open source under the Open Source Definition, and
commercial use remains restricted.

## Product principles

- **Local first:** new roadmaps live in the browser and work offline.
- **No account:** access is granted through scoped owner, editor, and viewer
  credentials.
- **Portable:** JSON is the canonical backup/import format; Markdown is a compact
  human- and agent-readable view.
- **Explicit collaboration:** saving to a server is a deliberate action.
- **Recoverable:** local drafts survive failed saves, conflicts require an
  explicit choice, and shared roadmaps support restore points.
- **Simple by default:** a new roadmap can start blank or from a three-phase,
  nine-task example.

## Access model

RoadForge has no login system or verified personal identities.

- **Owner:** edit, restore versions, manage links and participants, override task
  claims, and delete the roadmap.
- **Editor:** edit roadmap content and claim tasks.
- **Viewer:** read roadmap content and activity.

Owner and editor invite links are bearer credentials. Share them privately.
Viewer links are intentionally read-only. Display names are collaboration labels,
not verified identities.

Assignees and participants are different:

- an **assignee** is a task-local label and works in local-only roadmaps;
- a **participant** is a server-side session created by joining a shared roadmap.

## Data and exports

Browser-local roadmaps are stored in `localStorage`. Clearing site data can remove
them, so keep JSON backups of important work.

- **JSON:** complete portable roadmap data, suitable for re-import.
- **Markdown:** deterministic presentation format for people and agents; it does
  not contain credentials and cannot be imported.

Exports exclude session tokens, invite tokens, passwords, and transient edit
locks.

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspace |
| Frontend | Next.js App Router, TypeScript, Tailwind CSS |
| Client persistence | browser `localStorage` |
| Backend | FastAPI, Python 3.12 |
| Database | PostgreSQL 16 |
| Realtime | Server-Sent Events with memory or Redis coordination |
| Migrations | Alembic |
| Agent integration | Publishable stdio MCP package (`packages/roadforge-mcp`) |
| Deployment | Docker Compose and nginx |

## Local development

Requirements:

- Node.js version from [`.nvmrc`](.nvmrc)
- pnpm
- Python 3.12 for direct API development
- Docker and Docker Compose for the standard backend stack

Copy the development environment template when needed:

```bash
cp .env.example .env.local
```

Common commands:

```bash
make help
make start
make status
make logs
make stop
```

Run the full validation gate before opening a pull request:

```bash
make check
make release-check
```

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

## Production deployment

Use the maintained deployment files under [`deploy/self-hosted`](deploy/self-hosted/README.md).
The normal server update path is:

```bash
cd /opt/stacks/roadforge/src
make update
```

Every release must migrate to the current Alembic head. Do not use a
release-specific migration instruction.

Production requirements:

- terminate HTTPS at a trusted reverse proxy;
- configure explicit CORS origins;
- trust forwarded client addresses only from the narrowest proxy IP/CIDR;
- omit query strings and referrers from logs because URL credentials are used;
- keep one API worker with memory realtime, or use Redis for multiple workers;
- back up PostgreSQL before schema-sensitive releases;
- validate create, share, join, conflict, export, and import flows in a browser.

The API container runs as a non-root user. API, browser import, and supplied nginx
configuration use the same 5 MiB roadmap payload limit.

See [Public Deployment Security](docs/public-deployment-security.md) for the
current security contract.

## Configuration

Important variables:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Browser-visible API base URL |
| `DATABASE_URL` | FastAPI and Alembic PostgreSQL connection |
| `POSTGRES_PASSWORD` | Compose PostgreSQL password |
| `ROADFORGE_ENVIRONMENT` | `development` or `production` behavior |
| `ROADFORGE_WEB_BASE_URL` | Base URL used to construct join links |
| `ROADFORGE_CORS_ORIGINS` | Explicit comma-separated browser origins |
| `ROADFORGE_TRUSTED_PROXY_IPS` | Proxies allowed to supply forwarded client IPs |
| `ROADFORGE_REALTIME_BACKEND` | `memory` or `redis` |
| `REDIS_URL` | Required when Redis realtime is enabled |
| `ROADFORGE_API_WORKERS` | Must be `1` with memory realtime |
| `ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED` | Optional derivative projection reads; disabled by default |

RoadForge intentionally has no generic application secret setting. Add one only
when a concrete cryptographic feature actually consumes it.

## API model

The browser uses a JSON HTTP API under `/api`. Major surfaces include:

- roadmap create, read, update, and delete;
- partial task updates, completion, and claims;
- tag registry operations;
- role-scoped invite links and participant management;
- activity, versions, checkpoints, and restore;
- edit locks and SSE tickets/events.

Shared roadmap writes use optimistic concurrency. Clients must echo the server's
latest update token; stale or future values cannot overwrite newer data.

## Agent and MCP integration

The publishable [`@anvilary/roadforge-mcp`](packages/roadforge-mcp/README.md) package exposes a
small, roadmap-scoped stdio tool surface. It reads credentials only from the MCP
host environment, defaults to deterministic compact context, and uses the same
optimistic-concurrency token as the web application. No account system or generic
public API key is introduced.

The package is ready to run from the repository. Publishing it to npm is a
separate release action after this branch is validated. See [MCP integration](docs/mcp.md).

Detailed references:

- [Backend API](docs/backend-api.md)
- [Architecture](docs/architecture/overview.md)
- [Access model](docs/access-model.md)
- [Manual QA](docs/manual-qa.md)
- [Performance](docs/performance.md)
- [Self-hosting](docs/self-hosting.md)

## Security and support

Run dependency and release checks for every candidate:

```bash
make audit
make release-check
```

See:

- [Security policy](SECURITY.md)
- [Security documentation](docs/security/README.md)
- [Dependency audit policy](docs/security/dependency-audit-policy.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)

Do not post invite links, session tokens, private exports, database credentials,
or unredacted private logs in public issues.
