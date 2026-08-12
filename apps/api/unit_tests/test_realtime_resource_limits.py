import pytest

from api.services.event_bus import (
    Event,
    MemoryEventBus,
    SubscriptionOverflowError,
    _MEMORY_SUBSCRIPTION_QUEUE_MAX,
    forward_subscription,
)
from api.services.realtime_stream_limit import MemoryRealtimeStreamRegistry


@pytest.mark.asyncio
async def test_memory_stream_registry_caps_concurrent_streams() -> None:
    registry = MemoryRealtimeStreamRegistry(max_streams=2)

    first = await registry.acquire("rm_1", "pt_1")
    second = await registry.acquire("rm_1", "pt_1")
    rejected = await registry.acquire("rm_1", "pt_1")

    assert first is not None
    assert second is not None
    assert rejected is None

    await first.release()
    replacement = await registry.acquire("rm_1", "pt_1")
    assert replacement is not None

    await second.release()
    await replacement.release()


@pytest.mark.asyncio
async def test_memory_event_bus_disconnects_slow_consumer_on_queue_overflow() -> None:
    bus = MemoryEventBus()
    subscription = await bus.open_subscription("rm_1")

    for index in range(_MEMORY_SUBSCRIPTION_QUEUE_MAX + 1):
        await bus.publish(
            Event(
                roadmap_id="rm_1",
                action="roadmap.updated",
                payload={"index": index},
            )
        )

    with pytest.raises(SubscriptionOverflowError):
        await subscription.get_event(0.1)


@pytest.mark.asyncio
async def test_roadmap_deleted_is_terminal_for_existing_stream() -> None:
    bus = MemoryEventBus()
    subscription = await bus.open_subscription("rm_1")
    stream = forward_subscription(subscription, participant_id="pt_1")

    await bus.publish(
        Event(
            roadmap_id="rm_1",
            action="roadmap.deleted",
            payload={"roadmap_id": "rm_1"},
        )
    )

    first_chunk = await anext(stream)
    assert "event: roadmap.deleted" in first_chunk
    with pytest.raises(StopAsyncIteration):
        await anext(stream)
