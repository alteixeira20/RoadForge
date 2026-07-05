# RoadForge — Backend Smoke Tests

Manual smoke guide for verifying the backend API after a fresh stack start, migration, or deployment. Run these steps top to bottom. Each step depends on state set by the previous one.

---

## Prerequisites

The Docker Compose stack must be running with migrations applied:

```bash
make reset          # Wipe DB, rebuild images, start API + Postgres + apply migrations
# OR, for an existing stack:
docker compose up --build -d api postgres
docker compose exec api alembic upgrade head
```

Confirm the API is reachable before proceeding:

```bash
curl -s http://localhost:7878/api/health
# → {"status":"ok","version":"0.1.0"}
```

Optional but recommended: install `jq` for readable JSON output and to extract fields inline.

Shell variables to set as you proceed through the steps:

```bash
ROADMAP_ID=
OWNER_TOKEN=
EDITOR_INVITE_URL=
EDITOR_TOKEN=
EDITOR_PID=
VIEWER_INVITE_URL=
```

These variables contain live credentials. Run the guide with shell tracing
disabled (`set +x`), do not paste the variable values into tickets or chat, and
finish with:

```bash
unset RESPONSE OWNER_TOKEN EDITOR_INVITE_URL EDITOR_RAW_TOKEN EDITOR_TOKEN
unset VIEWER_INVITE_URL JOIN_RESPONSE ROTATE_RESPONSE TICKET TICKET_RESPONSE
```

---

## Step 1 — Health check

```bash
curl -s http://localhost:7878/api/health | jq .
```

Expected:
```json
{"status": "ok", "version": "0.1.0"}
```

A non-200 response or connection refused means the API process is not ready.
This liveness response intentionally does not expose or verify PostgreSQL, Redis,
environment configuration, or worker topology. Check:

```bash
docker compose ps
docker compose logs --since 30m --tail=100 api postgres redis
docker compose exec postgres pg_isready -U roadforge -d roadforge
```

Then complete the realtime preflight below.

---

## Step 1b — Realtime deployment preflight

Inspect the configured backend and worker count:

```bash
docker compose exec api sh -c \
  'echo "backend=$ROADFORGE_REALTIME_BACKEND workers=$ROADFORGE_API_WORKERS"'
```

Expected:

- `memory` is valid only with exactly one worker and one API process/instance.
- More than one worker or API instance requires `redis`.
- In Redis mode, startup requires `REDIS_URL` and a successful Redis ping; the
  API must not silently fall back to memory.

For Redis mode, also confirm Redis health and check API startup logs:

```bash
docker compose exec redis redis-cli ping
docker compose logs --tail=40 api
```

Expected: `PONG`, `Application startup complete.`, and no Redis startup error.
The local service name is `redis`; hosting-bay uses `roadforge-redis`.

For a multi-worker staging check, complete
`docs/manual-qa.md` section `30b`. A health response alone does not prove
cross-worker event, ticket, lock, or rate-limit behavior.

---

## Step 2 — Create a roadmap

Extract `ROADMAP_ID` and `OWNER_TOKEN` from the response:

```bash
RESPONSE=$(curl -s -X POST http://localhost:7878/api/roadmaps \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Smoke Test Roadmap",
    "owner_display_name": "SmokeOwner",
    "phases": [],
    "password": null
  }')

echo "$RESPONSE" | jq '{
  id,
  name,
  share_roles: [.share_links[].role],
  owner_session_token_present: (.owner_session_token != null)
}'

ROADMAP_ID=$(echo "$RESPONSE" | jq -r '.id')
OWNER_TOKEN=$(echo "$RESPONSE" | jq -r '.owner_session_token')
EDITOR_INVITE_URL=$(echo "$RESPONSE" | jq -r '.share_links[] | select(.role == "editor") | .url')
VIEWER_INVITE_URL=$(echo "$RESPONSE" | jq -r '.share_links[] | select(.role == "viewer") | .url')

echo "ROADMAP_ID=$ROADMAP_ID"
test -n "$OWNER_TOKEN"
test -n "$EDITOR_INVITE_URL"
test -n "$VIEWER_INVITE_URL"
```

Expected:
- HTTP 201
- `id` starts with `rm_`
- `owner_session_token` starts with `sess_`
- Three entries in `share_links` with roles `owner`, `editor`, `viewer`
- `share_links[].url` contains `/join?token=`

---

## Step 3 — Fetch roadmap with owner token

```bash
curl -s http://localhost:7878/api/roadmaps/$ROADMAP_ID \
  -H "Authorization: Bearer $OWNER_TOKEN" | jq .
```

Expected:
- HTTP 200
- `id` matches `$ROADMAP_ID`
- `phases` is an empty array

---

## Step 4 — List share links

```bash
curl -s http://localhost:7878/api/roadmaps/$ROADMAP_ID/share-links \
  -H "Authorization: Bearer $OWNER_TOKEN" | jq .
```

Expected:
- HTTP 200
- Three entries sorted owner → editor → viewer
- Owner and editor `url` are `null` (raw tokens not stored for private links)
- Viewer `url` is the public read-only join URL

---

## Step 5 — Rotate editor link

Rotating generates a new invite token and returns the full join URL. The previous editor token is invalidated immediately.

```bash
ROTATE_RESPONSE=$(curl -s -X POST \
  "http://localhost:7878/api/roadmaps/$ROADMAP_ID/share-links/editor/rotate" \
  -H "Authorization: Bearer $OWNER_TOKEN")

echo "$ROTATE_RESPONSE" | jq '{
  role,
  is_active,
  rotated_at,
  url_present: (.url != null)
}'

EDITOR_INVITE_URL=$(echo "$ROTATE_RESPONSE" | jq -r '.url')
test -n "$EDITOR_INVITE_URL"
```

Expected:
- HTTP 200
- `role` is `editor`
- `url` is non-null and contains `/join?token=ed_`
- `rotated_at` is set to current time

---

## Step 6 — Join as editor

Extract the raw token from the invite URL and join:

```bash
EDITOR_RAW_TOKEN=$(echo "$EDITOR_INVITE_URL" | sed 's/.*token=//')

JOIN_RESPONSE=$(curl -s -X POST http://localhost:7878/api/roadmaps/join \
  -H 'Content-Type: application/json' \
  -d "{
    \"token\": \"$EDITOR_RAW_TOKEN\",
    \"display_name\": \"SmokeEditor\",
    \"password\": null
  }")

echo "$JOIN_RESPONSE" | jq '{
  roadmap_id,
  roadmap_name,
  role,
  participant_id,
  session_token_present: (.session_token != null)
}'

EDITOR_TOKEN=$(echo "$JOIN_RESPONSE" | jq -r '.session_token')
EDITOR_PID=$(echo "$JOIN_RESPONSE" | jq -r '.participant_id')

echo "EDITOR_PID=$EDITOR_PID"
test -n "$EDITOR_TOKEN"
```

Expected:
- HTTP 200
- `role` is `editor`
- `roadmap_id` matches `$ROADMAP_ID`
- `session_token` starts with `sess_`
- `participant_id` starts with `pt_`

---

## Step 7 — Editor update succeeds

An editor can update the roadmap name and phases:

```bash
CURRENT=$(curl -s http://localhost:7878/api/roadmaps/$ROADMAP_ID \
  -H "Authorization: Bearer $EDITOR_TOKEN" | jq -r '.updated_at')

curl -s -X PUT http://localhost:7878/api/roadmaps/$ROADMAP_ID \
  -H "Authorization: Bearer $EDITOR_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"name\": \"Smoke Test Roadmap (editor updated)\",
    \"phases\": [],
    \"last_updated_at\": \"$CURRENT\",
    \"change_summary\": {
      \"action\": \"roadmap.updated\",
      \"entity_type\": \"roadmap\"
    }
  }" | jq '{id, name, updated_at}'
```

Expected:
- HTTP 200
- `name` reflects the new value

---

## Step 8 — Owner-only actions rejected for non-owner roles

**Editor cannot list share links (403):**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:7878/api/roadmaps/$ROADMAP_ID/share-links \
  -H "Authorization: Bearer $EDITOR_TOKEN"
# → 403
```

**Editor cannot create a version checkpoint (403):**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST \
  http://localhost:7878/api/roadmaps/$ROADMAP_ID/versions/checkpoint \
  -H "Authorization: Bearer $EDITOR_TOKEN"
# → 403
```

**Editor cannot delete the roadmap (403):**

```bash
curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  http://localhost:7878/api/roadmaps/$ROADMAP_ID \
  -H "Authorization: Bearer $EDITOR_TOKEN"
# → 403
```

**No token returns 401:**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:7878/api/roadmaps/$ROADMAP_ID
# → 401
```

---

## Step 9 — Revoke participant then verify 401

```bash
# Revoke the editor participant
curl -s -o /dev/null -w "%{http_code}" -X POST \
  http://localhost:7878/api/roadmaps/$ROADMAP_ID/participants/$EDITOR_PID/revoke \
  -H "Authorization: Bearer $OWNER_TOKEN"
# → 204

# Revoked session returns 401
curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:7878/api/roadmaps/$ROADMAP_ID \
  -H "Authorization: Bearer $EDITOR_TOKEN"
# → 401
```

---

## Step 10 — Stale update conflict (409)

Simulate two clients diverging by saving with an outdated `last_updated_at`:

```bash
# First, get the current updated_at timestamp
CURRENT=$(curl -s http://localhost:7878/api/roadmaps/$ROADMAP_ID \
  -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '.updated_at')

# Perform a legitimate save to advance the server timestamp
curl -s -X PUT http://localhost:7878/api/roadmaps/$ROADMAP_ID \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"name\": \"After first save\",
    \"last_updated_at\": \"$CURRENT\"
  }" > /dev/null

# Now attempt a save with the old timestamp — this should conflict
curl -s -X PUT http://localhost:7878/api/roadmaps/$ROADMAP_ID \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"name\": \"Conflicting save\",
    \"last_updated_at\": \"$CURRENT\"
  }" | jq '{code: .code, detail: .detail}'
```

Expected:
- HTTP 409
- `code` is `"roadmap_conflict"`
- `conflict.server` contains the current server state

---

## Step 11 — Rate limit smoke note

The API has in-process rate limiting on several operations. To observe it:

```bash
# Attempt join with an invalid token repeatedly to trigger the IP-based join limit.
# Do not run this in a tight loop against production.
for i in $(seq 1 22); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    http://localhost:7878/api/roadmaps/join \
    -H 'Content-Type: application/json' \
    -d '{"token": "invalid_token_smoke_test"}')
  echo "Attempt $i: $STATUS"
done
```

Expected: HTTP 401 for the first ~20 attempts, then HTTP 429 with `{"detail":"Too many requests. Try again later."}` and a `Retry-After` header.

Do not run rapid-fire rate limit tests against production or shared staging environments.

---

## Step 12 — SSE event ticket smoke

```bash
# Request a ticket (requires a valid session)
TICKET_RESPONSE=$(curl -s -X POST \
  http://localhost:7878/api/roadmaps/$ROADMAP_ID/events/ticket \
  -H "Authorization: Bearer $OWNER_TOKEN")

TICKET=$(echo "$TICKET_RESPONSE" | jq -r '.ticket')
echo "$TICKET_RESPONSE" | jq '{expires_in, ticket_present: (.ticket != null)}'
test -n "$TICKET"
```

Expected:
- HTTP 200
- `ticket` is a non-empty string
- `expires_in` is 30

Open the SSE stream in a background process (Ctrl+C to stop):

```bash
curl -s "http://localhost:7878/api/roadmaps/$ROADMAP_ID/events?ticket=$TICKET" &
SSE_PID=$!

# Trigger an event by saving
CURRENT=$(curl -s http://localhost:7878/api/roadmaps/$ROADMAP_ID \
  -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '.updated_at')

curl -s -X PUT http://localhost:7878/api/roadmaps/$ROADMAP_ID \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"name\": \"SSE trigger test\",
    \"last_updated_at\": \"$CURRENT\"
  }" > /dev/null

sleep 2
kill $SSE_PID 2>/dev/null
```

Expected: the SSE stream emits an event block in the following format:

```
event: roadmap.updated
data: {"roadmap_id":"rm_...","updated_at":"...","participant_id":"p_..."}
```

Reusing a consumed ticket returns 401:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:7878/api/roadmaps/$ROADMAP_ID/events?ticket=$TICKET"
# → 401
```

---

## Step 13 — Migration drift check

Verify that all Alembic migrations have been applied and no pending upgrades exist:

```bash
make api-check
```

`make api-check` starts the `postgres` container automatically (bounded 30 s wait) and then runs `alembic check` in a one-off api container. The long-running `api` service does not need to be running. If the full stack is already up, use the faster variant instead:

```bash
make api-check-fast
```

`make api-check-fast` runs `alembic check` directly against the already-running `api` container. It does no Docker preparation.

Expected output: `No new upgrade operations detected.`

Any other output indicates a pending migration. Run `make migrate` or `docker compose exec api alembic upgrade head` to apply.

---

## Step 14 — API tests

```bash
make api-test
```

This runs the backend pytest suite. Locally, `make api-test` automatically starts the `postgres` container and creates the `roadforge_test` database if missing — no manual Docker setup required. Use `make api-test-fast` to skip Docker preparation when the database is already running (the default for CI). All tests must pass. Failures here should be resolved before any deployment.

---

## Step 15 — Dependency audit

```bash
make api-audit
```

This runs the Python runtime dependency audit via pip-audit. pip-audit fails on any reported vulnerability unless it is explicitly suppressed. JS audit severity thresholds are documented separately in `docs/security/dependency-audit-policy.md`.
