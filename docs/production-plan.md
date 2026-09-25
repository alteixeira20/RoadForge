# RoadForge production plan (freeze candidate)

- **Status:** proposal for review
- **Date:** 2026-09-25
- **Scope:** make RoadForge deployable on one host, secure, and cheap to run for roughly
  1,000 hosted-demo users, then freeze feature development.

This is a planning document. It is not evidence that anything below exists yet; see the
source-of-truth order in [`README.md`](README.md).

## Definition of done (freeze criteria)

RoadForge is frozen when all of the following hold on the exact release commit:

1. **Demo on one modest host.** The hosted demo runs on a single machine (working target:
   2 vCPU / 4 GB RAM / 40 GB disk) with a hard storage ceiling, and passes a load test of
   1,000 stored server roadmaps, 200 concurrent live streams, and 20 writes/s for 10 minutes.
2. **One-command self-hosting.** A self-hoster goes from clone to an HTTPS instance with one
   documented command, generated secrets, automated backups, and safe defaults.
3. **Secure MCP.** Agents work end-to-end against the demo and self-hosted instances, never
   send credentials over plain HTTP, and are visible and revocable by roadmap owners.
4. **Community sharing.** An owner can publish a read-only public page, an iframe embed,
   and a README badge without handing out credentials.
5. **Release evidence.** CI is green, the deployed checks in the
   [operational proof gate](security/operational-proof-gate.md) pass, a restore drill has
   been run, and `v0.1.0` is tagged.

## Findings that drive this plan

Each finding below was checked against the code during this review.

| # | Finding | Evidence | Impact |
| --- | --- | --- | --- |
| F1 | **Live streams pin database connections.** `GET /api/roadmaps/{id}/events` takes a request-scoped `Depends(get_db)` session, runs a query, then streams. With FastAPI 0.141 the session stays open, idle in a transaction, for the whole stream (up to 1 hour). | Reproduced with the locked FastAPI/SQLAlchemy/asyncpg versions against PostgreSQL 16: 16 open streams left 15 connections `idle in transaction` (the default pool of 5 plus 10 overflow), and an ordinary request timed out. | **Blocker.** About 15 people viewing synced roadmaps at the same time stall the whole API. |
| F2 | Critical Next.js remote code execution flaws (GHSA-2xp9-vwfh-vxw4, which is in `/_next/image`, and GHSA-p293-qw3h-jr36), plus a high `sharp` advisory. | `pnpm audit --prod` on `main`. | Fixed in the consolidation change (M0); still waiting on GitHub write access to merge. |
| F3 | **Storage has no practical ceiling.** Per synced roadmap: snapshot up to 5 MiB; a relational projection copy; version history up to 32 MiB (the setting can't go below 16 MiB); 2,000 activity rows holding before/after JSON. | `schemas/limits.py`, `config.py`, `version_service.py`, `activity_log_limit.py`. | Worst case about 60 MiB per roadmap, so about 30 GB at the default 500-roadmap cap. Real roadmaps are 1–85 KiB. |
| F4 | **The projection copy is pure overhead.** Every structural edit deletes and rebuilds all phase/task/dependency/assignee rows for the roadmap, but reads from those tables are off by default (`ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED=false`). | `services/projection/sync.py`, called from 5 services. | Doubles storage and multiplies write volume and dead rows for no user-visible benefit. |
| F5 | **Nothing expires on its own.** Synced roadmaps live until their owner deletes them. The retention purge is a manual command. Docker logs aren't rotated. | `retention_service.py`, `deploy/self-hosted/compose.yaml`. | Demo disk use grows without bound. |
| F6 | **The global cap is easy to exhaust.** There's a total of 500 server roadmaps, and each IP can create 10 per hour. | `config.py`, `routers/roadmap_core.py`. | A few IPs can block sharing for everyone until an operator steps in. |
| F7 | **Browser storage is too small and export is hard to find.** All local roadmaps share the browser's ~5 MiB `localStorage` quota, while the server accepts 5 MiB for one roadmap. Export is an icon-only header button. | `lib/storage.ts`, `AppHeader.tsx`, screenshots. | Silent quota failures on large roadmaps; users forget to back up. |
| F8 | **No presence.** Participants show "last seen" only: no live count, online state, or cursors. | `TeamPanel.tsx`; realtime events carry data changes only. | Collaboration doesn't feel live. |
| F9 | **No way to share with a community.** Viewer invites are private credentials, and each visitor who joins creates a participant session, capped at 128 per invite. `frame-ancestors 'none'` blocks every embed. There's no badge. | `access-model.md`, `content-security-policy.ts`, `config.py`. | A community can't follow a roadmap from a website or README. |
| F10 | **MCP setup has gaps.** The focused API (PR #67) is well designed, but setup needs a raw session token the browser no longer exposes (sessions are HttpOnly cookies). The client accepts `http://` for remote hosts. The package isn't published. | `packages/roadforge-mcp/src/config.mjs`, `docs/mcp.md`. | Agents are hard to connect, and a misconfigured URL leaks the bearer token. |
| F11 | **The deployment has gaps.** No container memory or CPU limits; no gzip, static caching, or edge rate limiting in nginx; no automated backups. The image optimizer runs only for the logo. | `deploy/self-hosted/*`, `next.config.ts`, `components/ui/Brand.tsx`. | Avoidable resource use and attack surface. |

## Principles for the freeze

- **Local-first stays the default.** A local roadmap costs the server nothing. The server
  stores only roadmaps someone deliberately shares, and every stored byte has a ceiling and
  an expiry on the demo.
- **Ephemeral state never touches PostgreSQL.** Presence, cursors, and viewer counts live in
  memory (or Redis when running several workers).
- **Every limit is a setting.** The demo ships strict defaults; self-hosters can loosen
  them.
- **Minimal product.** No new views (no kanban, timeline, or Gantt), no accounts.

## Milestones

Sizes are rough, for AI-assisted solo work: **S** is half a day or less, **M** is 1–2 days,
**L** is 3 days or more.

### M0 - Consolidate and clean the repository (in progress)

- [ ] Merge the consolidation change into `main`: focused MCP API (#67), Next.js 15.5.26,
  `sharp` 0.35.4, the `nanoid` override replacing the expired audit exception, patch
  dependency bumps, GitHub Actions updates, and Dependabot ignore rules for toolchain
  majors.
- [ ] Close #66 (it disables collaboration by default) and the superseded or rejected
  Dependabot PRs.
- [ ] Delete merged and obsolete branches, and reset `dev` to the new `main`.
- [ ] Turn on branch auto-delete after merge.

### M1 - Production blockers (must land before the demo is public)

- [ ] **1.1 Stop live streams pinning connections (F1). S.** Do the SSE endpoint's
  pre-stream checks in a short-lived `async with async_session_factory()` block instead of
  `Depends(get_db)`. Make the pool size, overflow, and timeout configurable. Set PostgreSQL
  `idle_in_transaction_session_timeout` (for example 60s) as a backstop. Add a regression
  test that opens more streams than the pool size and asserts that `/api/health/ready`
  still answers and no connections are checked out.
- [ ] **1.2 Remove the image optimizer. S.** Set `images: { unoptimized: true }`, since
  `next/image` only renders the logo. This removes the `/_next/image` attack surface
  behind F2 and the `sharp` CPU and memory cost.
- [ ] **1.3 Container limits and log rotation (F11). S.** Add memory and CPU limits per
  service, plus `logging: json-file` with `max-size: 10m` and `max-file: 3`.
- [ ] **1.4 nginx performance and edge limits (F11). S.** Add gzip for text responses,
  immutable long caching for `/_next/static`, `limit_req` on `/api/`, `limit_conn` per IP
  for the events path, and more `worker_connections` for long-lived streams.
- [ ] **1.5 Automated backups. M.** Add a nightly `pg_dump` sidecar with checksums and
  rotation (7 daily, 4 weekly), and document how to copy backups off the host. Script the
  existing restore drill as `make restore-drill`.
- [ ] **1.6 Load test gate. M.** Commit a k6 or Locust scenario matching the definition of
  done. Pass means p95 under 300 ms, no 5xx responses, and stable memory on the target
  host shape.

### M2 - Storage budget and lifecycle for 1,000 demo users

- [ ] **2.1 Stop writing the projection copy (F4). S.** Add
  `ROADFORGE_ROADMAP_PROJECTION_WRITE_ENABLED`, defaulting to `false`. Deleting the
  projection subsystem entirely is a later, separate decision.
- [ ] **2.2 Demo storage profile (F3). S.** Make these settings configurable, then set the
  demo values:

  | Setting | Today | Demo |
  | --- | --- | --- |
  | Max request body / roadmap size | 5 MiB (constant) | 1 MiB |
  | Version history per roadmap | 32 MiB, floor 16 MiB | 2 MiB, 20 versions; lower the floor to 1 MiB |
  | Activity rows per roadmap | 2,000 | 500, with long text fields trimmed in `before`/`after` |
  | Roadmap creation per IP | 10/hour | 5/day, plus a cap on active roadmaps per IP |

- [ ] **2.3 Idle expiry on the demo (F5). M.** A synced roadmap untouched for N days (demo:
  60) shows a warning banner 14 days early ("Open it or export JSON to keep it"). After
  that it's soft-deleted, then purged 30 days later. The Share panel shows the expiry date.
  This is off by default for self-hosters.
- [ ] **2.4 Scheduled retention (F5). S/M.** Run the existing retention planner daily inside
  the stack, either as a small maintenance service or as an API background task guarded by
  a PostgreSQL advisory lock. Log the counts each time.
- [ ] **2.5 Storage budget instead of a fixed count (F6). S.** Refuse *new* server roadmaps
  when `pg_database_size()` goes over `ROADFORGE_STORAGE_BUDGET_BYTES`, with a friendly
  message: "The demo is full. Keep working locally or self-host." Existing roadmaps keep
  working.

**Capacity estimate, to be confirmed by the M1.6 load test:**

- **Storage:** with the demo profile a typical shared roadmap takes about 0.2–0.5 MiB
  (snapshot, a few restore points, bounded activity), so 1,000 of them need about
  0.2–0.5 GiB. The worst case is capped by the storage budget, for example 10 GiB.
- **Memory:** on a single host with one API worker and in-memory realtime (no Redis), a
  rough guess is 200 MB for the API, 200 MB for web, 256–512 MB for PostgreSQL and 20 MB
  for nginx. That fits in 2 GB, and 4 GB is comfortable.

### M3 - Saving and exporting on the user's machine (F7)

- [ ] **3.1 Move roadmaps to IndexedDB. M.** Store roadmap bodies in IndexedDB and keep only
  small preferences in `localStorage`, with a one-time migration. Call
  `navigator.storage.persist()` so the browser doesn't evict data, and show "Stored in this
  browser · 42 KB".
- [ ] **3.2 Make backup obvious. S.** Add a labeled **Export** button in the header, and move
  "Report a problem" into the user menu. Show a "Last exported 12 days ago" nudge in the
  local-roadmap banner. Bind `Ctrl/Cmd+S` to export.
- [ ] **3.3 Save to a file. M.** Where the browser supports the File System Access API,
  link a roadmap to a `.roadforge.json` file on disk and auto-save to it. Elsewhere, fall
  back to a download.
- [ ] **3.4 Export formats. S.** JSON (canonical, re-importable); Markdown, with "Copy" for
  READMEs and issues; and "Copy agent context", a compact Markdown for pasting into an AI
  chat.
- [ ] **3.5 Import by drag-and-drop. S.** Drop a JSON file anywhere on the app to import it.

### M4 - Live collaboration that feels like Excalidraw (F8)

- [ ] **4.1 Presence. M.** Show who's here now as an avatar stack and count in the header.
  Highlight each person's focused task in their color, and show "editing…" on the task
  being edited. Agents appear with a bot badge. Transport: the existing SSE stream down,
  plus a throttled `POST /presence` heartbeat up (at most 1 Hz, 30-second TTL), kept in
  memory or Redis and never in PostgreSQL.
- [ ] **4.2 Live pointers (optional). M/L.** Show everyone's pointer, but only when two or
  more people are present. Positions are relative to the roadmap column, throttled to
  about 8 Hz in the browser, merged on the server, and limited to about 20 viewers per
  roadmap. If this turns out to be heavy over SSE plus POST, move just this channel to a
  WebSocket.

### M5 - Public read-only sharing for communities (F9)

- [ ] **5.1 Publish toggle. M.** Owner-only and revocable. It creates an unguessable public
  slug at `/p/<slug>`: read-only, with no participant session or activity leakage and
  names optional. The page is server-rendered and cached at the edge for 30–60 seconds,
  so a viral post costs almost nothing.
- [ ] **5.2 Embed. S.** A compact `/embed/<slug>` view with a route-specific CSP that allows
  framing. Every other route keeps `frame-ancestors 'none'`.
- [ ] **5.3 README badge. S.** `/badge/<slug>.svg` shows progress (for example
  "12/30 done · Phase 2") with cache headers that suit GitHub's image proxy.
- [ ] **5.4 Security. S.** The slug is not the roadmap ID. Rotating it revokes every embed
  and badge. Pages are `noindex` by default, with opt-in indexing. All public routes are
  rate-limited.

This replaces posting viewer invite links publicly, which creates a participant session per
visitor and runs into the per-invite session cap.

### M6 - MCP: working and secure (F10)

- [ ] **6.1 "Connect an AI agent". M.** Add this to the Share panel for owners and editors.
  It creates a dedicated agent credential (pick editor or viewer, add a label such as
  "Claude Code"), shows it once, and gives a copy-paste config snippet for common MCP
  hosts. The Team panel lists agent sessions with a bot badge, last-used time, and a
  revoke button.
- [ ] **6.2 Transport safety. S.** The MCP client refuses `http://` for anything other than
  loopback addresses. It refuses cross-origin redirects and never forwards `Authorization`
  on a redirect.
- [ ] **6.3 Safer destructive tools. S.** Task and phase deletion need an explicit `confirm`
  flag and the expected revision. Take a restore point before bulk agent edits.
- [ ] **6.4 Publish the package. S.** Publish `@anvilary/roadforge-mcp` to npm with
  provenance from GitHub Actions, so setup becomes `npx -y @anvilary/roadforge-mcp setup`.
- [ ] **6.5 End-to-end test. M.** An MCP tool call goes through the API and the resulting SSE
  event reaches a browser session. This proves people see agent edits live.

Deferred: a remote HTTP MCP transport with OAuth. Stdio is enough for the freeze.

### M7 - UI polish (bounded)

From screenshots of the current production build:

- [ ] Header: a labeled Export button; "Report a problem" moves into the user menu; presence
  avatars go here (M4).
- [ ] Landing hero: shorten the paragraph to one sentence and move the hosted-demo
  disclaimer to a small note under the call-to-action buttons.
- [ ] Copy bugs: "1 phases"; an empty phase shows "In progress 0/0" instead of "Not started".
- [ ] Mobile: the "Local draft" status pill overlaps "Add another phase".
- [ ] Create flow: merge the two-step dialog into one step with template chips, for fewer
  clicks to the first task.
- [ ] Share modal: one place for inviting people (editor/viewer), connecting an agent, and
  publishing publicly.
- [ ] Re-run the existing axe accessibility suite after these changes.

### M8 - Deploy on the Anvilary host and freeze

- [ ] **8.1 One-command self-hosting. M.** A single-host profile with no Redis (one API
  worker, in-memory realtime) as the default, and a Redis profile for several workers.
  `make init-env` generates strong secrets. Offer Caddy (automatic HTTPS) or the existing
  nginx and Cloudflare Tunnel setup. Reuse the operator-script idea from closed PR #66
  (install/start/stop/status/doctor/update).
- [ ] **8.2 Demo profile. S.** Put the M2 limits in a committed `deploy/demo.env`.
- [ ] **8.3 Minimum observability. S.** Connect health checks to an uptime monitor, add a
  disk-usage alert at 80%, log the daily retention counts, and have `make status` show
  database size and roadmap counts.
- [ ] **8.4 Release. S.** Run section 3 of the
  [operational proof gate](security/operational-proof-gate.md) on the real host, tag
  `v0.1.0`, publish release notes, and state maintenance mode in the README.
- [ ] **8.5 Freeze policy. S.** Protect `main` with required CI, group Dependabot updates
  monthly (security updates stay immediate), and note in the issue templates that feature
  work is paused.

## Suggested order

1. **Sprint 1: safe to host.** M0, M1, M2.1, M2.2, M2.4, M2.5, M6.2. After this sprint the
   demo can be public.
2. **Sprint 2: saving and agents.** M3, the rest of M6, M7.
3. **Sprint 3: community and live feel.** M5, M4.1, and M4.2 if you still want it.
4. **Wrap up.** M8, then freeze.

## Decisions needed

1. **Live pointers (M4.2):** build them, or stop at presence (avatars, count, focused task)?
   Recommendation: ship presence first and add pointers only if the app still doesn't feel
   live.
2. **Demo idle expiry:** 60 days or 90?
3. **Public pages:** `noindex` by default? Show contributor names publicly?
4. **Projection (F4):** switch writes off now (fast), or also delete the subsystem (cleaner,
   needs a migration)?
5. **Edge/TLS on the host:** Cloudflare Tunnel (current docs) or direct HTTPS with Caddy?
6. **Host size:** actual CPU, RAM, and disk, which set the demo storage budget.

## Out of scope for the freeze

Accounts or OAuth, kanban/timeline/Gantt views, CRDT or offline merge redesign, remote MCP
over HTTP with OAuth, GitHub-to-roadmap automation, multi-host scaling, and relicensing.

## Appendix: reproducing F1

The reproduction used a minimal FastAPI app with the same pattern and the locked library
versions (FastAPI 0.141.1, Starlette 1.6.0, SQLAlchemy 2.0.51, asyncpg) against
PostgreSQL 16:

1. The endpoint takes `db: AsyncSession = Depends(get_db)`.
2. It runs `await db.execute(text("select 1"))`, as the real endpoint does with
   `is_participant_revoked(db, …)`.
3. It returns a `StreamingResponse`.

With 16 concurrent streams, `pg_stat_activity` showed 15 sessions `idle in transaction`. The
pool reported `Checked out connections: 15`, and a normal request using `Depends(get_db)`
timed out after 8 seconds. The M1.1 regression test should encode the same scenario against
the real endpoint.
