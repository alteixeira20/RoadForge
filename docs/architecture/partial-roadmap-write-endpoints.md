# Partial Roadmap Write Endpoints

This document defines the contract for future partial roadmap writes after the relational projection is proven. It is design only; the current full-save API remains canonical.

## Scope

Partial writes will use owner/editor authorization and keep viewer access read-only. `roadmaps.snapshot_json` remains the compatibility cache during the staged transition so existing GET, import/export, version, and restore flows keep their shape.

## Proposed endpoints

- `POST /api/roadmaps/{roadmap_id}/phases`: create a phase after an optional `after_phase_id`, or at the end when omitted.
- `PATCH /api/roadmaps/{roadmap_id}/phases/{phase_id}`: update `num`, `name`, `color`, `status`, or `progress`.
- `DELETE /api/roadmaps/{roadmap_id}/phases/{phase_id}`: delete a phase and its tasks.
- `POST /api/roadmaps/{roadmap_id}/phases/reorder`: submit ordered client phase IDs.
- `POST /api/roadmaps/{roadmap_id}/tasks`: create a task in a phase after an optional `after_task_id`, or at the end when omitted.
- `PATCH /api/roadmaps/{roadmap_id}/tasks/{task_id}`: update task fields such as `title`, `done`, `next`, `est`, `desc`, and `parentId`.
- `DELETE /api/roadmaps/{roadmap_id}/tasks/{task_id}`: delete a task, dependency edges, and assignees.
- `POST /api/roadmaps/{roadmap_id}/tasks/reorder`: submit ordered task IDs for one phase, or a task move between phases.
- `POST /api/roadmaps/{roadmap_id}/tasks/{task_id}/dependencies`: link a dependency by `depends_on_task_id`.
- `DELETE /api/roadmaps/{roadmap_id}/tasks/{task_id}/dependencies/{depends_on_task_id}`: unlink a dependency.
- `PUT /api/roadmaps/{roadmap_id}/tasks/{task_id}/assignees`: replace ordered task-local display names.
- `PUT /api/roadmaps/{roadmap_id}/tasks/{task_id}/tags`: replace ordered task-local tags.

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
