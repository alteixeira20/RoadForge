# Import/Merge Data-Safety Audit

Audit date: 2026-05-29

Audited files:

- `apps/web/src/lib/roadmap-validation.ts`
- `apps/web/src/lib/import-merge/*`
- `apps/web/src/components/share/IOModal.tsx`
- `apps/web/src/components/share/useImportFlow.ts`
- `apps/web/src/components/share/ImportNotice.tsx`
- `apps/web/src/components/share/ConflictReviewPanel.tsx`
- `apps/web/src/services/roadmap-crud.service.ts`
- `apps/web/src/lib/__tests__/import-merge.test.ts`

## Verdict

Pass with minor follow-ups.

The current client import flow is appropriately preview-gated, conservative, and
safe for the supported client-only Phase 21 scope. No blocker or fix-now item was
found. The remaining items are documentation/manual-QA follow-ups and future
server parity requirements.

## Checklist

| Check | Result | Notes |
|---|---:|---|
| Safe-additions never overwrites existing data | Pass | `applySafeAdditions()` copies current phases/tasks, appends only unmatched imports, and records field differences as skipped conflicts. |
| Duplicate task IDs are blocked in matched and new phases | Pass | Imported duplicate task IDs are deterministically repaired during parse; collisions with current task IDs are skipped in matched phases and filtered in new phases. |
| Fallback matching is conservative | Pass | Phase fallback requires one normalized name match; task fallback is scoped to the matched phase and requires one normalized title match. |
| Ambiguous fallback does not silently merge | Pass | Ambiguous phase/task fallback returns no match. Ambiguous phases are treated as additions rather than merged into existing data. |
| Replace-current requires explicit danger acknowledgment | Pass | `ImportNotice` disables the replace confirmation until the acknowledgement checkbox is checked. |
| All imports show preview before apply | Pass | `useImportFlow` always sets `pendingImport`; apply only runs from the preview notice confirmation. |
| Malformed imports have deterministic generated IDs/repairs | Pass | Repair IDs use per-parse counters (`rf-p-*`, `rf-t-*`), duplicate task IDs get deterministic suffixes, and repair summaries are stable. |
| Export envelope is backward-compatible | Pass | Export emits schema/version metadata plus `phases`; import accepts both `{ phases }` envelopes and top-level phase arrays. Unknown fields produce warnings rather than hard failure. |
| No secrets/tokens/session data exported | Pass | Export includes roadmap name/id, saved state, updated timestamp, role, owner display name, counts, tags, and phases. It does not include invite links, session tokens, passwords, cookies, SSE tickets, or auth headers. |
| Tests cover major merge safety rules | Pass | Unit tests cover deterministic repair IDs, indexing, ID-first/fallback matching, ambiguous fallback, non-overwrite merge behavior, ID collisions, stale deps, and preview summaries. |
| Remaining manual QA needed | Minor | Manual browser QA should still verify modal behavior, replace acknowledgement, viewer restrictions, and exported JSON contents. |

## Findings

### IM-001 — Server Parity Is Required Before Any Server Import Endpoint

Severity: LATER

The client implementation is currently canonical and safe for the existing
scope. A future server import endpoint must reimplement or share the same
validation, repair, upgrade, matching, conflict, preview, and stale-write rules.
It must not trust a client-generated preview.

Recommended next action: use
`docs/architecture/server-supported-import-endpoint-plan.md` as the server
contract seed and port the import/merge test fixtures before implementing
server apply.

### IM-002 — Manual QA Should Cover The Full Modal Flow

Severity: MINOR

Unit tests cover merge logic, but the destructive replace acknowledgement,
viewer-disabled replace action, conflict review expansion, file-size rejection,
and all-mode preview gate are UI behaviors that still need manual browser QA.

Recommended next action: run the manual QA commands below and record any defects
against the import/export section of the release checklist.

### IM-003 — Export Metadata Stays Non-Secret But Should Remain Deliberate

Severity: NOTE

The export envelope includes non-secret roadmap/collaborator metadata:
roadmap ID, saved state, updated timestamp, role, and owner display name. This
is useful for compatibility and context, and no tokens or password material are
exported. Future export fields should keep this boundary explicit.

Recommended next action: when changing export metadata, verify the JSON does not
include invite URLs, bearer session tokens, passwords, cookies, localStorage
state, SSE tickets, or authorization headers.

### IM-004 — Merge Safety Assumes Parsed/Repaired Inputs

Severity: NOTE

`applySafeAdditions()` is safe in the production flow because imports pass
through `parseImportedRoadmapJson()` and roadmap upgrade first. Direct callers
should not feed unvalidated phase arrays into merge logic.

Recommended next action: keep import flow entry points routed through
`parseImportedRoadmapJson()` or an equivalent server-side validator.

## Manual QA

Recommended manual checks:

1. Export a roadmap and confirm the JSON contains schema/version, roadmap
   metadata, `tagRegistry`, and phases, but no invite links, session tokens,
   passwords, cookies, SSE tickets, or auth headers.
2. Import as new local roadmap and confirm a preview appears before activation.
3. Merge safe additions with one matched task changed in the file; confirm the
   current task remains unchanged and the conflict panel shows the skipped diff.
4. Merge a file with a task ID that already exists in another current phase;
   confirm the colliding imported task is skipped.
5. Import a malformed-but-repairable file twice and confirm generated IDs and
   repair notices are deterministic.
6. Replace current roadmap and confirm the final button is disabled until the
   danger acknowledgement is checked.
7. Open the modal as a viewer on a synced roadmap and confirm replace-current is
   disabled and cannot mutate shared data.

Suggested validation command:

```bash
make check
```
