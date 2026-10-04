# AGY03 Handoff: Realtime SSE Database Connection Lifecycle and Capacity

## 1. Original Failure

The Server-Sent Events (SSE) endpoint at `GET /api/roadmaps/{roadmap_id}/events` received an `AsyncSession` database dependency via `Depends(get_db)`.

When a client opened an SSE connection, the route performed an initial participant revocation check:
```python
if await is_participant_revoked(db, roadmap_id, event_ticket.participant_id):
    raise HTTPException(status_code=401, detail="Session revoked")
```
This query checked out an active PostgreSQL connection from SQLAlchemy's connection pool. Because the route yielded a `StreamingResponse`, FastAPI kept the request-scoped dependency generator open inside its `AsyncExitStack` for the entire lifetime of the HTTP response.

As a result:
- The checked-out PostgreSQL connection remained held for the entire duration of the client connection (minutes, hours, or days).
- In standard pool configurations (`pool_size=5`, `max_overflow=5` or `10`), having as few as 10 to 15 idle SSE connections completely exhausted the database pool.
- Concurrent ordinary API requests (such as roadmap reads, edits, or ticket requests) hung waiting for an available connection from the pool until hitting `pool_timeout` (2.0s to 30.0s), failing with `TimeoutError` / HTTP 500 / HTTP 503.

## 2. Root Cause

1. **FastAPI Dependency Lifetime**:
   In FastAPI (version 0.115+ / 0.141+), dependencies defined as async generators (`async def get_db(): async with ...: yield session`) are registered with the request's `AsyncExitStack`. When an endpoint returns a `StreamingResponse`, the exit stack only cleans up dependencies *after* the streaming body generator has completed and closed.

2. **SQLAlchemy AsyncSession Connection Checkout**:
   Executing `is_participant_revoked` checks out a connection from `engine.pool`. The connection remains bound to that `AsyncSession` until the session is explicitly closed or committed/rolled back.

3. **Combined Effect**:
   Because `db` was never closed before returning `StreamingResponse`, idle streaming clients held dedicated database connections indefinitely while doing nothing more than waiting for SSE events.

## 3. Correction

The backend correction was implemented in `apps/api/src/api/routers/roadmap_realtime.py`:

1. **Prompt Early Session Release**:
   Wrapped the initial ticket consumption, participant authorization, and stream setup in a `try...finally` block that explicitly calls `await db.close()` before returning `StreamingResponse`:
   ```python
   try:
       if await is_participant_revoked(db, roadmap_id, event_ticket.participant_id):
           raise HTTPException(status_code=401, detail="Session revoked")
       ...
   finally:
       await db.close()
   ```
   Calling `await db.close()` immediately returns the checked-out PostgreSQL connection to the connection pool before the streaming response begins. When the route's dependency generator eventually exits upon client disconnect, calling `session.close()` in `get_db` is an idempotent no-op.

2. **Idempotent Resource Cleanup**:
   Added safe, idempotent cleanup helpers (`_safe_release_lease`, `_safe_close_subscription`) and tracking flags (`lease_released`, `subscription_closed`). In the event of setup failure, client disconnect during subscription creation, or normal stream termination, both the stream limit lease and the event bus subscription are released exactly once without duplicate cleanup exceptions.

3. **Short-Lived Reauthorization Sessions**:
   Preserved the existing short-lived database sessions for periodic revocation checks (`_is_still_authorized`), session expiry checks (`close_at`), and fast-path revocation checks (`_is_revoked_fast`). These checks utilize `async with async_session_factory() as session:`, acquiring and releasing connections within milliseconds rather than holding them open.

4. **Security and Backend Compatibility**:
   - Preserved single-use HttpOnly cookie ticket validation and automatic ticket deletion on connect.
   - Preserved participant permission boundaries and immediate revocation handling.
   - Maintained full compatibility with both in-memory and Redis-backed infrastructure (`RedisTicketService`, `RedisRealtimeStreamRegistry`, `RedisPubSubEventBus`).

## 4. Connection-Pressure Results

A dedicated test suite was added in `apps/api/tests/test_realtime_capacity.py`:

1. **Connection Exhaustion Reproduction and Verification**:
   - Configured an isolated async engine pool with tight constraints: `pool_size=5`, `max_overflow=5`, `pool_timeout=2.0s` (maximum 10 connections allowed).
   - Created a roadmap and joined 16 distinct participants via single-use tickets.
   - Established 16 concurrent long-lived SSE streams connected to a local HTTP server instance.
   - **Pool Checkout Verification**: With all 16 streams connected and idle, `pooled_engine.pool.checkedout()` was asserted and measured at exactly `0`.
   - **Ordinary API Concurrency Verification**: 20 concurrent ordinary API requests (`GET /api/roadmaps/{roadmap_id}`) were executed simultaneously against the server. All 20 requests succeeded immediately with HTTP 200 without pool starvation or latency spikes.
   - **Event Delivery Verification**: Broadcasted an event over the event bus; all 16 idle streams received the event simultaneously.
   - **Lease Cleanup Verification**: On stream disconnection, all 16 participant stream limit leases were released cleanly.

2. **Lifecycle and Edge Case Tests (12/12 Passed)**:
   - `test_idle_sse_connections_do_not_exhaust_database_pool`: Proves 16 idle streams hold 0 DB connections and allow 20 concurrent requests.
   - `test_unauthorized_connection_missing_cookie`: Rejects missing tickets (401).
   - `test_unauthorized_connection_invalid_ticket`: Rejects malformed tickets (401).
   - `test_unauthorized_connection_ticket_for_different_roadmap`: Rejects mismatched roadmap tickets (401).
   - `test_ticket_single_use_cannot_be_consumed_twice`: Verifies single-use consumption semantics (401).
   - `test_ticket_ttl_expiry`: Verifies TTL expiration on event tickets (401).
   - `test_revoked_participant_stream_rejected_and_terminates`: Verifies revoked participants cannot connect and active streams terminate (401).
   - `test_disconnect_during_subscription_setup_releases_lease`: Verifies cancellations during setup release leases without leaking.
   - `test_reconnect_after_interruption`: Proves interrupted clients can reconnect with fresh tickets.
   - `test_stream_limit_rejection_and_recovery`: Verifies per-participant stream limits (429) and recovery upon disconnect.
   - `test_backend_subscription_failure_cleans_up_lease`: Verifies event bus outages release acquired leases.
   - `test_redis_backed_realtime_lifecycle`: Verifies tickets, stream limits, and pubsub over real Redis instance.

3. **Full Regression Suite Results**:
   - 439 passed, 0 failed, 1 warning (pre-existing test warning in client api) across all 35 test files in `apps/api/tests` and `apps/api/unit_tests`.
   - Ruff linting and syntax compilation: 0 errors.

## 5. Residual Capacity Risks

1. **Fast-Path Revocation Fallback Query Volume**:
   When Redis is active, `resolve_realtime_revocation` checks the Redis cache mark (`RevocationMark.ACTIVE` / `REVOKED`) without querying PostgreSQL. If Redis is unavailable or in memory-only deployments, every event delivery or periodic reauthorization falls back to querying `participants` in PostgreSQL. While each query uses a short-lived connection (< 5ms), a large volume of active streams (e.g., thousands) receiving rapid bursts of events will increase database query rate.

2. **Memory Event Bus Queue Buffering**:
   In memory mode (`MemoryEventBus`), each connected stream possesses an in-memory queue. If a client connection suffers from high latency or a slow reader, buffered messages will consume process heap. Production environments should use `RedisPubSubEventBus` with consumer drop-slow policies.

3. **OS File Descriptor and Reverse Proxy Limits**:
   Each open SSE connection retains an open TCP socket and file descriptor on both the application server and reverse proxy (Nginx / Envoy / Cloudflare). Operating systems must be tuned with sufficient `ulimit -n` and proxy buffering must be disabled (`X-Accel-Buffering: no` is set by the endpoint).
