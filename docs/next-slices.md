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

## E. ✅ Responsive header and mobile More menu — Done

At ≤640px, secondary header controls (Theme toggle, Roadmap switcher, Import/Export) collapse into a More (···) menu. Primary action (Save/Share/Reload) stays visible. Roadmap title is shown in the workspace `<h1>`, not duplicated in the header. Header buttons use consistent 36px height and `inline-flex` alignment with `line-height: 1` to prevent baseline drift.

---

## E2. ✅ Import auto-repair pipeline — Done

`apps/web/src/lib/roadmap-validation.ts` — `repairImportedRoadmap()` runs before strict validation. Repairs: null/missing optional fields, boolean coercion for `done`/`next`, array coercion for `tags`/`deps`/`assignees`, phase field inference, progress recalculation, legacy `owner:`/`review:` tag migration, duplicate ID renaming, stale `parentId` removal. Users see an **Import notice** listing repairs. Malformed or unrelated JSON still fails hard.

---

## E3. ✅ Team/collaboration model cleanup — Done

Assignees are task-local names used for filters. Participants/collaborators are server-side joined users with roles and sessions. Local-only roadmaps do not show Team/collaboration management. Person filter options derive only from active-roadmap task assignees. Team is now a main workspace view for synced owner roadmaps and shows actual participants only; owners can invite via Share and revoke non-current participants.

---

## E4. ✅ Phase reorder numbering — Done

Phase drag/drop preserves phase IDs, tasks, name, color, and status, but recomputes `phase.num` from the new order using zero-based padded numbering: `00`, `01`, `02`, etc. Saves and exports persist the recomputed numbers.

---

## E5. ✅ Stable public viewer/demo link — Done

Viewer links are read-only and suitable for README/portfolio/demo sharing. Owner/editor invite URLs remain private and are only exposed immediately after create/rotate. Active viewer URLs remain copyable from the owner-only Share modal. Backend migration `0005_add_public_viewer_tokens.py` is required; deploys must run `make migrate`.

---

## E6. ✅ Inline roadmap title editing — Done

The main workspace title supports double-click rename, mobile/tablet edit button, Enter save, Escape cancel, blur save, empty-title rejection, and viewer lockout. Rename autosyncs through the normal save path, logs `roadmap.renamed` in Activity, and does not create a version checkpoint.

---

## E7. ✅ Roadmap schema auto-upgrade — Done

`apps/web/src/lib/roadmap-upgrade.ts` upgrades old local/server/join/import/export snapshots through a shared client-side pipeline. It repairs old booleans/arrays, legacy assignment tags, stale progress, phase numbering, and stale references where safe. Local roadmaps write upgraded snapshots back to cache; editable synced roadmaps mark unsaved so autosync persists; viewers upgrade in memory only. Users see a short **Roadmap updated** notice. Automatic upgrades do not create Activity entries or version checkpoints.

---

## E8. Polish save/share/join UX (partial)

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
- **CI/CD:** GitHub Actions exists, but backend coverage is still lightweight syntax-level. Expand it with real backend tests before treating CI as full coverage.
- **Documentation:** Expand deployment guides for specific platforms (Hetzner, DigitalOcean, etc.).
