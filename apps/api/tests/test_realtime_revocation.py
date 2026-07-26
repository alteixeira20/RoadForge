"""
RF-044 — Immediate realtime revocation.

Groups:
  A  MemoryEventBus stream filtering / defense-in-depth revalidation
  B  RedisPubSubEventBus stream filtering (fake pubsub double, no real Redis)
  C  HTTP-level: ticket redemption and open-stream revocation
"""

from __future__ import annotations

import asyncio

import pytest
from httpx import AsyncClient

from api.services import event_bus as event_bus_module
from api.services.auth_service import is_participant_revoked
from api.services.event_bus import Event, MemoryEventBus, RedisPubSubEventBus
from tests.conftest import create_roadmap
from tests.test_auth_and_share_links import _auth, _join, _rotate_link

pytestmark = pytest.mark.asyncio


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


# ─── Group B — RedisPubSubEventBus (fake pubsub double) ───────────────────────


class _FakePubSub:
    def __init__(self, messages: list[dict | None]):
        self._messages = list(messages)
        self.subscribed_channel: str | None = None
        self.closed = False

    async def subscribe(self, channel: str) -> None:
        self.subscribed_channel = channel

    async def get_message(self, *, ignore_subscribe_messages: bool, timeout: float):
        if self._messages:
            return self._messages.pop(0)
        return None

    async def unsubscribe(self, channel: str) -> None:
        pass

    async def close(self) -> None:
        self.closed = True


class _FakeRedis:
    def __init__(self, pubsub: _FakePubSub):
        self._pubsub = pubsub

    def pubsub(self):
        return self._pubsub


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
    fake_pubsub = _FakePubSub([None, None])

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
