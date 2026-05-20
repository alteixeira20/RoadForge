# RoadForge — Backend API Reference

Base URL: `http://localhost:7878` (local Docker).  
All endpoints are under `/api/`.  
All request and response bodies are JSON.

Import/export note: RoadForge currently exposes JSON import/export only in the browser client. There are no backend import/export endpoints for Markdown, PDF, or agent bundles yet.

---

## GET /api/health

Health check. No body.

**Response 200:**
```json
{"status": "ok", "version": "0.1.0"}
```

---

## POST /api/roadmaps

Create a new roadmap. Returns the roadmap, three share links with raw join URLs, and the owner's session token. **The raw tokens in this response are never returned again.**

**Request:**
```json
{
  "name": "v1.0 Public Launch",
  "owner_display_name": "Ada",
  "phases": [],
  "password": null
}
```

- `name` — required, 1–120 chars
- `owner_display_name` — required, 1–128 chars
- `phases` — optional, array of phase objects (see Phase shape below), max 50 phases
- `password` — optional, 6–128 chars; enables password gate for all joiners

**Response 201:**
```json
{
  "id": "rm_abc123",
  "name": "v1.0 Public Launch",
  "owner_display_name": "Ada",
  "schema_version": "1.0",
  "phases": [],
  "created_at": "2026-05-08T10:00:00Z",
  "updated_at": "2026-05-08T10:00:00Z",
  "share_links": [
    {
      "id": "sl_xyz",
      "role": "owner",
      "token_prefix": "ow_Ab1C",
      "url": "http://localhost:3020/join?token=ow_<REDACTED>",
      "is_active": true,
      "created_at": "2026-05-08T10:00:00Z",
      "rotated_at": null
    },
    {
      "id": "sl_yzw",
      "role": "editor",
      "token_prefix": "ed_Xy2Z",
      "url": "http://localhost:3020/join?token=ed_<REDACTED>",
      "is_active": true,
      "created_at": "2026-05-08T10:00:00Z",
      "rotated_at": null
    },
    {
      "id": "sl_wvu",
      "role": "viewer",
      "token_prefix": "vi_Mn3P",
      "url": "http://localhost:3020/join?token=vi_<REDACTED>",
      "is_active": true,
      "created_at": "2026-05-08T10:00:00Z",
      "rotated_at": null
    }
  ],
  "owner_session_token": "sess_<REDACTED>"
}
```

**Security:**
- Raw tokens exist only in this response and in local memory during the request. Only SHA-256 hashes are stored in the database.
- `owner_session_token` is a one-time return. Store it client-side; it cannot be recovered.

---

## GET /api/roadmaps/{roadmap_id}

Fetch a roadmap with its current phase snapshot.

**Response 200:**
```json
{
  "id": "rm_abc123",
  "name": "v1.0 Public Launch",
  "owner_display_name": "Ada",
  "schema_version": "1.0",
  "phases": [ /* phase objects */ ],
  "created_at": "2026-05-08T10:00:00Z",
  "updated_at": "2026-05-08T10:15:00Z"
}
```

**Response 404:**
```json
{"detail": "Roadmap not found"}
```

---

## PUT /api/roadmaps/{roadmap_id}

Update a roadmap's name and/or phases. Both fields are optional; omit to leave unchanged. Phase update is a full snapshot replacement — the entire `phases` array is stored as-is.

**Requires:** `Authorization: Bearer <session_token>` with owner or editor role. Returns 401 if token is missing or invalid; 403 if the participant's role is insufficient.

**Request:**
```json
{
  "name": "v1.1 Beta",
  "phases": [
    /* ... */
  ],
  "last_updated_at": "2026-05-08T10:00:00Z",
  "change_summary": {
    "action": "task.completed",
    "entity_type": "task",
    "entity_id": "RF-01",
    "taskId": "RF-01",
    "taskTitle": "Set up repo"
  }
}
```

- `name` — optional, 1–120 chars
- `phases` — optional, array of phase objects
- `last_updated_at` — optional, optimistic concurrency check
- `change_summary` — optional, dictionary used to customize the activity log entry for this update. If provided, `action` is required.

**Response 200:** Same shape as `GET /api/roadmaps/{roadmap_id}`.

**Response 404:** Roadmap not found.

---

## GET /api/roadmaps/{roadmap_id}/share-links

List active share links for a roadmap. **`url` is always `null` here** — join URLs containing raw tokens are only returned at create or rotate time.

**Response 200:**
```json
[
  {
    "id": "sl_xyz",
    "role": "owner",
    "token_prefix": "ow_Ab1C",
    "url": null,
    "is_active": true,
    "created_at": "2026-05-08T10:00:00Z",
    "rotated_at": null
  },
  {
    "id": "sl_yzw",
    "role": "editor",
    "token_prefix": "ed_Xy2Z",
    "url": null,
    "is_active": true,
    "created_at": "2026-05-08T10:00:00Z",
    "rotated_at": "2026-05-08T11:00:00Z"
  }
]
```

Links are sorted owner → editor → viewer. Revoked links are excluded.

**Response 404:** Roadmap not found.

---

## POST /api/roadmaps/{roadmap_id}/share-links/{role}/rotate

Generate a new invite token for the given role. Invalidates the previous token immediately. Returns the new join URL with the raw token — **this is the only time the new token is exposed**.

`role` must be one of `owner`, `editor`, `viewer`. Other values return 422.

**Requires:** `Authorization: Bearer <session_token>` with owner role.

**Response 200:**
```json
{
  "id": "sl_yzw",
  "role": "editor",
  "token_prefix": "ed_Pq4R",
  "url": "http://localhost:3020/join?token=ed_<REDACTED>",
  "is_active": true,
  "created_at": "2026-05-08T10:00:00Z",
  "rotated_at": "2026-05-08T12:00:00Z"
}
```

**Response 404:** Roadmap not found.

---

## DELETE /api/roadmaps/{roadmap_id}/share-links/{role}

Soft-revoke a share link. The link's `is_active` is set to `false`. Any join attempt with the old token returns 401.

**Requires:** `Authorization: Bearer <session_token>` with owner role.

**Response 204:** No content.

**Response 404:** Roadmap or active share link not found.

---

## POST /api/roadmaps/join

Accept an invite token and join the roadmap. Creates a `Participant` row and returns a session token. The raw session token is only in this response.

**Request:**
```json
{
  "token": "ed_<raw_invite_token>",
  "display_name": "Jordan",
  "password": null
}
```

- `token` — required, min 8 chars; the raw token from the join URL
- `display_name` — optional; blank or omitted assigns a role default ("Guest Editor", etc.)
- `password` — required when the roadmap has `is_password_enabled = true`

**Response 200:**
```json
{
  "roadmap_id": "rm_abc123",
  "roadmap_name": "v1.0 Public Launch",
  "role": "editor",
  "session_token": "sess_<REDACTED>",
  "participant_id": "pt_def456"
}
```

**Response 401:**
- `"Invalid or expired invite token"` — token hash not found or share link is inactive
- `"Invalid invite token or password"` — roadmap has password enabled and the supplied password is wrong or missing

**Note:** The 401 message does not reveal which check failed.

---

## Phase and Task shape

Phases are stored as a JSON snapshot. The shape mirrors `apps/web/src/types/roadmap.ts`.

```typescript
interface Task {
  id: string           // e.g. "RF-01"
  title: string
  done: boolean
  next?: boolean
  est?: string         // e.g. "2d", "1w"
  tags?: string[]
  deps?: string[]      // task IDs this task depends on
  desc?: string
}

interface Phase {
  id: string           // e.g. "p1"
  num: string          // display number e.g. "01"
  name: string
  color: string        // hex color
  status: "done" | "active" | "next" | "future"
  progress: number     // 0–100
  tasks: Task[]
}
```

---

## Realtime and Locking (SSE)

Realtime sync uses Server-Sent Events (SSE). To connect, a client must first obtain a short-lived ticket.

### POST /api/roadmaps/{roadmap_id}/events/ticket

Request a ticket to open an SSE stream.
**Requires:** `Authorization: Bearer <session_token>`.

**Response 200:**
```json
{
  "ticket": "cryptographic_random_ticket",
  "expires_in": 30
}
```

### GET /api/roadmaps/{roadmap_id}/events?ticket={ticket}

Open the SSE event stream. Validates and consumes the ticket.
**Authentication:** Query parameter `ticket`.

**Events:**
- `roadmap.updated` — `{ "roadmap_id": "...", "updated_at": "...", "participant_id": "..." }`
- `lock.acquired` — `{ "roadmap_id": "...", "target": "...", "participant_id": "...", "display_name": "..." }`
- `lock.released` — `{ "roadmap_id": "...", "target": "...", "participant_id": "..." }`

---

## Soft Locks

In-memory locks to prevent edit collisions. Targets are generic strings (e.g., `task:RF-01`).

### POST /api/roadmaps/{roadmap_id}/locks

Acquire or refresh a lock.
**Requires:** `Authorization: Bearer <session_token>` with owner or editor role.

**Request:**
```json
{ "target": "task:RF-01" }
```

**Response 200:** Lock info.
**Response 409:** Target is locked by another participant.

### DELETE /api/roadmaps/{roadmap_id}/locks/{target}

Release a lock. Only the owner of the lock can release it.
**Requires:** `Authorization: Bearer <session_token>`.

### GET /api/roadmaps/{roadmap_id}/locks

List all active locks for a roadmap.
**Response 200:** Array of `LockResponse` objects.
```json
[
  {
    "target": "task:RF-01",
    "participant_id": "pt_def456",
    "display_name": "Jordan",
    "expires_at": "2026-05-08T12:00:30Z"
  }
]
```

---

## Activity Logs

Audit trail of contributor actions.

### GET /api/roadmaps/{roadmap_id}/activity

Fetch paginated activity logs for a roadmap, newest first.
**Requires:** `Authorization: Bearer <session_token>` (any role).

**Query parameters:**
- `limit` — optional, 1–200, default 100
- `offset` — optional, default 0

**Response 200:**
```json
{
  "logs": [
    {
      "id": "al_123",
      "roadmap_id": "rm_abc",
      "participant_id": "pt_456",
      "actor_name": "Ada",
      "action": "roadmap.updated",
      "entity_type": "roadmap",
      "entity_id": "rm_abc",
      "before_json": {"name": "Old Name"},
      "after_json": {"name": "New Name"},
      "metadata_json": null,
      "created_at": "2026-05-08T14:00:00Z"
    }
  ],
  "has_more": false
}
```

---

## Error format

All errors follow FastAPI's default shape:

```json
{"detail": "Human-readable error message"}
```

Common status codes:
- `401` — missing/invalid session token, or wrong invite token/password
- `403` — session token valid but role insufficient
- `404` — roadmap or share link not found
- `413` — request body exceeds 512 KB
- `422` — validation error (bad request shape, invalid role value, field too long, etc.)

---

## Authorization

Write endpoints require a session token in the `Authorization` header:

```
Authorization: Bearer sess_<raw_session_token>
```

The token is returned once at roadmap creation (`owner_session_token`) or invite join (`session_token`). Store it client-side; it cannot be recovered.

| Endpoint | Required role |
|---|---|
| `PUT /api/roadmaps/{id}` | owner or editor |
| `POST /api/roadmaps/{id}/share-links/{role}/rotate` | owner |
| `DELETE /api/roadmaps/{id}/share-links/{role}` | owner |

Public endpoints (no token required): `POST /api/roadmaps`, `POST /api/roadmaps/join`, `GET /api/roadmaps/{id}`, `GET /api/roadmaps/{id}/share-links`.

---

## Security notes

- **Session tokens enforced** — write endpoints verify `Authorization: Bearer` against hashed token in the database. Missing or invalid token returns 401; wrong role returns 403.
- **Short-lived tickets** — SSE connections use 30-second tickets to avoid exposing long-lived session tokens in URLs.
- **Optimistic Concurrency** — `PUT /api/roadmaps/{id}` accepts `last_updated_at`. Returns 409 if the database has a newer version.
- **Raw tokens never stored** — only SHA-256 hex digests are in the database. Even a full DB dump does not expose working invite tokens.
- **Passwords hashed** — PBKDF2-SHA256, 260,000 iterations, 16-byte random salt per password. Compared with `hmac.compare_digest`.
- **Body size limit** — requests larger than 512 KB are rejected with 413 before parsing.
- **Soft deletes** — roadmaps use `deleted_at` timestamp; no hard purge yet.
- **No rate limiting** — brute-force on invite tokens is possible. Add rate limiting before any public deployment.
