from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

import pytest

import api.services.lock_service as lock_module
from api.services.event_bus import Event, MemoryEventBus, RedisPubSubEventBus
from api.services.lock_service import MemoryLockService, RedisLockService
from api.services.ticket_service import MemoryTicketService, RedisTicketService

pytestmark = pytest.mark.asyncio


class RecordingEventBus:
    def __init__(self) -> None:
        self.events: list[Event] = []

    async def publish(self, event: Event) -> None:
        self.events.append(event)


async def test_memory_lock_owner_refresh_conflict_release_and_expiry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = 1_000.0
    events = RecordingEventBus()
    monkeypatch.setattr(lock_module.time, "time", lambda: now)
    monkeypatch.setattr(lock_module, "event_bus", events)
    store = MemoryLockService(ttl=30)

    acquired = await store.acquire_lock("rm_1", "task:tk_1", "pt_1", "Alex")
    assert acquired is not None
    first_expiry = acquired.expires_at
    assert await store.acquire_lock("rm_1", "task:tk_1", "pt_2", "Sam") is None

    now = 1_010.0
    refreshed = await store.acquire_lock("rm_1", "task:tk_1", "pt_1", "Alex")
    assert refreshed is not None
    assert refreshed.expires_at > first_expiry

    await store.release_lock("rm_1", "task:tk_1", "pt_2")
    assert len(await store.get_locks_for_roadmap("rm_1")) == 1
    await store.release_lock("rm_1", "task:tk_1", "pt_1")
    assert await store.get_locks_for_roadmap("rm_1") == []
    assert [event.action for event in events.events] == [
        "lock.acquired",
        "lock.acquired",
        "lock.released",
    ]

    await store.acquire_lock("rm_1", "task:tk_2", "pt_1", "Alex")
    now = 1_041.0
    assert await store.get_locks_for_roadmap("rm_1") == []


async def test_memory_ticket_is_single_use_scoped_and_expiring(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = 2_000.0
    monkeypatch.setattr("api.services.ticket_service.time.time", lambda: now)
    store = MemoryTicketService(ttl=30)
    session_expiry = datetime.fromtimestamp(3_000, timezone.utc)

    wrong_scope = await store.create_ticket("rm_1", "pt_1", session_expiry)
    assert await store.consume_ticket(wrong_scope, "rm_2") is None
    assert await store.consume_ticket(wrong_scope, "rm_1") is None

    ticket = await store.create_ticket("rm_1", "pt_1", session_expiry)
    consumed = await store.consume_ticket(ticket, "rm_1")
    assert consumed is not None
    assert consumed.participant_id == "pt_1"
    assert consumed.session_expires_at == 3_000
    assert await store.consume_ticket(ticket, "rm_1") is None

    expired = await store.create_ticket("rm_1", "pt_1", session_expiry)
    now = 2_031.0
    assert await store.consume_ticket(expired, "rm_1") is None


async def test_memory_event_bus_isolates_roadmap_channels() -> None:
    bus = MemoryEventBus()
    rm_1_queue = await bus.subscribe("rm_1")
    rm_2_queue = await bus.subscribe("rm_2")

    await bus.publish(Event("rm_1", "roadmap.updated", {"roadmap_id": "rm_1"}))

    # publish() queues the Event itself (not pre-serialized text) so
    # stream() can inspect actions/payloads for revocation filtering before
    # serializing to SSE at yield time.
    assert await asyncio.wait_for(rm_1_queue.get(), timeout=0.1) == Event(
        roadmap_id="rm_1", action="roadmap.updated", payload={"roadmap_id": "rm_1"}
    )
    assert rm_2_queue.empty()
    await bus.unsubscribe("rm_1", rm_1_queue)
    await bus.unsubscribe("rm_2", rm_2_queue)
    assert bus._subscribers == {}


async def test_redis_ticket_getdel_and_malformed_payload() -> None:
    store = RedisTicketService(
        redis_url="redis://localhost:6379/0",
        key_prefix="test",
        connect_timeout_seconds=0.1,
        socket_timeout_seconds=0.1,
    )

    class FakeRedis:
        def __init__(self) -> None:
            self.values = {
                "test:ticket:valid": json.dumps({
                    "roadmap_id": "rm_1",
                    "participant_id": "pt_1",
                    "session_expires_at": 4_000,
                }),
                "test:ticket:malformed": "{",
            }

        async def getdel(self, key: str) -> str | None:
            return self.values.pop(key, None)

    store._redis = FakeRedis()  # type: ignore[assignment]
    ticket = await store.consume_ticket("valid", "rm_1")

    assert ticket is not None
    assert ticket.participant_id == "pt_1"
    assert await store.consume_ticket("valid", "rm_1") is None
    assert await store.consume_ticket("malformed", "rm_1") is None


async def test_redis_lock_rejects_malformed_acquire_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = RedisLockService(
        redis_url="redis://localhost:6379/0",
        key_prefix="test",
        connect_timeout_seconds=0.1,
        socket_timeout_seconds=0.1,
    )

    class FakeRedis:
        async def eval(self, *_args: object) -> list[object]:
            return [1, "not-json"]

    store._redis = FakeRedis()  # type: ignore[assignment]
    monkeypatch.setattr(lock_module, "event_bus", RecordingEventBus())

    with pytest.raises(RuntimeError, match="malformed edit lock"):
        await store.acquire_lock("rm_1", "task:tk_1", "pt_1", "Alex")


async def test_redis_event_adapter_rejects_invalid_messages() -> None:
    bus = RedisPubSubEventBus(
        redis_url="redis://localhost:6379/0",
        key_prefix="test",
        connect_timeout_seconds=0.1,
        socket_timeout_seconds=0.1,
    )

    assert bus._event_from_message("rm_1", "not-json") is None
    assert bus._event_from_message("rm_1", '{"action": 3, "payload": {}}') is None
    event = bus._event_from_message(
        "rm_1",
        '{"action": "roadmap.updated", "payload": {"roadmap_id": "rm_1"}}',
    )
    assert event == Event(
        roadmap_id="rm_1",
        action="roadmap.updated",
        payload={"roadmap_id": "rm_1"},
    )
