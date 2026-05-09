import asyncio
import time
from dataclasses import dataclass
from typing import Dict, Tuple

from api.services.event_bus import Event, event_bus


@dataclass
class Lock:
    roadmap_id: str
    target: str
    participant_id: str
    display_name: str
    expires_at: float


class LockService:
    def __init__(self, ttl: int = 30):
        # (roadmap_id, target) -> Lock
        self._locks: Dict[Tuple[str, str], Lock] = {}
        self._ttl = ttl
        self._lock = asyncio.Lock()

    async def acquire_lock(
        self, roadmap_id: str, target: str, participant_id: str, display_name: str
    ) -> Lock | None:
        async with self._lock:
            key = (roadmap_id, target)
            now = time.time()
            
            existing = self._locks.get(key)
            if existing and now < existing.expires_at:
                if existing.participant_id != participant_id:
                    # Locked by someone else
                    return None
            
            # Create or refresh lock
            lock = Lock(
                roadmap_id=roadmap_id,
                target=target,
                participant_id=participant_id,
                display_name=display_name,
                expires_at=now + self._ttl
            )
            self._locks[key] = lock
            
            # Broadast event
            await event_bus.publish(Event(
                roadmap_id=roadmap_id,
                action="lock.acquired",
                payload={
                    "roadmap_id": roadmap_id,
                    "target": target,
                    "participant_id": participant_id,
                    "display_name": display_name,
                }
            ))
            
            return lock

    async def release_lock(self, roadmap_id: str, target: str, participant_id: str):
        async with self._lock:
            key = (roadmap_id, target)
            existing = self._locks.get(key)
            
            if not existing:
                return

            if existing.participant_id != participant_id:
                # Cannot release someone else's lock
                return

            del self._locks[key]
            
            # Broadcast event
            await event_bus.publish(Event(
                roadmap_id=roadmap_id,
                action="lock.released",
                payload={
                    "roadmap_id": roadmap_id,
                    "target": target,
                    "participant_id": participant_id,
                }
            ))

    def get_locks_for_roadmap(self, roadmap_id: str) -> list[Lock]:
        now = time.time()
        # Prune expired locks for this roadmap opportunistically
        expired_keys = [
            k for k, l in self._locks.items() 
            if k[0] == roadmap_id and now > l.expires_at
        ]
        for k in expired_keys:
            del self._locks[k]

        return [l for k, l in self._locks.items() if k[0] == roadmap_id]


# Global lock service instance
lock_service = LockService()
