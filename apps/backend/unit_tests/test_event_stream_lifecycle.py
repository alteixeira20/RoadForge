from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from redis.exceptions import ConnectionError
from starlette.requests import ClientDisconnect

from api.features.realtime import stream_service
from api.features.realtime.router import _EventStreamResponse
from api.features.realtime.ticket_service import Ticket
from api.shared.realtime.event_bus import RedisPubSubEventBus


@pytest.fixture
def stream_setup(monkeypatch):
    db = SimpleNamespace(close=AsyncMock())
    subscription = SimpleNamespace(close=AsyncMock(), get_event=AsyncMock())
    lease = SimpleNamespace(release=AsyncMock())
    monkeypatch.setattr(stream_service, 'ticket_service', SimpleNamespace(
        consume_ticket=AsyncMock(return_value=Ticket('rm_1', 'pt_1', 0, 0)),
    ))
    monkeypatch.setattr(stream_service, 'realtime_stream_registry', SimpleNamespace(
        acquire=AsyncMock(return_value=lease),
    ))
    monkeypatch.setattr(stream_service, 'event_bus', SimpleNamespace(
        open_subscription=AsyncMock(return_value=subscription),
    ))
    monkeypatch.setattr(stream_service, 'is_participant_revoked', AsyncMock(return_value=False))
    return db, subscription, lease


async def test_response_disconnect_before_first_chunk_releases_resources(stream_setup):
    db, subscription, lease = stream_setup
    stream = await stream_service.prepare_event_stream(db, 'rm_1', 'test_ticket')
    db.close.assert_awaited_once()
    response = _EventStreamResponse(stream)
    send = AsyncMock(side_effect=OSError('connection disappeared'))

    with pytest.raises(ClientDisconnect):
        await response({'type': 'http', 'asgi': {'spec_version': '2.4'}}, AsyncMock(), send)
    await stream.aclose()

    subscription.get_event.assert_not_awaited()
    subscription.close.assert_awaited_once()
    lease.release.assert_awaited_once()


async def test_database_close_failure_releases_subscription_and_lease(stream_setup):
    db, subscription, lease = stream_setup
    db.close.side_effect = RuntimeError('database close failed')

    with pytest.raises(RuntimeError, match='database close failed'):
        await stream_service.prepare_event_stream(db, 'rm_1', 'test_ticket')

    subscription.close.assert_awaited_once()
    lease.release.assert_awaited_once()


async def test_subscription_close_failure_still_releases_lease(stream_setup):
    db, subscription, lease = stream_setup
    stream = await stream_service.prepare_event_stream(db, 'rm_1', 'test_ticket')
    subscription.close.side_effect = RuntimeError('subscription close failed')

    with pytest.raises(RuntimeError, match='subscription close failed'):
        await stream.aclose()

    lease.release.assert_awaited_once()


async def test_failed_redis_subscribe_closes_partial_subscription(monkeypatch):
    pubsub = SimpleNamespace(
        subscribe=AsyncMock(side_effect=ConnectionError('subscribe failed')), aclose=AsyncMock(),
    )
    monkeypatch.setattr('redis.asyncio.Redis.from_url', lambda *args, **kwargs: SimpleNamespace(
        pubsub=lambda: pubsub,
    ))
    bus = RedisPubSubEventBus(
        redis_url='redis://localhost', key_prefix='test',
        connect_timeout_seconds=1, socket_timeout_seconds=1,
    )

    with pytest.raises(ConnectionError, match='subscribe failed'):
        await bus.open_subscription('rm_1')

    pubsub.aclose.assert_awaited_once()
