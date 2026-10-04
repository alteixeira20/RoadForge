# RoadForge - Frontend Foundation Reference

This document describes the current frontend boundaries. RoadForge is a local-first
Next.js application: local roadmaps work without the API, while synced roadmaps use a
browser cache, bearer participant session, optimistic concurrency, and SSE refreshes.

## Routes

| Route | Purpose |
|---|---|
| `/` | Marketing/wizard entry, then local workspace |
| `/workspace` | Editable owner/editor workspace |
| `/shared` | Read-only viewer workspace |
| `/join` | Invite-token join and optional password gate |
| `/help` | Task-based user guide and safe reporting path |

## State and persistence

`RoadmapContext` owns the active roadmap, participant/session metadata, tag registry,
locks, save state, and local cache coordination. Browser persistence goes through
`src/lib/storage.ts`; components must not call `localStorage` directly.

Current keys:

| Storage | Key | Purpose |
|---|---|---|
| local | `rf:displayName` | collaboration label |
| local | `rf:lastRoadmapId` | last active roadmap |
| local | `rf:roadmap:{id}` | roadmap cache and save state |
| local | `rf:auth:{id}` | scoped server/session/participant/role data |
| session | `rf:activeRoadmapId` | active roadmap for this tab |
| session | `rf:ui:{id}` | active-roadmap UI state |

Legacy flat `rf:*` roadmap/auth keys are migrated into scoped records on first read.
Old roadmap snapshots pass through `roadmap-upgrade.ts` before rendering.

Canonical construction and validation boundaries:

- `roadmap-factory.ts` is the only phase factory; phase creation always flows
  through `usePhaseMutations`.
- `roadmap-validation.ts` and `parseImportedRoadmapJson` are the canonical
  browser import/parser path. Upgrade and repair behavior delegates to that path
  rather than maintaining a second template validator.
- `ActivityAction` in `types/roadmap.ts` is the current mutation vocabulary, and
  `activity-changes.ts` owns batching/deduplication. `roadmap.phases_reordered`
  remains read-compatible legacy vocabulary; new phase reorder writes use
  `phase.reordered`.

## Component and hook boundaries

- `Workspace.tsx` composes the workspace and delegates stateful behavior to hooks.
- `PhaseList`, `Phase`, and `TaskRow` own roadmap presentation and focused interactions.
- `PhaseList` is the memoized render boundary for phase/task editors. Workspace
  structural mutation callbacks and filtered disclosure data remain referentially
  stable until their roadmap inputs change, so unrelated toast or panel state does
  not rerender active editors.
- `TaskRow` and task-claim behavior subscribe to the roadmap data/session slices
  they use rather than the combined compatibility context, so lifecycle-only
  updates do not invalidate active task editors.
- `useAutoSync` handles exceptional aggregate saves (creation, imports, restores); ordinary
  task, phase, claim, and tag mutations use focused service calls and do not trigger whole-roadmap PUTs.
- `useRoadmapRealtime` obtains a short-lived ticket and reconciles SSE events silently without
  triggering secondary writes or notification spam.
- `useEditLock` manages 30-second soft locks with 20-second refresh.
- `useIdleEditPause` pauses lock refresh after 90 seconds without interaction while
  preserving the local edit draft.
- `useWorkspaceParticipants` loads full owner participant data or reduced editor
  summaries for Team and assignee suggestions.
- `SyncStatusIndicator` presents local/live/saving/updating/reconnecting/offline/conflict
  state.

## Overlay and focus ownership

- `AnchoredOverlay` owns portal rendering, collision-aware placement, viewport
  clamping, resize/scroll repositioning, dismissal, keyboard navigation, and focus
  return for toolbar and header popovers.
- `Modal` owns portalled modal-dialog focus trapping. When dialogs are nested, only
  the topmost dialog handles Escape and Tab before returning focus to its parent.
- `SidePanel` owns Activity and Versions panel structure, initial focus, Escape, and
  focus return. Workspace keeps those panels mutually exclusive.
- Layer ordering is defined only by the `--z-*` tokens in `styles/tokens.css`:
  local popovers, workspace/site headers, anchored overlays, side panels,
  modal dialogs and wizards, then toasts.

## Service boundary

Only modules under `src/services/` call `fetch()`:

- `roadmap-crud.service.ts` - roadmap CRUD, versions, task state, tags, and canonical JSON export;
- `roadmap-sharing.service.ts` - join, share links, password management, and participants;
- `roadmap-locks.service.ts` - lock acquire/release/list;
- `roadmap-realtime.service.ts` - event tickets and SSE setup;
- `roadmap-http.ts` - shared request/error handling;
- `roadmap.service.ts` - compatibility barrel for existing imports.

Components and hooks consume these services rather than calling the API directly.

## Import and export

JSON import/export is browser-only. Import validates and safely repairs supported older
shapes, previews replace/merge effects, and never requires a backend endpoint. Import
accepts current `roadforge.*` and legacy `anvilary.*` schema IDs. Exports retain the
legacy `anvilary.roadmap.export` ID so older RoadForge deployments can read new files.

Markdown export is produced by `src/lib/roadmap-markdown.ts` as a deterministic
client-side presentation format. It preserves phase/task order and user-authored task
descriptions, includes planning metadata, omits session and volatile claim state, and
cannot be imported. PDF export is deferred and has no control in the current UI.
JSON remains the canonical portable and importable format.

## Collaboration behavior

- Quiet collaboration model: ordinary collaborative edits appear automatically and converge
  without whole-roadmap conflict modals, banners, page reloads, or repetitive toasts.
- Focused intent writes: task planning edits, task completion, phase creation/deletion/renaming/reordering,
  and tag mutations bypass whole-roadmap compare-and-swap checks, serializing safely under database
  row locking where later accepted writes win.
- Aggregate saves with `last_updated_at` CAS checks are reserved strictly for exceptional bulk operations
  such as initial server roadmap creation, explicit JSON import, or version checkpoint restore.
- Remote authoritative updates are applied non-dirtily: applying received
  updates does not mark the roadmap unsaved (`saved: false`) and never triggers echo writes or autosync loops.
- Snapshot normalization happens silently in memory without user-facing upgrade notice banners or
  cascading saves.
- Active task editor focus and uncommitted user drafts are preserved across remote updates to unrelated entities.
- Only owners can manage share links, set/change/remove roadmap passwords in `ShareModal.tsx`, revoke
  participants, delete roadmaps, and restore versions.
- Viewers cannot mutate roadmap state.

## Styling

CSS is organized under `src/styles/` and imported through `app/globals.css`. Design
tokens live in `styles/tokens.css`; responsive rules stay with the owning stylesheet.
The `Brand` component presents the RoadForge product name with Anvilary brand assets.

The UI is dark-only and inherits the shared Anvilary design language. The
Anvilary-Website repository is the source of truth for the forge palette, typography
(Lexend / JetBrains Mono), the dark-orange action gradient, translucent surface
treatment, and the ambient ember atmosphere. The aligned pieces were copied and
adapted - not imported - so RoadForge builds independently:

- `styles/tokens.css` mirrors the Anvilary token set (palette, radii, shadows,
  action gradient, forge-glow, surface hierarchy).
- `components/ui/EmberBackground.tsx` and `styles/primitives/atmosphere.css` port
  the Anvilary ember canvas and glow (fixed decorative layer, particle cap, capped
  device pixel ratio, pauses when hidden, reduced-motion keeps a static glow).
- `styles/primitives/buttons.css` ports the accessible primary button gradient.
- Brand and favicon assets use the white Anvilary mark for dark surfaces.
