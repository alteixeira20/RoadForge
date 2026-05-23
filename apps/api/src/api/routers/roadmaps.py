from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.database import get_db
from api.schemas.roadmap import (
    ActivityLogListResponse,
    CheckpointResponse,
    CreateRoadmapRequest,
    CreateRoadmapResponse,
    DeleteRoadmapResponse,
    EventTicketResponse,
    JoinRoadmapRequest,
    JoinRoadmapResponse,
    LockRequest,
    LockResponse,
    ParticipantResponse,
    RoadmapResponse,
    RoadmapVersionDetailResponse,
    RoadmapVersionSummaryResponse,
    ShareLinkResponse,
    ShareRole,
    UpdateRoadmapRequest,
)
from api.services.auth_service import require_participant
from api.services.event_bus import event_bus
from api.services.lock_service import lock_service
from api.services.roadmap_service import (
    create_roadmap,
    create_roadmap_checkpoint,
    delete_roadmap,
    get_activity_logs,
    get_participants,
    get_roadmap,
    get_roadmap_version,
    get_roadmap_versions,
    get_share_links,
    join_roadmap,
    revoke_participant,
    revoke_share_link,
    restore_roadmap_version,
    rotate_share_link,
    update_roadmap,
)
from api.services.ticket_service import ticket_service

router = APIRouter(tags=["roadmaps"])

_OWNER_EDITOR = {"owner", "editor"}
_OWNER_ONLY = {"owner"}


@router.post("", response_model=CreateRoadmapResponse, status_code=status.HTTP_201_CREATED)
async def post_roadmap(
    payload: CreateRoadmapRequest,
    db: AsyncSession = Depends(get_db),
) -> CreateRoadmapResponse:
    settings = get_settings()
    return await create_roadmap(db, payload, settings.web_base_url)


@router.post("/join", response_model=JoinRoadmapResponse)
async def post_join(
    payload: JoinRoadmapRequest,
    db: AsyncSession = Depends(get_db),
) -> JoinRoadmapResponse:
    return await join_roadmap(db, payload)


@router.get("/{roadmap_id}", response_model=RoadmapResponse)
async def fetch_roadmap(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    await require_participant(db, roadmap_id, authorization, {"owner", "editor", "viewer"})
    return await get_roadmap(db, roadmap_id)


@router.put("/{roadmap_id}", response_model=RoadmapResponse)
async def put_roadmap(
    roadmap_id: str,
    payload: UpdateRoadmapRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    return await update_roadmap(db, roadmap_id, payload, participant)


@router.delete("/{roadmap_id}", response_model=DeleteRoadmapResponse)
async def remove_roadmap(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> DeleteRoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    result = await delete_roadmap(db, roadmap_id, participant)
    return DeleteRoadmapResponse(**result)


@router.get("/{roadmap_id}/share-links", response_model=list[ShareLinkResponse])
async def fetch_share_links(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[ShareLinkResponse]:
    await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
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
    await revoke_share_link(db, roadmap_id, role, participant)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{roadmap_id}/versions", response_model=list[RoadmapVersionSummaryResponse])
async def fetch_roadmap_versions(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[RoadmapVersionSummaryResponse]:
    await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    return await get_roadmap_versions(db, roadmap_id)


@router.post("/{roadmap_id}/versions/checkpoint", response_model=CheckpointResponse)
async def post_checkpoint(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CheckpointResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    created, version = await create_roadmap_checkpoint(db, roadmap_id, participant)
    return CheckpointResponse(created=created, version=version)


@router.get("/{roadmap_id}/versions/{version_id}", response_model=RoadmapVersionDetailResponse)
async def fetch_roadmap_version(
    roadmap_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapVersionDetailResponse:
    await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    return await get_roadmap_version(db, roadmap_id, version_id)


@router.post("/{roadmap_id}/versions/{version_id}/restore", response_model=RoadmapResponse)
async def post_restore_roadmap_version(
    roadmap_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    return await restore_roadmap_version(db, roadmap_id, version_id, participant)


@router.get("/{roadmap_id}/participants", response_model=list[ParticipantResponse])
async def fetch_participants(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[ParticipantResponse]:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    return await get_participants(db, roadmap_id, participant)


@router.post("/{roadmap_id}/participants/{participant_id}/revoke", status_code=status.HTTP_204_NO_CONTENT)
async def post_revoke_participant(
    roadmap_id: str,
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> Response:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    await revoke_participant(db, roadmap_id, participant_id, participant)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{roadmap_id}/events/ticket", response_model=EventTicketResponse)
async def post_event_ticket(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> EventTicketResponse:
    # All roles (owner, editor, viewer) can subscribe to events.
    participant = await require_participant(db, roadmap_id, authorization, {"owner", "editor", "viewer"})
    ticket = ticket_service.create_ticket(roadmap_id, participant.id)
    return EventTicketResponse(ticket=ticket, expires_in=30)


@router.get("/{roadmap_id}/events")
async def get_events(
    roadmap_id: str,
    ticket: str = Query(...),
):
    participant_id = ticket_service.consume_ticket(ticket, roadmap_id)
    if not participant_id:
        raise HTTPException(status_code=401, detail="Invalid or expired event ticket")

    return StreamingResponse(
        event_bus.stream(roadmap_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable buffering for Nginx
        },
    )


@router.post("/{roadmap_id}/locks", response_model=LockResponse)
async def post_lock(
    roadmap_id: str,
    payload: LockRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> LockResponse:
    participant = await require_participant(db, roadmap_id, authorization, {"owner", "editor"})
    lock = await lock_service.acquire_lock(
        roadmap_id, payload.target, participant.id, participant.display_name
    )
    if not lock:
        raise HTTPException(status_code=409, detail="Target is locked by another participant")
    
    return LockResponse(
        roadmap_id=lock.roadmap_id,
        target=lock.target,
        participant_id=lock.participant_id,
        display_name=lock.display_name,
        expires_at=datetime.fromtimestamp(lock.expires_at, timezone.utc),
    )


@router.delete("/{roadmap_id}/locks/{target}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lock(
    roadmap_id: str,
    target: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> Response:
    participant = await require_participant(db, roadmap_id, authorization, {"owner", "editor"})
    await lock_service.release_lock(roadmap_id, target, participant.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{roadmap_id}/locks", response_model=list[LockResponse])
async def get_locks(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[LockResponse]:
    # Viewer can see locks too
    await require_participant(db, roadmap_id, authorization, {"owner", "editor", "viewer"})
    locks = lock_service.get_locks_for_roadmap(roadmap_id)
    return [
        LockResponse(
            roadmap_id=l.roadmap_id,
            target=l.target,
            participant_id=l.participant_id,
            display_name=l.display_name,
            expires_at=datetime.fromtimestamp(l.expires_at, timezone.utc),
        )
        for l in locks
    ]


@router.get("/{roadmap_id}/activity", response_model=ActivityLogListResponse)
async def fetch_activity_logs(
    roadmap_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> ActivityLogListResponse:
    await require_participant(db, roadmap_id, authorization, {"owner", "editor", "viewer"})
    return await get_activity_logs(db, roadmap_id, limit, offset)
