# RoadForge

A structured roadmap planning tool for indie hackers and small teams. Break a release into phases, track task dependencies, and share access via private invite links. No accounts required.

**Current status:** v0.1 manual-testing candidate. Core create/save/share/join flow is wired, and realtime collaboration (SSE) is active. Security and UX hardening are still in progress.

---

## Access model

RoadForge is accountless. There are no logins, user records, or dashboards.

- **Create** — owner saves a roadmap, receives a session token and three role-specific share links.
- **Share** — send an invite link to collaborators. Links are role-scoped (owner / editor / viewer) and revocable.
- **Join** — visitor opens the link, optionally enters a display name, and receives a session token for that role.
- **Password gate** — roadmaps can optionally require a password before a join token is issued.
- **Session token** — stored in `localStorage` after create or join and sent as a Bearer token for authorized actions.
- **Display name** — optional, used only as a collaboration label. Blank joins get a role-based default ("Guest Editor", etc.).

Nothing is emailed. Nothing is verified. The invite link is the durable access handle.

---

## Security audit note

RoadForge is built with a security-first mindset, but is currently in a pre-production state.

- **High/Critical Gate:** `pnpm audit --audit-level high` passes with zero vulnerabilities.
- **PostCSS Advisory:** A moderate vulnerability (`GHSA-qx2v-qp2m-jg93`) is reported in plain `pnpm audit` due to an internal dependency of Next.js 15.
- **Mitigation:** Direct `postcss` used by the web app is pinned to `8.5.14` (patched). RoadForge does not generate user-controlled CSS in style tags.
- **Status:** Overrides, `pnpm patch`, and Next.js 16 were evaluated and did not safely resolve this upstream dependency issue. We are tracking this and will update Next.js once a clean patch is available.

---

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspace |
| Frontend | Next.js 15 App Router, TypeScript 5 |
| Styling | Tailwind CSS v3 + CSS custom properties |
| Client persistence | `localStorage` (local-first, optimistic cache) |
| Realtime | Server-Sent Events (SSE) + In-memory task locks |
| Backend | FastAPI, Python 3.12 |
| Database | PostgreSQL 16 |
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
- **CSP required** — a strict Content Security Policy is deferred in the current MVP but should be implemented before any multi-user public deployment.
- **Single-worker API** — the API uses in-memory singletons for locks, SSE, and realtime state. Always run exactly one Uvicorn worker (`--workers 1` is set in the Dockerfile CMD). Do not override this in compose files or orchestration configs.
- **Run `make check` before deploying** — this runs `pnpm lint`, `pnpm typecheck`, and `pnpm build`. All three must pass with zero errors and zero warnings.
- **Database migrations before rollback** — Alembic migrations are not reversible by default. Take a Postgres snapshot before any release that includes new files under `apps/api/alembic/versions/`.

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

# Run migrations (after adding new models)
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
| `ROADFORGE_WEB_BASE_URL` | `http://localhost:3020` | Backend — builds `/join?token=…` URLs |

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

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/roadmaps` | Create roadmap, returns share links + owner session token |
| `GET` | `/api/roadmaps/{id}` | Fetch roadmap and phases |
| `PUT` | `/api/roadmaps/{id}` | Update name and/or phases (full snapshot replace) |
| `GET` | `/api/roadmaps/{id}/share-links` | List active share links (url is null — tokens not re-exposed) |
| `POST` | `/api/roadmaps/{id}/share-links/{role}/rotate` | Generate new token for role, returns join URL |
| `DELETE` | `/api/roadmaps/{id}/share-links/{role}` | Revoke share link (soft-deactivate) |
| `POST` | `/api/roadmaps/join` | Accept invite token, create participant, return session token |

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
- **Activity log UI** — the backend logs all events; there is no frontend view yet.
- **Email verification** — not implemented. Planned as an optional future security layer.
- **Deployment hardening** — rate limiting, HTTPS enforcement, and CSP are pending before public production-ready deployment.

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
│           ├── services/     # roadmap.service.ts (all HTTP calls)
│           ├── styles/       # CSS split by concern
│           └── types/        # TypeScript types
└── docs/                     # Architecture and API documentation
```

---

## Development disclosure

RoadForge is a human-directed project developed with assistance from coding tools.

These tools were used for implementation planning, code drafting, refactoring support, and documentation drafts. Final product direction, code review, testing, and acceptance remain human-controlled.