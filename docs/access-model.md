# RoadForge — Access Model

RoadForge is accountless. There are no user records, no login flow, and no email-based identity. Access to a roadmap is controlled entirely by invite links and, optionally, a roadmap password.

---

## Invite link model

When a roadmap is created, the backend generates three share links — one per role:

| Role | Description |
|---|---|
| `owner` | Full control: manage settings, share links, and members |
| `editor` | Can edit phases, tasks, and dependencies |
| `viewer` | Read-only; can see everything but cannot change anything |

Each link is a URL of the form:

```
http://localhost:3000/join?token=ed_<43-char-random-token>
```

**Security properties:**
- The raw token is generated with `secrets.token_urlsafe(32)` and only returned in the HTTP response at creation or rotation time. It is never stored raw — only a SHA-256 hex digest is persisted in the database.
- Once a link is rotated or revoked, the old token hash is overwritten. Old links immediately stop working.
- `GET /api/roadmaps/{id}/share-links` returns `url: null` — the join URL is only available at create/rotate time.

The invite link is the durable access handle. Losing it means losing that role's access path (until the owner rotates a new one).

---

## Password gate

A roadmap can optionally require a password for joining.

- Password is set at creation time via `POST /api/roadmaps` with the `password` field (min 6 characters).
- Stored as a PBKDF2-SHA256 hash (260,000 iterations, 16-byte random salt, `hashlib.pbkdf2_hmac`). Compared with `hmac.compare_digest` for timing safety.
- At join time, the backend checks `is_password_enabled` on the roadmap. If true, the supplied password is verified before a session token is issued.
- A wrong or missing password returns `401 Unauthorized` with `"Invalid invite token or password"`. The error message does not indicate which was wrong.

---

## Optional display name

The `display_name` field in `POST /api/roadmaps/join` is optional. If omitted or blank:
- Backend assigns a role-based default: `"Guest Owner"`, `"Guest Editor"`, or `"Guest Viewer"`.
- The name is stored on the `Participant` row and used only as a collaboration label.
- It has no security significance and is not validated for uniqueness.

---

## Local session token

After creating or joining a roadmap, the frontend receives an opaque session token:
- **Create:** `owner_session_token` in `POST /api/roadmaps` response
- **Join:** `session_token` in `POST /api/roadmaps/join` response

The token is:
- Generated with `secrets.token_urlsafe(32)` prefixed with `sess_`
- Stored as a SHA-256 hex hash on the `Participant` row
- Returned once in the response and never re-exposed
- Stored in `localStorage` under key `rf:sessionToken`

**Enforcement:** Accountless access does not mean unauthenticated writes. The session token is stored in `localStorage` and must be sent in the `Authorization: Bearer <session_token>` header for all protected write operations:
- `PUT /api/roadmaps/{id}` — requires **owner** or **editor** role.
- `POST /api/roadmaps/{id}/share-links/{role}/rotate` — requires **owner** role.
- `DELETE /api/roadmaps/{id}/share-links/{role}` — requires **owner** role.

The backend verifies the token hash and validates the participant's role before processing the request.

---

## Realtime sync and locks

RoadForge uses Server-Sent Events (SSE) for real-time collaboration.

- **Sync:** When a participant saves a roadmap, all other connected participants receive a `roadmap.updated` event and automatically re-fetch the latest state.
- **Tickets:** SSE connections do not send long-lived session tokens in the URL. Instead, they use 30-second single-use tickets obtained via a Bearer-authenticated POST request.
- **Soft Locks:** To prevent edit collisions, RoadForge uses in-memory "soft locks" (30s TTL). When a user expands a task, the frontend acquires a lock. Other users see the task as "Editing by X" and have their inputs disabled.
- **Concurrency:** `PUT` requests use optimistic concurrency control. If the roadmap has been updated on the server since the client last fetched it, the save is rejected with a `409 Conflict`.

---

## What is intentionally not present

| Feature | Decision |
|---|---|
| User accounts | Not planned for MVP. The invite link is the access primitive. |
| Login / password reset | No accounts means no login. |
| Email collection | No emails are collected or stored. |
| User dashboard | No concept of "your roadmaps" — users navigate via saved links. |
| No accounts / OAuth | RoadForge has no user-account login or OAuth provider. Protected write endpoints still require a bearer session token. |
| Email verification codes | Deferred future security layer (see below). |

---

## Future: optional email verification code

A planned optional security layer (not in MVP):

1. Owner enables email-code verification for a roadmap.
2. When a joiner presents an invite token, the backend sends a one-time code to their email.
3. The joiner enters the code; on success, a session token is issued.

This adds a second factor without requiring accounts. It is purely opt-in per roadmap.

**Status:** Not designed, not implemented. Do not add this without explicit instruction.

---

## Security caveats for MVP

- **Opaque IDs** — Roadmap IDs are opaque (`rm_` prefix + random) but not secret. Access to data requires an active session or a valid invite token.
- **No rate limiting** — brute-force on invite tokens is not throttled.
- **No HTTPS enforcement** — the Docker setup serves plain HTTP. Production deployment must terminate TLS at a reverse proxy and configure HSTS.
- **Tokens in URLs** — invite tokens appear in the URL query string and may be logged by proxies or browsers. Self-hosters should configure reverse proxy logs to exclude query strings or strictly control log access.
- **Soft deletes only** — `Roadmap.deleted_at` is set on delete; no hard purge yet.
- **No development server exposure** — `next dev` (or `make dev`) should never be exposed publicly. Use a production build for hosting.
- **Content Security Policy** — RoadForge currently lacks a CSP. Implementing a strict CSP is a critical requirement before public open-source release to protect `localStorage` tokens.
