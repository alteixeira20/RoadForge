# Partial Roadmap Write Endpoints

This document records focused roadmap writes implemented after the relational
projection foundation. Task completion, task claims, and tag registry operations have
dedicated routes; broader task/phase editing remains on the aggregate save path.
`roadmaps.snapshot_json` remains canonical for phases and tasks.

## Scope

Partial writes use owner/editor authorization and keep viewer access read-only.
Task partial writes update `roadmaps.snapshot_json` first and
then rebuild/sync derivative projection rows. Existing GET, import/export,
version, and restore flows keep their shape.

## Implemented endpoint: task done toggle

`PATCH /api/roadmaps/{roadmap_id}/tasks/{task_id}/done`

Request:

```json
{
  "done": true,
  "last_updated_at": "2026-05-29T12:00:00Z"
}
```

Response: the normal `RoadmapResponse`.

Behavior:

- owner/editor only; viewers receive 403.
- Uses the same roadmap-level optimistic concurrency policy as full `PUT`:
  stale `last_updated_at` returns structured 409 `RoadmapConflictResponse`.
- Returns 404 when the roadmap is missing/deleted or the task ID does not exist
  in the current canonical snapshot.
- Updates only the target task's `done` field in `roadmaps.snapshot_json`.
- Rebuilds derivative projection rows after the canonical snapshot update.
- Creates `task.completed` or `task.reopened` activity only when the value
  actually changes.
- Same-value no-op returns 200 with the current roadmap and does not create an
  activity log or SSE event.

## Implemented endpoints: task claims

```text
PATCH  /api/roadmaps/{roadmap_id}/tasks/{task_id}/claim
DELETE /api/roadmaps/{roadmap_id}/tasks/{task_id}/claim
```

Claims are owner/editor coordination metadata. A participant can release their own
claim; another editor receives 409. The owner can explicitly take over or clear another
claim with `override=true`. Completing a task clears the claim.

## Implemented endpoints: tag registry

```text
GET    /api/roadmaps/{roadmap_id}/tags
POST   /api/roadmaps/{roadmap_id}/tags
PUT    /api/roadmaps/{roadmap_id}/tags/{tag_id}
DELETE /api/roadmaps/{roadmap_id}/tags/{tag_id}
```

All roles can list tags. Owner/editor can create, update, and delete unused tags with
roadmap-level optimistic concurrency. The registry remains canonical on
`roadmaps.tag_registry_json`; these routes do not create a relational task-tag model.

## Frontend behavior

The workspace keeps local-only roadmaps on the existing local mutation path.
For synced owner/editor roadmaps, task checkbox toggles optimistically call the
task done PATCH endpoint with the last observed roadmap `updated_at`.

While a task done PATCH is in flight, the same task checkbox is temporarily
guarded against repeat toggles and autosync/full-save PUTs are suppressed until
the partial write finishes. On success, clean local state is reconciled from the
server roadmap response and `updatedAt` is advanced. On failure, the optimistic
checkbox change is reverted. A 409 conflict leaves the server state untouched,
shows the stale-write message, and reuses the roadmap conflict review path when
the API returns conflict metadata.

## Deferred endpoints

- `POST /api/roadmaps/{roadmap_id}/phases`: create a phase after an optional `after_phase_id`, or at the end when omitted.
- `PATCH /api/roadmaps/{roadmap_id}/phases/{phase_id}`: update `num`, `name`, `color`, `status`, or `progress`.
- `DELETE /api/roadmaps/{roadmap_id}/phases/{phase_id}`: delete a phase and its tasks.
- `POST /api/roadmaps/{roadmap_id}/phases/reorder`: submit ordered client phase IDs.
- `POST /api/roadmaps/{roadmap_id}/tasks`: create a task in a phase after an optional `after_task_id`, or at the end when omitted.
- `PATCH /api/roadmaps/{roadmap_id}/tasks/{task_id}`: future broad task patching
  for fields such as `title`, `next`, `est`, `desc`, and `parentId`.
- `DELETE /api/roadmaps/{roadmap_id}/tasks/{task_id}`: delete a task, dependency edges, and assignees.
- `POST /api/roadmaps/{roadmap_id}/tasks/reorder`: submit ordered task IDs for one phase, or a task move between phases.
- `POST /api/roadmaps/{roadmap_id}/tasks/{task_id}/dependencies`: link a dependency by `depends_on_task_id`.
- `DELETE /api/roadmaps/{roadmap_id}/tasks/{task_id}/dependencies/{depends_on_task_id}`: unlink a dependency.
- `PUT /api/roadmaps/{roadmap_id}/tasks/{task_id}/assignees`: replace ordered task-local display names.
- `PUT /api/roadmaps/{roadmap_id}/tasks/{task_id}/tags`: replace ordered task-local tag IDs.

## Optimistic concurrency

Requests should carry the last observed roadmap `updated_at` plus, when available, an entity-level version or `updated_at`. The first implementation can keep the current roadmap-level timestamp check. Later slices can narrow conflicts to phase/task rows once entity timestamps are reliable.

Conflict responses should use HTTP 409 and include the changed entity type, client ID, current field values, and enough metadata for the frontend to offer keep mine, accept theirs, or manual edit.

## Activity logs

Each partial write should create one `activity_logs` row in the same transaction. Use precise entities where possible: `entity_type="phase"`, `entity_type="task"`, `entity_type="dependency"`, `entity_type="assignees"`, or `entity_type="tags"`. `entity_id` should remain the client-visible phase/task ID. `before_json` and `after_json` should contain only the changed fields or ordered IDs needed for audit display.

## Versions and checkpoints

Routine partial writes should follow the existing conservative version policy. Manual checkpoints continue to snapshot the current roadmap. Restore continues to copy `roadmap_versions.snapshot_json` into `roadmaps.snapshot_json` and rebuild projection rows.

If a future partial write action becomes version-worthy, create the version after snapshot compatibility regeneration and before commit, matching current full-save behavior.

## Snapshot compatibility cache

During the staged architecture, partial writes should either update `snapshot_json` first and rebuild projection, or update relational rows and immediately regenerate `snapshot_json` before commit. The safer first slice is usually snapshot-first because it preserves the current canonical source and reuses projection parity checks.

The API response shape remains unchanged: roadmap responses return `phases` matching the current DTOs. Import/export schema is unchanged.

## Conflict behavior

- Missing phase/task: return 404 when the client ID does not exist in the active roadmap.
- Stale roadmap timestamp: return 409 with current roadmap metadata.
- Invalid dependency or parent reference: return 400 unless the operation is explicitly repair-style.
- Self dependency or self parent: return 400.
- Duplicate assignee/tag labels in a replace request: normalize deterministically or return 400; choose one behavior per endpoint before implementation.

## Rollback strategy

Keep `PUT /api/roadmaps/{id}` as the stable full-save path. If a partial endpoint causes drift, disable that endpoint, continue serving snapshots, clear projection rows for affected roadmaps, and rebuild projection from `snapshot_json`.

## Non-goals

- Do not remove `roadmaps.snapshot_json`.
- Do not change import/export schema.
- Do not change roadmap version restore semantics.
- Do not introduce accounts, email identity, OAuth, Redis, WebSockets, or CRDT infrastructure.
- Do not require task assignees to be participants.
