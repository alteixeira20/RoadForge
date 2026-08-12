# Task partial-write API — implementation record

**Status:** Implemented design record.
**Original decision date:** 2026-07-04.
**Current contract:** [`../backend-api.md`](../backend-api.md) and the API schemas/services/tests.

This file records why RoadForge introduced a focused task-update endpoint. It is not the
current endpoint specification and should not be used instead of code/tests.

## Decision

RoadForge added:

```text
PATCH /api/roadmaps/{roadmap_id}/tasks/{task_id}
```

so ordinary task-field edits do not need to submit the complete client phase tree.

The endpoint preserves RoadForge's existing data model rather than introducing a second
source of truth:

- `roadmaps.snapshot_json` remains canonical for phases/tasks;
- the roadmap tag registry remains canonical roadmap data;
- relational rows remain derivative projections;
- participant owner/editor authorization is enforced by the API;
- exact roadmap-level optimistic concurrency prevents stale or future revisions from
  silently overwriting current state;
- activity/realtime/projection behavior is updated only for a real change;
- portable JSON and version-restore semantics remain compatible.

## Why a focused endpoint

The aggregate roadmap save remains useful for structural changes, but it is unnecessarily
broad for changing one task's title, description, estimate, complexity, assignees, tags,
or supported links.

A focused endpoint narrows:

- request scope;
- validation scope;
- accidental submission of unrelated dirty client fields;
- the amount of client state participating in one intent.

It does **not** imply field-level distributed conflict resolution or make the relational
projection authoritative.

## Concurrency decision

Task planning updates use the roadmap's exact `updated_at` revision as compare-and-swap
evidence. Roadmap-level concurrency intentionally creates some conflicts between unrelated
edits, but it prevents an old task edit from silently overwriting a newer roadmap state.

RoadForge does not silently rebase/retry a `409` as an overwrite. The browser or agent
must observe the current server revision and take an explicit recovery action.

## No-op behavior

A normalized no-op should not create artificial side effects. The implemented behavior is
expected to preserve the current revision and avoid new activity/realtime/version work when
nothing actually changed.

Tests, not this record, are authoritative for exact normalization details.

## Projection boundary

Focused task mutations update canonical roadmap state and keep derivative projections in
sync. Projection failure must not turn projection rows into a competing source of truth;
guarded reads can fall back to the canonical snapshot according to the current projection
contract.

## Activity and versions

Task edits create precise task-oriented activity for real changes. Routine task edits are
not intended to create a full restore point for every mutation; explicit checkpoints and
version-worthy lifecycle operations provide bounded recovery history.

Activity is useful collaboration/history evidence, not an immutable compliance ledger.

## What this decision deliberately did not introduce

- relational rows as the primary roadmap write model;
- per-field CRDT/automatic merge behavior;
- a generic mutation framework;
- accounts/OAuth;
- field-level realtime patch application;
- a new portable JSON format.

Those require separate evidence and decisions if ever needed.

## Current implementation evidence

Review the current endpoint through:

```text
apps/api/src/api/routers/
apps/api/src/api/schemas/
apps/api/src/api/services/roadmap_task_service.py
apps/api/tests/test_task_patch.py
apps/web/src/services/
```

For exact supported fields, limits, response shapes, and error behavior, use current code,
`docs/backend-api.md`, and the contract tests.

Historical values and rollout steps from the original implementation plan—such as the old
512 KiB request ceiling or full-projection-rebuild assumptions—are intentionally not kept
here because they no longer describe the runtime.
