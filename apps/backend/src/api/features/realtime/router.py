from fastapi import APIRouter, Depends, Header, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.database import get_db
from api.features.realtime.schemas import EventTicketResponse
from api.features.realtime.stream_service import prepare_event_stream
from api.features.realtime.ticket_service import (
    EVENT_TICKET_COOKIE_NAME,
    EVENT_TICKET_TTL_SECONDS,
    event_ticket_cookie_path,
    ticket_service,
)
from api.shared.auth.auth_service import require_participant
from api.shared.auth.session_policy import ALL_ROLES
from api.shared.security.client_ip_service import extract_client_ip
from api.shared.security.rate_limit_service import enforce_rate_limit

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
        db, roadmap_id, authorization, ALL_ROLES
    )
    await enforce_rate_limit("events.ticket.participant", f'{participant.id}:{roadmap_id}')
    await enforce_rate_limit("events.ticket.ip", f'{extract_client_ip(request)}:{roadmap_id}')
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
    stream = await prepare_event_stream(db, roadmap_id, ticket)

    stream_response = StreamingResponse(
        stream.stream_chunks(),
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
