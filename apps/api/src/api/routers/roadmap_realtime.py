from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.database import async_session_factory, get_db
from api.schemas.roadmap import EventTicketResponse
from api.services.auth_service import is_participant_revoked, require_participant
from api.services.client_ip_service import extract_client_ip
from api.services.event_bus import event_bus, forward_subscription
from api.services.rate_limit_service import rate_limiter
from api.services.realtime_stream_limit import (
    RealtimeStreamLimitUnavailableError,
    realtime_stream_registry,
)
from api.services.sharing_service import resolve_realtime_revocation
from api.services.ticket_service import (
    EVENT_TICKET_COOKIE_NAME,
    EVENT_TICKET_TTL_SECONDS,
    event_ticket_cookie_path,
    ticket_service,
)

router = APIRouter(tags=["roadmaps"])


@router.post("/{roadmap_id}/events/ticket", response_model=EventTicketResponse)
async def post_event_ticket(
    request: Request,
    response: Response,
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> EventTicketResponse:
    participant = await require_participant(
        db, roadmap_id, authorization, {"owner", "editor", "viewer"}
    )
    await rate_limiter.enforce(
        "events.ticket.participant",
        f"{participant.id}:{roadmap_id}",
        limit=10,
        window_seconds=60,
    )
    await rate_limiter.enforce(
        "events.ticket.ip",
        f"{extract_client_ip(request)}:{roadmap_id}",
        limit=60,
        window_seconds=60,
    )
    ticket = await ticket_service.create_ticket(
        roadmap_id, participant.id, participant.session_expires_at
    )
    settings = get_settings()
    response.set_cookie(
        EVENT_TICKET_COOKIE_NAME,
        ticket,
        max_age=EVENT_TICKET_TTL_SECONDS,
        path=event_ticket_cookie_path(roadmap_id),
        secure=settings.is_production_like,
        httponly=True,
        samesite="strict",
    )
    response.headers["Cache-Control"] = "no-store"
    return EventTicketResponse(expires_in=EVENT_TICKET_TTL_SECONDS)


@router.get("/{roadmap_id}/events")
async def get_events(
    request: Request,
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
):
    ticket = request.cookies.get(EVENT_TICKET_COOKIE_NAME)
    event_ticket = (
        await ticket_service.consume_ticket(ticket, roadmap_id)
        if ticket
        else None
    )
    if not event_ticket:
        raise HTTPException(status_code=401, detail="Invalid or expired event ticket")

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

    try:
        subscription = await event_bus.open_subscription(roadmap_id)
    except Exception:
        await stream_lease.release()
        raise
    if await is_participant_revoked(db, roadmap_id, event_ticket.participant_id):
        await subscription.close()
        await stream_lease.release()
        raise HTTPException(status_code=401, detail="Session revoked")

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
            await stream_lease.release()

    stream_response = StreamingResponse(
        _bounded_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
    stream_response.delete_cookie(
        EVENT_TICKET_COOKIE_NAME,
        path=event_ticket_cookie_path(roadmap_id),
        secure=get_settings().is_production_like,
        httponly=True,
        samesite="strict",
    )
    return stream_response
