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

## Focused task writes

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

## Focused phase-field writes

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `PATCH` | `/api/roadmaps/{id}/phases/{phase_id}` | owner/editor | update phase `name`, `color`, and/or `colorMode` |

Phase-field PATCH is collaboration-oriented and operates on the latest row-locked canonical
snapshot. It intentionally does **not** require `last_updated_at`: only the fields explicitly
present in the request are changed, so an unrelated collaborator write cannot create a
whole-roadmap stale-revision conflict. Concurrent field operations on the same roadmap are
serialized by the database row lock; operations touching different fields both survive.
For the same field, the latest accepted server operation becomes the visible authoritative
value.

A no-op phase PATCH returns the current roadmap without advancing `updated_at` or writing
activity. Real changes keep the derivative projection in parity and publish a
`roadmap.updated` event with `phase_id`, action, and changed fields.

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
- phase-field writes mutate only declared fields on the latest row-locked server snapshot
  and therefore do not require a whole-roadmap revision token;
- claim/release operations use their own atomic ownership rules.

For compare-and-swap writes, a stale **or future** revision is not allowed to overwrite
current server state. A conflict returns HTTP `409` with `code: "roadmap_conflict"` and the
current server revision plus enough server state/summary information for deliberate
recovery.

Clients and MCP tools must not turn a conflicting aggregate replacement into a blind
overwrite. Intent-scoped operations may be safely retried only according to their documented
field/ownership semantics.

## Caching and sensitive responses

Sensitive roadmap API responses use `Cache-Control: no-store`, including `PATCH` responses.
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
| `409` | optimistic-concurrency or ownership conflict |
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
