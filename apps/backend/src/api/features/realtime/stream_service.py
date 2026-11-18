import logging
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import async_session_factory
from api.features.realtime.stream_limit import (
    RealtimeStreamLimitUnavailableError,
    realtime_stream_registry,
)
from api.features.realtime.ticket_service import ticket_service
from api.shared.auth.auth_service import is_participant_revoked
from api.shared.realtime.event_bus import (
    RevocationMark,
    event_bus,
    forward_subscription,
    log_revocation_failure,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AuthorizedEventStream:
    stream_chunks: Callable[[], AsyncIterator[str]]


async def resolve_realtime_revocation(
    db_session_factory: Callable[[], AbstractAsyncContextManager[AsyncSession]],
    roadmap_id: str,
    participant_id: str,
) -> bool | None:
    """
    Per-event authorization check for `forward_subscription`
    (`is_participant_revoked_now`).

    Only a `COMMITTED` fast-path mark is trusted directly - it is written
    by `_commit_revocation` only after the PostgreSQL commit lands, so it
    can never be stale in the direction that matters (a participant it
    calls revoked really is). Every other mark, including `ACTIVE` (no
    mark at all), falls back to the authoritative PostgreSQL check:
    `ACTIVE` is ambiguous between "never revoked" and "revoked, but the
    registry lost the mark" (e.g. a Redis restart with no persistence), so
    trusting it directly would let a lost mark silently restore visibility
    to a revoked participant. `PENDING` (in-flight or abandoned) and
    `UNKNOWN` (a failed registry read) are equally untrusted on their own.
    A `PENDING` mark is opportunistically reconciled once the PostgreSQL
    fallback resolves it, clearing an abandoned mark or promoting one
    whose commit had already landed.

    Returns `True` (suppress the event), `False` (forward it), or `None`
    when neither the registry nor PostgreSQL can answer - callers must
    treat `None` as fail-closed, never as "not revoked".
    """
    mark = await event_bus.revocations.get_mark(roadmap_id, participant_id)
    if mark is RevocationMark.COMMITTED:
        return True

    try:
        async with db_session_factory() as db:
            revoked = await is_participant_revoked(db, roadmap_id, participant_id)
    except Exception:
        logger.exception(
            "Failed to resolve participant revocation state against PostgreSQL"
        )
        return None

    if revoked:
        if mark is RevocationMark.PENDING:
            await log_revocation_failure(
                event_bus.revocations.promote_committed(roadmap_id, participant_id),
                "Failed to promote fast-path revocation registry mark to committed",
            )
        return True

    if mark is RevocationMark.PENDING:
        await log_revocation_failure(
            event_bus.revocations.clear(roadmap_id, participant_id),
            "Failed to clear abandoned fast-path revocation registry mark",
        )
    return False


async def prepare_event_stream(
    db: AsyncSession, roadmap_id: str, ticket: str | None
) -> AuthorizedEventStream:
    event_ticket = (
        await ticket_service.consume_ticket(ticket, roadmap_id)
        if ticket
        else None
    )
    if not event_ticket:
        raise HTTPException(status_code=401, detail="Invalid or expired event ticket")

    try:
        if await is_participant_revoked(db, roadmap_id, event_ticket.participant_id):
            raise HTTPException(status_code=401, detail="Session revoked")

        try:
            stream_lease = await realtime_stream_registry.acquire(
                roadmap_id, event_ticket.participant_id
            )
        except RealtimeStreamLimitUnavailableError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Realtime stream limit temporarily unavailable",
            ) from exc
        if stream_lease is None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many active realtime streams for this participant",
            )

        lease_released = False

        async def _safe_release_lease() -> None:
            nonlocal lease_released
            if not lease_released:
                lease_released = True
                await stream_lease.release()

        subscription_closed = False

        async def _safe_close_subscription() -> None:
            nonlocal subscription_closed
            if not subscription_closed and subscription is not None:
                subscription_closed = True
                await subscription.close()

        subscription = None
        setup_successful = False
        try:
            subscription = await event_bus.open_subscription(roadmap_id)
            if await is_participant_revoked(db, roadmap_id, event_ticket.participant_id):
                raise HTTPException(status_code=401, detail="Session revoked")
            setup_successful = True
        finally:
            if not setup_successful:
                await _safe_close_subscription()
                await _safe_release_lease()
    finally:
        await db.close()

    async def _is_still_authorized() -> bool:
        if not await stream_lease.refresh():
            return False
        async with async_session_factory() as session:
            return not await is_participant_revoked(
                session, roadmap_id, event_ticket.participant_id
            )

    async def _is_revoked_fast() -> bool | None:
        return await resolve_realtime_revocation(
            async_session_factory, roadmap_id, event_ticket.participant_id
        )

    async def _bounded_stream():
        try:
            async for chunk in forward_subscription(
                subscription,
                participant_id=event_ticket.participant_id,
                close_at=event_ticket.session_expires_at,
                is_still_authorized=_is_still_authorized,
                is_participant_revoked_now=_is_revoked_fast,
            ):
                yield chunk
        finally:
            await _safe_close_subscription()
            await _safe_release_lease()

    return AuthorizedEventStream(stream_chunks=_bounded_stream)
