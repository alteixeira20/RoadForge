# Task Claiming Collaboration Audit

Audit date: 2026-06-13

Status: authorization and override findings resolved; merge-preview enhancements remain
deferred.

## Current contract

Task claims are coordination metadata, not edit locks or permanent assignments.

- An unclaimed, incomplete task may be claimed by an owner or editor.
- A participant may release their own claim.
- Another editor receives `409 Conflict` and cannot replace or clear the claim.
- The owner may explicitly override or clear another participant's claim with
  `override=true`.
- The RoadForge UI requires confirmation before an owner override.
- Viewers cannot mutate claims.
- Completing a task clears its claim.
- Claims do not expire automatically.

Claim and unclaim operations write activity metadata, synchronize the relational
projection, and publish `roadmap.updated`. Participant claim counts use participant ID,
with display names used only for presentation.

## API

```text
PATCH  /api/roadmaps/{roadmap_id}/tasks/{task_id}/claim
DELETE /api/roadmaps/{roadmap_id}/tasks/{task_id}/claim
```

Both routes require owner/editor access. `override=true` is effective only for owners.
A completed task cannot be claimed. Claim ownership conflicts return 409.

## Import and merge boundary

Portable JSON preserves `claimedBy`, `claimedById`, and `claimedAt`. Safe-additions
merge preserves current matched tasks, so imported data does not silently remove a
server claim.

Merge preview does not currently explain claim-field differences. If claim-aware merge
is implemented later, it must keep server claims by default, show the difference
explicitly, and never manufacture server participant IDs for local-only data.

## Validation coverage

Backend tests cover owner/editor/viewer authorization, self-release, editor conflicts,
explicit owner takeover/clear, completed-task rejection, task-completion cleanup,
activity, realtime publication, and projection synchronization. Frontend tests cover
claim service calls and task-state presentation.
