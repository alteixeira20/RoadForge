# RoadForge

RoadForge by Anvilary is a structured roadmap planning tool for indie hackers and small teams. Break a release into phases, track task dependencies, and share access through private owner/editor invite links or a stable public read-only viewer link. No accounts required.

> **Public Alpha · Work in Progress**
>
> RoadForge is pre-release software. Core create/save/share/join and realtime
> collaboration are implemented, but behavior, data formats, and deployment
> requirements may change. Export important roadmaps regularly and do not treat
> the hosted alpha as the only copy of critical data.

**Current status:** v0.1 alpha. Security, collaboration, accessibility,
and UX hardening are still in progress. Known launch work is tracked in
[`docs/project-audit-2026-06-13.md`](docs/project-audit-2026-06-13.md).

**Repository and source release:** The repository and codebase are private during
Public Alpha. A public source release is planned when RoadForge is beta-ready.
That release is intended to be non-commercial source-available software, not
permissive open source; commercial use will remain restricted. The planned terms
are represented by the [PolyForm Noncommercial License 1.0.0](LICENSE).

---

## Access model

RoadForge is accountless. There are no logins, user records, or dashboards.

- **Create** — owner saves a roadmap, receives a session token and three role-specific share links.
- **Share** — send private owner/editor invite links to collaborators, or copy a stable public viewer/demo link for read-only sharing. Links are role-scoped and revocable.
- **Join** — visitor opens the link, optionally enters a display name, and receives a session token for that role.
- **Password gate** — roadmaps can optionally require a password before a join token is issued.
- **Session token** — stored in scoped `localStorage` after create or join and sent as a Bearer token for authorized actions.
- **Display name** — optional, used only as a collaboration label. Blank joins get a role-based default ("Guest Editor", etc.).

Nothing is emailed. Nothing is verified. Private owner/editor invite links are sensitive credentials. The public viewer link is intentionally read-only and suitable for a README, portfolio, or live demo.

Assignees and collaborators are separate concepts:

- **Assignees** are task-local names used for filters and workload views. They can exist in local-only roadmaps.
- **Participants / collaborators** are server-side joined users with roles and sessions. Team management is shown only for synced owner roadmaps.

---

## Security note

RoadForge is built with a security-first mindset, but remains alpha/WIP software.

CI defines dependency, lint, test, migration, and build gates. Those checks are
point-in-time evidence and must be rerun for each release candidate. See
[`SECURITY.md`](SECURITY.md) and the
[`dependency audit policy`](docs/security/dependency-audit-policy.md).

---

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspace |
| Frontend | Next.js 15 App Router, TypeScript 5 |
| Styling | Tailwind CSS v3 + CSS custom properties |
| Client persistence | `localStorage` (local-first, optimistic cache) |
| Realtime | Server-Sent Events (SSE) + memory or Redis-backed coordination |
| Backend | FastAPI, Python 3.12 |
| Database | PostgreSQL 16 |
| Redis | Provisioned in Compose; required for multi-worker realtime mode |
| ORM / migrations | SQLAlchemy 2.x async + asyncpg + Alembic |
| Container | Docker Compose |

---

## Local development setup

### Prerequisites

- Node.js 20+, pnpm 9+
- Docker + Docker Compose (backend only)

### Quick Start (Makefile)

The repository includes a `Makefile` for full background lifecycle management:

```bash
make help           # List all available commands
make start          # Start everything (API in Docker, Web in background)
make status         # Check what is running
make logs           # Follow all logs (API + Web)
make stop           # Stop everything
```

---

## Production hardening

Before self-hosting or releasing RoadForge publicly:

- **Do not expose `make dev`** — always run a production build (`pnpm build`) and start the production server (`pnpm --filter web start`).
- **Use a reverse proxy** — terminate TLS (HTTPS) at a proxy like Caddy or Nginx.
- **Enable HSTS** — configure HTTP Strict Transport Security at the proxy level.
- **Configure proxy logs** — invite tokens appear in URLs; ensure your proxy is configured not to log full query strings if possible, or restrict log access.
- **Run security audits** — regularly run `make audit` and address high-severity vulnerabilities.
- **Review CSP reports** — the current application emits a report-only Content
  Security Policy. Review violations and move to enforcement only after the release
  candidate works without required exceptions.
- **API worker mode** — the API defaults to one Uvicorn worker. Set `ROADFORGE_API_WORKERS` above `1` only with `ROADFORGE_REALTIME_BACKEND=redis`; container startup refuses unsafe memory-backed multi-worker mode.
- **Run `make check` before deploying** — this runs `pnpm lint`, `pnpm typecheck`, and `pnpm build`. All three must pass with zero errors and zero warnings.
- **Database migrations before rollback** — Alembic migrations are not reversible by default. Take a Postgres snapshot before any release that includes new files under `apps/api/alembic/versions/`.
- **Run migrations on deploy** — releases at or after `0005_add_public_viewer_tokens.py` require `make migrate` so active viewer links can remain copyable as public read-only demo links.

---

## Makefile targets

| Target | Description |
|---|---|
| `make start` | Start all services (API in Docker, Web in background) |
| `make stop` | Stop all services |
| `make restart` | Stop and then start all services |
| `make status` | Show status of all services |
| `make logs` | Follow all logs (API, Postgres, Web) |
| `make reset` | Destructive reset: wipe DB and start fresh |
| `make check` | Run linting, typechecking, and production build |
| `make audit` | Run dependency security audit |
| `make audit-prod` | Run dependency security audit (production only) |
| `make dev` | Run Next.js frontend in the foreground (standard dev) |
| `make api-up` | Start Postgres and FastAPI in Docker |
| `make api-down` | Stop backend services |
| `make api-migrate` | Run database migrations |
| `make api-health` | Check if backend is reachable |
| `make web-start` | Start frontend in the background |
| `make web-stop` | Stop background frontend process |
| `make logs-web` | Follow Web logs specifically |

---

## Frontend commands

```bash
pnpm dev          # Dev server
pnpm build        # Production build (all 5 routes must build statically)
pnpm lint         # ESLint — must pass with no warnings
pnpm typecheck    # tsc --noEmit — must pass with 0 errors
```

---

## Backend commands

```bash
# Start API + Postgres
docker compose up --build api postgres

# Confirm health
curl http://localhost:7878/api/health
# → {"status":"ok","version":"0.1.0"}

# Interactive docs
open http://localhost:7878/api/docs

# Run migrations (required after schema releases such as 0005_add_public_viewer_tokens.py)
docker compose exec api alembic upgrade head

# View API logs
docker compose logs --tail=40 api

# Stop
docker compose down
```

---

## Environment variables

Defined in `.env.example`. Copy to `.env.local` for local overrides.

| Variable | Default | Used by |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:7878` | Frontend — base URL for all API calls |
| `DATABASE_URL` | `postgresql+asyncpg://roadforge:roadforge_dev@localhost:5433/roadforge` | Alembic / host-side scripts |
| `POSTGRES_DB` | `roadforge` | Docker Compose |
| `POSTGRES_USER` | `roadforge` | Docker Compose |
| `POSTGRES_PASSWORD` | `roadforge_dev` | Docker Compose |
| `ROADFORGE_ENVIRONMENT` | `development` | Backend — log verbosity, SQL echo |
| `ROADFORGE_SECRET_KEY` | unset | Backend — required non-default production secret guard outside development |
| `ROADFORGE_TRUSTED_PROXY_IPS` | unset | Backend — comma-separated proxy IPs/CIDRs allowed to supply forwarded client IP headers |
| `ROADFORGE_ALLOW_LOCAL_DATABASE_IN_PRODUCTION` | `false` | Backend — explicit override for documented host-local production DB topologies |
| `ROADFORGE_WEB_BASE_URL` | `http://localhost:3020` | Backend — builds `/join?token=…` URLs |
| `REDIS_URL` | `redis://redis:6379/0` | Backend Redis connection string |
| `ROADFORGE_REALTIME_BACKEND` | `memory` | Backend realtime storage, `memory` or `redis` |
| `ROADFORGE_REDIS_KEY_PREFIX` | `roadforge` | Backend namespace for Redis keys |
| `ROADFORGE_API_WORKERS` | `1` | Backend Uvicorn worker count; values greater than `1` require `ROADFORGE_REALTIME_BACKEND=redis` |

---

## Manual QA

See [docs/manual-qa.md](docs/manual-qa.md) for the full pre-release QA checklist
(functional, collaboration, import/export, security, and deployment verification).
For a focused backend API smoke test with curl commands, see
[docs/backend-smoke-tests.md](docs/backend-smoke-tests.md).

For security policies and responsible disclosure, see [SECURITY.md](SECURITY.md) and [docs/security/README.md](docs/security/README.md).
For public deployment security assumptions, see [docs/public-deployment-security.md](docs/public-deployment-security.md).
For non-commercial self-hosting, see [docs/self-hosting.md](docs/self-hosting.md).
For contribution and support expectations, see [CONTRIBUTING.md](CONTRIBUTING.md)
and [SUPPORT.md](SUPPORT.md).

---

## Manual MVP test flow

Quick path:
1. `docker compose up --build api postgres` + `pnpm dev`
2. Open `http://localhost:3020`, complete wizard, click **Save to server**
3. Open Share modal — rotate editor link, copy the URL
4. Open a private browser window, paste the URL — join without a name
5. Confirm editor is routed to `/workspace`, viewer to `/shared`

---

## Backend API summary

Full reference: [docs/backend-api.md](docs/backend-api.md)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/roadmaps` | Create roadmap, returns share links + owner session token |
| `POST` | `/api/roadmaps/join` | Accept invite token, create participant, return session token |
| `GET` | `/api/roadmaps/{id}` | Fetch roadmap and phases |
| `PUT` | `/api/roadmaps/{id}` | Update name and/or phases (full snapshot replace) |
| `PATCH` | `/api/roadmaps/{id}/tasks/{task_id}/done` | Set task completion with optimistic concurrency |
| `PATCH` | `/api/roadmaps/{id}/tasks/{task_id}/claim` | Claim a task; owner may explicitly override |
| `DELETE` | `/api/roadmaps/{id}/tasks/{task_id}/claim` | Release a task claim; owner may explicitly override |
| `DELETE` | `/api/roadmaps/{id}` | Soft-delete roadmap; broadcasts `roadmap.deleted` SSE event |
| `GET` | `/api/roadmaps/{id}/share-links` | Owner-only share-link list; owner/editor URLs stay hidden, active viewer URL is copyable |
| `POST` | `/api/roadmaps/{id}/share-links/{role}/rotate` | Generate new token for role, returns join URL |
| `DELETE` | `/api/roadmaps/{id}/share-links/{role}` | Revoke share link (soft-deactivate) |
| `GET` | `/api/roadmaps/{id}/participants` | Owner full list; editor active-participant summaries |
| `POST` | `/api/roadmaps/{id}/participants/{pid}/revoke` | Revoke participant session; broadcasts `participant.revoked` |
| `GET` | `/api/roadmaps/{id}/versions` | List version history summaries |
| `POST` | `/api/roadmaps/{id}/versions/checkpoint` | Create a manual checkpoint snapshot |
| `GET` | `/api/roadmaps/{id}/versions/{vid}` | Fetch a specific version's full phase snapshot |
| `POST` | `/api/roadmaps/{id}/versions/{vid}/restore` | Restore roadmap to a previous version |
| `GET` | `/api/roadmaps/{id}/activity` | Paginated activity log (newest first) |
| `POST` | `/api/roadmaps/{id}/events/ticket` | Request a short-lived SSE ticket |
| `GET` | `/api/roadmaps/{id}/events` | SSE stream (ticket auth via query param) |
| `POST` | `/api/roadmaps/{id}/locks` | Acquire or refresh an edit lock |
| `DELETE` | `/api/roadmaps/{id}/locks/{target}` | Release a lock |
| `GET` | `/api/roadmaps/{id}/locks` | List active locks |
| `GET` | `/api/roadmaps/{id}/tags` | List tag registry |
| `POST` | `/api/roadmaps/{id}/tags` | Create a tag |
| `PUT` | `/api/roadmaps/{id}/tags/{tag_id}` | Update a tag |
| `DELETE` | `/api/roadmaps/{id}/tags/{tag_id}` | Delete an unused tag |

---

## Frontend routes

| Route | Component | Notes |
|---|---|---|
| `/` | `Homepage` / `Workspace` | Wizard on first visit; workspace after |
| `/workspace` | `Workspace` (owner mode) | Editable, save/share controls |
| `/shared` | `Workspace` (viewer mode) | Read-only with viewer banner |
| `/join` | `JoinPage` | Reads `?token=`, optional name + password |

---

## Current limitations / deferred features

- **Markdown/PDF export** — requires backend; currently shows a toast.
- **Email verification** — not implemented. Planned as an optional future security layer.
- **Rate limiting** — app-level rate limiting is active. It is shared across workers only when `ROADFORGE_REALTIME_BACKEND=redis`.
- **Content Security Policy** — a report-only policy is active; enforcement remains deferred.
- **No CRDT merge UI** — conflict recovery reloads the server version; there is no three-way merge.
- **Memory backend is single-worker only** — `ROADFORGE_API_WORKERS>1` requires `ROADFORGE_REALTIME_BACKEND=redis`.

---

## Project structure

```
roadforge/
├── apps/
│   ├── api/                  # FastAPI backend
│   │   ├── alembic/          # Migrations
│   │   └── src/api/
│   │       ├── models/       # SQLAlchemy ORM models
│   │       ├── routers/      # Route handlers
│   │       ├── schemas/      # Pydantic request/response models
│   │       └── services/     # Business logic
│   └── web/                  # Next.js frontend
│       └── src/
│           ├── app/          # App Router routes
│           ├── components/   # UI components by feature
│           ├── context/      # RoadmapContext, ThemeContext
│           ├── hooks/        # Custom hooks
│           ├── lib/          # storage.ts (localStorage helpers)
│           ├── services/     # domain API clients + legacy compatibility barrel
│           ├── styles/       # CSS split by concern
│           └── types/        # TypeScript types
└── docs/                     # Architecture and API documentation
```

---

## Development disclosure

RoadForge is a human-directed project developed with assistance from coding tools.

These tools were used for implementation planning, code drafting, refactoring support, and documentation drafts. Final product direction, code review, testing, and acceptance remain human-controlled.
