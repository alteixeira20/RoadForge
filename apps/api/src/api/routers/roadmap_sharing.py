from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.database import get_db
from api.schemas.roadmap import (
    ParticipantResponse,
    ParticipantSummaryResponse,
    ShareLinkResponse,
    ShareRole,
)
from api.services.auth_service import require_participant
from api.services.event_bus import RevocationRegistryUnavailableError
from api.services.rate_limit_service import rate_limiter
from api.services.sharing_service import (
    get_participants,
    get_participants_summary,
    get_share_links,
    revoke_participant,
    revoke_share_link,
    rotate_share_link,
)

router = APIRouter(tags=["roadmaps"])
_OWNER_EDITOR = {"owner", "editor"}
_OWNER_ONLY = {"owner"}


def _participant_rate_key(participant_id: str, roadmap_id: str) -> str:
    return f"{participant_id}:{roadmap_id}"


@router.get("/{roadmap_id}/share-links", response_model=list[ShareLinkResponse])
async def fetch_share_links(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[ShareLinkResponse]:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    await rate_limiter.enforce(
        "share_links.read",
        _participant_rate_key(participant.id, roadmap_id),
        limit=60,
        window_seconds=60,
    )
    settings = get_settings()
    return await get_share_links(db, roadmap_id, settings.web_base_url)


@router.post(
    "/{roadmap_id}/share-links/{role}/rotate",
    response_model=ShareLinkResponse,
)
async def post_rotate_share_link(
    roadmap_id: str,
    role: ShareRole,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> ShareLinkResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    await rate_limiter.enforce(
        "share_link.rotate",
        f"{participant.id}:{roadmap_id}:{role}",
        limit=5,
        window_seconds=60,
    )
    settings = get_settings()
    return await rotate_share_link(db, roadmap_id, role, settings.web_base_url, participant)


@router.delete("/{roadmap_id}/share-links/{role}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_share_link(
    roadmap_id: str,
    role: ShareRole,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> Response:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    await rate_limiter.enforce(
        "share_link.revoke",
        f"{participant.id}:{roadmap_id}:{role}",
        limit=10,
        window_seconds=60,
    )
    await revoke_share_link(db, roadmap_id, role, participant)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{roadmap_id}/participants")
async def fetch_participants(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[ParticipantResponse] | list[ParticipantSummaryResponse]:
    # Owners see the full participant listing (timestamps, link linkage).
    # Editors see a reduced projection — just enough for assignee suggestions.
    # Viewers remain forbidden.
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "participants.read",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    if participant.role == "owner":
        return await get_participants(db, roadmap_id, participant)
    return await get_participants_summary(db, roadmap_id, participant)


@router.post(
    "/{roadmap_id}/participants/{participant_id}/revoke",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def post_revoke_participant(
    roadmap_id: str,
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> Response:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    await rate_limiter.enforce(
        "participants.revoke",
        _participant_rate_key(participant.id, roadmap_id),
        limit=10,
        window_seconds=60,
    )
    try:
        await revoke_participant(db, roadmap_id, participant_id, participant)
    except RevocationRegistryUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Revocation registry temporarily unavailable; please retry",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
