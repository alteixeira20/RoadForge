# AGY00 Realtime Reconciliation and Collaborative Editing Handoff

## Summary
AGY00 addressed realtime reconciliation and collaboration stability to make multi-user editing seamless and non-disruptive, similar to Excalidraw. Previously, incoming remote events triggered wholesale phase and task object recreations, overwrote unsaved local field drafts (such as task descriptions), reset editing state / collapsed active task forms, disturbed focus/cursor positions, and caused the sync status indicator badge to constantly flash between "live" and "updating".

## Findings and Root Causes

1. **Unnecessary State Replacement and Cursor/Editor Disruption**:
   - `mergeAuthoritativeTasksIntoLocalPhases` previously reconstructed the entire task object (`{ ...authoritativeTask }`) on every task event.
   - When a collaborator completed or claimed a task, or updated a single field, the local user's in-progress description draft or title draft was completely wiped out.
   - Recreating phase and task objects on every event invalidated React component identities in `PhaseList`, `Phase`, and `TaskEditForm`, causing focus loss, cursor jumping, and form collapse.

2. **Status Badge Flickering ("live" <-> "updating")**:
   - `runAuthoritativeRefresh` unconditionally called `setRealtimeStatus('updating')` for every event, including routine task updates, renames, and claims.
   - Routine incoming updates should remain visibly `live`. Only initial connection and post-reconnection resyncs require the transitional `updating` indicator.

3. **Redundant Network Requests and In-Flight Race Conditions**:
   - Duplicate SSE events and delayed events with timestamps older than the currently cached snapshot were not filtered before dispatching network requests.
   - Event bursts during active GET requests were not cleanly coalesced with safe scoped updates.

4. **Reference Identity Loss for Unchanged Phases and Tasks**:
   - Scope-merging routines lacked reference-equality preservation. Unmodified tasks and phases were cloned needlessly, triggering widespread cascading re-renders across the entire roadmap tree.

## Changes Made

### 1. `apps/web/src/lib/realtime-task-merge.ts`
- Added optional `taskFields?: ReadonlyMap<string, ReadonlySet<string>>` parameter to `mergeAuthoritativeTasksIntoLocalPhases`.
- Preserved existing task reference if values for authoritative fields match existing values.
- Preserved local draft fields (such as `desc`, `title`, `est`, `complexity`, `tags`, etc.) when server events only cover specific action scopes (e.g. `task.completed`, `task.claimed`).
- Preserved phase object references when no contained tasks changed and progress is unchanged.
- Preserved array identity (`localPhases`) if no phases changed.

### 2. `apps/web/src/lib/realtime-structure-merge.ts`
- Updated `mergeAuthoritativePhaseFieldsIntoLocalPhases` to check field value equality (`phase[field] === authoritative[field]`) before creating new phase objects.
- Preserves array identity if no phase fields actually changed.

### 3. `apps/web/src/lib/realtime-phase-structure-merge.ts`
- Updated `mergeAuthoritativePhaseStructureIntoLocalPhases` to preserve existing phase object references and array identity if preferred order matches current order.

### 4. `apps/web/src/lib/realtime-task-structure-merge.ts`
- Updated `withoutDeletedTasks` and structure merge helpers to skip phases lacking affected tasks, dependencies, or parent references, preserving phase references and returning original array if unchanged.

### 5. `apps/web/src/hooks/useRoadmapRealtime.ts`
- Extended `RealtimeRefreshRequest` with `isResync: boolean`, `maxEventUpdatedAt: string | null`, and `taskFields: Map<string, Set<string>>`.
- Mapped action scopes (`task.completed`, `task.reopened`, `task.claimed`, `task.unclaimed`, and `payload.changed_fields`) into specific `taskFields` scopes so only covered fields are updated.
- Updated `runAuthoritativeRefresh`: only transitions to `updating` status when `request.isResync === true` (initial connect and reconnect). Routine collaborative events stay `live`.
- In `applyLoadedScopedUpdates`: only calls `setPhasesState`, `setRoadmapNameState`, `setUpdatedAtState`, and `storage.setRoadmapCache` when actual changes occur.
- Added deduplication cache `seenEventKeys` to drop duplicate events per connection attempt.
- Filtered delayed and out-of-order events where `isOlderServerRevision(payload.updated_at, currentRevision)` is true, eliminating redundant GET requests.

### 6. `apps/web/src/hooks/__tests__/useRoadmapRealtime.collaboration.test.tsx`
- Added comprehensive focused test suite covering all 10 required collaboration scenarios:
  1. Two clients editing unrelated tasks concurrently without overwriting local drafts.
  2. Rapid edits to the same task coalescing into single in-flight fetch and one follow-up.
  3. Remote completion while keeping local description draft intact.
  4. Remote phase creation and deletion rebasing onto local drafts without disturbing unchanged phases.
  5. Reordered tasks during concurrent editing while preserving local drafts.
  6. Ignoring duplicate, delayed, and out-of-order events without unnecessary fetches.
  7. Preserving dirty local drafts during reconnect resync.
  8. Rejecting stale authoritative fetches and preserving newer local revisions.
  9. Stream disconnection and smooth reconnection with fresh ticket.
  10. Participant revocation permanently closing connection and preserving local draft.

## Verification Results
- `pnpm --dir apps/web test src/lib/__tests__/realtime src/hooks/__tests__/useRoadmapRealtime`: 10 test files, 70 tests passed.
- `pnpm --dir apps/web test`: 95 test files, 713 tests passed.
- `pnpm typecheck`: 0 TypeScript errors.
- `pnpm lint`: 0 ESLint errors or warnings.
- `pnpm check:copy`: Product copy validation passed for 26 current surfaces; release contract validated; em-dash check passed for all tracked files.
- `pnpm check:cycles`: Web import validation passed for 267 files and 719 internal imports.
- `pnpm check:docs`: Documentation link validation passed for 131 local links in 46 files.

## Unresolved Issues and Remaining Risks
- **Very high frequency simultaneous conflict on the exact same text field**: If Client A and Client B type in the exact same task title simultaneously without saving, the server's authoritative version will apply to that field on subsequent fetch. Full collaborative text CRDTs or operational transforms for character-by-character editing are out of scope per mission instructions.
- **Network partition recovery for aggregate operations**: If an aggregate operation occurs remotely while the local user has an unsaved dirty draft, the aggregate refresh is safely postponed to avoid overwriting the draft, pending focused server mutations or manual save.

## Integration Requirements for AGY01 and AGY02
- **AGY01 (Sync & Autosave Flow)**:
  - Local edits continue to write to `storage.getRoadmapCache/setRoadmapCache` and set `savedRef.current = false`.
  - When AGY01 sends local changes to the server, upon successful response, AGY01 advances `updatedAt` and sets `savedRef.current = true`. Realtime reconciliation will seamlessly treat the saved state as authoritative.
- **AGY02 (UI Controls & Presence / Locks)**:
  - Realtime lock handling (`onLockAcquired`, `onLockReleased`) in `useRoadmapRealtime` remains intact and populates `lockState.setLocks`.
  - Phase and task object identities are now preserved across routine updates, allowing React components to use `React.memo` or fine-grained selectors without unnecessary re-renders.
