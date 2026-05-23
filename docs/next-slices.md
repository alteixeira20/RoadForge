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

## D. ✅ Real-time collaboration MVP — Done

SSE-based update broadcast, short-lived ticket auth, and in-memory soft locks (30s TTL). Optimistic concurrency control via `last_updated_at` on PUT.

---

## E. Polish save/share/join UX (partial)

Remaining items:
- Share modal: after revoking, if the link was the only one, show a prompt to regenerate.
- Join page: show roadmap name from the `JoinRoadmapResponse.roadmap_name` field before routing.
- AppHeader: show a "not saved" indicator if `serverRoadmapId` exists but `saved` is false (local edits pending sync).

---

## F. End-to-end bugfix pass

Run the full `docs/mvp-test-plan.md` in a clean browser profile and fix any issues found. Treat each bug as a mini-slice.

---

## G. ✅ Activity log UI — Done

`GET /api/roadmaps/{id}/activity` endpoint (paginated) is wired. An Activity panel in the workspace shows actor name, action description, and relative timestamp. Anti-spam batching prevents one entry per toggle; saves accumulate changes into one summary entry per save.

---

## H. Deployment hardening (partial)

**Done:**
- TLS termination — nginx reverse proxy configured in `deploy/hosting-bay/`.
- `ROADFORGE_ENVIRONMENT=production` — config key wired; set in hosting-bay `.env`.
- Postgres credentials rotation — documented in `deploy/hosting-bay/README.md`.
- `ROADFORGE_WEB_BASE_URL` — documented and set for the public domain.
- Health check endpoint live at `/api/health`.
- Docker Compose volume mount documented under `/opt/data/apps/roadforge/postgres`.

**Remaining before public production deployment:**
- Rate limiting on `/api/roadmaps/join` and `/api/roadmaps` (invite token brute-force is unthrottled).
- Strict Content Security Policy (CSP) — deferred from MVP.

---

## I. UI icon polish

Replace the current custom icon implementation with `lucide-react` while preserving the existing `Icon` component API.

Rules:
- Keep imports centralized in `components/ui/Icon.tsx`.
- Do not import Lucide icons directly across feature components.
- Map existing icon names to Lucide equivalents.
- Keep icon sizing/stroke behavior compatible with the current UI.

---

## J. Optional email verification code

**Scope (high-level only — do not implement without explicit instruction):**
- Owner enables email verification on a roadmap.
- Joiner presents invite token → backend sends a one-time code to an email address they supply.
- Joiner enters code → session token issued.
- Requires: email service integration, a `verification_codes` table, SMTP config.

This is a pure opt-in security layer. It does not affect the accountless model — display name remains optional, no email is stored long-term.

---

## K. Quality & Testing

- **Backend tests:** Implement unit and integration tests for FastAPI services and routers.
- **CI/CD:** Set up GitHub Actions for linting, typechecking, and testing.
- **Documentation:** Expand deployment guides for specific platforms (Hetzner, DigitalOcean, etc.).
