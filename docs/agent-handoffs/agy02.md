# AGY02 Handoff: Quiet Collaboration UI and Visual Stability

## Overview

- **Agent**: AGY02
- **Branch**: `work/agy02-quiet-collaboration-ui`
- **Mission**: Make RoadForge behave like a polished realtime collaborative application. Remote edits, background saves, and synchronization are visually silent. Users continue typing, dragging, scrolling, and navigating without flashing status labels, auto-reopening panels, or redundant notifications.
- **File Freeze Compliance**: No edits were made to `useRoadmapRealtime.ts`, `useRoadmapHydration.ts`, `useSaveFlow.ts`, `useAutoSync.ts`, or `RoadmapContext.tsx`.

---

## 1. Exact Notifications Removed or Changed

### Toast System (`useToastState.ts`)
- **Deduplication**: Previously, duplicate messages repeatedly stacked in the toast queue, filling the screen with identical toasts during concurrent activity. The toast state now intercepts duplicate messages, resets their dismissal timer (3200ms) so users have sufficient viewing time, and updates their tone if the severity changes, without creating duplicate DOM nodes.
- **Classification**: Added `classifyToastTone` to categorize messages into `error`, `warning`, `success`, or `info`:
  - `error`: Network failures, unauthorized access, permissions errors, deletions, invalid operations.
  - `warning`: Data conflicts, edit locks held by others, expired sessions, circular dependencies, blockers, unsaved changes.
  - `success`: Checkpoints created, links generated/revoked, restored backups, saved states.
  - `info`: Routine informational notices.
- **Routine Silence**: Successful remote updates, routine sync events, and background saves no longer trigger routine success toasts.

### Sync Status Indicator (`SyncStatusIndicator.tsx`)
- **Transient Timing & Silence**:
  - Previously, `TRANSIENT_DELAY_MS` was 300ms, which was shorter than typical network round-trips (350-500ms), causing `Saving…` or `Updating…` to flash on every keystroke or remote event.
  - Normal saves and remote SSE updates are now debounced with `TRANSIENT_SAVE_UPDATE_DELAY_MS = 2000ms`. Operations completing within 2000ms remain visually silent (steady `Live` or `Local draft`).
  - Brief reconnections (`reconnecting`) are debounced with `TRANSIENT_RECONNECT_DELAY_MS = 2500ms` so transient network hiccups do not distract collaborators.
  - Urgent alerts (`offline`, `conflict`, `error`, `access-lost`) transition immediately with 0ms delay.
  - Minimum visibility (`TRANSIENT_MIN_VISIBLE_MS = 500ms`) is enforced only when a transient status is actually displayed, preventing 1-frame visual flashes.

### Upgrade Notice Banner (`roadmap-upgrade.ts`)
- **Signature Stability**:
  - `getRoadmapUpgradeNoticeSignature` previously included `updatedAt` in its serialized signature: `JSON.stringify([roadmapId, updatedAt, noticeParts])`. Every local autosave and incoming remote update produced a new signature, invalidating the user's dismissal stored in `localStorage` and causing the banner to repeatedly re-mount and shift workspace layout.
  - `updatedAt` has been removed from the signature (`JSON.stringify([roadmapId, noticeParts])`), keeping the signature stable across edits while continuing to detect changes to the upgrade notice content.

---

## 2. Changes to Accessibility Announcements

### Live Regions and Roles
- **Sync Status Announcements**:
  - Routine status states (`local`, `live`, `saving`, `updating`) use `role="status"` and `aria-live="polite"`.
  - Urgent conditions requiring user intervention (`offline`, `conflict`, `error`, `access-lost`) use `role="alert"` and `aria-live="assertive"` to ensure screen readers immediately notify users of potential data loss or permission failure.
- **Keyboard Reordering**:
  - Preserved the single workspace-wide assertive live region (`GlobalKeyboardReorderAnnouncer`), ensuring pickup, move, and drop actions announce clear position coordinates without duplicate announcer regions.
- **Reduced Motion**:
  - Retained strict compliance with `prefers-reduced-motion: reduce`, ensuring all UI transitions on status dots, collapse buttons, and toasts are clamped to `<= 0.01ms`.

---

## 3. Presentation and Visual Stability

### Phase Collapse Persistence (`usePhaseCollapse.ts`)
- **Deliberate Collapse**:
  - Fixed `loadOpenPhaseIds` which previously treated `openPhaseIds.length === 0` as empty/uninitialized state and reverted to defaults. An empty array (`openPhaseIds: []`) is now treated as a valid user preference.
  - After initialization, phase updates and remote phase creations prune removed IDs but do not reopen collapsed phases. Remote phase creation, task completion, and background sync never reopen collapsed panels.

### Form Focus and Uncommitted Edit Retention
- **Active Task Editor**:
  - Component hierarchy and React keys keep the active `TaskEditForm` mounted and focused during background updates and re-renders.
  - Input cursor position, text selection, and dirty draft state are fully preserved without remounting or focus drops.

### Drag and Drop Safety
- **Array Move Bounds**:
  - In `Phase.tsx` and `PhaseList.tsx`, guarded `handleDragEnd` with `oldIndex !== -1 && newIndex !== -1` to safely handle situations where items are concurrently deleted or moved remotely during a drag gesture.

---

## 4. Reproducible Visual Evidence and DOM Stability

Screenshots were captured during browser e2e testing and saved to `docs/agent-handoffs/screenshots/`:
- `phases-collapsed.png`: All phases collapsed via toolbar control.
- `phases-collapsed-after-reload.png`: Deliberate empty open phases preference surviving full page reload.
- `active-task-editor-before-update.png`: Task editor active with uncommitted text and active focus.
- `active-task-editor-after-update.png`: Task editor retaining text and focus across state events.
- `desktop-workspace.png`: Quiet sync status indicator in 1280x800 desktop viewport.
- `mobile-workspace.png`: Quiet sync status indicator in 390x844 mobile viewport.

### Measurable DOM Stability Metrics
- **Scroll Position**: Window scroll position remains stable within 2px across re-renders and resize events (verified in `e2e/quiet-collaboration.spec.ts`).
- **Focus Preservation**: Focused input elements maintain active element focus and selection across state updates.

---

## 5. Tests Added and Results

### Unit and Integration Tests (Vitest)
- `apps/web/src/lib/__tests__/roadmap-upgrade.test.ts` (16 tests)
- `apps/web/src/hooks/__tests__/usePhaseCollapse.test.tsx` (5 tests)
- `apps/web/src/components/roadmap/__tests__/SyncStatusIndicator.test.tsx` (7 tests)
- `apps/web/src/hooks/__tests__/useToastState.test.tsx` (8 tests)
- `apps/web/src/components/roadmap/__tests__/CollaborationUxStability.test.tsx` (6 tests)
- **Vitest Suite Total**: 97 test files, 729 passed (100% pass rate).

### End-to-End Browser Tests (Playwright)
- `apps/web/e2e/quiet-collaboration.spec.ts` (5 tests):
  1. Preserves collapsed phases across remote updates and page reloads.
  2. Keeps active task editor focused and retains uncommitted edits during updates.
  3. Maintains visual silence with quiet sync status indicator on desktop and mobile.
  4. Stable scroll position across unrelated updates.
  5. Reduced motion support disables transitions on status indicator and toasts.
- **Playwright Results**: 5 passed in 19.2s.

### Static Verification
- `pnpm typecheck`: Clean (0 errors).
- `pnpm lint`: Clean (0 errors, 0 warnings).
- `pnpm check:copy`: Product copy validation passed for 26 surfaces; release contract validated.
- `pnpm check:em-dash`: Checked tracked files, 0 em-dashes found.

---

## 6. Unresolved Issues

- None. All requirements for quiet realtime collaboration, visual stability, and accessibility have been verified.
