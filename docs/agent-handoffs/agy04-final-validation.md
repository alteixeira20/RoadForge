# AGY04 Final Validation: Collaboration Stability Corrective Pass

Author: AGY04 (Integration Agent)
Date: 2026-09-26
Branch: `integration/collaboration-stability`
Starting HEAD: `1dca8ae1ac30b15df424321082df417cc3a4304f`

---

## 1. Executive Summary

This validation handoff document records the successful completion of the AGY04 corrective pass following the AGY05 independent release re-audit.

All corrective validation gates have been satisfied:
1. The uncommitted Playwright locator correction in `apps/web/e2e/multi-client-collaboration.spec.ts` line 284 (`getByRole('menuitem', { name: /Delete phase/i })`) was preserved, executed, and confirmed passing.
2. The phase-creation network request and response contract was verified against live PostgreSQL, Redis, and SSE transports via real authenticated browser sessions.
3. The true phase-CREATE rollback implementation was audited, verified, and accurately documented in `apps/web/src/hooks/usePhaseStructureSync.ts`.
4. The full test matrix was executed sequentially across unit, backend, browser dev, production standalone, and repository hygiene suites with 0 failures and 0 unexpected skips.
5. All ephemeral test infrastructure and processes were cleanly torn down without affecting unrelated workloads.

---

## 2. Definitive Phase-Create Rollback Implementation

Previous reports contained inaccurate citations:
- AGY05 initially cited `RoadmapContext.tsx` around line 1883, which does not exist in the streamlined integrated codebase.
- An earlier AGY04 analysis pointed to `usePhasePatch.ts`, which handles task and phase PATCH mutations rather than phase creation.

The definitive phase-CREATE rollback implementation resides in:
- **File:** `apps/web/src/hooks/usePhaseStructureSync.ts`
- **Function:** `createSyncedPhase` (lines 131 to 232)
- **Definitive Error Branch:** lines 188 to 202

### Detailed Mechanism

1. **Optimistic Insertion (lines 145-146):**
   When `createSyncedPhase(phase, ...)` is called, it increments `structureGenerationRef`, establishes a creation barrier (`createBarrier()`) mapped by `phase.id`, calls `beginFocusedWrite()`, and updates state optimistically:
   `setCurrentPhases([...phasesRef.current, phase])`

2. **Server POST (line 151):**
   `createServerPhase(serverRoadmapId, phase, sessionToken)` sends the filtered four-field JSON payload (`id`, `name`, `color`, `colorMode`) to `/api/roadmaps/{roadmapId}/phases`.

3. **Classification & Rollback on Rejection (lines 166-202):**
   If the server responds with HTTP 422 (or 401/403/session-expired):
   `const { kind } = classifyRoadmapSaveError(error)`
   For HTTP 422 validation rejections, `kind === 'validation'`, satisfying:
   `const definitive = kind === 'validation' || kind === 'forbidden' || kind === 'unauthorized' || kind === 'session-expired'`
   Under this branch:
   - `readiness = 'absent'`
   - The optimistic phase is removed immediately:
     `setCurrentPhases(removePhaseAndDanglingDependencies(phasesRef.current, phase.id))`
   - A descriptive toast notification is emitted:
     `showToast('The server rejected this phase. The local phase was removed.')`
   - Noticeably, `setSaved(false)` is NOT invoked, ensuring the roadmap retains its prior saved indicator rather than incorrectly becoming dirty.

4. **Barrier Resolution (lines 210-216):**
   In the `finally` block, `barrier.resolve(readiness)` is called with `'absent'`, and the barrier is cleared from `creationBarriersRef`. Any concurrent or chained dependent operations (such as `deleteSyncedPhase` or `reorderSyncedPhases`, which await `waitForPhaseReady(phase.id)`) receive `'absent'` and cancel cleanly without targeting an invalid entity ID.

---

## 3. Live Phase Creation and Deletion Network Evidence

Evidence was captured during a live multi-client browser session using Playwright network listeners and direct PostgreSQL inspection.

### 3.1 Phase Creation Request
- **Endpoint:** `POST http://127.0.0.1:7878/api/roadmaps/rm_DIDOz4drYWf-ztUWb8t3pg/phases`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer <editor_session_token>`
- **Serialized Outgoing JSON:**
```json
{
  "id": "rf-p-3c28cffb-5e0d-4b07-9b0a-50ab4416f2d4",
  "name": "New phase",
  "color": "#76746e",
  "colorMode": "auto"
}
```
Only the four permitted fields are serialized. Fields rejected by `CreatePhaseRequest(extra="forbid")` (`num`, `tasks`, `progress`, `status`) are excluded. The backend schema permits `colorMode: Literal["auto", "manual"] = "auto"` (value `"inherit"` is neither generated nor permitted).

### 3.2 Phase Creation Response
- **Status:** `HTTP 201 Created`
- **Response Structure (`RoadmapResponse`):**
```json
{
  "id": "rm_DIDOz4drYWf-ztUWb8t3pg",
  "name": "Evidence Roadmap",
  "owner_display_name": "Browser Tester",
  "schema_version": "1.0",
  "phases": [
    ...,
    {
      "id": "rf-p-3c28cffb-5e0d-4b07-9b0a-50ab4416f2d4",
      "num": "04",
      "name": "New phase",
      "color": "#76746e",
      "colorMode": "auto",
      "status": "future",
      "progress": 0,
      "tasks": []
    }
  ],
  "tag_registry": [...],
  "is_password_enabled": false,
  "created_at": "2026-09-26T18:17:30.555476Z",
  "updated_at": "2026-09-26T18:17:33.968803Z"
}
```

### 3.3 PostgreSQL Persistence & Realtime SSE Delivery
- **PostgreSQL Persistence:**
  Querying `activity_logs` directly in PostgreSQL confirmed atomic ledger entries:
  - `phase.created`: ID `al_gjm2Oe4dh-I0odYKUwWpvA`, entity `rf-p-3c28cffb-5e0d-4b07-9b0a-50ab4416f2d4`
  - `phase.deleted`: ID `al_ZBRKWDPeL-tZmU0ODnpobw`, entity `rf-p-3c28cffb-5e0d-4b07-9b0a-50ab4416f2d4`
- **SSE Broadcast:**
  The second browser context (Owner) received the `roadmap.updated` SSE event via Redis pubsub and updated its DOM from 3 to 4 phases within the assertion window.
- **Reload Survival:**
  Both browser contexts were reloaded simultaneously (`editorPage.reload()`, `ownerPage.reload()`). Both clients fetched the server snapshot and rendered all 4 phases with live sync status.

### 3.4 Phase Deletion with Corrected Locator
- In Radix UI, the `<DropdownMenuItem>` element is rendered with accessibility role `menuitem` rather than `button`.
- Clicking `ownerPage.getByRole('menuitem', { name: /Delete phase/i })` opened the alert confirmation dialog (`role="alertdialog"`).
- Clicking `confirmDialog.getByRole('button', { name: 'Delete phase' })` issued `DELETE /api/roadmaps/{roadmapId}/phases/{phaseId}` with status `HTTP 200 OK`.
- Owner UI optimistically dropped to 3 phases without error toasts.
- PostgreSQL recorded the deletion in `activity_logs`.
- SSE propagated the deletion to Editor, which dropped to 3 phases.

---

## 4. Complete Test Execution Matrix

All suites were executed sequentially using isolated, disposable PostgreSQL (port 5444) and Redis (port 6404) instances.

| Suite | Command | Results |
| :--- | :--- | :--- |
| Multi-Client Collaboration | `playwright test apps/web/e2e/multi-client-collaboration.spec.ts` | **4 passed** (0 failed) in 22.1s |
| Quiet Collaboration | `playwright test apps/web/e2e/quiet-collaboration.spec.ts` | **5 passed** (0 failed) in 14.0s |
| Production Browser | `playwright test --config playwright.production.config.ts` | **30 passed** (0 failed) in 55.2s |
| Web Unit & Integration | `pnpm --dir apps/web test` | **103 test files passed, 767 passed** (0 failed) in 6.65s |
| Backend Pytest (with real Redis) | `REAL_REDIS_TEST_URL=... uv run pytest -v tests unit_tests` | **439 passed, 0 skipped, 0 failed** in 37.81s |
| Realtime SSE Capacity | `uv run pytest -v tests/test_realtime_capacity.py` | **12 passed** (0 failed) in 3.64s |
| RoadForge MCP Package | `npm --prefix packages/roadforge-mcp run check` | **14 passed**, types clean, pack dry-run clean |
| TypeScript Typecheck | `pnpm typecheck` | **0 errors** |
| ESLint Lint | `pnpm lint` | **0 errors, 0 warnings** |
| Production Web Build | `pnpm build` | **Successful** (all routes generated) |
| Em-Dash Check | `pnpm check:em-dash` | **604 tracked files clean** |
| Product Copy & Contract Checks | `tools/check-product-copy.mjs`, `tools/check-release-contract.mjs`, `tools/check-web-import-cycles.mjs` | **All passed** |
| Git Diff Check | `git diff --check` | **0 issues** |

---

## 5. Process and Infrastructure Cleanup

1. The orphaned/unstarted container definitions (`agy04-integration-api-1` and `agy04-integration-postgres-1`) left in `Created` state by the prior interrupted session were removed.
2. The temporary FastAPI background process running on port 7878 (`task-170`) was cleanly shut down and verified via `ss -tlnp`.
3. Disposable test containers `agy04-corrective-postgres` (port 5444) and `agy04-corrective-redis` (port 6404) were removed.
4. Pre-existing unrelated containers (`agy03-sse-postgres-1`, `roadforge-test-redis`, `roadforge-test-postgres-agy05`, `roadforge-test-redis-agy05`, Odysseus services) and unrelated processes (`CVForge` on port 3030) were untouched.

---

## 6. Residual Risks and Bounded Limitations

1. **Sequential Browser Execution:** Dev and production browser suites must not be run concurrently against shared ports or the same `.next` standalone output directory.
2. **Multi-Tab Local-Only Roadmap Sync:** As documented in previous integration handoffs, synchronizing unsaved changes across multiple browser tabs on an accountless local-only roadmap is a known bounded limitation outside the scope of collaboration stability.
3. **No Newly Introduced Deficiencies:** All 439 backend tests and all 39 browser tests pass without modifications to production server logic.

---

## 7. Changed Files in this Commit

- `apps/web/e2e/multi-client-collaboration.spec.ts`: Replaced `getByRole('button', { name: /Delete phase/i })` with `getByRole('menuitem', { name: /Delete phase/i })`.
- `docs/agent-handoffs/screenshots/*.png`: Regenerated during test execution.
- `docs/agent-handoffs/agy04-final-validation.md`: This validation report.
