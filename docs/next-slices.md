# RoadForge — Remaining Implementation Slices

Ordered by priority. Each slice is one focused implementation session. Do not combine slices unless explicitly directed.

---

## A. ✅ Reload server roadmap on app refresh — Done

`RoadmapContext.tsx` mount effect calls `getRoadmap(storedServerId)` on hydration and silently falls back to localStorage state on failure.

---

## B. ✅ Password field in Save flow — Done

Optional password input added to `SaveToServerModal.tsx`. Passes through `WorkspaceModals` → `Workspace.handleConfirmSave` → `createRoadmap`. Min 6 / max 128 validated client-side.

---

## C. ✅ Bearer token enforcement — Done

`apps/api/src/api/services/auth_service.py` — `require_participant` dependency added. PUT, rotate, and revoke endpoints enforce bearer token + role. Frontend `requestJson` sends `Authorization: Bearer` when `sessionToken` is provided.

---

## D. End-to-end bugfix pass

Run the full `docs/mvp-test-plan.md` in a clean browser profile and fix any issues found. Treat each bug as a mini-slice.

---

## E. Polish save/share/join UX (partial)

Remaining items:
- Share modal: after revoking, if the link was the only one, show a prompt to regenerate.
- Join page: show roadmap name from the `JoinRoadmapResponse.roadmap_name` field before routing.
- AppHeader: show a "not saved" indicator if `serverRoadmapId` exists but `saved` is false (local edits pending sync).

---

## F. Optional email verification code

**Scope (high-level only — do not implement without explicit instruction):**
- Owner enables email verification on a roadmap.
- Joiner presents invite token → backend sends a one-time code to an email address they supply.
- Joiner enters code → session token issued.
- Requires: email service integration, a `verification_codes` table, SMTP config.

This is a pure opt-in security layer. It does not affect the accountless model — display name remains optional, no email is stored long-term.

---

## G. Activity log UI

**Problem:** The backend logs every significant event (`roadmap.created`, `roadmap.updated`, `participant.joined`, `share_link.rotated`, `share_link.revoked`) in the `activity_logs` table. There is no frontend view.

**Scope:**
- Add `GET /api/roadmaps/{id}/activity` endpoint (paginated).
- Add an "Activity" tab or panel in the workspace, accessible to the owner.
- Display: actor name, action description, relative timestamp.

---

## H. Deployment hardening

Items needed before any public deployment:
- TLS termination (nginx reverse proxy or Caddy)
- Rate limiting on `/api/roadmaps/join` and `/api/roadmaps` (prevent token brute-force and spam)
- `ROADFORGE_ENVIRONMENT=production` disables SQL echo and debug details in error responses
- Postgres credentials rotated from dev defaults
- `ROADFORGE_WEB_BASE_URL` set to the public domain (affects join URL generation)
- Health check endpoint monitored by an uptime service
- Docker Compose volume backup strategy for `postgres_data`

---

## I. Real-time collaboration (long-term)

**Deferred.** Not planned for any near-term slice.
Would require:
- WebSocket infrastructure (likely FastAPI `WebSocket` endpoints)
- Operational transform or CRDT for conflict resolution
- Frontend state sync layer
