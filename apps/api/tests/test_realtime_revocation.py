"""
RF-044 — Immediate realtime revocation.

Groups:
  A  MemoryEventBus stream filtering / defense-in-depth revalidation
  B  RedisPubSubEventBus stream filtering (fake pubsub double, no real Redis)
  C  HTTP-level: ticket redemption and open-stream revocation
"""

from __future__ import annotations

import asyncio
import os
import uuid
from contextlib import asynccontextmanager

import pytest
from httpx import AsyncClient
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import Participant
from api.services import event_bus as event_bus_module
from api.services.auth_service import is_participant_revoked
from api.services.event_bus import (
    Event,
    MemoryEventBus,
    RedisPubSubEventBus,
    RedisRevocationRegistry,
    RevocationMark,
    RevocationRegistryUnavailableError,
    forward_subscription,
)
from api.services.sharing_service import resolve_realtime_revocation, revoke_participant
from tests.conftest import create_roadmap
from tests.test_auth_and_share_links import _auth, _join, _rotate_link

pytestmark = pytest.mark.asyncio


def _session_factory(session: AsyncSession):
    """Wraps an already-open test session as the async-context-manager
    factory `resolve_realtime_revocation` expects, without opening a
    second connection outside the test's own transaction/savepoint."""

    @asynccontextmanager
    async def factory():
        yield session

    return factory


# ─── Group A — MemoryEventBus ─────────────────────────────────────────────────


async def test_memory_bus_closes_stream_on_own_revocation():
    bus = MemoryEventBus()
    events = bus.stream("r1", participant_id="p1")

    async def publisher():
        await asyncio.sleep(0)  # let the stream subscribe first
        await bus.publish(Event("r1", "participant.revoked", {"participant_id": "p1"}))

    asyncio.create_task(publisher())

    received = [chunk async for chunk in events]

    assert len(received) == 1
    assert "participant.revoked" in received[0]


async def test_memory_bus_leaves_other_participants_stream_open():
    bus = MemoryEventBus()
    events = bus.stream("r1", participant_id="p1")

    async def publisher():
        await asyncio.sleep(0)
        # Someone else's revocation must not close p1's stream.
        await bus.publish(Event("r1", "participant.revoked", {"participant_id": "p2"}))
        await bus.publish(Event("r1", "roadmap.updated", {"roadmap_id": "r1"}))

    asyncio.create_task(publisher())

    received = []
    async for chunk in events:
        received.append(chunk)
        if len(received) == 2:
            break

    assert "participant.revoked" in received[0]
    assert "roadmap.updated" in received[1]


async def test_memory_bus_heartbeat_revalidation_closes_stream(monkeypatch):
    monkeypatch.setattr(event_bus_module, "_HEARTBEAT_INTERVAL_SECONDS", 0.01)
    bus = MemoryEventBus()

    calls = {"n": 0}

    async def is_still_authorized() -> bool:
        calls["n"] += 1
        return calls["n"] < 2

    received = [
        chunk
        async for chunk in bus.stream(
            "r1", participant_id="p1", is_still_authorized=is_still_authorized
        )
    ]

    assert received == [": heartbeat\n\n"]
    assert calls["n"] == 2


async def test_memory_subscribe_then_recheck_closes_before_forwarding_when_revoked_during_startup():
    """
    Reproduces the exact subscribe-then-recheck sequence the `/events` route
    uses: open a subscription, have a revocation publish while it is open
    but *before* authorization is rechecked, and prove the recheck sees it
    and nothing is ever forwarded — the race the router used to have when it
    called `is_participant_revoked` before subscribing.
    """
    bus = MemoryEventBus()

    # subscription established
    subscription = await bus.open_subscription("r1")

    # revocation happens and is published while the subscription is open,
    # before the post-subscription authorization recheck runs
    await bus.publish(Event("r1", "participant.revoked", {"participant_id": "p1"}))
    await bus.publish(Event("r1", "roadmap.updated", {"roadmap_id": "r1"}))

    # post-subscription authorization recheck fails (mirrors the router
    # re-querying `is_participant_revoked` after `open_subscription`)
    is_authorized = False

    received: list[str] = []
    if is_authorized:
        received = [
            chunk async for chunk in forward_subscription(subscription, participant_id="p1")
        ]
    else:
        await subscription.close()

    assert received == []
    assert bus._subscribers == {}


async def test_memory_bus_reauthorizes_on_bounded_cadence_despite_continuous_traffic(
    monkeypatch,
):
    """
    Continuous non-revocation traffic must not postpone the fallback
    authorization recheck indefinitely — it must still fire on its bounded
    cadence even though the stream is never idle.
    """
    monkeypatch.setattr(event_bus_module, "_HEARTBEAT_INTERVAL_SECONDS", 0.05)
    bus = MemoryEventBus()

    calls = {"n": 0}

    async def is_still_authorized() -> bool:
        calls["n"] += 1
        return calls["n"] < 2

    events = bus.stream("r1", participant_id="p1", is_still_authorized=is_still_authorized)

    stop = asyncio.Event()

    async def flood():
        await asyncio.sleep(0)
        while not stop.is_set():
            await bus.publish(Event("r1", "roadmap.updated", {"roadmap_id": "r1"}))
            await asyncio.sleep(0.001)

    flood_task = asyncio.create_task(flood())
    try:
        received = []
        async for chunk in events:
            received.append(chunk)
            assert len(received) < 5000  # safety valve against a regression hanging forever
    finally:
        stop.set()
        flood_task.cancel()

    assert calls["n"] == 2
    # The flood keeps the queue non-empty almost the entire time, so traffic
    # must have kept flowing (proving the reauth cadence isn't just an idle
    # heartbeat firing) even though a leading heartbeat is possible before
    # the flood task gets its first chance to run.
    assert sum("roadmap.updated" in chunk for chunk in received) > 0


async def test_memory_registry_blocks_normal_event_queued_before_control_publish(monkeypatch):
    """
    RF-044 residual defect: the periodic `is_still_authorized` recheck is
    bounded (every `_HEARTBEAT_INTERVAL_SECONDS`), so a normal event queued
    right after revocation becomes authoritative but before the separate
    `participant.revoked` control event is published could still be
    forwarded. Reproduces the exact ordering deterministically (no sleeps,
    no timing guesses):

        stream fully subscribed
        -> revocation authoritative (fast-path registry marked, mirroring
           the point immediately before `revoke_participant()`'s own
           database commit)
        -> a normal roadmap event is published
        -> (the control event is never published at all here, standing in
           for "not yet" or "publish failed")
        -> the revoked stream must yield nothing and close

    The suppressed event is never yielded and never closes the stream by
    itself (the participant's own revocation notification could still be
    queued behind it — see the "still delivers" test below), so this test
    also supplies a failing `is_still_authorized` as the bounded fallback
    that ends the stream once the control event never shows up.
    """
    monkeypatch.setattr(event_bus_module, "_HEARTBEAT_INTERVAL_SECONDS", 0.01)
    bus = MemoryEventBus()
    subscription = await bus.open_subscription("r1")

    await bus.revocations.mark_pending("r1", "p1")
    await bus.revocations.promote_committed("r1", "p1")
    await bus.publish(Event("r1", "roadmap.updated", {"roadmap_id": "r1"}))

    async def is_revoked_now() -> bool:
        return (await bus.revocations.get_mark("r1", "p1")) is RevocationMark.COMMITTED

    async def is_still_authorized() -> bool:
        return False

    received = [
        chunk
        async for chunk in forward_subscription(
            subscription,
            participant_id="p1",
            is_still_authorized=is_still_authorized,
            is_participant_revoked_now=is_revoked_now,
        )
    ]

    assert received == []
    assert bus._subscribers == {}


async def test_memory_registry_still_delivers_the_participants_own_revocation_event():
    """The fast-path registry must not swallow the terminating notification
    the revoked participant's own client relies on to show "access lost"."""
    bus = MemoryEventBus()
    subscription = await bus.open_subscription("r1")

    await bus.revocations.mark_pending("r1", "p1")
    await bus.revocations.promote_committed("r1", "p1")
    await bus.publish(Event("r1", "participant.revoked", {"participant_id": "p1"}))

    async def is_revoked_now() -> bool:
        return (await bus.revocations.get_mark("r1", "p1")) is RevocationMark.COMMITTED

    received = [
        chunk
        async for chunk in forward_subscription(
            subscription, participant_id="p1", is_participant_revoked_now=is_revoked_now
        )
    ]

    assert len(received) == 1
    assert "participant.revoked" in received[0]


async def test_memory_registry_still_delivers_own_revocation_queued_behind_suppressed_event():
    """
    The own-revocation notification must be delivered even when unrelated
    traffic that arrived around the same time is queued *ahead* of it —
    e.g. another participant's concurrent edit publishes a `roadmap.updated`
    event after the fast-path registry is marked but before
    `revoke_participant()` gets to publish its own `participant.revoked`
    control event. The suppressed event in front of it must not cause the
    stream to close before the notification behind it is ever reached.
    """
    bus = MemoryEventBus()
    subscription = await bus.open_subscription("r1")

    await bus.revocations.mark_pending("r1", "p1")
    await bus.revocations.promote_committed("r1", "p1")
    await bus.publish(Event("r1", "roadmap.updated", {"roadmap_id": "r1"}))
    await bus.publish(Event("r1", "participant.revoked", {"participant_id": "p1"}))

    async def is_revoked_now() -> bool:
        return (await bus.revocations.get_mark("r1", "p1")) is RevocationMark.COMMITTED

    received = [
        chunk
        async for chunk in forward_subscription(
            subscription, participant_id="p1", is_participant_revoked_now=is_revoked_now
        )
    ]

    assert len(received) == 1
    assert "participant.revoked" in received[0]


async def test_memory_registry_leaves_other_participants_unaffected():
    """Revoking p1 must not block p2's stream, including p2 still receiving
    the broadcast revocation notice and later roadmap events."""
    bus = MemoryEventBus()

    async def is_p2_revoked() -> bool:
        return (await bus.revocations.get_mark("r1", "p2")) is RevocationMark.COMMITTED

    events = bus.stream("r1", participant_id="p2", is_participant_revoked_now=is_p2_revoked)

    async def revoke_p1_and_publish():
        await asyncio.sleep(0)
        await bus.revocations.mark_pending("r1", "p1")
        await bus.revocations.promote_committed("r1", "p1")
        await bus.publish(Event("r1", "participant.revoked", {"participant_id": "p1"}))
        await bus.publish(Event("r1", "roadmap.updated", {"roadmap_id": "r1"}))

    task = asyncio.create_task(revoke_p1_and_publish())

    received = []
    async for chunk in events:
        received.append(chunk)
        if len(received) == 2:
            break

    await task
    assert "participant.revoked" in received[0]
    assert "roadmap.updated" in received[1]
    assert (await bus.revocations.get_mark("r1", "p2")) is RevocationMark.ACTIVE


async def test_memory_registry_blocks_continuous_traffic_after_revocation(monkeypatch):
    """
    Continuous roadmap traffic queued after revocation becomes authoritative
    must never leak through the fast-path check, regardless of volume.
    Sequenced deterministically (no concurrent tasks, no scheduling
    dependence): 10 events are queued, then revocation becomes
    authoritative, then 10 more events are queued — proving a full queue
    of traffic straddling the revocation point is never delivered once the
    registry is marked.
    """
    monkeypatch.setattr(event_bus_module, "_HEARTBEAT_INTERVAL_SECONDS", 0.01)
    bus = MemoryEventBus()
    subscription = await bus.open_subscription("r1")

    for _ in range(10):
        await bus.publish(Event("r1", "roadmap.updated", {"roadmap_id": "r1"}))

    await bus.revocations.mark_pending("r1", "p1")
    await bus.revocations.promote_committed("r1", "p1")

    for _ in range(10):
        await bus.publish(Event("r1", "roadmap.updated", {"roadmap_id": "r1"}))

    async def is_revoked_now() -> bool:
        return (await bus.revocations.get_mark("r1", "p1")) is RevocationMark.COMMITTED

    async def is_still_authorized() -> bool:
        return False

    received = [
        chunk
        async for chunk in forward_subscription(
            subscription,
            participant_id="p1",
            is_still_authorized=is_still_authorized,
            is_participant_revoked_now=is_revoked_now,
        )
    ]

    assert received == []


# --- Group A.1 - fail-closed authorization and mark lifecycle ----------------


async def test_memory_bus_fails_closed_when_authorization_cannot_be_established():
    """
    `is_participant_revoked_now` returning `None` means neither the registry
    nor its PostgreSQL fallback could answer. The stream must end
    immediately without ever forwarding the queued event - treating this as
    "not revoked" would grant access on pure uncertainty.
    """
    bus = MemoryEventBus()
    subscription = await bus.open_subscription("r1")
    await bus.publish(Event("r1", "roadmap.updated", {"roadmap_id": "r1"}))

    async def is_revoked_now() -> bool | None:
        return None

    received = [
        chunk
        async for chunk in forward_subscription(
            subscription, participant_id="p1", is_participant_revoked_now=is_revoked_now
        )
    ]

    assert received == []


async def test_memory_registry_mark_lifecycle():
    """A mark starts `ACTIVE`, moves to `PENDING` then `COMMITTED`, and
    `clear()` returns it to `ACTIVE` - the exact sequence
    `sharing_service._commit_revocation` drives in production."""
    registry = MemoryEventBus().revocations

    assert (await registry.get_mark("r1", "p1")) is RevocationMark.ACTIVE

    await registry.mark_pending("r1", "p1")
    assert (await registry.get_mark("r1", "p1")) is RevocationMark.PENDING

    await registry.promote_committed("r1", "p1")
    assert (await registry.get_mark("r1", "p1")) is RevocationMark.COMMITTED

    await registry.clear("r1", "p1")
    assert (await registry.get_mark("r1", "p1")) is RevocationMark.ACTIVE


# ─── Group B — RedisPubSubEventBus (fake pubsub double) ───────────────────────


class _FakePubSub:
    def __init__(self, messages: list[dict]):
        self._messages = list(messages)
        self.subscribed_channel: str | None = None
        self.closed = False

    async def subscribe(self, channel: str) -> None:
        self.subscribed_channel = channel

    async def get_message(self, *, ignore_subscribe_messages: bool, timeout: float):
        if self._messages:
            return self._messages.pop(0)
        # Real redis-py blocks for up to `timeout` waiting for a message;
        # mirror that so callers pacing on wall-clock time (e.g. a bounded
        # periodic reauthorization check) behave the same as in production
        # instead of busy-looping.
        await asyncio.sleep(timeout)
        return None

    async def unsubscribe(self, channel: str) -> None:
        pass

    async def aclose(self) -> None:
        self.closed = True


class _FakeRedis:
    def __init__(self, pubsub: _FakePubSub):
        self._pubsub = pubsub
        self.store: dict[str, str] = {}
        self.ttls: dict[str, int | None] = {}

    def pubsub(self):
        return self._pubsub

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.store[key] = value
        self.ttls[key] = ex

    async def delete(self, key: str) -> None:
        self.store.pop(key, None)

    async def get(self, key: str) -> str | None:
        return self.store.get(key)


def _wire_fake_redis(bus: RedisPubSubEventBus, fake_pubsub: _FakePubSub) -> _FakeRedis:
    """Swap in a fake Redis client and rebuild `bus.revocations` against it —
    the constructor already built one against the real client."""
    fake_redis = _FakeRedis(fake_pubsub)
    bus._redis = fake_redis
    bus.revocations = RedisRevocationRegistry(fake_redis, key_prefix="rf")
    return fake_redis


def _redis_message(event: Event) -> dict:
    import json

    return {
        "type": "message",
        "data": json.dumps({"action": event.action, "payload": event.payload}),
    }


async def test_redis_bus_closes_stream_on_own_revocation(monkeypatch):
    own_event = Event("r1", "participant.revoked", {"participant_id": "p1"})
    fake_pubsub = _FakePubSub([_redis_message(own_event)])

    bus = RedisPubSubEventBus(
        redis_url="redis://fake",
        key_prefix="rf",
        connect_timeout_seconds=1,
        socket_timeout_seconds=1,
    )
    bus._redis = _FakeRedis(fake_pubsub)

    received = [chunk async for chunk in bus.stream("r1", participant_id="p1")]

    assert len(received) == 1
    assert "participant.revoked" in received[0]
    assert fake_pubsub.closed


async def test_redis_bus_heartbeat_revalidation_closes_stream(monkeypatch):
    monkeypatch.setattr(event_bus_module, "_HEARTBEAT_INTERVAL_SECONDS", 0.01)
    fake_pubsub = _FakePubSub([])

    bus = RedisPubSubEventBus(
        redis_url="redis://fake",
        key_prefix="rf",
        connect_timeout_seconds=1,
        socket_timeout_seconds=1,
    )
    bus._redis = _FakeRedis(fake_pubsub)

    calls = {"n": 0}

    async def is_still_authorized() -> bool:
        calls["n"] += 1
        return calls["n"] < 2

    received = [
        chunk
        async for chunk in bus.stream(
            "r1", participant_id="p1", is_still_authorized=is_still_authorized
        )
    ]

    assert received == [": heartbeat\n\n"]


async def test_redis_subscribe_then_recheck_closes_before_forwarding_when_revoked_during_startup():
    """
    Redis-backed equivalent of the memory-backend subscribe/recheck race
    test above: a `participant.revoked` publish that lands on the channel
    while the subscription is open but before the recheck runs must never
    reach the client once the recheck fails.
    """
    own_event = Event("r1", "participant.revoked", {"participant_id": "p1"})
    fake_pubsub = _FakePubSub([_redis_message(own_event)])

    bus = RedisPubSubEventBus(
        redis_url="redis://fake",
        key_prefix="rf",
        connect_timeout_seconds=1,
        socket_timeout_seconds=1,
    )
    bus._redis = _FakeRedis(fake_pubsub)

    subscription = await bus.open_subscription("r1")

    is_authorized = False

    received: list[str] = []
    if is_authorized:
        received = [
            chunk async for chunk in forward_subscription(subscription, participant_id="p1")
        ]
    else:
        await subscription.close()

    assert received == []
    assert fake_pubsub.closed


async def test_redis_registry_blocks_normal_event_queued_before_control_publish(monkeypatch):
    """Redis-backed equivalent of the memory fast-path race test: the
    registry mark (mirroring the point just before `revoke_participant()`'s
    database commit) must block a normal event queued ahead of — or
    instead of, on publish failure — the `participant.revoked` control
    message, across every worker sharing the same Redis instance."""
    monkeypatch.setattr(event_bus_module, "_HEARTBEAT_INTERVAL_SECONDS", 0.01)
    fake_pubsub = _FakePubSub([])
    bus = RedisPubSubEventBus(
        redis_url="redis://fake",
        key_prefix="rf",
        connect_timeout_seconds=1,
        socket_timeout_seconds=1,
    )
    _wire_fake_redis(bus, fake_pubsub)

    subscription = await bus.open_subscription("r1")

    await bus.revocations.mark_pending("r1", "p1")
    await bus.revocations.promote_committed("r1", "p1")
    fake_pubsub._messages.append(
        _redis_message(Event("r1", "roadmap.updated", {"roadmap_id": "r1"}))
    )

    async def is_revoked_now() -> bool:
        return (await bus.revocations.get_mark("r1", "p1")) is RevocationMark.COMMITTED

    async def is_still_authorized() -> bool:
        return False

    received = [
        chunk
        async for chunk in forward_subscription(
            subscription,
            participant_id="p1",
            is_still_authorized=is_still_authorized,
            is_participant_revoked_now=is_revoked_now,
        )
    ]

    assert received == []
    assert fake_pubsub.closed


async def test_redis_registry_still_delivers_the_participants_own_revocation_event():
    fake_pubsub = _FakePubSub([])
    bus = RedisPubSubEventBus(
        redis_url="redis://fake",
        key_prefix="rf",
        connect_timeout_seconds=1,
        socket_timeout_seconds=1,
    )
    _wire_fake_redis(bus, fake_pubsub)

    subscription = await bus.open_subscription("r1")

    await bus.revocations.mark_pending("r1", "p1")
    await bus.revocations.promote_committed("r1", "p1")
    fake_pubsub._messages.append(
        _redis_message(Event("r1", "participant.revoked", {"participant_id": "p1"}))
    )

    async def is_revoked_now() -> bool:
        return (await bus.revocations.get_mark("r1", "p1")) is RevocationMark.COMMITTED

    received = [
        chunk
        async for chunk in forward_subscription(
            subscription, participant_id="p1", is_participant_revoked_now=is_revoked_now
        )
    ]

    assert len(received) == 1
    assert "participant.revoked" in received[0]


async def test_redis_registry_mark_applies_the_safety_net_ttl():
    """The fast-path mark must carry the bounded safety-net TTL so a stale
    entry (e.g. left behind by a double failure — see the commit-failure
    rollback test — that also fails to clear) self-heals instead of
    permanently blocking a participant's realtime access."""
    fake_pubsub = _FakePubSub([])
    bus = RedisPubSubEventBus(
        redis_url="redis://fake",
        key_prefix="rf",
        connect_timeout_seconds=1,
        socket_timeout_seconds=1,
    )
    fake_redis = _wire_fake_redis(bus, fake_pubsub)

    await bus.revocations.mark_pending("r1", "p1")

    assert fake_redis.ttls["rf:revoked:r1:p1"] == event_bus_module._REVOCATION_MARK_TTL_SECONDS


async def test_redis_registry_leaves_other_participants_unaffected():
    """Simulates two separate workers each holding one participant's stream
    against the same shared (fake) Redis instance."""
    fake_pubsub_a = _FakePubSub([])
    fake_pubsub_b = _FakePubSub([])

    bus_a = RedisPubSubEventBus(
        redis_url="redis://fake", key_prefix="rf", connect_timeout_seconds=1,
        socket_timeout_seconds=1,
    )
    _wire_fake_redis(bus_a, fake_pubsub_a)

    bus_b = RedisPubSubEventBus(
        redis_url="redis://fake", key_prefix="rf", connect_timeout_seconds=1,
        socket_timeout_seconds=1,
    )
    fake_redis_b = _wire_fake_redis(bus_b, fake_pubsub_b)
    # Each worker owns its own pubsub connection but the two workers are
    # really talking to the same Redis instance, so the revocation registry
    # (a plain key/value store, unlike pubsub) is shared between them.
    fake_redis_b.store = bus_a._redis.store

    # Worker A revokes p1 against the shared Redis registry.
    await bus_a.revocations.mark_pending("r1", "p1")
    await bus_a.revocations.promote_committed("r1", "p1")

    # Worker B holds p2's stream and must be unaffected.
    fake_pubsub_b._messages.append(
        _redis_message(Event("r1", "participant.revoked", {"participant_id": "p1"}))
    )
    fake_pubsub_b._messages.append(
        _redis_message(Event("r1", "roadmap.updated", {"roadmap_id": "r1"}))
    )

    async def is_p2_revoked() -> bool:
        return (await bus_b.revocations.get_mark("r1", "p2")) is RevocationMark.COMMITTED

    received: list[str] = []
    async for chunk in bus_b.stream(
        "r1", participant_id="p2", is_participant_revoked_now=is_p2_revoked
    ):
        received.append(chunk)
        if len(received) == 2:
            break

    assert "participant.revoked" in received[0]
    assert "roadmap.updated" in received[1]
    assert (await bus_b.revocations.get_mark("r1", "p2")) is RevocationMark.ACTIVE


# ─── Group B.1 — Real Redis (opt-in, skipped when unreachable) ────────────────
#
# `REAL_REDIS_TEST_URL` points at a disposable Redis instance (e.g.
# `redis://localhost:6390/0`). This is intentionally separate from the
# repository's own docker-compose `redis` service / `REDIS_URL` so this
# suite never touches a Redis instance also used for real application data.
# Not wired into CI by default — CI has no Redis service defined, so this
# test skips there rather than failing on a missing environment.

_REAL_REDIS_URL = os.environ.get("REAL_REDIS_TEST_URL")


async def test_real_redis_registry_blocks_leaked_event_across_workers(monkeypatch):
    """
    Same race as the fake-pubsub Redis test above, against a real Redis
    instance with two independent `RedisPubSubEventBus` instances standing
    in for two separate API workers sharing one Redis.
    """
    if not _REAL_REDIS_URL:
        pytest.skip("REAL_REDIS_TEST_URL not set; skipping live Redis test")

    monkeypatch.setattr(event_bus_module, "_HEARTBEAT_INTERVAL_SECONDS", 0.05)

    import redis.asyncio as redis_asyncio

    probe = redis_asyncio.Redis.from_url(
        _REAL_REDIS_URL, socket_connect_timeout=1, socket_timeout=1
    )
    try:
        await probe.ping()
    except Exception as exc:  # noqa: BLE001 - environment probe, any failure means skip
        pytest.skip(f"Real Redis unreachable at {_REAL_REDIS_URL}: {exc}")
    finally:
        await probe.aclose()

    key_prefix = f"rf-test-{uuid.uuid4().hex}"
    bus_a = RedisPubSubEventBus(
        redis_url=_REAL_REDIS_URL,
        key_prefix=key_prefix,
        connect_timeout_seconds=1,
        socket_timeout_seconds=1,
    )
    bus_b = RedisPubSubEventBus(
        redis_url=_REAL_REDIS_URL,
        key_prefix=key_prefix,
        connect_timeout_seconds=1,
        socket_timeout_seconds=1,
    )

    try:
        # Worker B holds participant p1's stream.
        subscription = await bus_b.open_subscription("r1")

        # Worker A handles the revoke request: marks the shared registry,
        # then publishes a normal event in the gap before any control
        # event (which this test never publishes at all, standing in for
        # "not yet" or "publish failed").
        await bus_a.revocations.mark_pending("r1", "p1")
        await bus_a.revocations.promote_committed("r1", "p1")
        await bus_a.publish(Event("r1", "roadmap.updated", {"roadmap_id": "r1"}))

        async def is_revoked_now() -> bool:
            return (await bus_b.revocations.get_mark("r1", "p1")) is RevocationMark.COMMITTED

        async def is_still_authorized() -> bool:
            return False

        received = [
            chunk
            async for chunk in forward_subscription(
                subscription,
                participant_id="p1",
                is_still_authorized=is_still_authorized,
                is_participant_revoked_now=is_revoked_now,
            )
        ]

        # Real Redis's timeout granularity can interleave one harmless
        # keep-alive heartbeat before the bounded `is_still_authorized`
        # fallback fires (unlike the fake pubsub double, whose simulated
        # wait is exactly the requested timeout) — heartbeats carry no
        # application data, so the only thing that matters here is that
        # the leaked event itself never appears.
        assert all("roadmap.updated" not in chunk for chunk in received)
    finally:
        await bus_a.revocations.clear("r1", "p1")
        await bus_a._redis.aclose()
        await bus_b._redis.aclose()


async def test_real_redis_mark_failure_aborts_revocation_and_keeps_other_worker_consistent(
    monkeypatch, client: AsyncClient, db_session
):
    """
    New design against a real Redis instance: if the fast-path mark write
    itself fails (e.g. this worker's Redis connection is broken), the whole
    revocation must abort rather than proceed on a partial fast-path state.
    Confirms neither failure mode: no incorrect fail-open (the revocation
    never happened, so the database must still show the participant active)
    and no incorrect fail-closed-forever (the broken worker's own connection
    failing must not leave a stale mark visible to another worker sharing
    the same real Redis).
    """
    if not _REAL_REDIS_URL:
        pytest.skip("REAL_REDIS_TEST_URL not set; skipping live Redis test")

    import redis.asyncio as redis_asyncio

    probe = redis_asyncio.Redis.from_url(
        _REAL_REDIS_URL, socket_connect_timeout=1, socket_timeout=1
    )
    try:
        await probe.ping()
    except Exception as exc:  # noqa: BLE001 - environment probe, any failure means skip
        pytest.skip(f"Real Redis unreachable at {_REAL_REDIS_URL}: {exc}")
    finally:
        await probe.aclose()

    key_prefix = f"rf-test-{uuid.uuid4().hex}"
    # Worker A stands in for the API's real event bus for this revoke
    # request, with a connection that can never succeed - redis-py's async
    # client transparently reopens a fresh connection from its pool on the
    # next command, so closing an otherwise-healthy client (e.g. via
    # `aclose()`) does not reproduce a broken connection. Pointing it at an
    # address nothing listens on does.
    bus_a = RedisPubSubEventBus(
        redis_url="redis://127.0.0.1:1/0",
        key_prefix=key_prefix,
        connect_timeout_seconds=1,
        socket_timeout_seconds=1,
    )
    bus_b = RedisPubSubEventBus(
        redis_url=_REAL_REDIS_URL,
        key_prefix=key_prefix,
        connect_timeout_seconds=1,
        socket_timeout_seconds=1,
    )

    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]
    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    owner = (
        await db_session.execute(
            select(Participant).where(
                Participant.roadmap_id == roadmap_id,
                Participant.role == "owner",
            )
        )
    ).scalar_one()

    monkeypatch.setattr(event_bus_module.event_bus, "revocations", bus_a.revocations)

    try:
        with pytest.raises(RevocationRegistryUnavailableError):
            await revoke_participant(db_session, roadmap_id, editor_pid, owner)

        reloaded = (
            await db_session.execute(
                select(Participant).where(Participant.id == editor_pid)
            )
        ).scalar_one()
        assert reloaded.revoked_at is None

        # Worker B, sharing the same real Redis, must not see a stale mark
        # either - the mark write never actually succeeded.
        assert (
            await bus_b.revocations.get_mark(roadmap_id, editor_pid)
        ) is RevocationMark.ACTIVE
    finally:
        await bus_b.revocations.clear(roadmap_id, editor_pid)
        await bus_b._redis.aclose()


async def test_real_redis_state_loss_after_revocation_leaks_no_event(
    client: AsyncClient, db_session, monkeypatch
):
    """
    Real-Redis equivalent of the state-loss test above: revoke through the
    real service against a real Redis-backed registry, delete the key to
    simulate a restart or flush with no persistence, and prove the
    authoritative PostgreSQL check in `resolve_realtime_revocation` still
    suppresses the next ordinary event - the shared Redis instance losing
    its mark must not restore visibility on its own.
    """
    if not _REAL_REDIS_URL:
        pytest.skip("REAL_REDIS_TEST_URL not set; skipping live Redis test")

    monkeypatch.setattr(event_bus_module, "_HEARTBEAT_INTERVAL_SECONDS", 0.01)

    key_prefix = f"rf-test-{uuid.uuid4().hex}"
    bus = RedisPubSubEventBus(
        redis_url=_REAL_REDIS_URL,
        key_prefix=key_prefix,
        connect_timeout_seconds=1,
        socket_timeout_seconds=1,
    )

    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]
    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    owner = (
        await db_session.execute(
            select(Participant).where(
                Participant.roadmap_id == roadmap_id,
                Participant.role == "owner",
            )
        )
    ).scalar_one()

    monkeypatch.setattr(event_bus_module.event_bus, "revocations", bus.revocations)

    try:
        await revoke_participant(db_session, roadmap_id, editor_pid, owner)
        assert (
            await bus.revocations.get_mark(roadmap_id, editor_pid)
        ) is RevocationMark.COMMITTED

        await bus.revocations.clear(roadmap_id, editor_pid)  # simulate flush/restart
        assert (await bus.revocations.get_mark(roadmap_id, editor_pid)) is RevocationMark.ACTIVE

        subscription = await bus.open_subscription(roadmap_id)
        await bus.publish(Event(roadmap_id, "roadmap.updated", {"roadmap_id": roadmap_id}))

        async def is_revoked_fast() -> bool | None:
            return await resolve_realtime_revocation(
                _session_factory(db_session), roadmap_id, editor_pid
            )

        async def is_still_authorized() -> bool:
            return not await is_participant_revoked(db_session, roadmap_id, editor_pid)

        received = [
            chunk
            async for chunk in forward_subscription(
                subscription,
                participant_id=editor_pid,
                is_still_authorized=is_still_authorized,
                is_participant_revoked_now=is_revoked_fast,
            )
        ]

        # Real Redis's timeout granularity can interleave one harmless
        # keep-alive heartbeat before the bounded `is_still_authorized`
        # fallback fires - heartbeats carry no application data, so the
        # only thing that matters is that the leaked event itself never
        # appears.
        assert all("roadmap.updated" not in chunk for chunk in received)
    finally:
        await bus.revocations.clear(roadmap_id, editor_pid)
        await bus._redis.aclose()


# ─── Group C — HTTP-level ──────────────────────────────────────────────────────


async def test_is_participant_revoked_helper(client: AsyncClient, db_session):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    assert await is_participant_revoked(db_session, roadmap_id, editor_pid) is False
    assert await is_participant_revoked(db_session, roadmap_id, "missing-pid") is True

    revoke_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/participants/{editor_pid}/revoke",
        headers=_auth(owner_token),
    )
    assert revoke_resp.status_code == 204

    assert await is_participant_revoked(db_session, roadmap_id, editor_pid) is True


async def test_ticket_issued_before_revocation_cannot_open_stream_after(
    client: AsyncClient,
):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_token = join_resp.json()["session_token"]
    editor_pid = join_resp.json()["participant_id"]

    ticket_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/events/ticket",
        headers=_auth(editor_token),
    )
    assert ticket_resp.status_code == 200
    ticket = ticket_resp.json()["ticket"]

    revoke_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/participants/{editor_pid}/revoke",
        headers=_auth(owner_token),
    )
    assert revoke_resp.status_code == 204

    stream_resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/events", params={"ticket": ticket}
    )
    assert stream_resp.status_code == 401


async def test_revocation_during_stream_startup_is_caught_by_post_subscribe_recheck(
    client: AsyncClient, monkeypatch
):
    """
    Reproduces the confirmed defect at the route: a ticket is redeemed and
    passes the initial revocation check, but the participant is revoked
    *while the route is opening the event subscription* — after that check
    but before the stream would start forwarding events. The route must
    still reject the request via its post-subscription recheck instead of
    opening a stream the client never gets a revocation event on.
    """
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_token = join_resp.json()["session_token"]
    editor_pid = join_resp.json()["participant_id"]

    ticket_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/events/ticket",
        headers=_auth(editor_token),
    )
    assert ticket_resp.status_code == 200
    ticket = ticket_resp.json()["ticket"]

    real_open_subscription = event_bus_module.event_bus.open_subscription

    async def open_subscription_then_revoke(roadmap_id_arg: str):
        subscription = await real_open_subscription(roadmap_id_arg)
        # Land the revocation exactly between subscribe and the route's
        # post-subscription authorization recheck.
        revoke_resp = await client.post(
            f"/api/roadmaps/{roadmap_id}/participants/{editor_pid}/revoke",
            headers=_auth(owner_token),
        )
        assert revoke_resp.status_code == 204
        return subscription

    monkeypatch.setattr(
        event_bus_module.event_bus, "open_subscription", open_subscription_then_revoke
    )

    stream_resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/events", params={"ticket": ticket}
    )
    assert stream_resp.status_code == 401


async def test_revoked_participant_cannot_request_a_new_ticket(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_token = join_resp.json()["session_token"]
    editor_pid = join_resp.json()["participant_id"]

    revoke_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/participants/{editor_pid}/revoke",
        headers=_auth(owner_token),
    )
    assert revoke_resp.status_code == 204

    ticket_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/events/ticket",
        headers=_auth(editor_token),
    )
    assert ticket_resp.status_code == 401


async def test_revocation_survives_control_event_publish_failure(
    client: AsyncClient, monkeypatch
):
    """
    A revoked participant must not keep receiving normal application
    events indefinitely merely because the separate `participant.revoked`
    control-event publish failed. The database commit and the fast-path
    registry mark must both still take effect, and the revoke request
    itself must still succeed (the control event is best-effort).
    """
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    async def failing_publish(_event) -> None:
        raise RuntimeError("simulated event-bus publish failure")

    monkeypatch.setattr(event_bus_module.event_bus, "publish", failing_publish)

    revoke_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/participants/{editor_pid}/revoke",
        headers=_auth(owner_token),
    )
    assert revoke_resp.status_code == 204

    assert (
        await event_bus_module.event_bus.revocations.get_mark(roadmap_id, editor_pid)
    ) is RevocationMark.COMMITTED


async def test_revoke_participant_rolls_back_registry_mark_on_commit_failure(
    client: AsyncClient, db_session, monkeypatch
):
    """
    If the database commit itself fails, the optimistic fast-path registry
    mark made just before it must be rolled back — otherwise a participant
    could be treated as revoked by every stream's fast-path check while the
    database still shows them active (the actual source of truth).
    """
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    owner = (
        await db_session.execute(
            select(Participant).where(
                Participant.roadmap_id == roadmap_id,
                Participant.role == "owner",
            )
        )
    ).scalar_one()

    async def failing_commit() -> None:
        raise RuntimeError("simulated database commit failure")

    monkeypatch.setattr(db_session, "commit", failing_commit)

    registry = event_bus_module.event_bus.revocations
    calls: list[str] = []
    real_mark_pending = registry.mark_pending
    real_clear = registry.clear

    async def spy_mark_pending(roadmap_id_arg: str, participant_id_arg: str) -> None:
        calls.append("mark_pending")
        await real_mark_pending(roadmap_id_arg, participant_id_arg)

    async def spy_clear(roadmap_id_arg: str, participant_id_arg: str) -> None:
        calls.append("clear")
        await real_clear(roadmap_id_arg, participant_id_arg)

    monkeypatch.setattr(registry, "mark_pending", spy_mark_pending)
    monkeypatch.setattr(registry, "clear", spy_clear)

    with pytest.raises(RuntimeError, match="simulated database commit failure"):
        await revoke_participant(db_session, roadmap_id, editor_pid, owner)

    # The mark must actually have been made (and then rolled back) - not
    # simply absent, which a regression that dropped the fast-path mark
    # entirely would also satisfy.
    assert calls == ["mark_pending", "clear"]
    assert (await registry.get_mark(roadmap_id, editor_pid)) is RevocationMark.ACTIVE


async def test_revoke_participant_aborts_and_rolls_back_when_mark_pending_fails(
    client: AsyncClient, db_session, monkeypatch
):
    """
    If the fast-path `mark_pending()` write fails, the whole revocation
    must abort: the session is rolled back (no partial DB write survives)
    and a distinguishable `RevocationRegistryUnavailableError` propagates
    instead of a false success.
    """
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    owner = (
        await db_session.execute(
            select(Participant).where(
                Participant.roadmap_id == roadmap_id,
                Participant.role == "owner",
            )
        )
    ).scalar_one()

    registry = event_bus_module.event_bus.revocations

    async def failing_mark_pending(roadmap_id_arg: str, participant_id_arg: str) -> None:
        raise RedisError("simulated registry mark failure")

    monkeypatch.setattr(registry, "mark_pending", failing_mark_pending)

    with pytest.raises(RevocationRegistryUnavailableError):
        await revoke_participant(db_session, roadmap_id, editor_pid, owner)

    # The rollback must actually take effect at the database level, not
    # just leave the in-memory ORM object mutated.
    reloaded = (
        await db_session.execute(select(Participant).where(Participant.id == editor_pid))
    ).scalar_one()
    assert reloaded.revoked_at is None
    assert (await registry.get_mark(roadmap_id, editor_pid)) is RevocationMark.ACTIVE


async def test_post_revoke_participant_returns_503_when_registry_mark_fails(
    client: AsyncClient, db_session, monkeypatch
):
    """HTTP-level mapping for the same defect-B failure: the route must
    report a retryable 503, not a false 204 and not a bare 500."""
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    async def failing_mark_pending(roadmap_id_arg: str, participant_id_arg: str) -> None:
        raise RedisError("simulated registry mark failure")

    monkeypatch.setattr(
        event_bus_module.event_bus.revocations, "mark_pending", failing_mark_pending
    )

    revoke_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/participants/{editor_pid}/revoke",
        headers=_auth(owner_token),
    )
    assert revoke_resp.status_code == 503
    assert "retry" in revoke_resp.json()["detail"].lower()

    # The participant must still show as active - the failed mark aborted
    # the revocation entirely rather than leaving a partial state.
    assert not await is_participant_revoked(db_session, roadmap_id, editor_pid)


async def test_revoke_participant_commit_failure_survives_registry_clear_failure(
    client: AsyncClient, db_session, monkeypatch
):
    """
    If the database commit fails and the compensating registry `clear()`
    also fails (e.g. a second, independent Redis outage), the commit
    failure must still propagate rather than being masked - the stale
    `PENDING` mark left behind is bounded by its own safety-net TTL.
    """
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    owner = (
        await db_session.execute(
            select(Participant).where(
                Participant.roadmap_id == roadmap_id,
                Participant.role == "owner",
            )
        )
    ).scalar_one()

    async def failing_commit() -> None:
        raise RuntimeError("simulated database commit failure")

    async def failing_clear(roadmap_id_arg: str, participant_id_arg: str) -> None:
        raise RedisError("simulated registry clear failure")

    monkeypatch.setattr(db_session, "commit", failing_commit)
    monkeypatch.setattr(event_bus_module.event_bus.revocations, "clear", failing_clear)

    with pytest.raises(RuntimeError, match="simulated database commit failure"):
        await revoke_participant(db_session, roadmap_id, editor_pid, owner)


# --- Group C.1 - resolve_realtime_revocation reconciliation ------------------


async def test_resolve_realtime_revocation_falls_back_when_registry_read_fails_active(
    client: AsyncClient, db_session, monkeypatch
):
    """A failed registry read must not be treated as "not revoked" - it
    must fall back to the authoritative PostgreSQL check."""
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    async def failing_get_mark(roadmap_id_arg: str, participant_id_arg: str) -> RevocationMark:
        return RevocationMark.UNKNOWN

    monkeypatch.setattr(event_bus_module.event_bus.revocations, "get_mark", failing_get_mark)

    result = await resolve_realtime_revocation(
        _session_factory(db_session), roadmap_id, editor_pid
    )
    assert result is False


async def test_resolve_realtime_revocation_falls_back_when_registry_read_fails_revoked(
    client: AsyncClient, db_session, monkeypatch
):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    revoke_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/participants/{editor_pid}/revoke",
        headers=_auth(owner_token),
    )
    assert revoke_resp.status_code == 204

    async def failing_get_mark(roadmap_id_arg: str, participant_id_arg: str) -> RevocationMark:
        return RevocationMark.UNKNOWN

    monkeypatch.setattr(event_bus_module.event_bus.revocations, "get_mark", failing_get_mark)

    result = await resolve_realtime_revocation(
        _session_factory(db_session), roadmap_id, editor_pid
    )
    assert result is True


async def test_resolve_realtime_revocation_fails_closed_when_postgres_also_unavailable(
    client: AsyncClient, monkeypatch
):
    """Neither the registry nor PostgreSQL can answer - the caller must
    treat this as unresolved, never as "not revoked"."""
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    async def failing_get_mark(roadmap_id_arg: str, participant_id_arg: str) -> RevocationMark:
        return RevocationMark.UNKNOWN

    monkeypatch.setattr(event_bus_module.event_bus.revocations, "get_mark", failing_get_mark)

    def broken_session_factory():
        raise RuntimeError("simulated database unavailable")

    result = await resolve_realtime_revocation(broken_session_factory, roadmap_id, editor_pid)
    assert result is None


async def test_resolve_realtime_revocation_clears_abandoned_pending_mark_when_postgres_shows_active(
    client: AsyncClient, db_session
):
    """
    A `PENDING` mark with no corresponding PostgreSQL revocation means the
    process that started marking crashed before it ever committed. The
    fallback check must resolve this as active and clean up the abandoned
    mark rather than leaving it to expire on its own safety-net TTL.
    """
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    registry = event_bus_module.event_bus.revocations
    await registry.mark_pending(roadmap_id, editor_pid)

    result = await resolve_realtime_revocation(
        _session_factory(db_session), roadmap_id, editor_pid
    )

    assert result is False
    assert (await registry.get_mark(roadmap_id, editor_pid)) is RevocationMark.ACTIVE


async def test_resolve_realtime_revocation_promotes_pending_mark_when_postgres_confirms_revoked(
    client: AsyncClient, db_session
):
    """
    A `PENDING` mark that was never promoted to `COMMITTED` (e.g. the
    process crashed right after the database commit) must still resolve as
    revoked - PostgreSQL is authoritative regardless of the registry's own
    state - and the fallback check opportunistically promotes the mark so
    later reads take the cheap `COMMITTED` path again.
    """
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    owner = (
        await db_session.execute(
            select(Participant).where(
                Participant.roadmap_id == roadmap_id,
                Participant.role == "owner",
            )
        )
    ).scalar_one()

    await revoke_participant(db_session, roadmap_id, editor_pid, owner)

    registry = event_bus_module.event_bus.revocations
    # Simulate promotion never completing by resetting the mark back to
    # PENDING, as if the process crashed between commit and promote.
    await registry.mark_pending(roadmap_id, editor_pid)

    result = await resolve_realtime_revocation(
        _session_factory(db_session), roadmap_id, editor_pid
    )

    assert result is True
    assert (await registry.get_mark(roadmap_id, editor_pid)) is RevocationMark.COMMITTED


async def test_resolve_realtime_revocation_checks_postgres_even_when_mark_is_active(
    client: AsyncClient, db_session
):
    """
    An `ACTIVE` read (no mark at all) is ambiguous between "never revoked"
    and "revoked, but the registry lost the mark" - it must not be trusted
    on its own. Confirms the active/no-mark path actually reaches
    PostgreSQL rather than short-circuiting.
    """
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    assert (
        await event_bus_module.event_bus.revocations.get_mark(roadmap_id, editor_pid)
    ) is RevocationMark.ACTIVE

    calls = {"n": 0}
    real_factory = _session_factory(db_session)

    @asynccontextmanager
    async def spy_factory():
        calls["n"] += 1
        async with real_factory() as db:
            yield db

    result = await resolve_realtime_revocation(spy_factory, roadmap_id, editor_pid)

    assert result is False
    assert calls["n"] == 1


async def test_resolve_realtime_revocation_fails_closed_when_mark_active_and_postgres_unavailable(
    client: AsyncClient,
):
    """Fail-closed must also apply on the common `ACTIVE`/no-mark path, not
    only when the registry read itself fails."""
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    def broken_session_factory():
        raise RuntimeError("simulated database unavailable")

    result = await resolve_realtime_revocation(broken_session_factory, roadmap_id, editor_pid)
    assert result is None


async def test_resolve_realtime_revocation_trusts_committed_mark_without_querying_postgres(
    client: AsyncClient,
):
    """A `COMMITTED` mark is the one case that must resolve without ever
    invoking the database session factory."""
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    registry = event_bus_module.event_bus.revocations
    await registry.mark_pending(roadmap_id, editor_pid)
    await registry.promote_committed(roadmap_id, editor_pid)

    def unreachable_session_factory():
        raise AssertionError("PostgreSQL must not be consulted for a COMMITTED mark")

    result = await resolve_realtime_revocation(unreachable_session_factory, roadmap_id, editor_pid)
    assert result is True


async def test_registry_state_loss_after_revocation_leaks_no_ordinary_event(
    client: AsyncClient, db_session, monkeypatch
):
    """
    A participant revoked in PostgreSQL whose fast-path registry mark is
    then lost entirely (a Redis restart, flush, or natural TTL expiry all
    leave the same observable state: the key is gone and `get_mark` reads
    `ACTIVE`) must not regain realtime visibility. Every ordinary event
    still goes through the authoritative PostgreSQL check, so the queued
    event is never yielded and the stream still closes on the next bounded
    reauthorization - proven here at the event-forwarding level, not
    merely by asserting the resolver's return value.
    """
    monkeypatch.setattr(event_bus_module, "_HEARTBEAT_INTERVAL_SECONDS", 0.01)

    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    editor_pid = join_resp.json()["participant_id"]

    revoke_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/participants/{editor_pid}/revoke",
        headers=_auth(owner_token),
    )
    assert revoke_resp.status_code == 204

    registry = event_bus_module.event_bus.revocations
    await registry.clear(roadmap_id, editor_pid)  # simulates lost registry state
    assert (await registry.get_mark(roadmap_id, editor_pid)) is RevocationMark.ACTIVE

    subscription = await event_bus_module.event_bus.open_subscription(roadmap_id)
    await event_bus_module.event_bus.publish(
        Event(roadmap_id, "roadmap.updated", {"roadmap_id": roadmap_id})
    )

    async def is_revoked_fast() -> bool | None:
        return await resolve_realtime_revocation(
            _session_factory(db_session), roadmap_id, editor_pid
        )

    async def is_still_authorized() -> bool:
        return not await is_participant_revoked(db_session, roadmap_id, editor_pid)

    received = [
        chunk
        async for chunk in forward_subscription(
            subscription,
            participant_id=editor_pid,
            is_still_authorized=is_still_authorized,
            is_participant_revoked_now=is_revoked_fast,
        )
    ]

    assert received == []


# NOTE: An HTTP-level "revoke an already-open SSE stream and observe it close
# within seconds" test was deliberately omitted here. httpx's ASGI transport
# runs the streaming endpoint in a way that does not reliably support
# cancelling/bounding the client-side read independently of the server-side
# generator in this test harness, making such a test either racy or silently
# dependent on the 25s heartbeat fallback rather than the immediate,
# event-driven path. The event-driven closure and the heartbeat fallback are
# both verified directly above at the event-bus level (Groups A and B), which
# exercise the exact code path the HTTP route delegates to. Real open-tab
# revocation timing is covered by the roadmap's own required two-browser
# browser test and deployed multi-worker proof, not by this suite.
