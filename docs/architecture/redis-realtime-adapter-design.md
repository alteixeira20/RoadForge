# Redis Realtime Adapter Design

Status: proposed design for RF-880 with RF-881 infrastructure/config now added. This document describes intended Redis adapter boundaries only. It does not describe implemented Redis behavior unless explicitly marked as current behavior.

Related roadmap tasks: RF-822, RF-881, RF-882, RF-883, RF-884, RF-885, RF-886, RF-823.

## 1. Current state

Current realtime state is held in process-local Python objects:

- `EventBus` in `apps/api/src/api/services/event_bus.py`
  - Keeps `roadmap_id -> set[asyncio.Queue]` subscribers in memory.
  - `publish()` serializes the event into current SSE wire format and pushes it into queues for the same process only.
  - `stream()` owns SSE heartbeats and closes when the participant session expiry timestamp is reached.
- `TicketService` in `apps/api/src/api/services/ticket_service.py`
  - Keeps one-time SSE tickets in an in-memory dict.
  - Tickets have a 30 second TTL and are removed by `consume_ticket()`.
  - Ticket payload currently contains `roadmap_id`, `participant_id`, ticket expiry, and `session_expires_at`.
- `LockService` in `apps/api/src/api/services/lock_service.py`
  - Keeps `(roadmap_id, target) -> Lock` in an in-memory dict.
  - Locks have a 30 second TTL.
  - A participant may refresh their own lock by acquiring the same target again.
  - Release is owner-only by participant ID.
  - Lock acquire/release publishes `lock.acquired` and `lock.released` through `event_bus`.
- `InMemoryRateLimiter` in `apps/api/src/api/services/rate_limit_service.py`
  - Keeps fixed-window buckets in memory.
  - Returns `RateLimitResult` with `allowed`, `remaining`, and `retry_after`.
  - `enforce()` raises FastAPI `429` with generic detail `"Too many requests. Try again later."` and a `Retry-After` header.

The API must currently run exactly one Uvicorn worker. The Dockerfile documents and sets `--workers 1`, and deployment docs warn not to override it. One worker is required because SSE subscribers, tickets, locks, and rate-limit buckets are isolated inside one Python process.

Multiple workers break current correctness:

- A write handled by worker A only publishes to SSE queues connected to worker A. Clients connected to worker B miss the event.
- A ticket created by worker A cannot be consumed by worker B, so `/events` intermittently returns `401 Invalid or expired event ticket`.
- A lock acquired on worker A is invisible to worker B, so two participants can edit the same target at the same time.
- A lock released on worker A does not clear or publish release state from worker B.
- Rate limits are multiplied by worker count and do not protect shared resources consistently.

## 2. Goals

- Support multiple API workers or API instances after all realtime state has shared storage.
- Preserve the current SSE frontend contract and event names.
- Preserve accountless sessions and role-scoped participant access.
- Preserve edit-lock semantics: 30 second soft locks, owner refresh, owner-only release by participant ID, and lock event broadcasts.
- Preserve event-ticket one-time and TTL semantics.
- Preserve current rate-limit behavior while allowing Redis storage later.
- Avoid WebSockets.
- Avoid changing frontend behavior in the first Redis implementation.

## 3. Non-goals

- Do not add accounts, OAuth, or email identity.
- Do not introduce WebSockets.
- Do not implement CRDT.
- Do not implement structured conflict UX in this Redis phase.
- Do not make Redis optional in multi-worker mode without a clear fallback.
- Do not enable multi-worker deployment before all realtime state has Redis backing and RF-886 checks pass.

## 4. Redis configuration boundary

Proposed settings in `apps/api/src/api/config.py`:

- `REDIS_URL`
  - Redis connection string. Example local value after RF-881: `redis://localhost:6379/0`.
  - Production must provide this when Redis-backed realtime is enabled.
- `ROADFORGE_REALTIME_BACKEND`
  - Preferred over a generic boolean because it states the active storage mode.
  - Suggested values: `memory`, `redis`.
  - `REDIS_ENABLED` may be accepted as a transitional alias, but avoid keeping both as first-class settings long term.
- `ROADFORGE_REDIS_KEY_PREFIX`
  - Optional namespace prefix.
  - Default: `roadforge`.
  - Production can set per environment, for example `roadforge:prod`.
- `ROADFORGE_REDIS_CONNECT_TIMEOUT_SECONDS`
  - Optional connection timeout.
  - Suggested default: `2`.
- `ROADFORGE_REDIS_SOCKET_TIMEOUT_SECONDS`
  - Optional command timeout.
  - Suggested default: `2`.

Local development defaults after RF-881:

- Keep `ROADFORGE_REALTIME_BACKEND=memory` as the default.
- Allow `REDIS_URL` to be omitted when `ROADFORGE_REALTIME_BACKEND=memory`.
- Docker Compose provides a `redis` service and sets API `REDIS_URL=redis://redis:6379/0` for future adapter work.
- Do not set `ROADFORGE_REALTIME_BACKEND=redis` until RF-882 through RF-886 are implemented and validated.

Production requirements:

- Multi-worker or multi-instance production must use `ROADFORGE_REALTIME_BACKEND=redis`.
- `REDIS_URL` must be required when `ROADFORGE_REALTIME_BACKEND=redis`.
- Redis must be reachable only on private networks or protected service networks.
- If Redis auth or TLS is used by the provider, encode it in `REDIS_URL` and avoid logging the URL.

Fail-fast versus fallback:

- If `ROADFORGE_REALTIME_BACKEND=redis`, the app should fail startup when `REDIS_URL` is missing or an initial ping fails. This prevents a broken multi-worker deployment from silently falling back to isolated memory.
- If `ROADFORGE_REALTIME_BACKEND=memory`, the app should not require Redis and should keep the current single-worker behavior.
- Do not automatically fall back from Redis to memory in production or when worker count is greater than one.
- If a future deployment needs emergency fallback, it should be an explicit config change paired with single-worker mode.

## 5. Service adapter boundaries

Keep current in-memory implementations, but hide them behind small protocols. Route and service code should depend on the protocol, not the concrete storage backend.

### A. Event bus adapter

Proposed protocol shape:

```python
class RealtimeEventBus(Protocol):
    async def publish(self, event: Event) -> None: ...
    async def subscribe(self, roadmap_id: str) -> AsyncIterator[str]: ...
```

Responsibilities:

- Publish roadmap-scoped events with the existing `Event` model: `roadmap_id`, `action`, `payload`.
- Subscribe by `roadmap_id`.
- Unsubscribe and clean up Redis/local resources when the SSE connection closes.
- Keep SSE heartbeat behavior in the app/SSE generator, not in Redis.
- Keep `Event.to_sse()` or equivalent SSE serialization stable so frontend `EventSource` handlers do not change.

Recommendation for RF-882: use Redis Pub/Sub first. The current event bus is best-effort and does not replay missed events. The frontend re-fetches the roadmap after `roadmap.updated`, and lock/revoke/delete events are currently live notifications rather than durable command logs. Pub/Sub is the closest behavior match and has lower implementation complexity than Streams.

### B. Event ticket adapter

Proposed protocol shape:

```python
class EventTicketStore(Protocol):
    async def create_ticket(
        self,
        roadmap_id: str,
        participant_id: str,
        session_expires_at: datetime,
    ) -> str: ...

    async def consume_ticket(self, ticket_id: str, roadmap_id: str) -> Ticket | None: ...
```

Responsibilities:

- Create random one-time ticket IDs with the same entropy as the current service.
- Store a payload containing `roadmap_id`, `participant_id`, and `session_expires_at`.
- Preserve the 30 second ticket TTL unless a later task intentionally changes it.
- Consume atomically: a ticket must be usable once across all workers.
- Reject tickets for the wrong `roadmap_id`.

Redis implementation note: use an atomic get-and-delete operation. In Redis 6.2+, `GETDEL` is a direct fit. If the client or Redis version does not support `GETDEL`, use a Lua script to read, validate enough state, and delete atomically.

### C. Lock adapter

Proposed protocol shape:

```python
class EditLockStore(Protocol):
    async def acquire_lock(
        self,
        roadmap_id: str,
        target: str,
        participant_id: str,
        display_name: str,
    ) -> Lock | None: ...

    async def release_lock(self, roadmap_id: str, target: str, participant_id: str) -> None: ...
    async def get_locks_for_roadmap(self, roadmap_id: str) -> list[Lock]: ...
```

Responsibilities:

- Acquire lock with 30 second TTL.
- Return `None` when an unexpired lock exists for another participant.
- Refresh the lock when the same participant acquires the same target again.
- Release only when the existing lock owner matches `participant_id`.
- List active locks for a roadmap, excluding expired locks.
- Publish `lock.acquired` and `lock.released` events as today. Prefer keeping event publication in the lock service layer so both memory and Redis stores share the same event behavior.

Redis implementation note: acquire/refresh should be atomic. Use Lua so the check-owner-or-expired, write payload, and set TTL happen as one operation. Release should also use Lua to delete only when the stored `participant_id` matches.

### D. Rate limiter storage adapter

Proposed protocol shape:

```python
class RateLimitStore(Protocol):
    async def check(self, action: str, key: str, limit: int, window_seconds: int) -> RateLimitResult: ...
    async def enforce(self, action: str, key: str, limit: int, window_seconds: int) -> RateLimitResult: ...
```

Responsibilities:

- Preserve current fixed-window semantics unless RF-885 explicitly chooses sliding window.
- Atomic increment and expiry across workers.
- Compute `remaining` and `retry_after`.
- Preserve current generic `429` detail and `Retry-After` header behavior.
- Keep current action names and key strategy where possible: examples include `roadmap.create.ip`, `join.ip`, `events.ticket.participant`, and `events.ticket.ip`.

Redis implementation note: use Lua or transaction-like behavior to `INCR`, set expiry only for new buckets, and read TTL consistently. Do not store raw invite tokens, session tokens, passwords, or full bearer credentials in limiter keys.

## 6. Key design

Use a namespace prefix so local, staging, and production environments cannot collide if they share a Redis deployment.

Suggested prefix variable:

```text
{prefix} = ROADFORGE_REDIS_KEY_PREFIX, default "roadforge"
```

Pub/Sub channels:

```text
{prefix}:events:roadmap:{roadmap_id}
```

Published value:

```json
{"action":"roadmap.updated","payload":{"roadmap_id":"rm_..."}}
```

The app converts the message back into the current SSE frame:

```text
event: roadmap.updated
data: {...}
```

If Streams are introduced later, use:

```text
{prefix}:streams:roadmap:{roadmap_id}
```

Stream entries should include `action` and serialized `payload`. If Streams are used for replay, also define retention with `MAXLEN` or time-based trimming. Do not leave unbounded streams.

Ticket keys:

```text
{prefix}:ticket:{ticket_id}
```

Value:

```json
{
  "roadmap_id": "rm_...",
  "participant_id": "pt_...",
  "session_expires_at": 1760000000.0
}
```

TTL: 30 seconds. Cleanup is Redis expiry plus atomic consume delete.

Lock keys:

```text
{prefix}:lock:{roadmap_id}:{target_hash}
```

Value:

```json
{
  "roadmap_id": "rm_...",
  "target": "task:RF-101",
  "participant_id": "pt_...",
  "display_name": "Jordan",
  "expires_at": 1760000000.0
}
```

TTL: 30 seconds. Store the raw `target` inside the JSON payload for API responses, but hash or otherwise escape the target in the key so arbitrary target text cannot create ambiguous keys. Listing active locks needs an index:

```text
{prefix}:locks:index:{roadmap_id}
```

Use a Redis set of target hashes or lock key names. Because set members can outlive TTL lock keys, listing must fetch each referenced lock and remove missing entries opportunistically. This mirrors current opportunistic cleanup without requiring a background job.

Rate-limit keys:

```text
{prefix}:rate:{action}:{key_hash}
```

Value: integer counter. TTL: route-specific `window_seconds`. Hash the variable key segment when it may contain IP addresses, participant IDs combined with roadmap IDs, token hashes, or other sensitive-ish identifiers. The action name remains readable for operations.

## 7. Pub/Sub vs Streams decision

Redis Pub/Sub:

- Closest match to the current in-memory event bus: live delivery to connected subscribers only.
- Low operational overhead: no per-roadmap retention, trimming, or consumer group state.
- Simple fan-out across workers: any worker can publish, all subscribed workers receive.
- Missed events during a disconnected SSE session are not replayed.
- Redis restart drops subscriptions and in-flight messages; clients reconnect through the existing ticket flow.

Redis Streams:

- Can retain events for replay after reconnect if the app stores and tracks event IDs.
- Can support auditing-like event history, but RoadForge already stores durable roadmap/activity state in Postgres.
- Requires retention policy and cleanup to prevent memory growth.
- Requires careful consumer design. SSE fan-out usually needs each connected client to see every event, which is not the default goal of a single consumer group.
- Adds frontend or server reconnection semantics if replay is used.

Recommendation for RF-882: use Redis Pub/Sub first.

Reasons specific to current RoadForge behavior:

- `roadmap.updated` is a notification to re-fetch roadmap state from the API, not the source of truth.
- The frontend currently does not send or consume SSE event IDs for replay.
- Current `EventBus` does not replay missed events.
- `participant.revoked` and `roadmap.deleted` are best-effort live UX events; API authorization and database state remain authoritative.
- Lock events are short-lived UI state, and the frontend already fetches active locks before opening SSE.
- Pub/Sub gets multi-worker delivery with less complexity and lower retention risk.

Streams should be reconsidered only if RF-886 discovers that missed events during reconnect are a product problem, or if a future task explicitly adds server-side replay semantics.

## 8. Deployment plan

### RF-881: add Redis service and configuration for dev/prod

Implementation status: complete as infrastructure/config only. Redis is
provisioned in local and hosting-bay Compose, API settings expose Redis URL,
backend, key prefix, and timeout fields, and deployment examples keep
`ROADFORGE_REALTIME_BACKEND=memory`. No realtime service uses Redis yet, and
multi-worker mode remains blocked until RF-882 through RF-886 are implemented
and validated.

Likely files touched:

- `docker-compose.yml`
- `deploy/hosting-bay/compose.yaml`
- `deploy/hosting-bay/.env.example`
- `deploy/hosting-bay/README.md`
- `apps/api/src/api/config.py`
- API dependency files only to add the Redis client dependency if RF-881 owns that dependency change.

Validation:

- Config review for `ROADFORGE_REALTIME_BACKEND`, `REDIS_URL`, prefix, and timeouts.
- Local Redis healthcheck and production internal-network wiring.
- Confirm single-worker mode remains unchanged.

Rollback:

- Remove Redis service/config entries and keep `ROADFORGE_REALTIME_BACKEND=memory`.

Risks:

- Exposing Redis publicly.
- Accidentally requiring Redis for all local dev before adapter code exists.
- Logging Redis credentials in startup diagnostics.

### RF-882: move SSE event bus to Redis Pub/Sub

Implementation status: complete for the SSE event bus adapter. RF-882 adds a
Redis Pub/Sub event bus selected by `ROADFORGE_REALTIME_BACKEND=redis`, while
`memory` remains the default backend. Event tickets, edit locks, and rate-limit
storage remain memory-backed until RF-883, RF-884, and RF-885. Multi-worker mode
remains blocked until RF-886.

Likely files touched:

- `apps/api/src/api/services/event_bus.py`
- Possibly new adapter modules under `apps/api/src/api/services/`.
- `apps/api/src/api/config.py`
- Focused tests or manual checks for event fan-out.

Validation:

- Two API workers connected to the same Redis both broadcast `roadmap.updated`, `lock.acquired`, `lock.released`, `participant.revoked`, and `roadmap.deleted` to subscribers on either worker.
- SSE heartbeat cadence and response headers remain unchanged.

Rollback:

- Set backend to `memory` and return to single-worker mode.

Risks:

- Lost Redis subscription after transient disconnect.
- Duplicate messages if reconnect logic subscribes twice.
- Blocking SSE generators during Redis client failures.

### RF-883: move event tickets to Redis TTL storage

Likely files touched:

- `apps/api/src/api/services/ticket_service.py`
- New Redis ticket adapter module if separate from the current service.
- Config/dependency wiring.

Validation:

- Ticket created on worker A can be consumed exactly once on worker B.
- Wrong roadmap ID still fails.
- Expired ticket still fails.
- Ticket response schema remains unchanged.

Rollback:

- Use in-memory ticket adapter and single-worker mode.

Risks:

- Non-atomic consume allows double use.
- Ticket payload accidentally logs bearer-like ticket IDs.
- Clock/TTL mismatch changes the 30 second window.

### RF-884: move edit locks to Redis TTL storage

Likely files touched:

- `apps/api/src/api/services/lock_service.py`
- New Redis lock adapter module if separate.
- Possibly event bus injection/wiring so lock events still publish through the configured event bus.

Validation:

- Lock acquired on worker A is visible through `GET /locks` on worker B.
- Worker B cannot acquire the same target for a different participant while the lock is active.
- Same participant can refresh the lock.
- Release by owner participant on worker B clears a lock acquired on worker A and publishes `lock.released`.

Rollback:

- Use in-memory lock adapter and single-worker mode.

Risks:

- Race conditions if acquire/release are not atomic.
- Stale index entries causing noisy list operations.
- Lock key target escaping bugs.

### RF-885: move rate limiter storage adapter to Redis

Likely files touched:

- `apps/api/src/api/services/rate_limit_service.py`
- Config/dependency wiring.
- `docs/security/rate-limiting-policy.md` if behavior or failure mode changes.

Validation:

- Limits apply across workers.
- Existing action names and limits behave the same.
- `Retry-After` remains present and rounded up.
- Generic `429` detail remains unchanged.

Rollback:

- Use in-memory limiter only in single-worker mode.

Risks:

- Failing closed can block all users during Redis outage.
- Failing open can remove abuse protection during Redis outage.
- Key design may leak sensitive identifiers if not hashed.

### RF-886: add realtime multi-worker regression checks

Likely files touched:

- Test or validation harness files.
- CI/development documentation.
- Possibly Compose override or scripts for a two-worker validation setup.

Validation:

- See the regression checklist in section 12.

Rollback:

- Remove the regression harness if unstable, but keep manual validation notes.

Risks:

- Flaky SSE timing.
- Tests that accidentally depend on local single-process ordering.

### RF-823: enable multi-worker deployment mode

Likely files touched:

- `apps/api/Dockerfile`
- `deploy/hosting-bay/compose.yaml`
- `deploy/hosting-bay/README.md`
- README/manual QA docs.

Validation:

- Run after RF-882 through RF-886 pass.
- Confirm worker count change does not alter public API/SSE contract.

Rollback:

- Restore `--workers 1`.

Risks:

- Enabling multi-worker before all state is Redis-backed reintroduces split-brain realtime behavior.
- Capacity and connection counts change for Postgres and Redis.

## 9. Failure behavior

Redis unavailable at startup:

- `ROADFORGE_REALTIME_BACKEND=redis`: fail fast. The app should not start because multi-worker correctness depends on Redis.
- `ROADFORGE_REALTIME_BACKEND=memory`: start normally and require single-worker deployment.

Redis unavailable during request:

- Event tickets: fail closed with an auth/service error. Do not issue tickets that cannot be consumed consistently.
- Locks: fail closed for acquire/release/list with a service error rather than allowing unsafe concurrent edits.
- Rate limiting: recommend fail open for current low-risk app-level limits, with warning logs, unless a future endpoint is classified as highly sensitive.
- Event publish after a write: the write may already be committed. Return the API response if the database operation succeeded, but log the publish failure and accept degraded realtime. Clients can still see the new state on refresh or next fetch.

Redis unavailable during SSE subscribe:

- Fail the stream setup rather than silently opening a memory-only subscription in Redis mode.
- Existing frontend behavior already treats connection errors as realtime unavailable and can continue with manual fetch/save flows.

Redis unavailable during lock acquire/release:

- Acquire: fail closed. Returning a lock without shared storage would break edit-lock semantics across workers.
- Release: return a service error or best-effort failure rather than pretending the lock was released. The TTL still clears stale locks.
- List locks: fail closed/degraded with a service error; do not return an empty list that hides active locks.

Redis unavailable during rate-limit check:

- Recommended first Redis implementation: fail open and log a warning with action name only, because the current limiter is protective but not the only authorization control.
- For future sensitive endpoints, allow per-action fail-closed configuration if abuse risk outweighs availability.

Clear recommendation:

- Tickets: fail closed.
- Locks: fail closed.
- SSE subscribe: fail closed/degraded.
- Event publish: log and degrade after successful database writes.
- Rate limiter: fail open by default, with per-action option to fail closed later.

## 10. Backward compatibility

- Keep the in-memory backend for intentional single-worker development.
- Do not change frontend SSE payload format.
- Do not change SSE event names.
- Do not change API response schemas.
- Do not change participant session model.
- Do not change current conflict behavior.
- Do not require frontend changes for the first Redis event bus implementation.

## 11. Security considerations

- Do not store raw passwords in Redis.
- Avoid raw invite tokens, raw session tokens, and raw bearer credentials in Redis keys or logs.
- Ticket IDs are bearer-like. Generate random values, store only short TTL payloads, and avoid logging full ticket IDs.
- Lock and rate-limit keys must not leak secrets. Hash variable key parts when they contain participant/session-derived identifiers, IP addresses, token hashes, or arbitrary targets.
- Redis should not be exposed publicly.
- Production Redis should require private networking at minimum. Add auth and TLS when the provider/network model requires it.
- Do not log `REDIS_URL` if it may include credentials.
- Keep accountless/local-first behavior: Redis stores ephemeral coordination state, not durable identity.

## 12. Regression checklist

- [ ] Two API workers receive and broadcast `roadmap.updated` to SSE clients connected to either worker.
- [ ] Event tickets generated on worker A are consumed on worker B.
- [ ] Event tickets are still one-time use across workers.
- [ ] Event tickets expire after 30 seconds.
- [ ] Locks acquired on worker A are visible from worker B.
- [ ] Locks acquired on worker A are releasable by the same participant on worker B.
- [ ] Locks cannot be released by a different participant.
- [ ] Same participant lock refresh still extends TTL.
- [ ] Rate limits apply across workers.
- [ ] `Retry-After` and generic `429` detail are preserved.
- [ ] Participant revoked events propagate across workers.
- [ ] Roadmap deleted events propagate across workers.
- [ ] SSE reconnect behavior still works with ticket renewal.
- [ ] Redis restart behavior is understood and documented for tickets, locks, Pub/Sub subscriptions, and rate counters.
- [ ] Single-worker in-memory fallback still works when intentionally configured.

## 13. Recommended decision

Use adapter interfaces and keep the current in-memory services as the `memory` backend for single-worker development. Add Redis-backed adapters one service at a time:

- RF-882: Redis Pub/Sub event bus.
- RF-883: Redis TTL keys for one-time SSE tickets.
- RF-884: Redis TTL keys plus atomic Lua operations for edit locks.
- RF-885: Redis atomic fixed-window counters for rate limiting.

Do not enable multi-worker mode until RF-882, RF-883, RF-884, RF-885, and RF-886 have passed. Redis Pub/Sub is the recommended RF-882 event bus implementation because it matches current best-effort SSE behavior, supports multi-worker fan-out, avoids replay semantics the frontend does not use, and minimizes retention/cleanup risk.
