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

A shared roadmap participant receives an opaque session token and sends it as:

```http
Authorization: Bearer sess_<token>
```

Session tokens are roadmap-scoped bearer credentials, stored hashed at rest and never
returned by list/read endpoints. The browser keeps the active credential in scoped
local storage. Do not put session tokens in URLs.

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
| `GET` | `/api/roadmaps/{id}` | owner/editor/viewer | read current roadmap |
| `PUT` | `/api/roadmaps/{id}` | owner/editor | aggregate roadmap save |
| `DELETE` | `/api/roadmaps/{id}` | owner | soft-delete roadmap |

The canonical synced phase/task document remains PostgreSQL `roadmaps.snapshot_json`
with the roadmap tag registry stored alongside it. Relational phase/task tables are
derivative projections.

## Focused task writes

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `PATCH` | `/api/roadmaps/{id}/tasks/{task_id}` | owner/editor | update supported task planning fields |
| `PATCH` | `/api/roadmaps/{id}/tasks/{task_id}/done` | owner/editor | toggle completion |
| `PATCH` | `/api/roadmaps/{id}/tasks/{task_id}/claim` | owner/editor | claim/take over according to role rules |
| `DELETE` | `/api/roadmaps/{id}/tasks/{task_id}/claim` | owner/editor | release/clear a claim according to role rules |

Focused writes modify the same canonical roadmap document as aggregate saves. They do
not create a second source of truth.

## Tag registry

| Method | Path | Access |
| --- | --- | --- |
| `GET` | `/api/roadmaps/{id}/tags` | owner/editor/viewer |
| `POST` | `/api/roadmaps/{id}/tags` | owner/editor |
| `PUT` | `/api/roadmaps/{id}/tags/{tag_id}` | owner/editor |
| `DELETE` | `/api/roadmaps/{id}/tags/{tag_id}` | owner/editor |

Tasks reference stable tag IDs. The registry remains canonical roadmap data rather than
a separate identity/access system.

## Sharing and participants

| Method | Path | Access |
| --- | --- | --- |
| `GET` | `/api/roadmaps/{id}/share-links` | owner |
| `POST` | `/api/roadmaps/{id}/share-links/{role}/rotate` | owner |
| `DELETE` | `/api/roadmaps/{id}/share-links/{role}` | owner |
| `GET` | `/api/roadmaps/{id}/participants` | owner/editor, role-scoped response |
| `POST` | `/api/roadmaps/{id}/participants/{participant_id}/revoke` | owner |

Owner/editor raw invite URLs are one-time response material after creation/rotation;
normal listing does not recover their raw tokens. Viewer links may be intentionally
stable/copyable read-only access links according to the current sharing contract.

Invite rotation affects future joins. Participant revocation affects an existing
session. They are separate operations.

## Versions and activity

| Method | Path | Access |
| --- | --- | --- |
| `GET` | `/api/roadmaps/{id}/versions` | owner/editor |
| `POST` | `/api/roadmaps/{id}/versions/checkpoint` | owner/editor |
| `GET` | `/api/roadmaps/{id}/versions/{version_id}` | owner/editor |
| `POST` | `/api/roadmaps/{id}/versions/{version_id}/restore` | owner |
| `GET` | `/api/roadmaps/{id}/activity` | owner/editor/viewer |

Version history is a recovery mechanism, not an immutable compliance ledger. Routine
writes do not need to create a full restore point.

## Locks and realtime

| Method | Path | Access |
| --- | --- | --- |
| `GET` | `/api/roadmaps/{id}/locks` | owner/editor/viewer |
| `POST` | `/api/roadmaps/{id}/locks` | owner/editor |
| `DELETE` | `/api/roadmaps/{id}/locks/{target}` | eligible lock owner/role |
| `POST` | `/api/roadmaps/{id}/events/ticket` | owner/editor/viewer |
| `GET` | `/api/roadmaps/{id}/events` | short-lived event ticket |

Long-lived participant session tokens are not placed in SSE URLs. An authenticated
client first requests a short-lived, single-use event ticket.

Memory realtime supports one API process. Redis mode shares events, tickets, locks,
revocation state, and rate limits across workers/instances.

## Optimistic concurrency

Roadmap content writes use an exact server revision (`updated_at`) compare-and-swap
contract. Clients send their last observed revision. A stale **or future** revision is
not allowed to overwrite current server state.

A conflict returns HTTP `409` with `code: "roadmap_conflict"` and the current server
revision plus enough server state/summary information for the client to preserve local
work and present an explicit resolution path.

Clients and MCP tools must not silently retry a conflicting write as an overwrite.

## Common status codes

| Code | Meaning |
| ---: | --- |
| `200` | successful request |
| `201` | resource created |
| `204` | successful request with no body |
| `400` | invalid operation semantics |
| `401` | missing/invalid/expired/revoked credential |
| `403` | valid credential with insufficient role |
| `404` | active roadmap/entity not found |
| `409` | optimistic-concurrency or ownership conflict |
| `413` | request body exceeds the supported payload ceiling |
| `422` | schema/field validation failure |
| `429` | rate limit exceeded |
| `503` | required readiness dependency unavailable |

## Payload and field limits

The authoritative shared API limits live in:

```text
apps/api/src/api/schemas/limits.py
```

The supported roadmap request ceiling is **5 MiB** and is aligned with the maintained
browser import and nginx limits. Do not copy historical 512 KiB limits into new docs.

Frontend import validation mirrors the relevant roadmap shape limits in
`apps/web/src/lib/roadmap-validation.ts`. When changing a shared limit, update both
sides and add contract tests rather than relying on prose.

## Error details

RoadForge uses FastAPI-style JSON errors for ordinary failures:

```json
{"detail":"Human-readable error message"}
```

Conflict responses add structured conflict metadata. Error responses must never echo
raw invite tokens, participant session tokens, passwords, Redis credentials, or private
request bodies.

## API change checklist

When changing an endpoint contract:

1. update the Pydantic schema/router/service;
2. preserve authorization at the API boundary;
3. update focused API tests;
4. update the typed web service when the browser consumes it;
5. preserve the portable roadmap contract unless an explicit format migration owns the change;
6. update this document only when client-visible semantics change;
7. run API tests, migration drift checks, and the relevant browser tests.

The source code and tests remain authoritative over examples in historical design
records.
