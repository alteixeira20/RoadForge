# RoadForge

A structured roadmap planning tool for indie hackers and small teams. Break a release into phases, track task dependencies, and share access via private invite links. No accounts required.

**Current status:** Local MVP candidate. Core create/save/share/join flow is wired for manual testing. Security and UX hardening are still in progress.

---

## Access model

RoadForge is accountless. There are no logins, user records, or dashboards.

- **Create** — owner saves a roadmap, receives a session token and three role-specific share links.
- **Share** — send an invite link to collaborators. Links are role-scoped (owner / editor / viewer) and revocable.
- **Join** — visitor opens the link, optionally enters a display name, and receives a session token for that role.
- **Password gate** — roadmaps can optionally require a password before a join token is issued. Password gates are currently available through the API; the Save UI does not expose password setup yet.
- **Display name** — optional, used only as a collaboration label. Blank joins get a role-based default ("Guest Editor", etc.).
- **Session token** — stored in `localStorage` after create or join. Session tokens are stored locally after create/join and will be used by protected endpoints in a later authorization slice.

Nothing is emailed. Nothing is verified. The invite link is the durable access handle.

---

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspace |
| Frontend | Next.js 15 App Router, TypeScript 5 |
| Styling | Tailwind CSS v3 + CSS custom properties |
| Client persistence | `localStorage` (local-first, optimistic cache) |
| Backend | FastAPI, Python 3.12 |
| Database | PostgreSQL 16 |
| ORM / migrations | SQLAlchemy 2.x async + asyncpg + Alembic |
| Container | Docker Compose |

---

## Local development setup

### Prerequisites

- Node.js 20+, pnpm 9+
- Docker + Docker Compose (backend only)

### 1. Install frontend dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Edit .env.local if needed — defaults point at localhost:7878
```

### 3. Start the backend

```bash
docker compose up --build api postgres
```

Postgres is exposed on `localhost:5433` (not 5432) to avoid conflicts with a host Postgres instance.

### 4. Start the frontend

```bash
pnpm dev
# http://localhost:3000
```

The frontend works without the backend running — it falls back to local state. Backend calls only happen after "Save to server" is confirmed.

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
| `ROADFORGE_WEB_BASE_URL` | `http://localhost:3000` | Backend — builds `/join?token=…` URLs |

---

## Manual MVP test flow

Quick path:
1. `docker compose up --build api postgres` + `pnpm dev`
2. Open `http://localhost:3000`, complete wizard, click **Save to server**
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

- **Session tokens not yet enforced** — stored after create/join but not yet sent as bearer tokens on write requests. The backend accepts all requests without authorization for now.
- **No password field in Save flow** — password gates are supported by the backend; the Save UI does not expose setup yet.
- **Markdown/PDF export** — requires backend; currently shows a toast.
- **Real-time collaboration** — no WebSocket infrastructure; changes are not pushed to other participants.
- **Activity log UI** — the backend logs all events; there is no frontend view yet.
- **Email verification** — not implemented. Planned as an optional future security layer.
- **Deployment hardening** — rate limiting, HTTPS enforcement, and bearer authorization are pending before any public deployment.

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
