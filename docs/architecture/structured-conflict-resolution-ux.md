# Structured Conflict Resolution UX

## Current Conflict Behavior

Server-backed roadmaps use optimistic concurrency. The client sends the last
observed `updated_at` value as `last_updated_at` on full-roadmap saves. If the
server has a newer roadmap timestamp, the API returns `409 Conflict`.

Today the frontend marks the workspace as `CONFLICT`, shows a banner, preserves
the local unsynced copy, and offers a reload action. Reloading fetches the latest
server snapshot and discards local unsynced edits only after confirmation.

## Problem

Reload-only recovery is safe but blunt. Users can avoid silent data loss, but
they cannot inspect what changed elsewhere or make an informed choice about
whether to keep local work or accept the server state.

## First Structured Scope

The first version adds structured review around the existing full-snapshot save
model:

- show roadmap name differences;
- show phase count, order, and name differences;
- show task count, order, title, done, next, assignee, and tag differences;
- allow explicit resolution by using the server version or retrying the current
  local version against the latest server timestamp.

This is not a field-level merge engine. The comparison is informational and the
resolution choices remain explicit whole-roadmap choices.

## Non-Goals

- No CRDT.
- No real-time collaborative editor.
- No automatic AI merge.
- No silent data loss.
- No account, OAuth, or email identity model.
- No WebSocket transport.

## Server Conflict Metadata

When a stale save is rejected, the API should keep returning `409 Conflict` and
include a stable JSON body:

```json
{
  "detail": "Roadmap was updated by another session",
  "code": "roadmap_conflict",
  "conflict": {
    "roadmap_id": "rm_...",
    "server_updated_at": "2026-05-28T10:15:00Z",
    "client_last_updated_at": "2026-05-28T10:00:00Z",
    "server": {
      "name": "Current server name",
      "phases": []
    },
    "summary": {
      "phase_count": 3,
      "task_count": 18,
      "phase_ids": ["phase-1"],
      "task_ids": ["task-1"]
    }
  }
}
```

The metadata must not include session tokens, invite tokens, password hashes, or
password data.

## Client State Model

The save flow keeps the existing `isConflict` flag and adds optional
`conflictMetadata`. The local roadmap name, phases, and pending activity changes
remain in normal local state while conflict review is open.

Resolution state is local to the review panel: idle, resolving, resolved, or
failed. Successful resolution clears conflict state and updates `updatedAt`.
Failed resolution keeps the local copy and replaces conflict metadata if the API
returns newer conflict details.

## UI States

- **No conflict:** normal local/live/syncing/offline behavior.
- **Conflict detected:** banner shows that local edits are preserved and offers
  Review conflict and Reload server version when metadata exists.
- **Reviewing conflict:** panel compares local unsynced state with the server
  snapshot from the 409 response.
- **Resolving conflict:** selected action is disabled and shows loading.
- **Resolved:** panel closes, conflict state clears, and the workspace returns to
  the normal saved/live state.
- **Resolution failed:** panel remains open with a clear failure message.

## Resolution Choices

- **Use server version:** existing reload-server-version flow with explicit
  confirmation. This discards local unsynced edits only after confirmation.
- **Keep my local version:** retry the current local full snapshot using
  `conflict.server_updated_at` as the new concurrency base.
- **Apply selected local/server choices:** deferred until entity-level merge can
  be implemented safely.
- **Cancel and keep editing locally:** close the panel, keep `CONFLICT`, and
  preserve local unsynced state.

## Safe Fallback

The existing reload server version path remains available from the conflict
banner and from the review panel. If structured metadata is missing, the client
falls back to the existing conflict banner and reload-only recovery.

## Implementation Recommendation

Start with roadmap-level and phase/task-level metadata derived from the existing
snapshot JSON. Avoid full field-by-field merge in this pass because the current
backend save contract replaces the full snapshot, not individual fields.

## QA Checklist

- Trigger a stale save and confirm the API returns `409`, `code`, and
  `conflict`.
- Confirm the review panel opens without overwriting local unsynced edits.
- Confirm name, phase, and task differences are visible.
- Confirm Use server version requires confirmation and reloads the latest server
  state.
- Confirm Keep my local version retries with `server_updated_at` and clears the
  conflict only on success.
- Confirm a second conflict keeps the panel open and updates metadata.
- Confirm missing conflict metadata still shows the reload-only fallback.

## Rollback Path

Remove the frontend metadata parsing, conflict panel, and keep-local retry while
leaving the existing `409` handling and reload confirmation intact. The server
can also revert to the previous string-only 409 body because the client fallback
continues to rely on status code handling.
