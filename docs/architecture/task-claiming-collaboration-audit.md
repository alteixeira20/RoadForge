# Task Claiming Collaboration Audit

Audit date: 2026-06-13

## Decision

Task claims are coordination metadata, not edit locks and not permanent assignments.
They must not be silently stolen or cleared by another editor.

The target authorization contract is:

- an unclaimed task may be claimed by any owner or editor;
- the current claimant may refresh or clear their own claim;
- a different editor receives a conflict and cannot replace or clear the claim;
- the roadmap owner may explicitly override or clear another participant's claim;
- viewers cannot mutate claims;
- completing a task clears its claim;
- imported or merged data must not silently remove a current server claim.

Owner override must be presented as an explicit action and recorded distinctly in
activity history.

## Current implementation

The implementation already provides:

- persisted `claimedBy`, `claimedById`, and `claimedAt` fields;
- partial claim and unclaim endpoints;
- participant authorization and editor-role checks;
- row locking around the snapshot mutation;
- relational projection support;
- realtime roadmap update publication;
- UI controls and claimed-task indicators;
- claim clearing when a task is completed;
- import validation that preserves the fields;
- backend tests for core claim and unclaim behavior.

## Findings

### Silent takeover is currently allowed

The claim endpoint replaces an existing claim without checking claimant identity. The
UI offers another editor a “take over” action without confirmation or owner-only
authorization.

### Silent unclaim is currently allowed

Any owner or editor can clear any participant's claim. This removes coordination state
without proving ownership or recording an override reason.

### Stale claims have no policy

`claimedAt` is stored but is not used for expiry, warning, or cleanup. Automatic expiry
would be surprising during long-running work, so the beta should not expire claims
silently.

Recommended beta policy:

- claims do not automatically expire;
- claims older than a documented threshold may be shown as stale;
- the claimant may refresh the timestamp;
- the owner may override a stale or abandoned claim explicitly;
- future account identity may support stronger cleanup when a member is removed.

### Import preview does not surface claim differences

Safe-additions merge behavior preserves current matched tasks, which avoids destructive
claim removal. However, claim differences are excluded from task conflict comparison,
so the preview does not explain why imported claim data was ignored.

### Team counts use display names

Claimed-task counts are grouped by display name in the workspace. Duplicate names can
conflate two participants. Server-backed counts should use participant ID as the key
and display name as presentation.

### Client error handling is generic

The frontend has no dedicated handling for a claim ownership conflict because the API
does not currently emit one. The final contract should distinguish:

- task not found;
- task already claimed by another participant;
- viewer/read-only denial;
- session expiry or revocation;
- owner override success.

## Required implementation changes

### API

- Return `409 Conflict` when a non-owner attempts to claim or unclaim a task claimed by
  another participant.
- Permit an owner override through an explicit request field or dedicated endpoint.
- Keep the row lock so claim mutation is serialized with other partial writes.
- Record normal claim, self-unclaim, owner takeover, and owner clear as distinct
  activity events or metadata.
- Include actor and claim details in realtime updates where the event contract permits.
- Add focused rate-limit coverage if claim mutation is not already included.

### Frontend

- Replace the generic editor takeover action with a disabled/conflict state.
- Show an explicit owner override action with confirmation.
- Explain stale claims without automatically clearing them.
- Display useful conflict feedback and refetch the latest roadmap state.
- Group participant claim counts by stable participant identity.

### Import and merge

- Preserve current server claims for matched tasks in safe-additions mode.
- Surface differing imported claim fields in merge preview.
- Define replace-import behavior explicitly and require destructive confirmation.
- Do not manufacture server participant IDs for local-only imported claims.

### Tests

Add or update tests for:

- editor claims an unclaimed task;
- claimant refreshes and clears their claim;
- different editor cannot take over or clear a claim;
- owner explicitly takes over or clears another claim;
- viewer remains read-only;
- concurrent claims produce one winner and one conflict;
- task completion clears the claim;
- merge preview surfaces claim differences without removing the current claim;
- duplicate display names do not combine participant claim counts.

## Acceptance criteria

The task-claim feature is accepted when:

- claim ownership behavior is explicit in API, UI, docs, and tests;
- no editor can silently replace another editor's coordination state;
- owner override is intentional and auditable;
- claims remain separate from edit locks and task assignees;
- stale behavior is documented and non-destructive;
- realtime and import behavior preserve the same contract.
