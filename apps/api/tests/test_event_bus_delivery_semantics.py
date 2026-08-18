from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from redis.exceptions import RedisError

from api.services.event_bus import (
    Event,
    RedisPubSubEventBus,
    RedisRevocationRegistry,
    RevocationRegistryUnavailableError,
)

pytestmark = pytest.mark.asyncio


def _redis_bus() -> RedisPubSubEventBus:
    return RedisPubSubEventBus(
        redis_url="redis://fake",
        key_prefix="rf",
        connect_timeout_seconds=1,
        socket_timeout_seconds=1,
    )


async def test_redis_event_publish_failure_is_best_effort_after_authoritative_mutation():
    bus = _redis_bus()
    bus._redis = AsyncMock()
    bus._redis.publish.side_effect = RedisError("simulated publish outage")

    await bus.publish(Event(
        roadmap_id="rm_1",
        action="roadmap.updated",
        payload={"roadmap_id": "rm_1"},
    ))

    bus._redis.publish.assert_awaited_once()


async def test_revocation_registry_pending_mark_remains_fail_closed():
    redis_client = AsyncMock()
    redis_client.set.side_effect = RedisError("simulated registry outage")
    registry = RedisRevocationRegistry(redis_client, key_prefix="rf")

    with pytest.raises(RevocationRegistryUnavailableError):
        await registry.mark_pending("rm_1", "pt_1")
