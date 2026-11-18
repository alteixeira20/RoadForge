from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.database import get_db
from api.features.sharing.join_schemas import JoinRoadmapRequest, JoinRoadmapResponse
from api.features.sharing.join_service import join_roadmap
from api.features.sharing.service import (
    get_participants,
    get_participants_summary,
    get_share_links,
    revoke_participant,
    revoke_share_link,
    rotate_share_link,
    update_roadmap_password,
)
from api.features.sharing.sharing_schemas import (
    ParticipantResponse,
    ParticipantSummaryResponse,
    RoadmapPasswordResponse,
    UpdatePasswordRequest,
)
from api.shared.auth.auth_service import require_participant
from api.shared.auth.session_policy import OWNER_EDITOR, OWNER_ONLY
from api.shared.auth.share_schemas import ShareLinkResponse, ShareRole
from api.shared.realtime.event_bus import RevocationRegistryUnavailableError
from api.shared.security.client_ip_service import extract_client_ip
from api.shared.security.rate_limit_service import enforce_rate_limit, participant_rate_key

router = APIRouter(tags=["roadmaps"])
join_router = APIRouter(tags=["roadmaps"])


@router.get("/{roadmap_id}/share-links", response_model=list[ShareLinkResponse])
async def fetch_share_links(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[ShareLinkResponse]:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_ONLY)
    await enforce_rate_limit("share_links.read", participant_rate_key(participant.id, roadmap_id))
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
    participant = await require_participant(db, roadmap_id, authorization, OWNER_ONLY)
    await enforce_rate_limit("share_link.rotate", f'{participant.id}:{roadmap_id}:{role}')
    settings = get_settings()
    return await rotate_share_link(db, roadmap_id, role, settings.web_base_url, participant)


@router.delete("/{roadmap_id}/share-links/{role}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_share_link(
    roadmap_id: str,
    role: ShareRole,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> Response:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_ONLY)
    await enforce_rate_limit("share_link.revoke", f'{participant.id}:{roadmap_id}:{role}')
    await revoke_share_link(db, roadmap_id, role, participant)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/{roadmap_id}/password",
    response_model=RoadmapPasswordResponse,
)
async def put_roadmap_password(
    roadmap_id: str,
    payload: UpdatePasswordRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapPasswordResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_ONLY)
    await enforce_rate_limit(
          "roadmap.password.update", participant_rate_key(participant.id, roadmap_id),
    )
    enabled = await update_roadmap_password(db, roadmap_id, payload.password, participant)
    return RoadmapPasswordResponse(is_password_enabled=enabled)


@router.get("/{roadmap_id}/participants")
async def fetch_participants(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[ParticipantResponse] | list[ParticipantSummaryResponse]:
    # Owners see the full participant listing (timestamps, link linkage).
    # Editors see a reduced projection - just enough for assignee suggestions.
    # Viewers remain forbidden.
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("participants.read", participant_rate_key(participant.id, roadmap_id))
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
    participant = await require_participant(db, roadmap_id, authorization, OWNER_ONLY)
    await enforce_rate_limit(
          "participants.revoke", participant_rate_key(participant.id, roadmap_id),
    )
    try:
        await revoke_participant(db, roadmap_id, participant_id, participant)
    except RevocationRegistryUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Revocation registry temporarily unavailable; please retry",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@join_router.post("/join", response_model=JoinRoadmapResponse)
async def post_join(
    request: Request,
    payload: JoinRoadmapRequest,
    db: AsyncSession = Depends(get_db),
) -> JoinRoadmapResponse:
    client_ip = extract_client_ip(request)
    await enforce_rate_limit("join.ip", client_ip)
    return await join_roadmap(db, payload, client_ip)
