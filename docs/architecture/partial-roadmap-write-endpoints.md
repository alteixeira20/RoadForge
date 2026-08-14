# Focused roadmap writes

**Status:** Current architecture summary.
**Endpoint semantics:** [`../backend-api.md`](../backend-api.md) and API tests.

RoadForge uses a mix of aggregate saves and focused mutation endpoints. Focused writes are
an intent-narrowing and collaboration mechanism; they do not change the canonical roadmap
source of truth.

## Invariant

For synced roadmaps:

- the canonical phase/task document remains `roadmaps.snapshot_json`;
- roadmap metadata such as the name remains canonical on the roadmap row;
- the tag registry remains canonical roadmap data;
- relational phase/task tables are derivative;
- activity/version records are separate recovery/history evidence;
- each write surface owns an explicit concurrency contract appropriate to its mutation scope.

Local-only roadmaps continue to use the browser-local mutation path and remain usable
without the API.

## Current focused surfaces

Current code includes focused operations for:

- roadmap rename;
- task planning-field updates;
- task completion/reopen;
- task claim/release;
- phase name/color/color-mode updates;
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
- live collaboration behavior;
- a concrete integration/agent use case.

The new path must preserve portable JSON, authorization, activity, projection, realtime,
and recovery invariants.

## Concurrency behavior

Focused writes do **not** all need the same optimistic-concurrency mechanism.

- Task planning/completion writes currently use the exact observed roadmap revision.
- Roadmap rename and phase-field writes are safe to apply to the latest row-locked server
  state because they mutate only explicitly declared fields. They therefore do not
  require a whole-roadmap `last_updated_at` token.
- Claim/release operations use atomic ownership semantics.
- Aggregate replacement remains compare-and-swap and must not become a blind overwrite.

The important invariant is that unrelated client state is never smuggled into a focused
mutation. A server-authoritative collaboration client should reconcile or retry an
intent-scoped operation according to that operation's contract rather than forcing a
whole-roadmap local/server choice when the mutation can be safely isolated.

## Projection behavior

Projection tables are rebuildable derivatives. Focused writes should keep them consistent
with canonical state when the projected document changes, but metadata-only writes such as
roadmap rename do not need to rebuild an unchanged phase/task projection. Projection
architecture must never make a best-effort derivative more authoritative than canonical
roadmap state.

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
3. explicit concurrency/ownership behavior appropriate to the mutation scope;
4. canonical state mutation correctness;
5. projection parity when projected state changes;
6. precise activity behavior;
7. realtime behavior when applicable;
8. normalized no-op behavior;
9. browser/integration reconciliation without losing unrelated dirty local state;
10. no portable-format regression.

Do not introduce generic mutation infrastructure, CRDTs, provider synchronization, or
account concepts as incidental work in a focused endpoint PR.
