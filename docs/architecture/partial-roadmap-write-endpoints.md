# Focused roadmap writes

**Status:** Current architecture summary.
**Endpoint semantics:** [`../backend-api.md`](../backend-api.md) and API tests.

RoadForge uses a mix of aggregate saves and focused mutation endpoints. Focused writes are
an optimization and intent-narrowing mechanism; they do not change the canonical roadmap
source of truth.

## Invariant

For synced roadmaps:

- the canonical phase/task document remains `roadmaps.snapshot_json`;
- the tag registry remains canonical roadmap data;
- relational phase/task tables are derivative;
- activity/version records are separate recovery/history evidence;
- optimistic content writes preserve the current exact-revision contract.

Local-only roadmaps continue to use the browser-local mutation path and remain usable
without the API.

## Current focused surfaces

Current code includes focused operations for:

- task planning-field updates;
- task completion/reopen;
- task claim/release;
- tag registry listing/mutation.

The exact routes, roles, fields, limits, and errors are maintained in
[`../backend-api.md`](../backend-api.md) and the corresponding router/schema/service tests.
Do not duplicate those contracts here.

## Aggregate saves remain valid

`PUT /api/roadmaps/{id}` remains the aggregate save path for roadmap edits without a
focused endpoint. A contributor should not add another partial endpoint merely because a
more granular API sounds cleaner.

Add a focused path when there is evidence that it improves at least one of:

- correctness by preventing unrelated client state from joining a mutation;
- payload/write amplification;
- conflict scope or recovery clarity;
- a concrete integration/agent use case.

The new path must preserve portable JSON, authorization, activity, projection, realtime,
and recovery invariants.

## Conflict behavior

Focused content writes do not bypass optimistic concurrency. Stale or future revisions
must not silently overwrite newer server state. Conflict UI/integrations should preserve
local work and require an explicit next action.

Claims/other coordination operations can have additional atomic ownership semantics; use
the current service tests as the contract rather than inferring them from this overview.

## Projection behavior

Projection tables are rebuildable derivatives. Focused writes should keep them consistent
with canonical state, but projection architecture must not make a best-effort derivative
more authoritative than the roadmap snapshot.

Any proposal to make relational rows canonical is a separate data-model decision and must
include migration, parity, recovery, and compatibility evidence.

## Versions and activity

Routine focused writes create appropriately scoped activity for real changes but should
not automatically create an unbounded full-snapshot version history. Manual checkpoints
and deliberately version-worthy operations own restore history.

## Adding another focused write

A PR should demonstrate:

1. a concrete user/operational reason;
2. API role enforcement;
3. exact revision/ownership behavior;
4. canonical snapshot mutation correctness;
5. projection parity;
6. precise activity behavior;
7. realtime behavior when applicable;
8. normalized no-op behavior;
9. browser/integration reconciliation without losing unrelated dirty local state;
10. no portable-format regression.

Do not introduce generic mutation infrastructure, CRDTs, provider synchronization, or
account concepts as incidental work in a focused endpoint PR.
