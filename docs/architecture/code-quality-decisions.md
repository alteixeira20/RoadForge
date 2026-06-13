# Code Quality Decisions Before Final QA

Decision date: 2026-06-13

## Autosync authentication loss

Autosync 401/403 behavior now matches manual save: clear scoped session access through
the shared session-expired handler, preserve the local roadmap cache as unsaved, and
require rejoin through an active invite link. Authentication loss is not represented
as a generic offline state.

## Pending activity

`useSaveFlow` exposes named add, replace, and clear actions. Callers no longer receive
the raw React state setter.

## Future CRUD endpoints

Unimplemented granular phase/task endpoint stubs live in
`future-roadmap-crud.service.ts`. The active CRUD service contains implemented API and
client-side import/export operations only.

## Projection counting

Snapshot counts and projection counts intentionally remain separate while snapshot
JSON is canonical. Consolidate the implementation only when projection reads become
the default and parity evidence demonstrates equivalent behavior. Prematurely sharing
one helper would obscure which authority produced a count.

## Deferred structural refactors

Parameter grouping in `useSaveFlow`, roadmap hydration helper extraction, participant
revoke deduplication, and phase/task callback grouping remain open. They affect broad
state and interaction surfaces and should begin only after the current release
candidate passes tests, typecheck, and focused manual QA.
