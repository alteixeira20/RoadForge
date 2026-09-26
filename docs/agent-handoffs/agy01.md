# AGY01 Persistence Safety and Local-First Integrity Handoff

This document details the persistence, hydration, synchronization, and data loss prevention invariants implemented by AGY01 for RoadForge on branch `work/agy01-persistence-safety`.

---

## 1. Persistence Invariants

1. **Unsaved Work Is Sacred**: Local edits (dirty state) must never be silently discarded or overwritten by hydration, background polling, server fetches, reconnection, or quota errors.
2. **Safe Migration with Readback Verification**: Migration of legacy storage keys (`roadforge_roadmap`, `roadforge_auth_token`, etc.) to namespaced caches (`roadforge:roadmap:<id>`, `roadforge:auth`) must verify both write success and readback integrity before clearing legacy entries. If any step fails (e.g., storage quota exhaustion or security restrictions), legacy data is preserved.
3. **In-Flight Save Isolation**: Outgoing network saves (manual save or autosync) capture a snapshot and revision at the exact moment the request is initiated. Edits made while a save is in flight remain marked as unsaved (`saved: false`), retaining pending activity changes so they are not falsely acknowledged.
4. **Monotonic Update Timestamps**: Saved timestamps (`updatedAt`) never regress to older values due to out-of-order network responses.
5. **Autosync and Manual Save Concurrency Safety**: Autosync and manual save never execute concurrently. Manual save awaits in-flight autosync before determining whether an additional save is needed, avoiding self-inflicted 409 conflicts. Autosync is suppressed whenever a manual save is in flight.
6. **Active Roadmap Isolation**: When switching active roadmaps, in-flight requests originating from previous roadmaps cannot commit state or overwrite the newly selected roadmap. Creating a new local roadmap verifies write success and readback before switching active IDs, protecting against silent loss of current drafts during quota exhaustion.
7. **HttpOnly Cookie and Credential Safety**: Session token migration preserves legacy credentials if modern auth cache writing fails, preventing unintentional user logout or authentication lockouts.

---

## 2. Implemented Fixes

### A. Storage Migration and Quota Safety (`apps/web/src/lib/storage.ts`)
- Modified `setLocal`, `setRoadmapCache`, and `setAuthCache` to return a `boolean` outcome status indicating whether the underlying write succeeded.
- In `migrateLegacyStorageIfNeeded`, new storage entries are written and then verified via readback (`getLocal` or `getRoadmapCache`) before calling `removeLocal` on legacy keys (`roadforge_roadmap`, `roadforge_roadmap_id`, `roadforge_auth_token`).
- If quota exhaustion or browser policy prevents saving, legacy keys remain untouched and recoverable.

### B. Hydration and Draft Recovery (`apps/web/src/hooks/useRoadmapHydration.ts`)
- Added snapshot comparison helper `areSnapshotsEquivalent` to differentiate clean cache replacement from dirty draft recovery.
- When cached local state is dirty (`saved: false`) and diverged from the server:
  - Local phases, name, and tag registry are preserved.
  - State remains marked dirty (`saved: false`) with the original `updatedAt`.
  - Server revision metadata is tracked, enabling subsequent autosync or manual save to cleanly reconcile or detect conflicts.
- When cached local state is structurally equivalent to the server payload, hydration performs safe reconciliation by setting `saved: true` and updating to the server timestamp without dropping work.
- In `createLocalRoadmap` and `resetToSample`, storage writes are verified via readback before updating active roadmap state. If storage quota is exhausted, an error notification is raised and the user's active draft remains in view.

### C. Save Request Revision and Dirty State Tracking (`apps/web/src/hooks/useSaveFlow.ts`)
- Integrated `revisionRef` tracking and outgoing snapshot capture during `handleConfirmSave` and `handleKeepLocalVersion`.
- On successful save response:
  - Compares the acknowledged snapshot against the current draft state.
  - If additional edits occurred while the request was in flight, state remains dirty (`saved: false`) and subsequent activity changes are retained using `removeAcknowledgedActivityChanges`.
  - Only when the current draft matches the acknowledged snapshot is state marked clean (`saved: true`).
- Implemented `safeSetUpdatedAt` to ensure `updatedAt` only advances forward, preventing out-of-order responses from regressing timestamps.
- Guarded `handleConfirmSave` to await any in-flight autosync via `waitForSync`, avoiding redundant duplicate requests and 409 conflict errors.
- Guarded responses against roadmap switching: responses arriving after `serverRoadmapId` changes are discarded.

### D. Autosync Concurrency and Conflict Handling (`apps/web/src/hooks/useAutoSync.ts`)
- Added `manualSaveInFlight` prop check to prevent autosync while a manual save dialog or request is executing.
- Exported `waitForSync` helper allowing callers (such as manual save) to await pending background sync completion.
- Replaced effect cleanup cancellation checks with roadmap ID checks (`syncParamsRef.current.serverRoadmapId !== rid`) to avoid discarding valid in-flight responses when rapid typing triggers effect cleanup on the same roadmap.
- Scoped conflict clearing to match the initiating revision (`requestRevision === revisionRef.current`), preventing stale responses from prematurely clearing newer conflicts.

### E. Roadmap Context Draft Transition Safety (`apps/web/src/context/RoadmapContext.tsx`)
- In `setServerRoadmapId`, write and readback on the new server ID are verified before clearing the local draft key, ensuring atomic draft promotion.

---

## 3. Integration Contract with AGY00 (Realtime Synchronization)

AGY00 owns `useRoadmapRealtime.ts` and realtime merge utilities. To maintain system integrity and prevent data loss, the realtime layer must adhere to the following contract:

1. **Dirty Local State Immunity**:
   - When `saved === false` (local draft has uncommitted edits), incoming WebSocket/realtime patches or full snapshots from the server must NOT overwrite the user's active canvas.
   - If the incoming remote event represents a concurrent edit on the same roadmap:
     - Realtime must invoke non-destructive 3-way merge or present a conflict banner, rather than calling `setPhases` unconditionally.
     - The dirty status (`saved: false`) must remain intact until explicitly reconciled or saved by the user.
2. **Revision-Aware Acknowledgment**:
   - The persistence layer increments a monotonic revision counter on every local edit (`revisionRef.current`).
   - When realtime updates arrive:
     - If the update originates from the local client and is an acknowledgment of revision `R`, only edits up to revision `R` should be acknowledged.
     - Any edits made at revision `> R` must remain pending and unsaved.
3. **Timestamp Monotonicity**:
   - Incoming realtime server updates must only advance `updatedAt` if `new Date(remoteUpdatedAt) > new Date(currentUpdatedAt)`. Never regress client timestamps.
4. **Active Roadmap Isolation**:
   - Realtime event handlers must verify that the incoming event's `roadmap_id` matches the current active `serverRoadmapId` before applying any state changes. Events for previously viewed roadmaps must be discarded.

---

## 4. Backward Compatibility and Portable Roadmap Format

- **Schema Stability**: All changes strictly preserve the existing `RoadmapData` and `RoadmapCacheEntry` formats:
  - Cache entries continue using `{ roadmap, saved, updatedAt }`.
  - Portable JSON exports and sample templates remain 100% compliant with existing format validators.
- **Legacy Migration**:
  - Legacy keys (`roadforge_roadmap`, `roadforge_roadmap_id`, `roadforge_auth_token`) are read on startup.
  - Safe migration moves them to `roadforge:roadmap:<id>` and `roadforge:auth`.
  - Legacy keys are preserved if migration cannot verify readback.
- **Authentication**:
  - HttpOnly cookie exchange remains primary.
  - Legacy credential recovery is intact and safe against storage exhaustion.

---

## 5. Test Coverage and Verification

Focused regression test suites were created to verify all critical edge cases:

1. **`apps/web/src/lib/__tests__/persistence-migration-safety.test.ts`**:
   - `preserves legacy keys if writing to new keys fails (quota / policy)`
   - `preserves legacy auth token if auth cache write fails`
   - `removes legacy keys only after successful write and verified readback`
   - `handles localStorage quota errors gracefully in setLocal`
2. **`apps/web/src/hooks/__tests__/useRoadmapHydration.persistence.test.tsx`**:
   - `preserves unsaved offline edits when reopened with server available`
   - `replaces clean cache when server version is newer`
   - `marks cleanly reconciled if local dirty cache is structurally identical to server`
   - `preserves dirty draft when session expires during editing`
   - `handles storage quota failure during createLocalRoadmap without losing draft`
3. **`apps/web/src/hooks/__tests__/useSaveFlow.races.test.tsx`**:
   - `keeps saved as false and retains pending activity when edits occur during pending save`
   - `serializes concurrent manual save and autosync without duplicate requests`
   - `handles server 409 conflict and prevents updatedAt regression on stale responses`
   - `discards in-flight responses if active roadmap switches before save completes`

### Full Suite Validation
- **Unit Tests**: 97 test files passed, 716 tests passed, 0 failures.
- **Typecheck**: Zero TypeScript errors.
- **Lint**: Zero ESLint warnings or errors.
- **Product Copy & Contract Checks**: `npm run check:copy` passed (26 surfaces, release contract, zero em-dashes across all tracked text files).
- **Import Cycles**: `npm run check:cycles` passed (269 files, 725 imports, zero cycles).
