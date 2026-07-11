# RoadForge — Backend API Reference

## Base URLs

| Environment | URL |
|---|---|
| Local (Docker) | `http://localhost:7878` |
| Production | `https://roadforge.anvilary.tools` |

All endpoints are under `/api/`. All request and response bodies are JSON.

---

## Auth model

Write endpoints and all roadmap data endpoints require a session token in the `Authorization` header:

```
Authorization: Bearer sess_<raw_session_token>
```

Session tokens are returned once at roadmap creation (`owner_session_token`) or invite join (`session_token`). Store them client-side in `localStorage`; they cannot be recovered from the API.

Sessions expire after 30 days of inactivity. Successful authenticated requests validate expiry and renew `session_expires_at`/`last_seen_at` when the participant presence timestamp is stale, reducing repeated GET write pressure.

**Roles:** `owner`, `editor`, `viewer`

- `owner` — full control: update, delete, task state, tags, share link management, participant revocation, version history, checkpoints, restore, and locks.
- `editor` — can update roadmap content and task state, manage tags, read participant summaries and version history, create replacement-safety checkpoints, and acquire/release locks.
- `viewer` — read-only access to roadmap data, tags, activity, locks, and SSE streams.

**Invite token join flow:**
1. Owner creates a roadmap (`POST /api/roadmaps`) and receives three share link URLs, one per role.
2. A recipient opens the URL, which embeds a raw invite token.
3. The recipient calls `POST /api/roadmaps/join` with that token, an optional display name, and an optional password if the roadmap is password-protected.
4. The response includes a session token and participant ID. The client stores both in `localStorage` under scoped keys.

Token prefixes are non-secret role hints only:
- `ow_…` — owner invite
- `ed_…` — editor invite
- `vi_…` — viewer invite
- `sess_…` — participant session

---

## Common response codes

| Code | Meaning |
|---|---|
| `200 OK` | Request succeeded with a JSON body |
| `201 Created` | Resource created (POST /api/roadmaps) |
| `204 No Content` | Request succeeded with no body |
| `400 Bad Request` | Invalid request semantics (e.g., revoking your own session) |
| `401 Unauthorized` | Missing, invalid, expired, or revoked session token |
| `403 Forbidden` | Token is valid but role is insufficient |
| `404 Not Found` | Roadmap, share link, participant, or version not found |
| `409 Conflict` | Stale update (optimistic concurrency check failed) or lock held by another participant |
| `413 Request Entity Too Large` | Request body exceeds 512 KB |
| `422 Unprocessable Entity` | Validation error (bad field type, value out of range, invalid role) |
| `429 Too Many Requests` | Rate limit exceeded; includes `Retry-After` header |

All errors use FastAPI's default shape:
```json
{"detail": "Human-readable error message"}
```

---

## Authorization table

| Endpoint | Required role |
|---|---|
| `GET /api/roadmaps/{id}` | owner, editor, or viewer |
| `PUT /api/roadmaps/{id}` | owner or editor |
| `PATCH /api/roadmaps/{id}/tasks/{task_id}` | owner or editor |
| `PATCH /api/roadmaps/{id}/tasks/{task_id}/done` | owner or editor |
| `PATCH /api/roadmaps/{id}/tasks/{task_id}/claim` | owner or editor |
| `DELETE /api/roadmaps/{id}/tasks/{task_id}/claim` | owner or editor |
| `DELETE /api/roadmaps/{id}` | owner |
| `GET /api/roadmaps/{id}/share-links` | owner |
| `POST /api/roadmaps/{id}/share-links/{role}/rotate` | owner |
| `DELETE /api/roadmaps/{id}/share-links/{role}` | owner |
| `GET /api/roadmaps/{id}/participants` | owner or editor |
| `POST /api/roadmaps/{id}/participants/{pid}/revoke` | owner |
| `GET /api/roadmaps/{id}/versions` | owner or editor |
| `POST /api/roadmaps/{id}/versions/checkpoint` | owner or editor |
| `GET /api/roadmaps/{id}/versions/{vid}` | owner or editor |
| `POST /api/roadmaps/{id}/versions/{vid}/restore` | owner |
| `GET /api/roadmaps/{id}/activity` | owner, editor, or viewer |
| `POST /api/roadmaps/{id}/events/ticket` | owner, editor, or viewer |
| `GET /api/roadmaps/{id}/events` | ticket auth (query param) |
| `POST /api/roadmaps/{id}/locks` | owner or editor |
| `DELETE /api/roadmaps/{id}/locks/{target}` | owner or editor (lock owner only) |
| `GET /api/roadmaps/{id}/locks` | owner, editor, or viewer |
| `GET /api/roadmaps/{id}/tags` | owner, editor, or viewer |
| `POST /api/roadmaps/{id}/tags` | owner or editor |
| `PUT /api/roadmaps/{id}/tags/{tag_id}` | owner or editor |
| `DELETE /api/roadmaps/{id}/tags/{tag_id}` | owner or editor |

Public endpoints (no token required): `GET /api/health`, `POST /api/roadmaps`, `POST /api/roadmaps/join`.

---

## Endpoints

### GET /api/health

Health check. No auth, no body.

**Response 200:**
```json
{"status": "ok", "version": "0.1.0"}
```

---

### POST /api/roadmaps

Create a new roadmap. Returns the roadmap object, three share link URLs (one per role), and the owner's session token. Raw owner/editor invite tokens are never returned again — the only subsequent way to recover them is to rotate via `POST …/share-links/{role}/rotate`. Viewer tokens may be returned again from the share-link listing as a stable public read-only URL.

Rate-limited: 10 creates per IP per hour.

**Request:**
```json
{
  "name": "v1.0 Public Launch",
  "owner_display_name": "Ada",
  "phases": [],
  "tag_registry": [],
  "password": null,
  "change_summary": null
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `name` | string | yes | 1–120 chars |
| `owner_display_name` | string | yes | 1–128 chars |
| `phases` | array | no | max 50 phases (see Phase shape) |
| `tag_registry` | array or null | no | max 200 unique tag definitions |
| `password` | string or null | no | 6–128 chars; enables password gate on join |
| `change_summary` | object or null | no | overrides the first activity log entry; useful for import-on-create flows |

`change_summary` example for an import-triggered create:
```json
{
  "action": "roadmap.imported",
  "entity_type": "roadmap",
  "phase_count": 11,
  "task_count": 77
}
```

**Response 201:**
```json
{
  "id": "rm_abc123",
  "name": "v1.0 Public Launch",
  "owner_display_name": "Ada",
  "schema_version": "1.0",
  "phases": [],
  "tag_registry": [],
  "is_password_enabled": false,
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

`owner_session_token` is returned once. Store it; it cannot be recovered.

---

### POST /api/roadmaps/join

Accept an invite token. Creates a `Participant` row and issues a session token. The raw session token appears only in this response.

Rate-limited: 20 join attempts per IP per minute; 30 per share link per 10 minutes. Password failures are limited separately: 5 per IP+link per 10 minutes, 30 per link per hour.

**Request:**
```json
{
  "token": "ed_<raw_invite_token>",
  "display_name": "Jordan",
  "password": null
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `token` | string | yes | min 8 chars; the raw token from the join URL |
| `display_name` | string or null | no | max 128 chars; omitting assigns a role default ("Guest Editor", etc.) |
| `password` | string or null | no | required when `is_password_enabled` is true on the roadmap |

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
- `"Invalid or expired invite token"` — token not found, share link inactive, or roadmap soft-deleted.
- `"Invalid invite token or password"` — roadmap has password enabled and the supplied password is wrong or absent.

The 401 message does not indicate which check failed.

---

### GET /api/roadmaps/{roadmap_id}

Fetch a roadmap with its current phase snapshot.

**Auth:** Any authenticated participant (owner, editor, or viewer).

**Response 200:**
```json
{
  "id": "rm_abc123",
  "name": "v1.0 Public Launch",
  "owner_display_name": "Ada",
  "schema_version": "1.0",
  "phases": [ ... ],
  "tag_registry": [ ... ],
  "is_password_enabled": false,
  "created_at": "2026-05-08T10:00:00Z",
  "updated_at": "2026-05-08T10:15:00Z"
}
```

**Response 401:** Token missing, invalid, expired, or revoked.

**Response 404:** Roadmap not found or soft-deleted.

---

### PUT /api/roadmaps/{roadmap_id}

Update the roadmap name, phases, and/or tag registry. These fields are optional; omit
one to leave it unchanged. Phase and tag-registry updates replace their full arrays.

**Auth:** owner or editor.

**Request:**
```json
{
  "name": "v1.1 Preview",
  "phases": [ ... ],
  "tag_registry": [ ... ],
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

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string or null | no | 1–120 chars |
| `phases` | array or null | no | full snapshot replacement |
| `tag_registry` | array or null | no | full tag-registry replacement |
| `last_updated_at` | ISO datetime | yes | optimistic concurrency timestamp; returns 409 if server is strictly newer |
| `change_summary` | object or null | no | customizes the activity log entry; if provided, `action` must be in the backend allowlist |

Batch `change_summary` example:
```json
{
  "change_summary": {
    "action": "roadmap.batch_changed",
    "entity_type": "roadmap",
    "changes": [
      {
        "action": "task.created",
        "entity_type": "task",
        "entity_id": "RF-302",
        "taskTitle": "Remove stale export paths"
      }
    ],
    "counts": {
      "tasks_added": 1,
      "phases_completed": 1
    }
  }
}
```

**Response 200:** Same shape as `GET /api/roadmaps/{roadmap_id}`.

**Response 409 — stale update conflict:**
```json
{
  "detail": "Roadmap was updated by another session",
  "code": "roadmap_conflict",
  "conflict": {
    "roadmap_id": "rm_abc123",
    "server_updated_at": "2026-05-08T10:20:00Z",
    "client_last_updated_at": "2026-05-08T10:00:00Z",
    "server": {
      "name": "v1.0 Public Launch",
      "phases": [ ... ]
    },
    "summary": {
      "phase_count": 3,
      "task_count": 12,
      "phase_ids": [],
      "task_ids": ["RF-301"]
    }
  }
}
```

`summary.phase_ids` and `summary.task_ids` list IDs present in one version but not the other (symmetric difference).

**Response 404:** Roadmap not found.

---

### PATCH /api/roadmaps/{roadmap_id}/tasks/{task_id}

Update one or more editable task planning fields without replacing the full roadmap
snapshot. Supported fields are `title`, `desc`, `est`, `assignees`, `tags`, and
credential-free `links`. The write uses optimistic concurrency, records a
`task.updated` activity entry, synchronizes the relational projection, and publishes
a `roadmap.updated` event when a field changes.

**Auth:** owner or editor.

**Request:**
```json
{
  "title": "Document Markdown export",
  "est": "2h",
  "assignees": ["Ada"],
  "tags": ["docs"],
  "links": [],
  "last_updated_at": "2026-05-08T10:00:00Z"
}
```

At least one editable task field is required. `title` and `links` cannot be null.
`last_updated_at` is required; a newer server roadmap returns the same structured
409 conflict shape as `PUT /api/roadmaps/{roadmap_id}`. A no-op patch returns the
current roadmap without creating activity or publishing an event.

**Response 200:** Same shape as `GET /api/roadmaps/{roadmap_id}`.

**Response 404:** Task not found.

**Response 422:** No editable field supplied or a field fails validation.

---

### PATCH /api/roadmaps/{roadmap_id}/tasks/{task_id}/done

Set one task's completion state without replacing the full roadmap snapshot. Completing
a task clears its active claim. The response includes the updated roadmap and a
`roadmap.updated` event is published.

**Auth:** owner or editor.

**Request:**
```json
{
  "done": true,
  "last_updated_at": "2026-05-08T10:00:00Z"
}
```

`last_updated_at` is required. A server roadmap newer than this timestamp returns the
same structured 409 conflict shape as `PUT /api/roadmaps/{roadmap_id}`.

**Response 200:** Same shape as `GET /api/roadmaps/{roadmap_id}`.

**Response 404:** Task not found.

---

### PATCH /api/roadmaps/{roadmap_id}/tasks/{task_id}/claim

Claim an incomplete task for the current participant. The task records the
participant display name, participant ID, and claim timestamp.

**Auth:** owner or editor.

**Query parameter:** `override=true` allows an owner to replace another
participant's existing claim. Editors cannot override claims.

**Response 200:** Same shape as `GET /api/roadmaps/{roadmap_id}`.

**Response 400:** Task is complete.

**Response 409:** Task is already claimed by another participant.

**Response 404:** Task not found.

---

### DELETE /api/roadmaps/{roadmap_id}/tasks/{task_id}/claim

Release the current participant's task claim.

**Auth:** owner or editor.

**Query parameter:** `override=true` allows an owner to clear another participant's
claim. Editors can clear only their own claims.

**Response 200:** Same shape as `GET /api/roadmaps/{roadmap_id}`. Releasing an
already-unclaimed task is idempotent.

**Response 409:** The task is claimed by another participant and no valid owner
override was supplied.

**Response 404:** Task not found.

---

### DELETE /api/roadmaps/{roadmap_id}

Soft-delete a roadmap. Sets `deleted_at`. Deactivates all share links. Broadcasts a `roadmap.deleted` SSE event to connected participants.

**Auth:** owner only.

**Response 200:**
```json
{"ok": true}
```

**Response 404:** Roadmap not found.

---

### GET /api/roadmaps/{roadmap_id}/share-links

List share links for a roadmap. Owner/editor `url` is always `null` in this listing — private invite URLs are only returned at create or rotate time. Active viewer links include a public `url` so owners can re-copy the stable read-only demo link.

Links are sorted owner → editor → viewer.

**Auth:** owner only.

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
]
```

Inactive links are returned with `is_active: false` and `url: null`.

**Response 404:** Roadmap not found.

---

### POST /api/roadmaps/{roadmap_id}/share-links/{role}/rotate

Generate a new invite token for the given role. Invalidates the previous token immediately. Returns the new join URL with the raw token embedded. For owner/editor links, this is the only time the new token is accessible. Active viewer links remain copyable from the share-link listing.

`role` must be `owner`, `editor`, or `viewer`. Other values return 422.

Rate-limited: 5 rotations per participant per roadmap per role per minute.

**Auth:** owner only.

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

### DELETE /api/roadmaps/{roadmap_id}/share-links/{role}

Revoke a share link. Sets `is_active` to `false`. Any join attempt with the old token returns 401. Existing participant sessions that joined via this link are not terminated.

Rate-limited: 10 revocations per participant per roadmap per role per minute.

**Auth:** owner only.

**Response 204:** No content.

**Response 404:** Roadmap not found, or no active share link for that role.

---

### GET /api/roadmaps/{roadmap_id}/participants

List participants for a roadmap. Owners receive the full participant/session
projection, including revoked participants. Editors receive active participants only,
with the reduced fields needed for collaborator and assignee suggestions. Viewers are
forbidden.

**Auth:** owner or editor.

**Response 200:**
```json
[
  {
    "id": "pt_def456",
    "display_name": "Jordan",
    "role": "editor",
    "created_at": "2026-05-08T10:05:00Z",
    "last_seen_at": "2026-05-08T14:00:00Z",
    "session_expires_at": "2026-06-07T14:00:00Z",
    "revoked_at": null,
    "is_current_participant": false,
    "share_link_id": "sl_yzw",
    "joined_via_role": "editor",
    "access_source_label": "Editor link"
  }
]
```

`is_current_participant` is `true` for the participant matching the caller's session token. `access_source_label` is `"Legacy / unknown link"` if the share link was rotated or revoked after the participant joined.

**Editor response 200:**
```json
[
  {
    "id": "pt_def456",
    "display_name": "Jordan",
    "role": "editor",
    "is_current_participant": true
  }
]
```

Editor responses omit timestamps, expiry/revocation state, and share-link metadata.
Revoked participants are excluded.

**Response 404:** Roadmap not found.

---

### POST /api/roadmaps/{roadmap_id}/participants/{participant_id}/revoke

Revoke a participant's session. All subsequent authenticated requests from that participant return 401. Broadcasts a `participant.revoked` SSE event. Does not prevent the participant from re-joining via an active share link.

**Auth:** owner only.

**Response 204:** No content.

**Response 400:** `"Cannot revoke your own owner session"` — owners cannot revoke themselves.

**Response 404:** Participant not found or already revoked.

---

### GET /api/roadmaps/{roadmap_id}/versions

List version history summaries, newest first. Versions are saved automatically on version-worthy actions (roadmap created, imported, restored, or manual checkpoint). Routine `roadmap.updated` saves do not create version entries unless the snapshot differs from the last recorded version.

Up to 100 versions are retained; the oldest are pruned when the limit is exceeded.

**Auth:** owner or editor.

**Response 200:**
```json
[
  {
    "id": "rv_abc123",
    "version_number": 5,
    "created_at": "2026-05-08T14:00:00Z",
    "actor_name": "Ada",
    "action": "roadmap.checkpoint",
    "phase_count": 3,
    "task_count": 12
  }
]
```

---

### POST /api/roadmaps/{roadmap_id}/versions/checkpoint

Create a manual checkpoint. If the current snapshot already matches the latest version, returns the existing version with `created: false` (idempotent guard against double-click).

**Auth:** owner or editor. The editor UI uses this only as the safety gate before replacing a synced roadmap.

**Response 200:**
```json
{
  "created": true,
  "version": {
    "id": "rv_abc124",
    "version_number": 6,
    "created_at": "2026-05-08T15:00:00Z",
    "actor_name": "Ada",
    "action": "roadmap.checkpoint",
    "phase_count": 3,
    "task_count": 12
  }
}
```

When `created` is `false`, `version` contains the existing latest entry unchanged.

---

### GET /api/roadmaps/{roadmap_id}/versions/{version_id}

Fetch a specific version's full phase snapshot.

**Auth:** owner or editor.

**Response 200:**
```json
{
  "id": "rv_abc123",
  "version_number": 5,
  "roadmap_name": "v1.0 Public Launch",
  "phases": [ ... ],
  "created_at": "2026-05-08T14:00:00Z",
  "actor_name": "Ada",
  "action": "roadmap.checkpoint",
  "phase_count": 3,
  "task_count": 12,
  "metadata_json": null
}
```

**Response 404:** Version not found for this roadmap.

---

### POST /api/roadmaps/{roadmap_id}/versions/{version_id}/restore

Restore the roadmap to a previous version. Replaces the current phases with the version snapshot, creates a new `roadmap.restored` version entry, and broadcasts `roadmap.updated` to all connected SSE participants.

**Auth:** owner only.

**Response 200:** Same shape as `GET /api/roadmaps/{roadmap_id}`.

**Response 404:** Version not found for this roadmap.

---

### GET /api/roadmaps/{roadmap_id}/activity

Paginated activity log, newest first.

**Auth:** owner, editor, or viewer.

**Query parameters:**
- `limit` — integer, 1–200, default 100
- `offset` — integer, default 0

**Response 200:**
```json
{
  "logs": [
    {
      "id": "al_123",
      "roadmap_id": "rm_abc123",
      "participant_id": "pt_def456",
      "actor_name": "Ada",
      "action": "roadmap.updated",
      "entity_type": "roadmap",
      "entity_id": "rm_abc123",
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

### POST /api/roadmaps/{roadmap_id}/events/ticket

Request a short-lived ticket to open an SSE stream. The ticket is consumed once when the stream is opened and expires 30 seconds after issue.

SSE uses a ticket instead of a Bearer header because EventSource in browsers does not support custom headers.

Rate-limited: 10 tickets per participant per roadmap per minute; 60 per IP per roadmap per minute.

**Auth:** owner, editor, or viewer.

**Response 200:**
```json
{
  "ticket": "cryptographic_random_ticket_value",
  "expires_in": 30
}
```

---

### GET /api/roadmaps/{roadmap_id}/events

Open the SSE event stream. Authenticates using the one-time ticket. The ticket is consumed on first connection; reuse returns 401.

**Auth:** query parameter `?ticket={ticket}` (consumed on connect).

**Response:** `text/event-stream`

**Event types:**

| Event | Payload fields |
|---|---|
| `roadmap.updated` | `roadmap_id`, `updated_at`, `participant_id` |
| `roadmap.deleted` | `roadmap_id`, `updated_at`, `participant_id` |
| `participant.revoked` | `roadmap_id`, `participant_id`, `revoked_at` |
| `lock.acquired` | `roadmap_id`, `target`, `participant_id`, `display_name` |
| `lock.released` | `roadmap_id`, `target`, `participant_id` |

**Response 401:** `"Invalid or expired event ticket"` — ticket not found, already consumed, or expired.

---

### POST /api/roadmaps/{roadmap_id}/locks

Acquire or refresh an in-memory edit lock on a target string. A participant can refresh their own lock by re-posting the same target. Returns 409 if the target is already locked by a different participant.

Targets are arbitrary strings matching `^[a-zA-Z0-9:\-_.]+$`, max 160 chars. Convention: `task:RF-01`, `phase:p1`.

**Auth:** owner or editor.

**Request:**
```json
{"target": "task:RF-01"}
```

**Response 200:**
```json
{
  "roadmap_id": "rm_abc123",
  "target": "task:RF-01",
  "participant_id": "pt_def456",
  "display_name": "Jordan",
  "expires_at": "2026-05-08T12:00:30Z"
}
```

**Response 409:** `"Target is locked by another participant"`

---

### DELETE /api/roadmaps/{roadmap_id}/locks/{target}

Release a lock. Only the participant who holds the lock can release it. Broadcasts `lock.released` to SSE subscribers.

**Auth:** owner or editor.

**Response 204:** No content.

---

### GET /api/roadmaps/{roadmap_id}/locks

List all active locks for a roadmap.

**Auth:** owner, editor, or viewer.

**Response 200:**
```json
[
  {
    "roadmap_id": "rm_abc123",
    "target": "task:RF-01",
    "participant_id": "pt_def456",
    "display_name": "Jordan",
    "expires_at": "2026-05-08T12:00:30Z"
  }
]
```

---

### GET /api/roadmaps/{roadmap_id}/tags

List the roadmap's tag registry.

**Auth:** owner, editor, or viewer.

**Response 200:**
```json
[
  {
    "id": "planning",
    "label": "Planning",
    "color": "#f97316",
    "createdAt": "2026-05-08T10:00:00Z",
    "updatedAt": "2026-05-08T10:00:00Z"
  }
]
```

---

### POST /api/roadmaps/{roadmap_id}/tags

Create a tag. `id` is optional; when omitted, the server generates a unique ID from
the label.

**Auth:** owner or editor.

**Request:**
```json
{
  "id": "planning",
  "label": "Planning",
  "color": "#f97316",
  "last_updated_at": "2026-05-08T10:00:00Z"
}
```

**Response 201:** Updated roadmap response.

**Response 409:** Stale roadmap, duplicate ID, or duplicate label.

---

### PUT /api/roadmaps/{roadmap_id}/tags/{tag_id}

Update a tag label and/or color. Send `color: null` to remove the color.

**Auth:** owner or editor.

**Request:**
```json
{
  "label": "Product planning",
  "color": null,
  "last_updated_at": "2026-05-08T10:00:00Z"
}
```

**Response 200:** Updated roadmap response.

**Response 404:** Tag not found.

**Response 409:** Stale roadmap or duplicate label.

---

### DELETE /api/roadmaps/{roadmap_id}/tags/{tag_id}

Delete an unused tag.

**Auth:** owner or editor.

**Query parameter:** required ISO datetime `last_updated_at`.

**Response 200:** Updated roadmap response.

**Response 404:** Tag not found.

**Response 409:** Stale roadmap or tag is still used by a task.

---

## Phase and Task shape

Phases and tasks are stored as a JSON snapshot. The shape mirrors `apps/web/src/types/roadmap.ts`.

```
Phase
  id        string              e.g. "p1"
  num       string              display number, e.g. "01"
  name      string              max 120 chars
  color     string              hex color, max 64 chars
  status    "done" | "active" | "next" | "future"
  progress  integer             0–100
  tasks     Task[]              max 200 tasks per phase

Task
  id        string              e.g. "RF-01", max 80 chars
  title     string              max 160 chars
  done      boolean
  next      boolean | null
  est       string | null       e.g. "2d", "1w", max 64 chars
  assignees string[] | null     task-local names (not participants), max 20 items
  tags      string[] | null     max 20 items, each max 40 chars
  deps      string[] | null     task IDs this task depends on, max 50 items
  desc      string | null       max 5000 chars
  parentId  string | null       ID of parent task, max 80 chars
  claimedBy string | null       claim owner display name
  claimedById string | null     claim owner participant ID
  claimedAt string | null       ISO timestamp for the claim
  links     TaskExternalLink[] | null  credential-free external references, max 20

TaskExternalLink
  id        string              stable RoadForge-local ID, max 80 chars
  provider  "github" | "url"
  kind      "issue" | "pull" | "discussion" | "commit" | "release" | "url"
  url       string              normalized HTTP(S) URL, max 2048 chars
  owner     string | null       GitHub owner
  repo      string | null       GitHub repository
  number    integer | null      issue, pull request, or discussion number
  sha       string | null       commit SHA
  tag       string | null       release tag
  label     string | null       optional display label
```

Max 50 phases per roadmap. All text fields are server-sanitized (control characters stripped; suspiciously long values rejected).
Task links never contain credentials or fetched GitHub metadata. See
[Task External Links](architecture/task-external-links.md) for source-of-truth
and normalization rules.

Client compatibility: the browser auto-upgrades older local or server snapshots before rendering. Repairs include null booleans and arrays, legacy `owner:` / `review:` assignment tags migrated to `assignees`, recomputed progress, and stale dependency/parent references. This is client-side handling only; there is no backend import endpoint.

---

## Security notes

- **Session tokens** — write endpoints and roadmap read endpoints require `Authorization: Bearer`. Missing or invalid token returns 401; wrong role returns 403.
- **Token storage** — owner/editor invite tokens are stored only as SHA-256 hex digests. Viewer tokens may be stored while active because they are public read-only demo links.
- **Short-lived SSE tickets** — SSE connections use 30-second one-time tickets to avoid exposing session tokens in URLs or server logs.
- **Optimistic concurrency** — `PUT /api/roadmaps/{id}` requires `last_updated_at`. Returns 409 with the server's current snapshot if the database is strictly newer.
- **Password hashing** — PBKDF2-SHA256, 260,000 iterations, 16-byte random salt per password. Compared with `hmac.compare_digest`.
- **Body size limit** — requests larger than 512 KB are rejected with 413 before parsing. This is enforced in-app for both declared `Content-Length` bodies and streamed/chunked bodies that omit `Content-Length` (the latter is tallied per ASGI message and aborted as soon as the running total exceeds the limit, without buffering the full body). Self-hosters running without a reverse proxy are still protected; a body-limiting proxy remains useful as defense-in-depth.
- **Soft deletes** — roadmaps use `deleted_at` timestamp; hard purge is not yet implemented.
- **Rate limiting** — in-process; shared across workers only when `ROADFORGE_REALTIME_BACKEND=redis`. Rate-limited operations include: roadmap create, join, password failures, share link rotate/revoke, SSE ticket requests, checkpoints, and authenticated sensitive read paths.

---

## Import/export note

RoadForge's JSON import and export run entirely in the browser. There are no backend import or export endpoints for JSON, Markdown, or PDF.

Import accepts the current `roadforge.roadmap.import` and
`roadforge.roadmap.export` schema IDs plus the legacy
`anvilary.roadmap.import` and `anvilary.roadmap.export` IDs. Legacy IDs remain
supported for existing roadmap files. New exports currently retain
`anvilary.roadmap.export` for compatibility with older RoadForge deployments.

---

## Deployment notes

- Releases at or after `apps/api/alembic/versions/0005_add_public_viewer_tokens.py` must run `make migrate` / `alembic upgrade head`. That migration adds storage for active public viewer tokens.
- Running multiple Uvicorn workers requires `ROADFORGE_REALTIME_BACKEND=redis`.
  Application and container startup refuse `ROADFORGE_API_WORKERS > 1` in
  memory mode. Redis mode also requires `REDIS_URL` and a successful startup
  ping. Multiple one-worker API instances must not use memory mode.
