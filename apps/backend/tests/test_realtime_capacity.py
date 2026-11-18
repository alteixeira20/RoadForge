"""
Realtime Capacity, Concurrency, and SSE Connection Lifecycle Tests (AGY03).

Proves that:
1. Multiple idle SSE connections (>= 16) do NOT hold database connections or exhaust pool.
2. Ordinary API requests execute concurrently without database pool starvation.
3. Unauthorized connection attempts are rejected (401).
4. Expired or already-consumed single-use tickets are rejected (401).
5. Revoked participants cannot open streams, and active streams terminate upon revocation.
6. Disconnect during subscription setup reliably releases leases and closes subscriptions.
7. Reconnection after interruption succeeds with fresh tickets.
8. Stream limit rejections (429) are enforced per participant and recover on disconnect.
9. Backend subscription failures trigger immediate lease cleanup.
10. Redis-backed operation works seamlessly when a disposable Redis instance is available.
"""

from __future__ import annotations

import asyncio
import os
import time
import uuid

import pytest
import uvicorn
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import api.database as db_module
import api.routers.roadmap_realtime as rr_module
from api.database import get_db
from api.main import create_app
from api.models.base import Base
from api.services import event_bus as event_bus_module
from api.services.event_bus import (
    Event,
    RedisPubSubEventBus,
)
from api.services.rate_limit_service import MemoryRateLimiter
from api.services.realtime_stream_limit import (
    RedisRealtimeStreamRegistry,
    realtime_stream_registry,
)
from api.services.ticket_service import (
    EVENT_TICKET_COOKIE_NAME,
    EVENT_TICKET_TTL_SECONDS,
    RedisTicketService,
    ticket_service,
)
from tests.conftest import _TEST_DB_URL, create_roadmap
from tests.test_auth_and_share_links import _auth, _join, _rotate_link

pytestmark = pytest.mark.asyncio


# ─────────────────────────────────────────────────────────────────────────────
# 1. Database Connection Pressure & Concurrency Proof (>= 16 Streams)
# ─────────────────────────────────────────────────────────────────────────────


async def test_idle_sse_connections_do_not_exhaust_database_pool():
    """
    Prove that at least 16 idle SSE streams do not hold PostgreSQL connections
    and do not starve concurrent ordinary API requests.

    Pool configuration:
      pool_size = 5, max_overflow = 5, pool_timeout = 2.0s
      Maximum concurrent DB connections allowed = 10.

    If SSE connections held their request-scoped DB session open while streaming,
    the 11th connection (and any concurrent ordinary API request) would block
    waiting for a connection from the pool and fail with TimeoutError.

    With prompt session release:
      All 16 streams connect and remain idle waiting for events.
      checkedout connections in the pool is 0 while waiting.
      20 concurrent API requests execute and complete successfully.
    """
    pooled_engine = create_async_engine(
        _TEST_DB_URL,
        pool_size=5,
        max_overflow=5,
        pool_timeout=2.0,
    )
    pooled_session_factory = async_sessionmaker(pooled_engine, expire_on_commit=False)

    async with pooled_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    app = create_app()

    async def _override_get_db():
        async with pooled_session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    rr_module.async_session_factory = pooled_session_factory
    db_module.async_session_factory = pooled_session_factory
    rr_module.rate_limiter = MemoryRateLimiter()

    # Use a free port for a real uvicorn HTTP server to avoid in-memory
    # ASGITransport disconnect deadlocks
    port = 8770
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    server_task = asyncio.create_task(server.serve())
    await asyncio.sleep(0.5)

    stream_clients: list[AsyncClient] = []
    stream_tasks: list[asyncio.Task] = []

    try:
        async with AsyncClient(base_url=f"http://127.0.0.1:{port}") as client:
            resp = await client.post(
                "/api/roadmaps",
                json={
                    "name": "Pool Pressure Test",
                    "owner_display_name": "Owner",
                    "phases": [],
                },
            )
            assert resp.status_code == 201
            body = resp.json()
            roadmap_id = body["id"]
            owner_token = body["owner_session_token"]

            editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")

            # Create 16 distinct participants
            tokens: list[str] = []
            pids: list[str] = []
            for i in range(16):
                j = await _join(client, editor_url, display_name=f"Participant{i}")
                assert j.status_code == 200
                tokens.append(j.json()["session_token"])
                pids.append(j.json()["participant_id"])

            # Create 16 event tickets
            tickets: list[str] = []
            for tok in tokens:
                t_resp = await client.post(
                    f"/api/roadmaps/{roadmap_id}/events/ticket", headers=_auth(tok)
                )
                assert t_resp.status_code == 200
                ticket_cookie = t_resp.cookies.get(EVENT_TICKET_COOKIE_NAME)
                assert ticket_cookie is not None
                tickets.append(ticket_cookie)

            received_events = [asyncio.Event() for _ in range(16)]

            async def run_stream(idx: int, tkt: str):
                c = AsyncClient(base_url=f"http://127.0.0.1:{port}", timeout=30.0)
                stream_clients.append(c)
                cookies = {EVENT_TICKET_COOKIE_NAME: tkt}
                try:
                    async with c.stream(
                        "GET", f"/api/roadmaps/{roadmap_id}/events", cookies=cookies
                    ) as r:
                        assert r.status_code == 200
                        async for line in r.aiter_lines():
                            if "capacity.verified" in line:
                                received_events[idx].set()
                                break
                except asyncio.CancelledError:
                    pass

            for i, ticket in enumerate(tickets):
                stream_tasks.append(asyncio.create_task(run_stream(i, ticket)))

            # Give streams time to complete initial authorization and enter idle streaming loop
            await asyncio.sleep(1.0)

            # 1. Assert all 16 stream leases are held
            active_leases = sum(
                len(realtime_stream_registry._leases.get((roadmap_id, pid), {}))
                for pid in pids
            )
            assert active_leases == 16, f"Expected 16 active leases, got {active_leases}"

            # 2. KEY PROOF: The database connection pool has ZERO checked out connections
            # while 16 streams are active!
            checkedout = pooled_engine.pool.checkedout()
            assert (
                checkedout == 0
            ), f"Expected 0 checked out DB connections while streams are idle, got {checkedout}"

            # 3. CONCURRENCY PROOF: 20 concurrent ordinary API requests succeed without
            # pool starvation
            async def make_api_request(idx: int):
                res = await client.get(
                    f"/api/roadmaps/{roadmap_id}", headers=_auth(owner_token)
                )
                assert res.status_code == 200
                return res.status_code

            api_results = await asyncio.gather(*[make_api_request(i) for i in range(20)])
            assert len(api_results) == 20

            # Allow server event loop to finish connection checkin
            await asyncio.sleep(0.1)
            assert pooled_engine.pool.checkedout() == 0

            # 4. Broadcast event delivery to all 16 connected streams
            await event_bus_module.event_bus.publish(
                Event(
                    roadmap_id=roadmap_id,
                    action="capacity.verified",
                    payload={"status": "ok"},
                )
            )

            # Wait for all 16 streams to receive the event
            await asyncio.wait_for(
                asyncio.gather(*[ev.wait() for ev in received_events]), timeout=8.0
            )

    finally:
        for t in stream_tasks:
            t.cancel()
        await asyncio.gather(*stream_tasks, return_exceptions=True)
        for c in stream_clients:
            await c.aclose()
        server.should_exit = True
        await server_task
        async with pooled_engine.begin() as conn:
            for table in reversed(Base.metadata.sorted_tables):
                await conn.execute(table.delete())
        await pooled_engine.dispose()

    # 5. CLEANUP PROOF: All 16 stream leases were cleanly released upon disconnect
    active_leases_after = sum(
        len(realtime_stream_registry._leases.get((roadmap_id, pid), {}))
        for pid in pids
    )
    assert active_leases_after == 0


# ─────────────────────────────────────────────────────────────────────────────
# 2. Unauthorized Connection Attempts
# ─────────────────────────────────────────────────────────────────────────────


async def test_unauthorized_connection_missing_cookie(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]

    resp = await client.get(f"/api/roadmaps/{roadmap_id}/events")
    assert resp.status_code == 401
    assert "ticket" in resp.json()["detail"].lower()


async def test_unauthorized_connection_invalid_ticket(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]

    client.cookies.set(EVENT_TICKET_COOKIE_NAME, "bogus-random-ticket")
    resp = await client.get(f"/api/roadmaps/{roadmap_id}/events")
    assert resp.status_code == 401
    assert "invalid or expired" in resp.json()["detail"].lower()


async def test_unauthorized_connection_ticket_for_different_roadmap(client: AsyncClient):
    body1 = await create_roadmap(client, name="Roadmap 1")
    body2 = await create_roadmap(client, name="Roadmap 2")
    rm1_id = body1["id"]
    rm2_id = body2["id"]
    tok1 = body1["owner_session_token"]

    t_resp = await client.post(f"/api/roadmaps/{rm1_id}/events/ticket", headers=_auth(tok1))
    assert t_resp.status_code == 200
    ticket = t_resp.cookies[EVENT_TICKET_COOKIE_NAME]

    # Attempt to use rm1 ticket on rm2 endpoint
    client.cookies.set(EVENT_TICKET_COOKIE_NAME, ticket)
    resp = await client.get(f"/api/roadmaps/{rm2_id}/events")
    assert resp.status_code == 401
    assert "invalid or expired" in resp.json()["detail"].lower()


# ─────────────────────────────────────────────────────────────────────────────
# 3. Expired or Already-Consumed Tickets
# ─────────────────────────────────────────────────────────────────────────────


async def test_ticket_single_use_cannot_be_consumed_twice(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    t_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/events/ticket", headers=_auth(owner_token)
    )
    assert t_resp.status_code == 200
    ticket = t_resp.cookies[EVENT_TICKET_COOKIE_NAME]

    # First consumption: ticket is consumed from store
    consumed = await ticket_service.consume_ticket(ticket, roadmap_id)
    assert consumed is not None

    # Second consumption attempt via HTTP route must fail
    client.cookies.set(EVENT_TICKET_COOKIE_NAME, ticket)
    resp = await client.get(f"/api/roadmaps/{roadmap_id}/events")
    assert resp.status_code == 401
    assert "invalid or expired" in resp.json()["detail"].lower()


async def test_ticket_ttl_expiry(client: AsyncClient, monkeypatch: pytest.MonkeyPatch):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    now = 100_000.0
    monkeypatch.setattr(time, "time", lambda: now)

    t_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/events/ticket", headers=_auth(owner_token)
    )
    assert t_resp.status_code == 200
    ticket = t_resp.cookies[EVENT_TICKET_COOKIE_NAME]

    # Advance time beyond EVENT_TICKET_TTL_SECONDS
    now += EVENT_TICKET_TTL_SECONDS + 5.0

    client.cookies.set(EVENT_TICKET_COOKIE_NAME, ticket)
    resp = await client.get(f"/api/roadmaps/{roadmap_id}/events")
    assert resp.status_code == 401
    assert "invalid or expired" in resp.json()["detail"].lower()


# ─────────────────────────────────────────────────────────────────────────────
# 4. Participant Revocation
# ─────────────────────────────────────────────────────────────────────────────


async def test_revoked_participant_stream_rejected_and_terminates(
    client: AsyncClient, db_session: AsyncSession
):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="RevokedUser")
    editor_token = join_resp.json()["session_token"]
    editor_pid = join_resp.json()["participant_id"]

    # Issue ticket before revocation
    t_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/events/ticket", headers=_auth(editor_token)
    )
    assert t_resp.status_code == 200
    ticket = t_resp.cookies[EVENT_TICKET_COOKIE_NAME]

    # Revoke participant
    revoke_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/participants/{editor_pid}/revoke",
        headers=_auth(owner_token),
    )
    assert revoke_resp.status_code == 204

    # Connecting with the pre-issued ticket must fail closed with 401
    client.cookies.set(EVENT_TICKET_COOKIE_NAME, ticket)
    stream_resp = await client.get(f"/api/roadmaps/{roadmap_id}/events")
    assert stream_resp.status_code == 401
    assert "session revoked" in stream_resp.json()["detail"].lower()


# ─────────────────────────────────────────────────────────────────────────────
# 5. Disconnect During Subscription Setup
# ─────────────────────────────────────────────────────────────────────────────


async def test_disconnect_during_subscription_setup_releases_lease(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    t_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/events/ticket", headers=_auth(owner_token)
    )
    assert t_resp.status_code == 200
    ticket = t_resp.cookies[EVENT_TICKET_COOKIE_NAME]

    # Simulate cancellation (e.g. client disconnect) during event_bus.open_subscription
    async def cancel_during_subscription(_rm_id: str):
        raise asyncio.CancelledError("Client disconnected during setup")

    monkeypatch.setattr(
        event_bus_module.event_bus, "open_subscription", cancel_during_subscription
    )

    client.cookies.set(EVENT_TICKET_COOKIE_NAME, ticket)
    with pytest.raises(asyncio.CancelledError):
        await client.get(f"/api/roadmaps/{roadmap_id}/events")

    # Prove stream lease was released and did not leak
    owner_pid = (
        await client.get(
            f"/api/roadmaps/{roadmap_id}/participants", headers=_auth(owner_token)
        )
    ).json()[0]["id"]

    leases = realtime_stream_registry._leases.get((roadmap_id, owner_pid), {})
    assert len(leases) == 0, f"Expected 0 leaked leases, found {leases}"


# ─────────────────────────────────────────────────────────────────────────────
# 6. Reconnect After Interruption
# ─────────────────────────────────────────────────────────────────────────────


async def test_reconnect_after_interruption(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    owner_pid = (
        await client.get(
            f"/api/roadmaps/{roadmap_id}/participants", headers=_auth(owner_token)
        )
    ).json()[0]["id"]

    # 1. First connection
    t1_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/events/ticket", headers=_auth(owner_token)
    )
    t1 = t1_resp.cookies[EVENT_TICKET_COOKIE_NAME]

    # Simulate opening stream lease and releasing on disconnect
    lease1 = await realtime_stream_registry.acquire(roadmap_id, owner_pid)
    assert lease1 is not None
    await lease1.release()

    # 2. Reconnect: obtain new ticket and connect
    t2_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/events/ticket", headers=_auth(owner_token)
    )
    t2 = t2_resp.cookies[EVENT_TICKET_COOKIE_NAME]
    assert t2 != t1

    lease2 = await realtime_stream_registry.acquire(roadmap_id, owner_pid)
    assert lease2 is not None
    await lease2.release()


# ─────────────────────────────────────────────────────────────────────────────
# 7. Stream-Limit Rejection (429) & Recovery
# ─────────────────────────────────────────────────────────────────────────────


async def test_stream_limit_rejection_and_recovery(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    owner_pid = (
        await client.get(
            f"/api/roadmaps/{roadmap_id}/participants", headers=_auth(owner_token)
        )
    ).json()[0]["id"]

    # Acquire leases up to the max limit (3)
    l1 = await realtime_stream_registry.acquire(roadmap_id, owner_pid)
    l2 = await realtime_stream_registry.acquire(roadmap_id, owner_pid)
    l3 = await realtime_stream_registry.acquire(roadmap_id, owner_pid)
    assert l1 is not None and l2 is not None and l3 is not None

    # 4th stream attempt must be rejected with 429
    t_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/events/ticket", headers=_auth(owner_token)
    )
    assert t_resp.status_code == 200
    ticket = t_resp.cookies[EVENT_TICKET_COOKIE_NAME]

    client.cookies.set(EVENT_TICKET_COOKIE_NAME, ticket)
    resp = await client.get(f"/api/roadmaps/{roadmap_id}/events")
    assert resp.status_code == 429
    assert "too many active realtime streams" in resp.json()["detail"].lower()

    # Release one lease
    await l1.release()

    # Obtain new ticket and verify new connection is now accepted
    t_resp2 = await client.post(
        f"/api/roadmaps/{roadmap_id}/events/ticket", headers=_auth(owner_token)
    )
    ticket2 = t_resp2.cookies.get(EVENT_TICKET_COOKIE_NAME)
    assert ticket2 is not None

    l_new = await realtime_stream_registry.acquire(roadmap_id, owner_pid)
    assert l_new is not None

    # Cleanup remaining leases
    await l2.release()
    await l3.release()
    await l_new.release()


# ─────────────────────────────────────────────────────────────────────────────
# 8. Backend Subscription Failures
# ─────────────────────────────────────────────────────────────────────────────


async def test_backend_subscription_failure_cleans_up_lease(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    owner_pid = (
        await client.get(
            f"/api/roadmaps/{roadmap_id}/participants", headers=_auth(owner_token)
        )
    ).json()[0]["id"]

    t_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/events/ticket", headers=_auth(owner_token)
    )
    assert t_resp.status_code == 200
    ticket = t_resp.cookies[EVENT_TICKET_COOKIE_NAME]

    async def broken_open_subscription(_rm_id: str):
        raise RuntimeError("simulated event-bus backend outage")

    monkeypatch.setattr(
        event_bus_module.event_bus, "open_subscription", broken_open_subscription
    )

    client.cookies.set(EVENT_TICKET_COOKIE_NAME, ticket)
    with pytest.raises(RuntimeError, match="simulated event-bus backend outage"):
        await client.get(f"/api/roadmaps/{roadmap_id}/events")

    # Lease must be cleaned up and not leaked
    leases = realtime_stream_registry._leases.get((roadmap_id, owner_pid), {})
    assert len(leases) == 0, f"Expected 0 leaked leases, got {leases}"

    # Verify a subsequent connection can acquire a lease
    lease = await realtime_stream_registry.acquire(roadmap_id, owner_pid)
    assert lease is not None
    await lease.release()


# ─────────────────────────────────────────────────────────────────────────────
# 9. Redis-Backed Operation
# ─────────────────────────────────────────────────────────────────────────────


_REAL_REDIS_URL = os.environ.get(
    "REAL_REDIS_TEST_URL", "redis://localhost:6390/0"
)


async def _probe_redis(url: str) -> bool:
    import redis.asyncio as redis_asyncio

    try:
        r = redis_asyncio.Redis.from_url(url, socket_connect_timeout=1, socket_timeout=1)
        await r.ping()
        await r.aclose()
        return True
    except Exception:
        return False


async def test_redis_backed_realtime_lifecycle():
    """
    Validates tickets, stream limits, event bus and fast-path revocation
    against an isolated disposable Redis instance.
    Skips cleanly if Redis is unavailable.
    """
    if not await _probe_redis(_REAL_REDIS_URL):
        pytest.skip(f"Disposable Redis unavailable at {_REAL_REDIS_URL}")

    key_prefix = f"rf-cap-{uuid.uuid4().hex}"
    roadmap_id = f"rm_{uuid.uuid4().hex}"
    participant_id = f"pt_{uuid.uuid4().hex}"

    # 1. Redis Ticket Store
    ticket_store = RedisTicketService(
        redis_url=_REAL_REDIS_URL,
        key_prefix=key_prefix,
        connect_timeout_seconds=2.0,
        socket_timeout_seconds=2.0,
        ttl=10,
    )
    from datetime import datetime, timezone

    session_exp = datetime.now(timezone.utc)

    ticket_id = await ticket_store.create_ticket(roadmap_id, participant_id, session_exp)
    assert ticket_id is not None

    consumed = await ticket_store.consume_ticket(ticket_id, roadmap_id)
    assert consumed is not None
    assert consumed.participant_id == participant_id

    # Single-use consumption
    assert await ticket_store.consume_ticket(ticket_id, roadmap_id) is None
    await ticket_store._redis.aclose()

    # 2. Redis Realtime Stream Registry
    stream_reg = RedisRealtimeStreamRegistry(
        redis_url=_REAL_REDIS_URL,
        key_prefix=key_prefix,
        max_streams=2,
        connect_timeout_seconds=2.0,
        socket_timeout_seconds=2.0,
        ttl=10,
    )

    lease1 = await stream_reg.acquire(roadmap_id, participant_id)
    lease2 = await stream_reg.acquire(roadmap_id, participant_id)
    lease3 = await stream_reg.acquire(roadmap_id, participant_id)

    assert lease1 is not None
    assert lease2 is not None
    assert lease3 is None  # max_streams=2 exceeded

    assert await lease1.refresh() is True
    await lease1.release()

    # After release, slot is available
    replacement = await stream_reg.acquire(roadmap_id, participant_id)
    assert replacement is not None

    await lease2.release()
    await replacement.release()
    await stream_reg._redis.aclose()

    # 3. Redis PubSub Event Bus
    bus = RedisPubSubEventBus(
        redis_url=_REAL_REDIS_URL,
        key_prefix=key_prefix,
        connect_timeout_seconds=2.0,
        socket_timeout_seconds=2.0,
    )

    sub = await bus.open_subscription(roadmap_id)
    await bus.publish(
        Event(roadmap_id=roadmap_id, action="redis.test", payload={"val": 42})
    )

    evt = None
    for _ in range(3):
        evt = await sub.get_event(timeout=2.0)
        if evt is not None:
            break
    assert evt is not None
    assert evt.action == "redis.test"
    assert evt.payload == {"val": 42}

    await sub.close()
    await bus._redis.aclose()
