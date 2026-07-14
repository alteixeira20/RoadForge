# RoadForge — Frontend Foundation Reference

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

## Component and hook boundaries

- `Workspace.tsx` composes the workspace and delegates stateful behavior to hooks.
- `PhaseList`, `Phase`, and `TaskRow` own roadmap presentation and focused interactions.
- `useAutoSync` handles aggregate saves; task done/claim and tag registry changes have
  focused service calls.
- `useRoadmapRealtime` obtains a short-lived ticket and reconciles SSE events.
- `useEditLock` manages 30-second soft locks with 20-second refresh.
- `useIdleEditPause` pauses lock refresh after 90 seconds without interaction while
  preserving the local edit draft.
- `useWorkspaceParticipants` loads full owner participant data or reduced editor
  summaries for Team and assignee suggestions.
- `SyncStatusIndicator` presents local/live/saving/updating/reconnecting/offline/conflict
  state.

## Service boundary

Only modules under `src/services/` call `fetch()`:

- `roadmap-crud.service.ts` - roadmap CRUD, versions, task state, tags, and canonical JSON export;
- `roadmap-sharing.service.ts` — join, share links, and participants;
- `roadmap-locks.service.ts` — lock acquire/release/list;
- `roadmap-realtime.service.ts` — event tickets and SSE setup;
- `roadmap-http.ts` — shared request/error handling;
- `roadmap.service.ts` — compatibility barrel for existing imports.

Components and hooks consume these services rather than calling the API directly.

## Import and export

JSON import/export is browser-only. Import validates and safely repairs supported older
shapes, previews replace/merge effects, and never requires a backend endpoint. Import
accepts current `roadforge.*` and legacy `anvilary.*` schema IDs. Exports retain the
legacy `anvilary.roadmap.export` ID so older RoadForge deployments can read new files.

Markdown export is produced by `src/lib/roadmap-markdown.ts` as a deterministic
client-side presentation format. It preserves phase/task order and user-authored task
descriptions, includes planning metadata, omits session and volatile claim state, and
cannot be imported. PDF export is deferred and has no control in the Public Alpha UI.
JSON remains the canonical portable and importable format.

## Collaboration behavior

- Owner/editor roadmap saves use `last_updated_at`; stale writes enter the conflict
  review flow without discarding local edits.
- Task title, estimate, description, tags, and assignees support lock-aware inline
  editing. Task completion and claims use focused API routes.
- Editors can read active participant name/role summaries and version history. Their
  Versions UI is read-only.
- Only owners can manage share links, revoke participants, delete roadmaps, and restore
  versions.
- Viewers cannot mutate roadmap state.

## Styling

CSS is organized under `src/styles/` and imported through `app/globals.css`. Design
tokens live in `styles/tokens.css`; responsive rules stay with the owning stylesheet.
The `Brand` component presents the RoadForge product name with Anvilary brand assets.

The UI is dark-only and inherits the shared Anvilary design language. The
Anvilary-Website repository is the source of truth for the forge palette, typography
(Lexend / JetBrains Mono), the dark-orange action gradient, translucent surface
treatment, and the ambient ember atmosphere. The aligned pieces were copied and
adapted — not imported — so RoadForge builds independently:

- `styles/tokens.css` mirrors the Anvilary token set (palette, radii, shadows,
  action gradient, forge-glow, surface hierarchy).
- `components/ui/EmberBackground.tsx` and `styles/primitives/atmosphere.css` port
  the Anvilary ember canvas and glow (fixed decorative layer, particle cap, capped
  device pixel ratio, pauses when hidden, reduced-motion keeps a static glow).
- `styles/primitives/buttons.css` ports the accessible primary button gradient.
- Brand and favicon assets use the white Anvilary mark for dark surfaces.
