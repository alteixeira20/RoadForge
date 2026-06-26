# Anvilary Roadmaps — Workspace Responsive Manual QA Matrix (Phase 25)

## Overview

This matrix covers the manual checks introduced or affected by Phase 25 (WR-2501–WR-2506): workspace max-width widened to 1080px, toolbar 900px intermediate breakpoint, 600px mobile density pass, edit form responsive rules, phase header refactor (`phase-toggle-btn`), and banner breakpoint alignment. Run each check at every listed viewport. Mark each cell ✓ (pass), ❌ (fail), or — (not yet tested). File bugs for every ❌ before sign-off.

---

## Viewport presets

| Label | Dimensions | Notes |
|---|---|---|
| Half-screen desktop | 1024 × 768 | **Primary working viewport** — browser + terminal/agent/docs side-by-side |
| Fullscreen desktop | 1440 × 900 | Expanded desktop check |
| Tablet | 768 × 1024 | Portrait orientation |
| Mobile | 390 × 844 | iPhone 14 Pro; portrait |

---

## QA matrix

### Layout / overflow

| Check | Fullscreen | Half-screen | Tablet | Mobile | Notes |
|---|:---:|:---:|:---:|:---:|---|
| No horizontal scroll bar on page | — | — | — | — | |
| Workspace content rail uses available width (no wide dead gutters at fullscreen) | — | — | — | — | Max-width is now 1080px via `--workspace-max-width` |
| Phase cards do not overflow their container | — | — | — | — | |
| Task rows do not overflow phase cards | — | — | — | — | |
| Long phase names truncate or wrap without overflow | — | — | — | — | |
| Long task titles wrap cleanly | — | — | — | — | |

### Header and toolbar

| Check | Fullscreen | Half-screen | Tablet | Mobile | Notes |
|---|:---:|:---:|:---:|:---:|---|
| App header renders without overflow | — | — | — | — | |
| Roadmap title visible and not clipped | — | — | — | — | |
| Toolbar (search + filter + actions) fits on its row without overflow | — | — | — | — | |
| Toolbar wraps gracefully at intermediate widths (900–1100px) | — | — | — | — | Search shrinks; kbd hint hides at 900px breakpoint |
| Search input is usable (not too narrow) | — | — | — | — | |
| Collapse all / Expand all button visible and functional | — | — | — | — | |
| Activity button visible and functional | — | — | — | — | Disabled for local-only roadmaps; see Local-only section |
| Versions button visible (when server roadmap synced) | — | — | — | — | Hidden for local-only roadmaps |
| Filter dropdown opens and closes correctly | — | — | — | — | |

### Phase interaction

| Check | Fullscreen | Half-screen | Tablet | Mobile | Notes |
|---|:---:|:---:|:---:|:---:|---|
| Phase collapses and expands on header click | — | — | — | — | Click target is `.phase-toggle-btn` button inside `.phase-head` |
| Phase settings (···) menu opens with Rename / Change color / Delete phase | — | — | — | — | Color picker is no longer a bare header swatch; it opens from the settings menu |
| Opening the settings menu / color popover does not instantly close (no self-lock flash) | — | — | — | — | Current user's own phase lock must not unmount the menu mid-edit |
| Current user is not shown "… is editing" for their own phase lock | — | — | — | — | Self-lock bridge; lock pill is for other participants only |
| Change color popover offers Auto / Manual modes (Manual shows presets + custom hex) | — | — | — | — | |
| Selecting a color updates phase and closes popover | — | — | — | — | |
| Color popover closes on outside click and Escape | — | — | — | — | |
| Delete phase opens styled ConfirmDialog (not native confirm) | — | — | — | — | Destructive confirm + Keep phase cancel |
| Drag handle visible on hover (or always on touch) | — | — | — | — | |
| Phase drag-reorder works | — | — | — | — | |

### Task row

| Check | Fullscreen | Half-screen | Tablet | Mobile | Notes |
|---|:---:|:---:|:---:|:---:|---|
| Task row expands/collapses on toggle button click | — | — | — | — | |
| Task done checkbox toggles correctly | — | — | — | — | |
| Task title is readable at all widths | — | — | — | — | |
| Meta pills (estimate, blocked) visible at desktop; hidden or truncated at mobile | — | — | — | — | 600px density pass affects pill visibility |
| Task lock pill visible when locked | — | — | — | — | |

### Task edit form

| Check | Fullscreen | Half-screen | Tablet | Mobile | Notes |
|---|:---:|:---:|:---:|:---:|---|
| Edit form opens within expanded task | — | — | — | — | |
| Title field is usable (not too narrow) | — | — | — | — | 600px responsive rules apply |
| Assignee chips render and are removable | — | — | — | — | |
| Tag input and chips render correctly | — | — | — | — | |
| Save / Cancel buttons visible and reachable | — | — | — | — | |
| Dirty-edit guard toast shows when navigating away with unsaved edits | — | — | — | — | |

### Draft task row

| Check | Fullscreen | Half-screen | Tablet | Mobile | Notes |
|---|:---:|:---:|:---:|:---:|---|
| Draft row opens when "Add task" is clicked | — | — | — | — | |
| Input field usable at all widths | — | — | — | — | |
| Create and Cancel buttons visible and reachable | — | — | — | — | |
| Dirty draft guard toast shows when trying to close phase with dirty draft | — | — | — | — | |

### Panels

| Check | Fullscreen | Half-screen | Tablet | Mobile | Notes |
|---|:---:|:---:|:---:|:---:|---|
| Activity panel opens and fills sidebar correctly | — | — | — | — | |
| Versions panel opens and fills sidebar correctly | — | — | — | — | |
| Panels do not obscure workspace content on mobile | — | — | — | — | |

### Dark / light theme

| Check | Fullscreen | Half-screen | Tablet | Mobile | Notes |
|---|:---:|:---:|:---:|:---:|---|
| Workspace renders in dark theme without color errors | — | — | — | — | |
| Workspace renders in light theme without color errors | — | — | — | — | |

### Read-only / viewer mode

| Check | Fullscreen | Half-screen | Tablet | Mobile | Notes |
|---|:---:|:---:|:---:|:---:|---|
| Color picker hidden for viewers | — | — | — | — | |
| Edit form not accessible for viewers | — | — | — | — | |
| Drag handles hidden for viewers | — | — | — | — | |
| Read-only banner visible | — | — | — | — | Banner breakpoint aligned to 760px in Phase 25 |

### Locked task / phase

| Check | Fullscreen | Half-screen | Tablet | Mobile | Notes |
|---|:---:|:---:|:---:|:---:|---|
| Lock pill visible on locked task or phase | — | — | — | — | |
| Color picker disabled when phase locked by another participant | — | — | — | — | |

### Local-only vs synced roadmap

| Check | Fullscreen | Half-screen | Tablet | Mobile | Notes |
|---|:---:|:---:|:---:|:---:|---|
| Activity button disabled for local-only roadmaps | — | — | — | — | |
| Versions button hidden for local-only roadmaps | — | — | — | — | |
| Save button behavior correct for both modes | — | — | — | — | Local-only: saves to localStorage; synced: PUT to API |

---

## Known deferred items

- `.check` div is not yet a keyboard-accessible `<button>` — accessibility gap, not addressed in Phase 25.
- Drag handle touch target is still below the 44px WCAG guideline on mobile.
- Task edit form has no responsive coverage at tablet (768px) — only 600px rules are in place.
- No final responsive/interaction audit has been run yet; scheduled for the next phase.

---

## How to file a bug

For any ❌ found during this pass, open an issue in the project issue tracker with the viewport preset, the failing check text, a screenshot if applicable, and the browser and OS. Reference this document and the Phase 25 ticket range (WR-2501–WR-2506) in the issue description.
