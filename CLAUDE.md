# RoadForge — Claude Code guidance

## What RoadForge is

An accountless, self-hostable, local-first roadmap planning tool. Users create roadmaps without registering. Access is controlled by private owner/editor invite links and a public read-only viewer link. Session tokens stored in `localStorage` identify participants. No accounts. No login. No user dashboard.

RoadForge has a Next.js frontend and a FastAPI/PostgreSQL backend. The v0.1 flow
is being hardened for a clearly labeled public beta/WIP release.

## Stack

- **pnpm workspace** — root scripts delegate to `apps/web` via `--filter web`
- **Next.js 15 App Router** — `apps/web/src/app/` holds all routes
- **TypeScript 5** — strict mode, path alias `@/` maps to `src/`
- **Tailwind CSS v3** — utility classes available; most styling is in `src/styles/*.css`
- **Fonts** — Lexend + JetBrains Mono loaded via `next/font/google` in `layout.tsx`
- **FastAPI** — Python 3.12 backend under `apps/api/`
- **PostgreSQL 16** — via Docker Compose (host port 5433, internal port 5432)

## Commands (run from repo root)

```bash
pnpm dev          # Start dev server (apps/web)
pnpm build        # Production build — all 5 routes must build statically
pnpm lint         # ESLint — must pass with no warnings
pnpm typecheck    # tsc --noEmit — must pass with 0 errors

docker compose up --build api postgres   # Start API + Postgres
curl http://localhost:7878/api/health    # Confirm API running
docker compose logs --tail=40 api        # Check for errors
docker compose down                      # Stop
```

## Folder structure

```
apps/web/src/
├── app/            # Routes: /, /workspace, /shared, /join
├── components/     # UI components, grouped by feature
│   ├── home/       # Homepage sections
│   ├── join/       # JoinPage
│   ├── layout/     # AppHeader, SiteHeader, SiteFooter
│   ├── roadmap/    # Workspace, Phase, TaskRow, sub-components
│   ├── share/      # SaveToServerModal, ShareModal, IOModal
│   ├── ui/         # Icon, Modal, Brand, Toast, ThemeToggle
│   └── wizard/     # CreateWizard (4-step form)
├── context/        # RoadmapContext, ThemeContext
├── data/           # sample-roadmap.ts, EXPORT_OPTIONS
├── hooks/          # useWorkspaceModals, usePhaseCollapse, usePhaseSearch, useToastState
├── lib/            # storage.ts, roadmap-validation.ts, roadmap-upgrade.ts, assignment helpers
├── services/       # roadmap.service.ts (all HTTP calls live here)
├── styles/         # CSS split: tokens, base, ui, site, workspace, modals, join
└── types/          # roadmap.ts, ui.ts
```

## Hard rules — do not do these unless explicitly instructed

- Do not add user accounts, login, sessions, or auth tokens
- Do not add WebSocket or real-time collaboration infrastructure
- Do not create API routes (`app/api/`)
- Do not redesign the UI or rename CSS classes
- Do not install packages without explicit instruction
- Do not commit or create branches without explicit instruction
- Do not call `fetch()` anywhere except `apps/web/src/services/roadmap.service.ts`
- Do not call `localStorage` directly in components — use `apps/web/src/lib/storage.ts`
- Do not add email verification or email-based flows (deferred feature)

## Working style

- Implement one slice at a time. If a request spans multiple concerns, ask to split.
- No speculative features. Implement exactly what is asked, nothing more.
- Run `pnpm lint && pnpm typecheck && pnpm build` after every code change. Fix any errors before reporting done.
- Match the slice size to what was requested: a bug fix does not need surrounding cleanup.

## Backend route list (source of truth)

Full reference: `docs/backend-api.md`

```
GET    /api/health
POST   /api/roadmaps                                          create roadmap
POST   /api/roadmaps/join                                     accept invite token
GET    /api/roadmaps/{roadmap_id}                             fetch roadmap + phases
PUT    /api/roadmaps/{roadmap_id}                             update name and/or phases
DELETE /api/roadmaps/{roadmap_id}                             soft-delete roadmap
GET    /api/roadmaps/{roadmap_id}/share-links                 list active share links
POST   /api/roadmaps/{roadmap_id}/share-links/{role}/rotate   rotate link token
DELETE /api/roadmaps/{roadmap_id}/share-links/{role}          revoke share link
GET    /api/roadmaps/{roadmap_id}/participants                 list participants (owner)
POST   /api/roadmaps/{roadmap_id}/participants/{pid}/revoke   revoke a participant
GET    /api/roadmaps/{roadmap_id}/versions                    list version history
POST   /api/roadmaps/{roadmap_id}/versions/checkpoint         create manual checkpoint
GET    /api/roadmaps/{roadmap_id}/versions/{vid}              fetch a version snapshot
POST   /api/roadmaps/{roadmap_id}/versions/{vid}/restore      restore a version
GET    /api/roadmaps/{roadmap_id}/activity                    paginated activity log
POST   /api/roadmaps/{roadmap_id}/events/ticket               request SSE ticket
GET    /api/roadmaps/{roadmap_id}/events                      SSE stream (ticket auth)
POST   /api/roadmaps/{roadmap_id}/locks                       acquire/refresh lock
DELETE /api/roadmaps/{roadmap_id}/locks/{target}              release a lock
GET    /api/roadmaps/{roadmap_id}/locks                       list active locks
```

All business logic lives in `apps/api/src/api/services/roadmap_service.py`. Route handlers in `routers/roadmaps.py` are thin wrappers. Note: `/join` must be registered before `/{roadmap_id}` in the router to avoid path capture.

## Frontend wiring state (as of current MVP)

| Feature | Status |
|---|---|
| Create roadmap → POST /api/roadmaps | Wired |
| Save phases → PUT /api/roadmaps/{id} | Wired |
| Share modal — load links → GET /api/roadmaps/{id}/share-links | Wired |
| Share modal — rotate → POST …/share-links/{role}/rotate | Wired |
| Share modal — revoke → DELETE …/share-links/{role} | Wired |
| Participant list → GET /api/roadmaps/{id}/participants | Wired |
| Participant revoke → POST …/participants/{pid}/revoke | Wired |
| Join page — POST /api/roadmaps/join | Wired |
| Join page — hydrate roadmap → GET /api/roadmaps/{id} | Wired (non-fatal) |
| Reload server roadmap on app refresh → GET /api/roadmaps/{id} | Wired (non-fatal) |
| Password field in Save flow | Wired |
| Session token sent as bearer on requests | Wired |
| Import auto-repair pipeline (roadmap-validation.ts) | Wired |
| Roadmap schema auto-upgrade (roadmap-upgrade.ts) | Wired |
| Public read-only viewer/demo link | Wired |
| Team main workspace view for participants | Wired for synced owner roadmaps |
| Inline roadmap title rename | Wired |
| Phase reorder renumbering | Wired |
| Responsive header — More menu collapses secondary actions ≤640px | Wired |
| Markdown/PDF export | Not implemented (toasts) |

## Service layer conventions

`apps/web/src/services/roadmap.service.ts` is the only file that calls `fetch()`. Every exported function maps to one backend endpoint. The `requestJson<T>` helper handles `Content-Type`, status codes, and error detail extraction. 204 responses return `undefined`. Non-2xx responses throw `Error("API {status}: {detail}")`.

## Context and storage conventions

- `RoadmapContext` owns: `displayName`, `roadmapName`, `phases`, `saved`, `serverRoadmapId`, `sessionToken`, `participantId`, `role`, `ownerDisplayName`, `updatedAt`, `locks`, `activeRoadmapId`
- `ThemeContext` owns: `theme`
- Context setters call the matching `storage.*` helper to persist
- `storage.ts` is SSR-safe (`typeof window` guard) and parse-safe (try/catch)
- Roadmap data is stored per-roadmap in scoped keys; flat legacy keys are migrated on first read
- Old roadmap snapshots are upgraded through `lib/roadmap-upgrade.ts` before rendering. Local cache writes back upgraded data; editable synced roadmaps mark `saved=false` so autosync persists the upgraded shape; viewers upgrade in memory only.
- Do not confuse task assignees with participants. Assignees are task-local strings used for filters. Participants are server rows created by joining owner/editor/viewer links.

## localStorage / sessionStorage keys

Current keys (scoped per roadmap):
```
localStorage  rf:theme                  — dark/light theme
localStorage  rf:displayName            — user's display name
localStorage  rf:lastRoadmapId          — last active roadmap ID
localStorage  rf:roadmap:{id}           — RoadmapCache JSON (name, phases, saved, etc.)
localStorage  rf:auth:{id}              — AuthCache JSON (serverRoadmapId, sessionToken, participantId, role)
sessionStorage rf:activeRoadmapId       — active roadmap for this tab session
```

Legacy flat keys (`rf:roadmapName`, `rf:phases`, `rf:saved`, `rf:serverRoadmapId`, `rf:sessionToken`, `rf:participantId`, `rf:role`, etc.) are migrated to the scoped format on first access and then removed.

Current roadmap upgrade behavior also repairs older phase/task shapes: missing/null booleans and arrays, legacy `owner:` / `review:` tags, stale progress, phase numbering, duplicate/missing task IDs where import repair supports it, and stale `deps` / `parentId`. Automatic upgrades do not create Activity rows or version checkpoints.

## CSS conventions

- CSS is in `src/styles/*.css`, imported in cascade order via `app/globals.css`
- Do not convert CSS to Tailwind utility classes
- Do not rename existing CSS classes
- Keep responsive rules at the bottom of the owning file
- Design tokens (custom properties) live in `styles/tokens.css` only

## Coding conventions

- `'use client'` at top of any component using hooks, browser APIs, or event handlers
- Server components (no directive) for pure layout/static components
- Custom hooks live in `src/hooks/`, named `use*.ts`
- `useSearchParams()` requires a `<Suspense>` boundary in the parent route file for static builds

## Naming conventions

- React components and context/provider files: PascalCase — `Workspace.tsx`, `ShareModal.tsx`, `RoadmapContext.tsx`
- Non-component TypeScript modules: kebab-case — `sample-roadmap.ts`, `roadmap-validation.ts`
- Custom hooks: camelCase with `use` prefix — `useWorkspaceModals.ts`
- Backend Python modules: snake_case — `roadmap_service.py`, `token_service.py`
- Do not mix styles: `roadmapService.ts` and `RoadmapValidation.ts` are wrong

## Local-first behavior — preserve this

- The frontend works fully without the backend running
- `RoadmapContext` falls back to `SAMPLE_ROADMAP` when no localStorage state exists
- Backend calls happen only after user-initiated actions (Save, Share rotate/revoke, Join)
- JSON export/import run entirely client-side

## Backend structure

```
apps/api/
├── pyproject.toml
├── Dockerfile
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/
└── src/api/
    ├── main.py
    ├── config.py
    ├── database.py
    ├── middleware/
    │   ├── cors.py
    │   └── body_limit.py        # ASGI 413 guard (Content-Length > 512 KB)
    ├── models/roadmap.py        # Roadmap, ShareLink, Participant, ActivityLog
    ├── routers/
    │   ├── health.py
    │   └── roadmaps.py
    ├── schemas/
    │   ├── roadmap.py           # Pydantic request/response models
    │   ├── limits.py            # Shared validation constants
    │   └── validators.py        # Text cleaning helpers (clean_required_text, etc.)
    └── services/
        ├── id_service.py        # generate_id(prefix)
        ├── token_service.py     # generate_token, hash_token, token_prefix
        ├── password_service.py  # hash_password, verify_password (PBKDF2-SHA256)
        └── roadmap_service.py   # All business logic
```

## Hard rules for backend — do not do these unless explicitly instructed

- Do not add user accounts, email, or authentication middleware
- Do not add WebSockets or real-time collaboration
- Do not install packages without explicit instruction

## Commit hygiene

- Do not commit unless the user explicitly asks
- Run lint + typecheck + build before any commit
- One slice per commit
- Commit message: present-tense imperative, ≤ 72 chars subject line
