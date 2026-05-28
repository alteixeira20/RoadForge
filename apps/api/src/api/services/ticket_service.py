import json
import secrets
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

import redis.asyncio as redis
from redis.exceptions import RedisError, ResponseError

from api.config import get_settings

_TICKET_TTL_SECONDS = 30
_GETDEL_FALLBACK_SCRIPT = """
local value = redis.call("GET", KEYS[1])
if value then
    redis.call("DEL", KEYS[1])
end
return value
"""


@dataclass
class Ticket:
    roadmap_id: str
    participant_id: str
    expires_at: float
    session_expires_at: float


class EventTicketStore(Protocol):
    async def create_ticket(
        self,
        roadmap_id: str,
        participant_id: str,
        session_expires_at: datetime,
    ) -> str: ...

    async def consume_ticket(self, ticket_id: str, roadmap_id: str) -> Ticket | None: ...


class MemoryTicketService:
    def __init__(self, ttl: int = _TICKET_TTL_SECONDS):
        self._tickets: dict[str, Ticket] = {}
        self._ttl = ttl

    async def create_ticket(
        self,
        roadmap_id: str,
        participant_id: str,
        session_expires_at: datetime,
    ) -> str:
        # Opportunistic cleanup
        self._cleanup()

        ticket_id = secrets.token_urlsafe(32)
        self._tickets[ticket_id] = Ticket(
            roadmap_id=roadmap_id,
            participant_id=participant_id,
            expires_at=time.time() + self._ttl,
            session_expires_at=session_expires_at.timestamp(),
        )
        return ticket_id

    async def consume_ticket(self, ticket_id: str, roadmap_id: str) -> Ticket | None:
        ticket = self._tickets.pop(ticket_id, None)
        if not ticket:
            return None

        if ticket.roadmap_id != roadmap_id or time.time() > ticket.expires_at:
            return None

        return ticket

    def _cleanup(self) -> None:
        now = time.time()
        expired = [tid for tid, t in self._tickets.items() if now > t.expires_at]
        for tid in expired:
            del self._tickets[tid]


class RedisTicketService:
    def __init__(
        self,
        *,
        redis_url: str,
        key_prefix: str,
        connect_timeout_seconds: float,
        socket_timeout_seconds: float,
        ttl: int = _TICKET_TTL_SECONDS,
    ):
        if not redis_url:
            raise RuntimeError(
                "REDIS_URL is required when ROADFORGE_REALTIME_BACKEND=redis"
            )
        self._key_prefix = key_prefix
        self._ttl = ttl
        self._redis = redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=connect_timeout_seconds,
            socket_timeout=socket_timeout_seconds,
        )

    async def create_ticket(
        self,
        roadmap_id: str,
        participant_id: str,
        session_expires_at: datetime,
    ) -> str:
        ticket_id = secrets.token_urlsafe(32)
        payload = json.dumps({
            "roadmap_id": roadmap_id,
            "participant_id": participant_id,
            "session_expires_at": session_expires_at.timestamp(),
        })
        await self._redis.set(self._key(ticket_id), payload, ex=self._ttl)
        return ticket_id

    async def consume_ticket(self, ticket_id: str, roadmap_id: str) -> Ticket | None:
        payload = await self._get_and_delete(self._key(ticket_id))
        if not payload:
            return None

        ticket = self._ticket_from_payload(payload)
        if ticket is None or ticket.roadmap_id != roadmap_id:
            return None
        return ticket

    def _key(self, ticket_id: str) -> str:
        return f"{self._key_prefix}:ticket:{ticket_id}"

    async def _get_and_delete(self, key: str) -> str | None:
        try:
            return await self._redis.getdel(key)
        except AttributeError:
            return await self._redis.eval(_GETDEL_FALLBACK_SCRIPT, 1, key)
        except ResponseError as exc:
            if "unknown command" in str(exc).lower():
                return await self._redis.eval(_GETDEL_FALLBACK_SCRIPT, 1, key)
            raise
        except RedisError:
            raise

    def _ticket_from_payload(self, payload: str) -> Ticket | None:
        try:
            data = json.loads(payload)
            return Ticket(
                roadmap_id=data["roadmap_id"],
                participant_id=data["participant_id"],
                expires_at=time.time() + self._ttl,
                session_expires_at=float(data["session_expires_at"]),
            )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            return None


TicketService = MemoryTicketService


def _build_ticket_service() -> EventTicketStore:
    settings = get_settings()
    if settings.realtime_backend == "memory":
        return MemoryTicketService()
    if settings.realtime_backend == "redis":
        return RedisTicketService(
            redis_url=settings.redis_url or "",
            key_prefix=settings.redis_key_prefix,
            connect_timeout_seconds=settings.redis_connect_timeout_seconds,
            socket_timeout_seconds=settings.redis_socket_timeout_seconds,
        )
    raise RuntimeError(f"Unsupported realtime backend: {settings.realtime_backend}")


# Global ticket service instance
ticket_service = _build_ticket_service()
