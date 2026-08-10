# Workspace interaction principles

**Status:** Current product guidance.  
**Executable UI truth:** components plus unit/browser/accessibility tests.

This document explains which kinds of controls RoadForge should expose and why. It
intentionally does not list every button, accessible name, or conditional UI state;
those details change too frequently and are better protected by executable tests.

## 1. Primary workflow stays visible

A new user should be able to complete the core RoadForge loop without discovering a
hidden advanced menu:

1. create or open a roadmap;
2. add/edit phases and tasks;
3. understand dependencies/progress;
4. export JSON;
5. optionally enable server collaboration;
6. recover from offline/conflict/storage failures.

Primary creation and recovery actions should not exist only on hover.

## 2. Local-first actions precede collaboration actions

A local roadmap is a complete valid RoadForge mode, not an incomplete account state.

- Do not show participant/team management as if it applies to browser-only roadmaps.
- Enabling server persistence/sharing is explicit.
- JSON portability remains available in both local and synced workflows.
- The UI should make the hosted Anvilary deployment's demo/convenience status clear and
  encourage users to keep JSON backups they control.

## 3. Role-specific controls reflect API permissions

Owner/editor/viewer controls may differ, but the API remains authoritative.

- Owner-only actions include access management, destructive roadmap ownership actions,
  and version restore where the current access contract requires owner authority.
- Editors receive editing/collaboration controls appropriate to their role.
- Viewers receive useful read-only navigation rather than disabled editing clutter.

Never add a control that implies a permission the API will reject, and never treat a
hidden control as security enforcement.

## 4. Advanced controls stay contextual

RoadForge retains some lower-frequency capabilities because they protect portability,
recovery, or collaboration:

- import/export;
- tags;
- activity;
- versions/checkpoints;
- participant access controls;
- filters/search;
- conflict and lock recovery.

These should appear when relevant rather than competing permanently with primary roadmap
editing actions.

## 5. Avoid duplicate ways to perform the same structural action

A second control is justified when it materially improves accessibility, recovery, or a
distinct device mode—not merely because another UI pattern is possible.

Ordering currently uses a dedicated reorder interaction with pointer/touch and
application-owned keyboard behavior. Do not reintroduce duplicate move-arrow rows unless
there is evidence the current interaction fails a user/accessibility need.

The browser tests own the exact keyboard sequence and persistence behavior.

## 6. Empty and error states must provide a next action

A valid zero-phase roadmap, empty phase, empty filter result, offline save, stale-write
conflict, revoked access, or lost edit lock should never strand the user.

A good state explains:

- what happened;
- whether local work is preserved;
- which actions are safe;
- which action is destructive or replaces data.

Recovery wording is part of the data-safety contract, not decorative copy.

## 7. Destructive actions are explicit

Deleting tasks/phases/roadmaps, replacing imports, restoring older versions, or choosing
server state over local conflict work must communicate the scope of data affected.

Use application dialogs with proper focus containment/return. Avoid native `confirm()`
for product flows where tests/accessibility semantics are expected.

## 8. Filtering must not mutate or hide structural editing rules

Search/filter controls narrow what is shown. They do not change roadmap source of truth.
Structural reordering may be disabled while a filtered subset is visible if the resulting
position would be ambiguous.

Resetting filters should always provide a clear route back to the full roadmap.

## 9. Claims and assignees are visually distinct concepts

Task assignees are portable planning labels. Claims are live collaboration coordination
for synced participants.

The UI should avoid presenting both with wording that implies two competing permanent
owners. If user testing shows the distinction is unclear, simplify/rename the claim UX
before adding more claim-specific controls.

## 10. Accessibility is part of control retention

Before removing or consolidating a control, verify that its outcome remains available to:

- keyboard-only users;
- touch users;
- screen-reader users where semantics matter;
- users at 200% reflow/zoom;
- users with reduced motion.

Likewise, do not keep duplicate controls solely because they once provided an accessibility
workaround if the current primary interaction now passes the corresponding tests.

## 11. New visible features require a user outcome

A new control should answer:

> What user outcome becomes possible or materially safer/easier because this exists?

Do not add UI placeholders for accounts, billing, webhooks, PDF export, provider sync,
assistant features, or other deferred concepts before the underlying product decision and
implementation exist.

## 12. How to review UI surface changes

A PR that adds/removes/repositions meaningful controls should include:

1. the user outcome;
2. role/state availability;
3. keyboard/focus behavior when interactive;
4. mobile/reflow behavior;
5. recovery/error state when the action can fail;
6. focused regression tests.

For the exact current visible surface, inspect the workspace/home components and the
Playwright/unit tests rather than extending this file into another manually synchronized
UI specification.
