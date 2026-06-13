# Filtering System Audit

Audit date: 2026-06-13

Status: static implementation audit complete; runtime QA pending

## Contract

Filtering is local UI state and never changes roadmap data. One `FilterState`
combines:

- free-text search;
- open/done status;
- assignee, including the current display name;
- stable tag ID;
- claim state (`mine`, `claimed`, or `unclaimed`);
- recommended/next status.

`filterTasks` is the only task-matching implementation. It preserves phase and task
order, removes empty phases, and searches task title, description, phase name,
assignees, tag IDs, and registry labels.

Search uses React deferred rendering to keep typing responsive on larger roadmaps.
Non-search filters persist per roadmap in `sessionStorage`; search text intentionally
does not persist. Invalid or unavailable selections produce an empty result rather
than modifying data.

## UX acceptance

- Filters combine instead of replacing one another.
- Every criterion has a clear-one chip.
- The panel has a clear-all action.
- Empty results distinguish text search from selected filters.
- Filtering expands matching phases and disables drag reordering.
- The panel closes on outside pointer input or Escape.
- Search keeps the existing Command/Ctrl+K shortcut.

## Manual QA matrix

1. Combine open status, assignee, tag, claim, and recommended filters.
2. Remove each chip independently and confirm other criteria remain.
3. Search by task title, description, phase, person, tag ID, and tag label.
4. Confirm a no-result search names the entered query.
5. Switch roadmaps and confirm non-search filters restore per roadmap.
6. Refresh and confirm search clears while non-search filters remain for the tab.
7. Confirm filtered task and phase drag handles cannot reorder hidden data.
8. Check keyboard focus, Escape close, narrow viewport overflow, and screen-reader
   labels.

No formatter, typecheck, test, build, browser, or performance command was run under
the project command restrictions.
