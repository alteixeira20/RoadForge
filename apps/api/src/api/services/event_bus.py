import asyncio
import json
from dataclasses import dataclass
from typing import Any, Dict, Set


@dataclass
class Event:
    roadmap_id: str
    action: str
    payload: Dict[str, Any]

    def to_sse(self) -> str:
        data = json.dumps(self.payload)
        return f"event: {self.action}\ndata: {data}\n\n"


class EventBus:
    def __init__(self):
        # roadmap_id -> set of queues
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, roadmap_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            if roadmap_id not in self._subscribers:
                self._subscribers[roadmap_id] = set()
            self._subscribers[roadmap_id].add(queue)
        return queue

    async def unsubscribe(self, roadmap_id: str, queue: asyncio.Queue):
        async with self._lock:
            if roadmap_id in self._subscribers:
                self._subscribers[roadmap_id].discard(queue)
                if not self._subscribers[roadmap_id]:
                    del self._subscribers[roadmap_id]

    async def publish(self, event: Event):
        async with self._lock:
            queues = self._subscribers.get(event.roadmap_id, set()).copy()
        
        if not queues:
            return

        sse_data = event.to_sse()
        for queue in queues:
            await queue.put(sse_data)

    async def stream(self, roadmap_id: str):
        """
        SSE event generator for a roadmap. Handles subscribe/unsubscribe and heartbeats.
        """
        queue = await self.subscribe(roadmap_id)
        try:
            while True:
                try:
                    # Wait for an event from the bus or a heartbeat timeout.
                    event_data = await asyncio.wait_for(queue.get(), timeout=25.0)
                    yield event_data
                except asyncio.TimeoutError:
                    # Send an SSE comment as a heartbeat to keep the connection alive.
                    yield ": heartbeat\n\n"
        finally:
            await self.unsubscribe(roadmap_id, queue)


# Global event bus instance
event_bus = EventBus()
