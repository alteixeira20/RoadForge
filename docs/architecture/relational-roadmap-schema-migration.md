# Relational Roadmap Schema Migration Plan

RF-820 is a design task only. This document describes a staged path from full
JSON roadmap snapshots toward relational phase/task storage without changing the
current product behavior first.

## 1. Current state

RoadForge currently stores the editable roadmap body as a full JSONB snapshot on
`roadmaps.snapshot_json`. The shape is `{"phases": [...]}` and mirrors the API
DTOs in `apps/api/src/api/schemas/roadmap.py`: phases contain task arrays, and
tasks contain fields such as `id`, `title`, `done`, `next`, `est`, `assignees`,
`tags`, `deps`, `desc`, and `parentId`.

The main write path is `PUT /api/roadmaps/{id}` in
`apps/api/src/api/routers/roadmaps.py`, implemented by `update_roadmap()` in
`apps/api/src/api/services/roadmap_service.py`. It replaces the whole `phases`
snapshot when `payload.phases` is present, writes one activity row, optionally
writes a version row, commits, and broadcasts a `roadmap.updated` SSE event.

The surrounding collaboration data is already relational:

- `roadmaps`: name, owner display name, snapshot JSON, password metadata,
  timestamps, soft delete.
- `share_links`: one link per role, token hashes, public viewer token storage.
- `participants`: accountless sessions, display names, role, revocation.
- `activity_logs`: actor, action, entity metadata, before/after JSON.
- `roadmap_versions`: version number, roadmap name, full snapshot JSON.

JSON snapshot storage gives the current app useful properties:

- It preserves import/export compatibility with minimal backend translation.
- It lets the frontend own snapshot repair and upgrade logic.
- It keeps version restore simple: restore copies `roadmap_versions.snapshot_json`
  back into `roadmaps.snapshot_json`.
- It makes full-roadmap save and SSE re-fetch behavior straightforward.
- It avoids early schema churn while task shape is still evolving.

The limitations are now visible:

- A single task toggle is stored as a full snapshot replacement.
- Server-side validation cannot easily enforce dependency integrity.
- Activity logs depend on client-provided summaries or coarse phase counts.
- Concurrent edits conflict at the whole-roadmap timestamp level.
- Querying tasks, dependencies, assignees, or workload requires loading JSON.
- Future partial task/phase endpoints would need to parse and rewrite the whole
  snapshot unless the data is projected into relational rows.

## 2. Migration goals

- Preserve all existing roadmaps and local/imported task IDs.
- Preserve JSON import/export compatibility during and after the transition.
- Preserve version restore behavior, especially owner-safe snapshot restore.
- Preserve existing activity logs and current activity API response shape.
- Preserve the accountless share/session model; do not introduce accounts,
  OAuth, email identity, or participant-required task assignment.
- Support future partial updates, smaller realtime events, and better conflict
  handling.
- Keep each step deployable and reversible without requiring a product rewrite.

## 3. Proposed target schema

Use additive relational tables that belong to `roadmaps`. Keep row IDs separate
from client-visible phase/task IDs so imported roadmaps can preserve their
existing IDs without assuming global uniqueness across roadmaps.

### `roadmap_phases`

Columns:

- `id text primary key`: generated server row ID, suggested prefix `rp_`.
- `roadmap_id text not null references roadmaps(id) on delete cascade`.
- `client_phase_id text not null`: existing phase `id` from snapshots/API.
- `position integer not null`: zero-based display order.
- `num text not null`: current display number, currently persisted by frontend.
- `name text not null`.
- `color text not null`.
- `status text not null`: check constraint matching `done`, `active`, `next`,
  `future`.
- `progress integer not null`: keep current snapshot field initially, even if it
  can later be derived.
- `source_json jsonb null`: temporary escape hatch for unknown phase fields
  during projection/backfill. It should be empty or removed after the schema is
  trusted.
- `created_at timestamptz not null default now()`.
- `updated_at timestamptz not null default now()`.

Constraints and indexes:

- Unique `(roadmap_id, client_phase_id)`.
- Index `(roadmap_id, position)`.
- Optional deferrable unique `(roadmap_id, position)` once reorder writes are
  implemented carefully.

Delete behavior:

- Deleting a roadmap cascades phases.
- Deleting a phase cascades tasks through `roadmap_tasks.phase_id`.

### `roadmap_tasks`

Columns:

- `id text primary key`: generated server row ID, suggested prefix `rt_`.
- `roadmap_id text not null references roadmaps(id) on delete cascade`.
- `phase_id text not null references roadmap_phases(id) on delete cascade`.
- `client_task_id text not null`: existing task `id` exposed in snapshots/API.
- `position integer not null`: zero-based order within the phase.
- `title text not null`.
- `done boolean not null default false`.
- `next boolean null`: nullable to preserve current DTO semantics.
- `est text null`.
- `desc text null`.
- `parent_task_id text null references roadmap_tasks(id) on delete set null`.
- `tags_json jsonb null`: store the current string tag list here initially.
- `source_json jsonb null`: temporary escape hatch for unknown task fields.
- `created_at timestamptz not null default now()`.
- `updated_at timestamptz not null default now()`.

Constraints and indexes:

- Unique `(roadmap_id, client_task_id)`.
- Index `(roadmap_id, phase_id, position)`.
- Index `(roadmap_id, done)`.
- Index `(roadmap_id, next)` if "Next" filtering moves server-side.
- Index `parent_task_id` if parent/child queries are added.

Delete behavior:

- Deleting a roadmap cascades tasks.
- Deleting a phase cascades tasks.
- Deleting a parent task sets child `parent_task_id` to null, matching current
  import repair behavior that removes stale parent references.

### `roadmap_task_dependencies`

Columns:

- `id text primary key`: generated server row ID, suggested prefix `rd_`.
- `roadmap_id text not null references roadmaps(id) on delete cascade`.
- `task_id text not null references roadmap_tasks(id) on delete cascade`: the
  task that is blocked by another task.
- `depends_on_task_id text not null references roadmap_tasks(id) on delete
  cascade`: the prerequisite task.
- `created_at timestamptz not null default now()`.

Constraints and indexes:

- Unique `(task_id, depends_on_task_id)`.
- Check `task_id <> depends_on_task_id`.
- Index `(roadmap_id, task_id)`.
- Index `(roadmap_id, depends_on_task_id)`.

Delete behavior:

- Deleting either task removes the dependency edge.

### `roadmap_task_assignees`

Assignees are task-local display names, not server participants. This table
should preserve that distinction.

Columns:

- `id text primary key`: generated server row ID, suggested prefix `ra_`.
- `roadmap_id text not null references roadmaps(id) on delete cascade`.
- `task_id text not null references roadmap_tasks(id) on delete cascade`.
- `display_name text not null`.
- `position integer not null default 0`.
- `participant_id text null references participants(id) on delete set null`:
  optional future metadata only. Do not require this for assignment, because
  local-only roadmaps and accountless names must keep working.
- `created_at timestamptz not null default now()`.

Constraints and indexes:

- Unique `(task_id, display_name)`.
- Index `(roadmap_id, display_name)`.
- Index `(roadmap_id, task_id, position)`.
- Index `participant_id` only if participant linking is implemented.

Delete behavior:

- Deleting a task cascades assignee rows.
- Revoking or deleting a participant must not delete task assignee names.

### Tags

Do not add `roadmap_task_tags` in the first relational migration unless a near
term feature needs tag metadata, global tag management, or tag analytics. Current
tags are simple task-local strings used for display/filtering and import/export.
Keeping them as `tags_json` or a PostgreSQL `text[]` on `roadmap_tasks` avoids
extra write complexity while preserving the current snapshot shape.

If tags later need relational behavior, add:

- `roadmap_task_tags(id, roadmap_id, task_id, label, position, created_at)`.
- Unique `(task_id, label)`.
- Index `(roadmap_id, label)`.
- `task_id on delete cascade`.

### Task history

Do not add `roadmap_task_history` initially. The app already has
`activity_logs` and `roadmap_versions`, and duplicating history at task level
would create restore and retention policy questions before there is a consumer.
Add task history only if the product needs per-field audit trails or task-level
undo beyond snapshot version restore.

## 4. Snapshot compatibility strategy

Recommended staged strategy: keep `roadmaps.snapshot_json` canonical first and
write relational tables as projections.

During the transition, reads and writes continue to use the current snapshot
API. After every create, update, import, and restore, the backend can rebuild the
relational projection from the canonical snapshot inside the same transaction.
This gives RF-821 a low-risk schema/backfill path while preserving current
frontend behavior.

Do not switch directly to full relational canonical state. That would force the
first migration to solve serialization, restore, import/export, partial writes,
activity diffs, and conflict behavior all at once.

The later canonical switch should happen only after projection parity is proven:

1. Snapshot canonical, relational projection optional.
2. Snapshot canonical, relational projection required and validated.
3. Reads can serialize response phases from relational rows behind a feature
   flag or internal setting.
4. Partial writes update relational rows and regenerate snapshot JSON.
5. Relational rows become canonical; snapshot JSON remains a compatibility cache
   for export, versions, and rollback until deprecated.

## 5. Migration phases

### Phase A: schema-only additive migrations

Likely files touched:

- `apps/api/alembic/versions/<new_revision>_add_relational_roadmap_projection.py`
  (proposed).
- `apps/api/src/api/models/roadmap.py`.

Validation:

- Review generated DDL.
- Apply migration in a local copy and inspect indexes/constraints.
- Confirm existing endpoints still use `roadmaps.snapshot_json`.

Rollback strategy:

- Drop only the new projection tables.
- No existing data is transformed in this phase.

Risk:

- Low. Main risk is over-constraining order uniqueness before reorder writes are
  ready.

### Phase B: backfill relational tables from existing snapshots

Likely files touched:

- `apps/api/src/api/scripts/backfill_projection.py` operator command.
- Possibly an Alembic data migration only if the team accepts longer migration
  runtime; prefer an explicit command for safer operations.

Validation:

- Count phases/tasks per roadmap from JSON and compare with relational counts.
- Compare dependency counts from task `deps`.
- Reconstruct a sample snapshot from relational rows and compare to
  `roadmaps.snapshot_json` after normalizing order and omitted null fields.
- Run `python -m api.scripts.backfill_projection --verify` after backfill, or
  `python -m api.scripts.backfill_projection --verify-only` to check current
  projection rows without rebuilding.

Rollback strategy:

- Truncate/delete projection rows and rerun backfill.
- Snapshot state remains canonical and unchanged.

Risk:

- Medium. Existing snapshots may contain repaired legacy shapes. Reuse the same
  DTO validation rules where practical and preserve unknown fields in
  `source_json` during early backfill.

### Phase C: dual-write or projection sync

Likely files touched:

- `apps/api/src/api/services/roadmap_service.py`.
- `apps/api/src/api/models/roadmap.py`.
- `apps/api/src/api/services/roadmap_projection_service.py`.

Validation:

- Create, update, import-style save, and version restore all update both
  `snapshot_json` and projection rows.
- Projection rebuild is transactional with the snapshot update.
- Drift reporting can identify active roadmaps whose projection rows no longer
  match `snapshot_json`.
- SSE behavior remains `roadmap.updated` with clients re-fetching the stable
  response.

Rollback strategy:

- Disable projection sync and continue using snapshots.
- Clear projection rows if they are suspected stale.

Risk:

- Medium. The main risk is drift between snapshot JSON and projection rows.
  Prefer full projection rebuild per roadmap during this phase over clever
  incremental sync.

### Phase D: read-path switch

Likely files touched:

- `apps/api/src/api/services/roadmap_service.py`.
- `apps/api/src/api/schemas/roadmap.py` only if response helpers need internal
  schema helpers; public response shape should stay stable.

Validation:

- `GET /api/roadmaps/{id}` returns the same phase/task JSON shape as before.
- Projection reads are behind `ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED`, which
  remains disabled by default.
- The read path validates parity and falls back to `roadmaps.snapshot_json` if
  parity or projection serialization fails.
- Version detail endpoints still read from `roadmap_versions.snapshot_json`.
- Import/export snapshots still round-trip.

Rollback strategy:

- Switch reads back to `roadmaps.snapshot_json`.
- Keep projection sync enabled until parity issues are fixed.

Risk:

- Medium. Serialization can accidentally omit nullable fields or reorder arrays.
  Keep the old snapshot response path available while validating parity.

### Phase E: write-path switch

Likely files touched:

- `apps/api/src/api/routers/roadmaps.py` for new partial endpoints.
- `apps/api/src/api/services/roadmap_service.py` or new task/phase service
  modules (proposed).
- `apps/api/src/api/schemas/roadmap.py` for partial request/response DTOs.
- `docs/backend-api.md` after behavior changes.

Validation:

- Existing `PUT /api/roadmaps/{id}` still accepts full snapshots.
- New partial task/phase/dependency writes update relational rows and regenerate
  `roadmaps.snapshot_json`.
- Activity logs contain task/phase-level before/after data.
- Optimistic concurrency is checked at an appropriate level.

Rollback strategy:

- Disable new partial endpoints or route writes back through full snapshot
  updates.
- Continue regenerating snapshot JSON for compatibility.

Risk:

- High. This phase changes write semantics and conflict behavior. It should be
  split into small endpoint-specific commits.

### Phase F: cleanup/deprecation

Likely files touched:

- `apps/api/src/api/models/roadmap.py`.
- Future Alembic revisions if dropping columns or constraints.
- `docs/backend-api.md`, `docs/manual-qa.md`, and import/export docs after the
  product behavior changes.

Validation:

- Old snapshots and versions can still restore.
- Exports still produce the documented `.roadforge.json` shape.
- No code path relies on stale projection rebuild behavior.

Rollback strategy:

- Keep `snapshot_json` as a generated compatibility cache for at least one
  release after relational writes are canonical.
- Do not drop snapshot/version JSON until restore and export have a replacement.

Risk:

- Medium to high if cleanup happens too early. Defer it until relational reads,
  writes, versions, and exports have production evidence.

## 6. API impact

Existing endpoints should remain stable initially:

- `POST /api/roadmaps` still accepts `phases`.
- `GET /api/roadmaps/{id}` still returns `phases`.
- `PUT /api/roadmaps/{id}` still accepts full `phases` replacement.
- Version, activity, share-link, participant, lock, and SSE endpoints keep their
  current contracts.

Relational storage later enables smaller endpoints such as:

- `POST /api/roadmaps/{id}/phases`
- `PATCH /api/roadmaps/{id}/phases/{phase_id}`
- `DELETE /api/roadmaps/{id}/phases/{phase_id}`
- `POST /api/roadmaps/{id}/phases/reorder`
- `POST /api/roadmaps/{id}/tasks`
- `PATCH /api/roadmaps/{id}/tasks/{task_id}`
- `DELETE /api/roadmaps/{id}/tasks/{task_id}`
- `POST /api/roadmaps/{id}/tasks/{task_id}/dependencies`
- `DELETE /api/roadmaps/{id}/tasks/{task_id}/dependencies/{depends_on_task_id}`
- `PUT /api/roadmaps/{id}/tasks/{task_id}/assignees`
- `PUT /api/roadmaps/{id}/tasks/{task_id}/tags`

These are proposed future endpoints, not part of RF-820. They should reuse the
current owner/editor permissions and keep viewer access read-only. They also
make partial activity diffs possible because the server knows the exact entity
being changed.

## 7. Version history impact

Keep `roadmap_versions.snapshot_json` as the restore-safe history format.
Current restore behavior is simple and valuable: owner selects a version, the
service replaces `roadmaps.name` and `roadmaps.snapshot_json`, creates a new
`roadmap.restored` version, and broadcasts `roadmap.updated`.

Initial relational work should not replace that. On restore, write the snapshot
first and rebuild the relational projection from that snapshot in the same
transaction. This keeps historical versions independent of later relational
schema changes.

Later, the app may add relational reconstruction for specific audit or diff
features, but it should be optional. The safest initial path is snapshot
versions plus relational projection rebuild.

## 8. Activity log impact

Today, activity logs store one row per save with coarse `before_json`,
`after_json`, and optional client-provided `change_summary`. Relational writes
can improve this without changing the activity API immediately:

- Task updates can log `entity_type="task"` and `entity_id=<client_task_id>`.
- Phase reorders can log the moved phase and before/after positions.
- Dependency link/unlink can log both task IDs.
- Assignee/tag changes can log precise added/removed values.

The existing `activity_logs` table is flexible enough for this. A new task
history table is not needed until the product needs per-field audit or
task-level undo separate from roadmap versions.

## 9. Conflict and CRDT implications

Relational rows reduce conflict scope. A task title edit and a different task
completion toggle no longer need to conflict as a whole-roadmap replacement.
This helps RF-824 by creating structured entities and fields that can be
compared, merged, and surfaced in conflict UI.

Do not design a full CRDT now. The practical next step is structured conflict
UX:

- Detect stale updates at task, phase, or dependency level.
- Show the user the specific field or entity that changed.
- Offer keep mine, accept theirs, or manually edit for meaningful conflicts.

CRDT work should wait until there is evidence that structured optimistic
conflicts are not enough for the roadmap editing workload.

## 10. Realtime and Redis implications

Current realtime behavior uses SSE tickets and an in-process event bus. Writes
broadcast broad events such as `roadmap.updated`, and clients re-fetch the
roadmap.

Relational updates work with that model first:

- Continue broadcasting `roadmap.updated` during projection and read-path
  phases.
- Add optional event payload metadata such as `entity_type`, `entity_id`, and
  `operation` once partial endpoints exist.
- Keep clients able to re-fetch the full roadmap after any event.

For RF-822 and RF-823, Redis can back the event bus and lock/state coordination
for multi-worker mode. Relational task updates do not require Redis by
themselves, but they make Redis event payloads smaller and more meaningful.
This plan does not implement Redis and does not require replacing existing SSE.

## 11. Risks and non-goals

Risks:

- Projection drift between `snapshot_json` and relational rows.
- Snapshot serialization differences causing import/export or frontend cache
  churn.
- Existing legacy snapshots exposing edge cases in task IDs, dependencies,
  tags, or parent references.
- Overly strict ordering constraints making reorder operations hard.
- Switching write paths before version restore and export are proven.
- Confusing task assignees with participants and accidentally weakening the
  accountless collaboration model.

Non-goals for the first migration:

- Do not remove `roadmaps.snapshot_json`.
- Do not remove `roadmap_versions.snapshot_json`.
- Do not redesign auth, invite links, participants, or public viewer links.
- Do not introduce accounts, OAuth, email auth, or global user identity.
- Do not add Redis, multi-worker deployment changes, or CRDT logic.
- Do not replace SSE; compare future realtime changes against the existing SSE
  model.
- Do not add `roadmap_task_history` until there is a concrete consumer.
- Do not normalize tags unless tag-specific behavior requires it.

## 12. Implementation notes

RF-870 through RF-875 add the projection schema, mapper, service-level
backfill helper, snapshot-write sync, parity helpers, and a disabled-by-default
read-path flag named `ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED`. Phase 22 adds
operator verification mode, reusable drift reporting, explicit read fallback
coverage, and the RF-821 completion criteria. Public API behavior remains
snapshot-first unless the flag is enabled and parity passes.

The backfill and verification workflow is operator-only through
`apps/api/src/api/scripts/backfill_projection.py`. There is no public route
because there is no existing admin-only endpoint framework.

The partial write endpoint contract is documented in
`docs/architecture/partial-roadmap-write-endpoints.md`; endpoint implementation
is deferred until conflict behavior and QA are scoped per endpoint. Future
partial relational writes require a separate canonical-state policy decision.

## 13. Recommended decision

Choose hybrid snapshot plus relational projection first.

That path matches the current app: snapshots are already the API contract,
version history format, import/export format, and restore safety net. Relational
projection gives RF-821 a way to backfill and validate phases, tasks,
dependencies, and assignees without forcing the frontend or API to change in
the same release.

Full relational canonical state should be a later decision after projection
parity is validated and after partial endpoint behavior is designed. Moving
canonical state immediately to relational tables would combine too many risks:
data migration, response serialization, restore semantics, activity diffs,
conflict handling, and realtime behavior.
