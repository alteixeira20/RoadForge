# Backend API reference

This document describes RoadForge API semantics that are important to clients and
contributors. It intentionally does **not** duplicate every Pydantic field constraint.
The API schemas and tests are authoritative for exact request/response validation.

Local API origin:

```text
http://localhost:7878
```

All application endpoints are under `/api`.

## Authentication model

RoadForge is accountless, not unauthenticated.

A shared roadmap participant receives an opaque roadmap-scoped session token. Non-browser
clients such as MCP authenticate with:

```http
Authorization: Bearer <participant-session-token>
```

Raw participant tokens are stored hashed at rest and are never returned by list/read
endpoints. Do not put participant sessions in URLs.

The web client does not persist newly issued raw Bearer tokens. Immediately after roadmap
creation or invite join it exchanges the raw token through:

```text
POST /api/roadmaps/{id}/session/cookie
```

The exchange requires the valid Bearer session in `Authorization` and returns `204` with a
path-scoped HttpOnly `roadforge_session` cookie. Browser code then uses a non-secret auth
marker while fetch requests use the cookie. Pre-hardening browser Bearer sessions are
migrated through the same endpoint on the next successful hydration.

Cookie-authenticated unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`) require an `Origin`
that exactly matches the configured CORS origins. Explicit Bearer API/MCP calls remain a
separate authentication path and do not depend on browser cookies or `Origin`.

Roles:

- `owner` — full roadmap and access management;
- `editor` — roadmap content editing and collaboration actions;
- `viewer` — read-only roadmap access.

Invite links are exchanged for participant sessions through the join endpoint. Display
names are labels, not verified identity.

## Health

| Method | Path | Meaning |
| --- | --- | --- |
| `GET` | `/api/health/live` | process liveness only |
| `GET` | `/api/health/ready` | PostgreSQL + configured Redis readiness |
| `GET` | `/api/health` | backward-compatible readiness alias |

Health endpoints require no participant token. Readiness returns `503` when a required
dependency is unavailable.

## Roadmap lifecycle

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/roadmaps` | public | create a synced roadmap, owner session, and initial share links |
| `POST` | `/api/roadmaps/join` | public invite | exchange an invite/password for a participant session |
| `POST` | `/api/roadmaps/{id}/session/cookie` | valid Bearer participant | exchange the browser bootstrap Bearer for an HttpOnly session cookie |
| `GET` | `/api/roadmaps/{id}` | owner/editor/viewer | read current roadmap |
| `PUT` | `/api/roadmaps/{id}` | owner/editor | aggregate roadmap save |
| `DELETE` | `/api/roadmaps/{id}` | owner | soft-delete roadmap |

The canonical synced phase/task document remains PostgreSQL `roadmaps.snapshot_json`
with the roadmap tag registry stored alongside it. Relational phase/task tables are
derivative projections.

## Focused roadmap metadata writes

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `PATCH` | `/api/roadmaps/{id}/name` | owner/editor | rename the roadmap |

Roadmap rename is collaboration-oriented and operates on the latest row-locked roadmap
row. It intentionally does **not** require `last_updated_at`: only the canonical roadmap
name changes, so unrelated phase/task writes cannot be overwritten by a stale aggregate
snapshot. A no-op rename does not advance `updated_at` or create activity. A real rename
creates `roadmap.renamed` activity and publishes `roadmap.updated` with
`roadmap_fields: ["name"]`.

## Focused task field and claim writes

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `PATCH` | `/api/roadmaps/{id}/tasks/{task_id}` | owner/editor | update supported task planning fields |
| `PATCH` | `/api/roadmaps/{id}/tasks/{task_id}/done` | owner/editor | toggle completion |
| `PATCH` | `/api/roadmaps/{id}/tasks/{task_id}/claim` | owner/editor | claim/take over according to role rules |
| `DELETE` | `/api/roadmaps/{id}/tasks/{task_id}/claim` | owner/editor | release/clear a claim according to role rules |

Focused writes modify the same canonical roadmap document as aggregate saves. They do
not create a second source of truth. Task planning PATCH supports title, description, time
estimate, complexity, assignees, tags, and supported links. `very_high` complexity is only
valid for top-level tasks with at least two direct subtasks; the domain validator rejects
writes that would violate that structure.

## Focused task structure and dependency writes

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/roadmaps/{id}/phases/{phase_id}/tasks` | owner/editor | create one top-level task or subtask using a client-proposed stable ID |
| `DELETE` | `/api/roadmaps/{id}/tasks/{task_id}` | owner/editor | delete one task subtree and clean surviving dependency references |
| `PUT` | `/api/roadmaps/{id}/phases/{phase_id}/tasks/order` | owner/editor | apply preferred order to caller-known top-level tasks in one phase |
| `PUT` | `/api/roadmaps/{id}/tasks/{parent_id}/subtasks/order` | owner/editor | apply preferred order to caller-known direct subtasks of one parent |
| `PUT` | `/api/roadmaps/{id}/tasks/{task_id}/dependencies/{dependency_id}` | owner/editor | idempotently link one dependency edge |
| `DELETE` | `/api/roadmaps/{id}/tasks/{task_id}/dependencies/{dependency_id}` | owner/editor | idempotently unlink one dependency edge |

These operations run against the latest row-locked canonical task graph and intentionally
do **not** accept a whole-roadmap revision token. Requests carry only the entity/order/edge
intent they own; unrelated caller task state is never written.

Task creation accepts a stable task ID, title, and optional `parentId`. The server owns all
other initial fields. Top-level tasks start incomplete with default planning fields. A task
with `parentId` becomes a subtask in that same phase and receives the existing `subtask`
tag convention. IDs are unique roadmap-wide. A missing phase/parent returns `404`; a
stable-ID collision returns `409`.

Task deletion removes the identified task plus all descendants. Any dependency references
from surviving tasks to deleted task IDs are removed in the same transaction. The resulting
full roadmap graph is validated before canonical state is committed, so deleting a required
direct child of a `very_high` task, creating an invalid parent graph, or otherwise violating
domain invariants is rejected atomically. Create/delete recompute the affected phase progress.

Top-level and subtask reorder use **preferred-known-order merge semantics**. Caller-known
peers appear in the requested order; peers already deleted concurrently are ignored;
server-only peers created concurrently remain present afterward in their current relative
order. Child subtrees move with their root task. Reorder is revision/activity neutral when
the effective scoped order does not change.

Dependency link/unlink is idempotent. The server validates the complete dependency graph
before commit, so self-dependencies, missing references, duplicate edges, and dependency
cycles cannot be introduced. Real dependency changes emit task-scoped realtime metadata,
while create/delete/reorder emit task-structure metadata for collaboration reconciliation.

## Focused phase structure and field writes

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/roadmaps/{id}/phases` | owner/editor | append one empty phase using a client-proposed stable ID |
| `PUT` | `/api/roadmaps/{id}/phases/order` | owner/editor | apply a preferred order for caller-known phase IDs |
| `PATCH` | `/api/roadmaps/{id}/phases/{phase_id}` | owner/editor | update phase `name`, `color`, and/or `colorMode` |
| `DELETE` | `/api/roadmaps/{id}/phases/{phase_id}` | owner/editor | delete one phase and renumber survivors |

All phase structure operations run against the latest row-locked canonical snapshot and do
not carry unrelated client roadmap state. Create accepts only the proposed phase identity and
presentation fields; the server assigns sequence/status/progress and creates the phase with
an empty task list. Duplicate IDs are rejected. Delete removes the identified latest server
phase and renumbers the remaining phases.

Reorder deliberately uses **merge semantics** rather than an exact phase-set precondition.
`phase_ids` is the caller's preferred order for IDs it currently knows. IDs already deleted
by another collaborator are ignored. Phases created concurrently and therefore absent from
the caller list remain present, preserving their current relative order after caller-known
phases. The final server order is renumbered. This lets create/delete/reorder compose under
the roadmap row lock without manufacturing a whole-roadmap revision conflict.

Phase-field PATCH is collaboration-oriented and also operates on the latest row-locked
canonical snapshot. It intentionally does **not** require `last_updated_at`: only fields
explicitly present in the request are changed. Concurrent operations are serialized by the
row lock; operations touching unrelated intent both survive. For the same field/entity, the
latest accepted server operation becomes authoritative.

No-op phase field/reorder writes return current state without advancing `updated_at` or
writing activity. Real structural changes keep the derivative projection in parity and emit
`roadmap.updated` metadata identifying the phase operation so browser collaboration can
reconcile it without treating the whole roadmap as a conflicting snapshot.

## Tag registry

| Method | Path | Access |
| --- | --- |
| `GET` | `/api/roadmaps/{id}/tags` | owner/editor/viewer |
| `POST` | `/api/roadmaps/{id}/tags` | owner/editor |
| `PUT` | `/api/roadmaps/{id}/tags/{tag_id}` | owner/editor |
| `DELETE` | `/api/roadmaps/{id}/tags/{tag_id}` | owner/editor |

Tasks reference stable tag IDs. The registry remains canonical roadmap data rather than
a separate identity/access system.

## Sharing and participants

| Method | Path | Access |
| --- | --- |
| `GET` | `/api/roadmaps/{id}/share-links` | owner |
| `POST` | `/api/roadmaps/{id}/share-links/{role}/rotate` | owner |
| `DELETE` | `/api/roadmaps/{id}/share-links/{role}` | owner |
| `GET` | `/api/roadmaps/{id}/participants` | owner/editor, role-scoped response |
| `POST` | `/api/roadmaps/{id}/participants/{participant_id}/revoke` | owner |

Raw invite URLs for every role are one-time response material after creation/rotation;
normal listing never recovers a raw token. Generated links place the invite in the URL
fragment (`/join#token=...`) so the credential is not sent in the HTTP request target. The
join page removes it from the current history entry after reading it.

Legacy query-token invite links are accepted only for migration compatibility. Operators
should rotate any pre-hardening owner/editor invite that may have been distributed. Migration
`0011` revokes legacy viewer links whose raw token had been persisted and removes the old
`public_token` column; rotate the viewer link once after upgrade when a fresh copyable link
is required.

Invite rotation affects future joins. Participant revocation affects an existing session.
They are separate operations.

## Versions and activity

| Method | Path | Access |
| --- | --- |
| `GET` | `/api/roadmaps/{id}/versions` | owner/editor |
| `POST` | `/api/roadmaps/{id}/versions/checkpoint` | owner/editor |
| `GET` | `/api/roadmaps/{id}/versions/{version_id}` | owner/editor |
| `POST` | `/api/roadmaps/{id}/versions/{version_id}/restore` | owner |
| `GET` | `/api/roadmaps/{id}/activity` | owner/editor/viewer |

Version history is a recovery mechanism, not an immutable compliance ledger. Routine
writes do not need to create a full restore point.

## Locks and realtime

| Method | Path | Access |
| --- | --- |
| `GET` | `/api/roadmaps/{id}/locks` | owner/editor/viewer |
| `POST` | `/api/roadmaps/{id}/locks` | owner/editor |
| `DELETE` | `/api/roadmaps/{id}/locks/{target}` | eligible lock owner/role |
| `POST` | `/api/roadmaps/{id}/events/ticket` | owner/editor/viewer |
| `GET` | `/api/roadmaps/{id}/events` | short-lived event ticket cookie |

Long-lived participant sessions are not placed in SSE URLs. An authenticated participant
requests a cryptographically random, 30-second, roadmap/participant-scoped, single-use event
ticket. The API delivers the ticket only through the path-scoped HttpOnly
`roadforge_event_ticket` cookie. EventSource connects without ticket/query credentials; the
server consumes the ticket once and expires the browser cookie in the response.

Memory realtime supports one API process. Redis mode shares events, tickets, locks,
revocation state, and rate limits across workers/instances. In Redis mode, a Redis error in
the public rate limiter fails closed with `503` rather than silently permitting requests.

## Concurrency contracts

RoadForge uses more than one concurrency contract because the safest scope depends on the
operation:

- aggregate roadmap replacement (`PUT`) and task planning/completion writes use an exact
  server revision (`updated_at`) compare-and-swap contract;
- roadmap rename and phase-field writes mutate only declared fields on the latest
  row-locked server state and therefore do not require a whole-roadmap revision token;
- task create/delete and dependency link/unlink mutate one entity/edge against the latest
  row-locked task graph;
- top-level task reorder merges caller-known order within one phase, and subtask reorder
  does the same within one parent, preserving current server-only peers;
- phase create/delete mutate one identified entity against the latest row-locked phase list;
- phase reorder merges caller-known order with current server-only phases instead of
  requiring an exact phase set or whole-roadmap revision token;
- claim/release operations use their own atomic ownership rules.

For compare-and-swap writes, a stale **or future** revision is not allowed to overwrite
current server state. A conflict returns HTTP `409` with `code: "roadmap_conflict"` and the
current server revision plus enough server state/summary information for deliberate
recovery.

Clients and MCP tools must not turn a conflicting aggregate replacement into a blind
overwrite. Intent-scoped operations may be safely retried only according to their documented
field/entity/order/edge semantics.

## Caching and sensitive responses

Sensitive roadmap API responses use `Cache-Control: no-store`, including mutation responses.
The browser-session exchange and event-ticket bootstrap also use `no-store`. SSE streaming
uses its dedicated no-cache/no-store behavior.

## Common status codes

| Code | Meaning |
| ---: | --- |
| `200` | successful request |
| `201` | resource created |
| `204` | successful request with no body |
| `400` | invalid operation semantics |
| `401` | missing/invalid/expired/revoked credential |
| `403` | insufficient role or rejected cookie-authenticated request origin |
| `404` | active roadmap/entity not found |
| `409` | optimistic-concurrency, ownership, or stable-ID collision conflict |
| `413` | request body exceeds the supported payload ceiling |
| `422` | schema/field validation failure |
| `429` | rate limit exceeded |
| `503` | required dependency/rate-limiter availability failure |

## Payload and field limits

The authoritative shared API limits live in:

```text
apps/api/src/api/schemas/limits.py
```

The supported roadmap request ceiling is **5 MiB** and is aligned with the maintained
browser import and nginx limits. The ASGI body limiter counts actual streamed bytes, so a
missing or dishonest `Content-Length` cannot bypass the limit.

Frontend import validation mirrors the relevant roadmap shape limits in
`apps/web/src/lib/roadmap-validation.ts`. When changing a shared limit, update both
sides and add contract tests rather than relying on prose.

## Error details

RoadForge uses FastAPI-style JSON errors for ordinary failures:

```json
{"detail":"Human-readable error message"}
```

Conflict responses add structured conflict metadata. Error responses must never echo raw
invite/session/event-ticket tokens, passwords, Redis credentials, database credentials, or
private request bodies.

## API change checklist

When changing an endpoint contract:

1. update the Pydantic schema/router/service;
2. preserve authorization at the API boundary;
3. update focused API tests;
4. update the typed web service when the browser consumes it;
5. preserve the portable roadmap contract unless an explicit format migration owns the change;
6. update this document only when client-visible semantics change;
7. run API tests, migration drift checks, and the relevant browser tests.

The source code and tests remain authoritative over examples in historical design records.
