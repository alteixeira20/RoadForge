# Roadforge — Frontend Foundation Reference

This document is the architecture reference for the Roadforge frontend. It covers component boundaries, context responsibilities, persistence, and where backend integration should happen.

---

## Route structure

| Route | Page file | Mode |
|---|---|---|
| `/` | `app/page.tsx` | Renders `Homepage` or `Workspace` depending on wizard state |
| `/workspace` | `app/workspace/page.tsx` | `Workspace` in owner mode |
| `/shared` | `app/shared/page.tsx` | `Workspace` in viewer mode |
| `/join` | `app/join/page.tsx` | `JoinPage` |

`app/page.tsx` manages a single piece of state: whether the user has completed the wizard (`showWorkspace: boolean`). Everything else is in context or component-local state.

---

## Component architecture

### Top-level components

| Component | File | Responsibility |
|---|---|---|
| `Homepage` | `components/home/Homepage.tsx` | Composes site sections; no logic |
| `Workspace` | `components/roadmap/Workspace.tsx` | Composes the workspace; delegates state to hooks |
| `CreateWizard` | `components/wizard/CreateWizard.tsx` | 4-step form; reads/writes RoadmapContext |
| `JoinPage` | `components/join/JoinPage.tsx` | Name input + mocked join call |

### Homepage sections (all server-safe except FeaturesSection which uses client animations)

- `HeroSection` — hero copy, CTAs, preview chrome + MiniPreview
- `HowItWorksSection` — flow strip + 3 step cards
- `FeaturesSection` — 6 feature cards + GitHub CTA strip

### Workspace sub-components (all fully controlled — no local state)

- `WorkspaceHead` — roadmap title, progress metadata
- `WorkspaceToolbar` — search input, collapse-all button
- `PhaseList` — renders Phase list + "Add phase" button (owner only)
- `Phase` — phase header + collapsible task list
- `TaskRow` — single task row with check, expand, and detail panel
- `WorkspaceModals` — renders SaveToServerModal, ShareModal, IOModal

### Layout

- `AppHeader` — sticky workspace header (brand, crumbs, save/share/IO buttons)
- `SiteHeader` — marketing site sticky header with scroll detection

### UI primitives

- `Modal` — generic modal with scrim, head, body, footer slots; Escape key handler
- `Icon` — 31 named SVG icons via TypeScript union `IconName`
- `Brand` — Roadforge logotype with flame mark
- `Toast` — fixed-position ephemeral message
- `ThemeToggle` — dark/light segmented control

### Modals

- `SaveToServerModal` — informational modal; calls `onConfirm` which sets `saved: true`
- `ShareModal` — shows share link rows; copy-to-clipboard with toast
- `IOModal` — tabbed export/import; real JSON download + file import; reset action

---

## Context responsibilities

### RoadmapContext (`context/RoadmapContext.tsx`)

Manages all roadmap state and localStorage persistence:

| Value | Type | Persisted |
|---|---|---|
| `displayName` | `string` | `rf:displayName` |
| `roadmapName` | `string` | `rf:roadmapName` |
| `phases` | `Phase[]` | `rf:phases` |
| `saved` | `boolean` | `rf:saved` |
| `resetToSample()` | `() => void` | clears all rf:* keys |

Hydration: on client mount, reads all keys from `localStorage`. Falls back to `SAMPLE_ROADMAP.phases` if no phases are stored.

**TODO(backend):** Replace the initial `SAMPLE_ROADMAP.phases` fallback with a `getRoadmap(roadmapId)` call once the save/join flow assigns a server roadmap ID. Auth is not required for this step — a roadmap ID from a save or invite context is sufficient. The localStorage layer remains as optimistic cache throughout.

### ThemeContext (`context/ThemeContext.tsx`)

Manages theme and `data-theme` DOM attribute:

- Reads `rf:theme` from localStorage on mount; falls back to `'dark'`
- Sets `document.documentElement.setAttribute('data-theme', theme)` on every change
- Persists to `rf:theme` on every change

---

## Custom hooks

| Hook | File | Purpose |
|---|---|---|
| `useWorkspaceModals` | `hooks/useWorkspaceModals.ts` | Three boolean states for Save/Share/IO modal visibility |
| `usePhaseCollapse` | `hooks/usePhaseCollapse.ts` | `openPhases[]`, `togglePhase`, `allOpen`, `collapseAll`, `expandAll` |
| `usePhaseSearch` | `hooks/usePhaseSearch.ts` | `searchQuery`, `setSearchQuery`, `filteredPhases` (memoized filter on title/id/tags) |
| `useToastState` | `hooks/useToastState.ts` | `toast` string, `showToast(msg)` with 2400ms auto-clear |

---

## localStorage persistence

All localStorage access goes through `src/lib/storage.ts`. Never call `localStorage` directly in components or contexts.

### Keys

| Key | Type | Default |
|---|---|---|
| `rf:theme` | `'dark' \| 'light'` | `'dark'` |
| `rf:displayName` | `string` | `''` |
| `rf:roadmapName` | `string` | `'v1.0 Public Launch'` |
| `rf:phases` | `Phase[]` (JSON) | `SAMPLE_ROADMAP.phases` |
| `rf:saved` | `boolean` (string) | `false` |

### Safety guarantees

- All `localStorage` calls are wrapped in `try/catch` — storage quota errors are silently ignored
- All access is guarded with `typeof window !== 'undefined'` for SSR safety
- JSON parse errors return `null` (callers fall back to defaults)
- `getTheme()` validates the stored string is `'dark'` or `'light'` before returning it

---

## Import / export behavior

### JSON export (fully client-side)

1. `IOModal` calls `exportRoadmap(phases, 'json')` from `roadmap.service.ts`
2. Service creates a `Blob` with `JSON.stringify({ phases }, null, 2)`
3. IOModal creates an object URL, clicks a hidden `<a>` to trigger download, then revokes the URL

### JSON import (fully client-side)

1. Hidden `<input type="file" accept=".json">` is triggered by button click
2. `FileReader.readAsText()` reads the file
3. Parsed JSON is validated: must be an array (or `{ phases: [] }`) with at least one entry containing `id` (string) and `tasks` (array)
4. On success: `setPhases()` (which persists to localStorage) + toast
5. On failure: toast with error message; state unchanged

### Other formats

Markdown, PDF, and agent-bundle export require backend rendering. They currently toast "requires backend" and close the modal.

---

## Service layer boundary

`src/services/roadmap.service.ts` is the single integration point for backend calls. It contains 14 typed async functions. Each has a `// TODO(backend): HTTP <method> <endpoint>` comment describing the expected API shape.

**Rule:** All future HTTP calls must be added to or modified in this file. Components and hooks must not call `fetch()` directly.

Current functions include:
- `getRoadmap(id)` — fetch a roadmap by ID
- `createRoadmap(payload)` — create a new roadmap
- `updateRoadmap(id, patches)` — partial update
- `addPhase / updatePhase / deletePhase`
- `addTask / updateTask / deleteTask / reorderTasks`
- `exportRoadmap(phases, format)` — JSON Blob (implemented), others throw
- `importRoadmap(data, format)` — throws (client-side JSON handled in IOModal directly)
- `createShareLink / joinRoadmap`

---

## CSS architecture

Global CSS is split by concern into `src/styles/`:

| File | Contents |
|---|---|
| `tokens.css` | CSS custom properties (`:root`, `[data-theme="light"]`) |
| `base.css` | Reset, element defaults, scrollbar, utilities |
| `ui.css` | Buttons, brand, theme toggle, toast, avatar |
| `site.css` | Site header, hero, preview chrome, sections, steps, features, footer |
| `workspace.css` | App shell, app header, roadmap layout, phases, tasks, readonly banner |
| `modals.css` | Wizard, generic modal, share modal, IO modal, save illustration |
| `join.css` | Join page and join card |

`app/globals.css` is the entry point — Tailwind directives + `@import` statements only.

Responsive rules live at the bottom of the owning file, not in a shared breakpoints file.

---

## Design/UX principles

- **Dark-first** — default theme is dark; light theme is a toggle, not the primary
- **Ember accent** (`--ember: #d97442`) — used for interactive states, progress, and brand moments
- **Monospace for metadata** — task IDs, phase numbers, export labels use `var(--font-mono)`
- **Display font for headings** — `var(--font-display)` (Lexend) for all h1/h2/h3 in the product
- **CSS custom properties for theming** — `data-theme` attribute on `<html>` switches the token set
- **clamp() for responsive typography** — hero and section headings use `clamp()` to avoid breakpoint jumps
- **No JavaScript-driven animations** — all transitions and keyframes are in CSS

---

## Backend integration checklist

The MVP does not require user accounts. The first backend milestone is: save a local roadmap to a server, get back a roadmap ID, then unlock secure invite links from that ID. Accounts/auth are optional and come later.

When a backend is available, integrate in this order:

1. **Save to server** — `SaveToServerModal.onConfirm` calls `createRoadmap()` (or `updateRoadmap()` if the roadmap already has a server ID). The server returns a roadmap ID. Store it in `RoadmapContext` and persist to `localStorage`. This is the only prerequisite for everything else.

2. **Store server roadmap ID** — Add `roadmapId: string | null` to `RoadmapContext`. Replace the `SAMPLE_ROADMAP.phases` fallback in the context init with `getRoadmap(roadmapId)` when an ID is present. `localStorage` stays as optimistic cache throughout — it is not removed.

3. **Share links** — Once a roadmap has a server ID, `getShareLinks(roadmapId)` returns real signed URLs. Wire `ShareModal` to use them. Wire the Regenerate and Revoke buttons to `regenerateShareLink()` and `revokeShareLink()` in the service layer. No accounts needed — links are scoped by token, not by user identity.

4. **Join flow** — `joinRoadmap(token, displayName)` on the server validates the invite token and returns the roadmap ID and granted role. On success, store the roadmap ID in context and redirect to `/workspace` or `/shared` based on role. The display name entered on `/join` is the only identity required — no account needed.

5. **Roadmap CRUD** — Wire `addPhase`, `addTask`, `updateTaskDone`, and `reorderPhases` through the service layer. Optimistic updates stay in `RoadmapContext`; the service call confirms with the server.

6. **Export (Markdown/PDF)** — Replace the "requires backend" toast in `IOModal` with a real call to `exportRoadmap(phases, format)` once the server endpoint exists. JSON export stays client-side.

7. **Accounts/auth (optional, later)** — If persistent identity across devices is desired, add a session layer after the above steps are working. Wire `displayName` from the session rather than the wizard. This is not required for MVP — invite-link identity is sufficient.

8. **Real-time collaboration (later)** — Add WebSocket/SSE subscription in `RoadmapContext` to receive remote phase/task updates and merge with local optimistic state.

All integration points are already marked in `roadmap.service.ts` with `// TODO(backend):` comments.
