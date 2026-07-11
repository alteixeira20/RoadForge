# Task Partial Write API

Status: Proposed for RF-301  
Date: 2026-07-04

## Decision

Add:

```text
PATCH /api/roadmaps/{roadmap_id}/tasks/{task_id}
```

The endpoint updates provided task planning fields while keeping
`roadmaps.snapshot_json` canonical. It follows the task-done route for
authorization, row locking, optimistic concurrency, activity, projection
synchronization, response shape, and realtime publication.

It does not make relational rows authoritative or change local-only,
full-save, import/export, restore, lock, or realtime client behavior.

## Current storage model

The `roadmaps` row stores:

- roadmap identity, name, owner, schema version, and timestamps;
- canonical `snapshot_json` JSONB with shape `{"phases": [...]}`;
- separate `tag_registry_json` JSONB.

`snapshot_json` is the complete canonical phase/task tree, not the complete
portable export envelope. Roadmap name, schema metadata, and the tag registry
live outside it and are combined by API/export flows.

Derivative relational projections also exist:

- `roadmap_phases`;
- `roadmap_tasks`;
- `roadmap_task_assignees`;
- `roadmap_task_dependencies`.

Task rows project title, done/next, estimate, description, tags, claims, parent,
assignees, and dependencies. Phase/task `source_json` preserves snapshot fields
without explicit columns. Projection rows are rebuildable, are not a second
write source of truth, and are used for reads only behind a feature flag and a
parity check. Reads fall back to the snapshot on drift or errors.

Activity and versions are separate tables. Each version stores a full
phase/task snapshot.

## Current full-snapshot save

Frontend `saveToServer` sends this to `PUT /api/roadmaps/{roadmap_id}`:

```json
{
  "name": "Roadmap name",
  "phases": ["complete phase/task tree"],
  "last_updated_at": "2026-07-04T10:00:00Z",
  "tag_registry": ["complete registry"],
  "change_summary": {"action": "task.updated"}
}
```

`change_summary` is omitted when empty. Debounced autosync and explicit save
use this service. The backend locks the roadmap row, rejects a stale timestamp,
replaces the supplied aggregate fields, writes activity, applies version
policy, rebuilds projection when phases changed, commits, publishes
`roadmap.updated`, and returns a full `RoadmapResponse`.

The API declares a 512 KiB request limit based on `Content-Length`. The schema
can theoretically describe a much larger roadmap, so multi-megabyte local
roadmaps cannot currently use the normal well-formed full-save request without
hitting this guard.

## Existing partial-write precedents

### Task done

`PATCH /api/roadmaps/{roadmap_id}/tasks/{task_id}/done` accepts `done` and
required `last_updated_at`. It:

1. selects the roadmap `FOR UPDATE`;
2. applies the roadmap timestamp check;
3. copy-patches the task in canonical `snapshot_json`;
4. advances `updated_at` and writes completion/reopen activity;
5. rebuilds projection, commits, and publishes `roadmap.updated`;
6. returns `RoadmapResponse`.

A same-value request returns 200 without timestamp, activity, projection,
version, or SSE changes.

### Task claim and unclaim

Claim PATCH and DELETE also avoid a full client PUT, patch the snapshot under a
row lock, enforce claim ownership/owner override, sync projection/activity, and
publish `roadmap.updated`. They do not accept `last_updated_at`; their safety is
atomic claim ownership under `FOR UPDATE`, not optimistic concurrency.

### Current performance boundary

Existing partial writes reduce request size and mutation scope, but still
assign a complete JSONB snapshot value and rebuild the complete projection.
They do not eliminate PostgreSQL JSONB rewrite or projection rebuild cost.

## Proposed endpoint contract

### Authorization and routing

- Bearer participant session required.
- Owner/editor allowed; viewer receives 403.
- Missing/invalid session retains current 401 behavior.
- Missing/deleted roadmap returns `404 {"detail": "Roadmap not found"}`;
  missing task returns `404 {"detail": "Task not found"}`.
- Add a task-update rate-limit action consistent with task done.
- Do not add account requirements or API enforcement of UI edit locks.

### Request

```json
{
  "title": "Implement partial task write",
  "desc": "Optional Markdown",
  "est": "2d",
  "assignees": ["Alice", "Bob"],
  "tags": ["backend", "api"],
  "last_updated_at": "2026-07-04T10:00:00Z"
}
```

Rules:

- `last_updated_at` is required.
- At least one mutable field is required; timestamp-only bodies return 422.
- Unknown fields return 422 via Pydantic `extra="forbid"`.
- Omitted mutable fields remain unchanged.
- `title` cannot be null or blank.
- `desc` and `est` may be null; null or normalized blank clears the key.
- `assignees` and `tags` may be null to remove the optional key. Empty arrays
  mean no values.
- Missing, null, and empty existing optional values are equivalent for no-op
  comparison; array ordering otherwise remains meaningful.
- Reuse current task validators. Do not newly require assignees to be
  participants or tags to exist in the registry.

Current limits:

| Field | Limit |
|---|---:|
| `title` | 160 characters |
| `desc` | 5,000 characters |
| `est` | 64 characters |
| `assignees` | 20 values, 128 characters each |
| `tags` | 20 values, 40 characters each |

Existing text validation strips outer whitespace, rejects blank required
values, never truncates, rejects disallowed control characters, and applies
the current suspicious-content checks. Full snapshots allow 50 phases and 200
tasks per phase (10,000 tasks before request-size constraints). The separate
tag registry allows 200 definitions, with 80-character labels and
32-character colors.

### Response

Success returns the existing full `RoadmapResponse`:

```text
id, name, owner_display_name, schema_version, phases, tag_registry,
is_password_enabled, created_at, updated_at
```

This preserves frontend compatibility but leaves response amplification in
place.

### Optimistic concurrency

The service must select the active roadmap `FOR UPDATE`, normalize
`last_updated_at` to aware UTC, and reject when:

```text
roadmap.updated_at > client_last_updated_at
```

The check occurs before no-op detection, matching task done. A stale request
returns the existing `409 RoadmapConflictResponse`:

- `detail` and `code="roadmap_conflict"`;
- roadmap ID plus server/client timestamps;
- full current server name and phases;
- phase/task counts;
- empty differing-ID arrays because a task PATCH supplies no client phase tree.

Roadmap-level concurrency is deliberately conservative: unrelated writes can
conflict, but stale task fields cannot silently overwrite server state.

### Snapshot mutation and no-op behavior

Add a focused copy-on-write helper beside done/claim helpers. It must:

- copy only containers on the path to the target task;
- apply only fields in the request's `model_fields_set`;
- preserve ID, ordering, parent, dependencies, done/next, claims, and unknown
  portable fields;
- remove cleared optional keys as full snapshot serialization omits `None`;
- return original phase/task context, next snapshot, and actual changed fields;
- return missing-task and normalized no-op outcomes explicitly.

A no-op returns 200 with the existing response and unchanged `updated_at`. It
must not assign the snapshot, write activity/version, sync projection, commit
solely for the no-op, or publish SSE.

Do not create a generic mutation framework.

### Projection synchronization

After a real canonical change, call
`sync_roadmap_projection_best_effort(..., "task_update_patch")`. Rebuild covers
task title/estimate/description/tags, ordered assignees, `source_json`, and all
unaffected projected fields. Tests must prove parity for every supported field
category.

The current best-effort policy remains: projection errors are logged, the
canonical write may commit, and guarded projection reads fall back to the
snapshot. Mandatory or incremental projection writes require a later decision.

### Activity

One real request creates one row:

```json
{
  "action": "task.updated",
  "entity_type": "task",
  "entity_id": "RF-302",
  "before_json": {"est": "1d", "tags": ["backend"]},
  "after_json": {"est": "2d", "tags": ["backend", "api"]},
  "metadata_json": {
    "taskId": "RF-302",
    "taskTitle": "Implement partial task write",
    "phaseId": "phase-3",
    "phaseName": "API",
    "changedFields": ["est", "tags"]
  }
}
```

Before/after contain only actual changed fields. `changedFields` uses stable
order: `title`, `desc`, `est`, `assignees`, `tags`. `taskTitle` is the
post-patch title. No-op requests create no activity, and metadata must not look
like completion, claim, or GitHub activity.

### Version/checkpoint policy

`task.updated` remains routine activity and creates no `roadmap_versions` row,
matching current task partial writes and `_VERSION_WORTHY_ACTIONS`. Manual
checkpoint captures the current canonical snapshot; restore behavior is
unchanged.

### SSE

After a real change commits and refreshes, publish one:

```text
event: roadmap.updated
```

with payload:

```json
{
  "roadmap_id": "rm_...",
  "updated_at": "2026-07-04T10:01:00Z",
  "participant_id": "pt_...",
  "task_id": "RF-302",
  "action": "task.updated",
  "changed_fields": ["est", "tags"]
}
```

Other clients continue to fetch the roadmap on this event. Failed and no-op
requests publish nothing; field-level realtime application is not introduced.

## What this solves

- Replaces a complete phase tree request with a small task-field request.
- Prevents task edits from submitting unrelated local roadmap fields.
- Rejects stale writes instead of silently overwriting concurrent changes.
- Avoids parsing/validating the complete client phase tree for each task edit.
- Preserves portable snapshot, response, activity, and realtime contracts.

## What this does not solve

- PostgreSQL may still rewrite the complete assigned JSONB value.
- Projection sync still deletes and rebuilds all projected rows.
- Success and conflict responses still include the complete phase tree.
- Concurrency remains roadmap-level.
- Aggregate autosync remains for operations without focused routes.
- Browser cache still stores the complete roadmap.
- The global 512 KiB full-request/multi-megabyte roadmap problem remains.

Do not claim those costs are solved by RF-302.

## Risks

- Later frontend wiring must not replace unrelated dirty local state with the
  full response; reuse task-done's clean-state reconciliation guard.
- Global timestamps cause intentional false-positive conflicts.
- Best-effort projection sync can leave drift, though snapshot fallback remains.
- Activity before/after can duplicate up to 5,000 description characters per
  side; measure before changing the existing audit convention.
- Optional-value normalization can create representation-only noise unless
  no-op tests cover omitted/null/empty cases.
- Do not introduce new duplicate-task-ID repair semantics in this endpoint.

## Explicitly deferred

- JSONB path writes, compression, chunking, and object storage.
- Incremental projection updates or projection as source of truth.
- Task revision columns, task-only conflicts, and partial responses.
- Field-level realtime application.
- Task/phase create, delete, move, reorder, dependency, and parent endpoints.
- `done`, `next`, and claim changes through this endpoint.
- Tag registry redesign or tag-membership enforcement.
- Generic mutation frameworks, CRDTs, and offline merge protocols.
- Auth/account, lock, import/export, and GitHub changes.

## Commit-sized implementation slices

### 1. Schema and pure helper

- Add and re-export `PatchTaskRequest`.
- Reuse current limits/validators with `extra="forbid"`.
- Add the focused snapshot helper.
- Unit-test each field, clearing, omitted/unknown preservation, missing task,
  empty request, and normalized no-op behavior.

No route or frontend behavior changes.

### 2. Backend service and route

- Add `patch_task` beside done/claim.
- Add owner/editor route and rate-limit action.
- Reuse row lock, conflict, response, activity, projection, commit, and event
  patterns.
- Add contract tests and update backend API documentation.

No migration or import/export change.

### 3. Later frontend wiring

- Add the typed service call.
- Route synced title, description, and Edit details updates through it.
- Keep local-only mutation unchanged.
- Reuse task-done in-flight, optimistic rollback, conflict, and clean-state
  reconciliation patterns without changing aggregate autosync.

This is outside RF-301 and follows the backend implementation.

## Validation plan

API tests must cover:

- owner/editor success for title, description, estimate, assignees, and tags;
- atomic multi-field update and omitted-field preservation;
- null/empty clearing and every length/count limit;
- timestamp-only and unknown-field 422 responses;
- normalized no-op with unchanged timestamp and no activity/version/SSE;
- stale timestamp 409 with no mutation;
- viewer 403, unauthenticated 401, and missing task/roadmap 404;
- one `task.updated` row with precise before/after and `changedFields`;
- no routine version row;
- projection parity for scalar, tag, and assignee updates;
- `roadmap.updated` publication if the test harness observes the event bus.

Implementation validation:

```bash
make api-test
make api-lint
git diff --check
```

After later frontend wiring:

```bash
pnpm --dir apps/web test
pnpm typecheck
```
