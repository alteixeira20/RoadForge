from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.database import get_db
from api.schemas.roadmap import (
    ActivityLogListResponse,
    CheckpointResponse,
    CreateRoadmapRequest,
    CreateRoadmapResponse,
    CreateTagRequest,
    DeleteRoadmapResponse,
    EventTicketResponse,
    JoinRoadmapRequest,
    JoinRoadmapResponse,
    LockRequest,
    LockResponse,
    ParticipantResponse,
    PatchTaskDoneRequest,
    RoadmapConflictResponse,
    RoadmapResponse,
    RoadmapVersionDetailResponse,
    RoadmapVersionSummaryResponse,
    ShareLinkResponse,
    ShareRole,
    TagResponse,
    UpdateRoadmapRequest,
    UpdateTagRequest,
)
from api.services.auth_service import require_participant
from api.services.client_ip_service import extract_client_ip
from api.services.event_bus import event_bus
from api.services.lock_service import lock_service
from api.services.rate_limit_service import rate_limiter
from api.services.roadmap_join_service import join_roadmap
from api.services.roadmap_service import (
    RoadmapConflictError,
    create_roadmap,
    delete_roadmap,
    get_activity_logs,
    get_roadmap,
    update_roadmap,
)
from api.services.roadmap_tag_service import (
    create_tag,
    delete_tag,
    list_tags,
    update_tag,
)
from api.services.roadmap_task_service import (
    delete_task_claim,
    patch_task_claim,
    patch_task_done,
)
from api.services.sharing_service import (
    get_participants,
    get_share_links,
    revoke_participant,
    revoke_share_link,
    rotate_share_link,
)
from api.services.ticket_service import ticket_service
from api.services.version_service import (
    create_roadmap_checkpoint,
    get_roadmap_version,
    get_roadmap_versions,
    restore_roadmap_version,
)

router = APIRouter(tags=["roadmaps"])

_OWNER_EDITOR = {"owner", "editor"}
_OWNER_ONLY = {"owner"}


def _participant_rate_key(participant_id: str, roadmap_id: str) -> str:
    return f"{participant_id}:{roadmap_id}"


@router.post("", response_model=CreateRoadmapResponse, status_code=status.HTTP_201_CREATED)
async def post_roadmap(
    request: Request,
    payload: CreateRoadmapRequest,
    db: AsyncSession = Depends(get_db),
) -> CreateRoadmapResponse:
    await rate_limiter.enforce(
        "roadmap.create.ip", extract_client_ip(request), limit=10, window_seconds=3600
    )
    settings = get_settings()
    return await create_roadmap(db, payload, settings.web_base_url)


@router.post("/join", response_model=JoinRoadmapResponse)
async def post_join(
    request: Request,
    payload: JoinRoadmapRequest,
    db: AsyncSession = Depends(get_db),
) -> JoinRoadmapResponse:
    client_ip = extract_client_ip(request)
    await rate_limiter.enforce("join.ip", client_ip, limit=20, window_seconds=60)
    return await join_roadmap(db, payload, client_ip)


@router.get("/{roadmap_id}", response_model=RoadmapResponse)
async def fetch_roadmap(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(
        db, roadmap_id, authorization, {"owner", "editor", "viewer"}
    )
    await rate_limiter.enforce(
        "roadmap.read",
        _participant_rate_key(participant.id, roadmap_id),
        limit=240,
        window_seconds=60,
    )
    return await get_roadmap(db, roadmap_id)


@router.put(
    "/{roadmap_id}",
    response_model=RoadmapResponse,
    responses={409: {"model": RoadmapConflictResponse}},
)
async def put_roadmap(
    roadmap_id: str,
    payload: UpdateRoadmapRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "roadmap.update",
        _participant_rate_key(participant.id, roadmap_id),
        limit=60,
        window_seconds=60,
    )
    try:
        return await update_roadmap(db, roadmap_id, payload, participant)
    except RoadmapConflictError as exc:
        return JSONResponse(status_code=409, content=exc.response.model_dump(mode="json"))


@router.patch(
    "/{roadmap_id}/tasks/{task_id}/done",
    response_model=RoadmapResponse,
    responses={409: {"model": RoadmapConflictResponse}},
)
async def patch_roadmap_task_done(
    roadmap_id: str,
    task_id: str,
    payload: PatchTaskDoneRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.done.patch",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    try:
        return await patch_task_done(db, roadmap_id, task_id, payload, participant)
    except RoadmapConflictError as exc:
        return JSONResponse(status_code=409, content=exc.response.model_dump(mode="json"))


@router.patch(
    "/{roadmap_id}/tasks/{task_id}/claim",
    response_model=RoadmapResponse,
)
async def patch_roadmap_task_claim(
    roadmap_id: str,
    task_id: str,
    override: bool = False,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.claim.patch",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await patch_task_claim(db, roadmap_id, task_id, participant, override=override)


@router.delete(
    "/{roadmap_id}/tasks/{task_id}/claim",
    response_model=RoadmapResponse,
)
async def delete_roadmap_task_claim(
    roadmap_id: str,
    task_id: str,
    override: bool = False,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.claim.delete",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await delete_task_claim(db, roadmap_id, task_id, participant, override=override)


@router.delete("/{roadmap_id}", response_model=DeleteRoadmapResponse)
async def remove_roadmap(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> DeleteRoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    await rate_limiter.enforce(
        "roadmap.delete",
        _participant_rate_key(participant.id, roadmap_id),
        limit=10,
        window_seconds=60,
    )
    result = await delete_roadmap(db, roadmap_id, participant)
    return DeleteRoadmapResponse(**result)


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


@router.get("/{roadmap_id}/versions", response_model=list[RoadmapVersionSummaryResponse])
async def fetch_roadmap_versions(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[RoadmapVersionSummaryResponse]:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    await rate_limiter.enforce(
        "versions.read",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await get_roadmap_versions(db, roadmap_id)


@router.post("/{roadmap_id}/versions/checkpoint", response_model=CheckpointResponse)
async def post_checkpoint(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CheckpointResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "versions.checkpoint",
        _participant_rate_key(participant.id, roadmap_id),
        limit=10,
        window_seconds=60,
    )
    created, version = await create_roadmap_checkpoint(db, roadmap_id, participant)
    return CheckpointResponse(created=created, version=version)


@router.get("/{roadmap_id}/versions/{version_id}", response_model=RoadmapVersionDetailResponse)
async def fetch_roadmap_version(
    roadmap_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapVersionDetailResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    await rate_limiter.enforce(
        "version.read",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await get_roadmap_version(db, roadmap_id, version_id)


@router.post("/{roadmap_id}/versions/{version_id}/restore", response_model=RoadmapResponse)
async def post_restore_roadmap_version(
    roadmap_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    await rate_limiter.enforce(
        "versions.restore",
        _participant_rate_key(participant.id, roadmap_id),
        limit=10,
        window_seconds=60,
    )
    return await restore_roadmap_version(db, roadmap_id, version_id, participant)


@router.get("/{roadmap_id}/participants", response_model=list[ParticipantResponse])
async def fetch_participants(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[ParticipantResponse]:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    await rate_limiter.enforce(
        "participants.read",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await get_participants(db, roadmap_id, participant)


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
    await revoke_participant(db, roadmap_id, participant_id, participant)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{roadmap_id}/events/ticket", response_model=EventTicketResponse)
async def post_event_ticket(
    request: Request,
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> EventTicketResponse:
    # All roles (owner, editor, viewer) can subscribe to events.
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
    return EventTicketResponse(ticket=ticket, expires_in=30)


@router.get("/{roadmap_id}/events")
async def get_events(
    roadmap_id: str,
    ticket: str = Query(...),
):
    event_ticket = await ticket_service.consume_ticket(ticket, roadmap_id)
    if not event_ticket:
        raise HTTPException(status_code=401, detail="Invalid or expired event ticket")

    return StreamingResponse(
        event_bus.stream(roadmap_id, close_at=event_ticket.session_expires_at),
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
    await rate_limiter.enforce(
        "locks.acquire",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
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
    await rate_limiter.enforce(
        "locks.release",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    await lock_service.release_lock(roadmap_id, target, participant.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{roadmap_id}/locks", response_model=list[LockResponse])
async def get_locks(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[LockResponse]:
    # Viewer can see locks too
    participant = await require_participant(
        db, roadmap_id, authorization, {"owner", "editor", "viewer"}
    )
    await rate_limiter.enforce(
        "locks.read",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    locks = await lock_service.get_locks_for_roadmap(roadmap_id)
    return [
        LockResponse(
            roadmap_id=lock.roadmap_id,
            target=lock.target,
            participant_id=lock.participant_id,
            display_name=lock.display_name,
            expires_at=datetime.fromtimestamp(lock.expires_at, timezone.utc),
        )
        for lock in locks
    ]


@router.get("/{roadmap_id}/activity", response_model=ActivityLogListResponse)
async def fetch_activity_logs(
    roadmap_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> ActivityLogListResponse:
    participant = await require_participant(
        db, roadmap_id, authorization, {"owner", "editor", "viewer"}
    )
    await rate_limiter.enforce(
        "activity.read",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await get_activity_logs(db, roadmap_id, limit, offset)


# ─── Tag registry ─────────────────────────────────────────────────────────────


@router.get("/{roadmap_id}/tags", response_model=list[TagResponse])
async def fetch_tags(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[TagResponse]:
    participant = await require_participant(
        db,
        roadmap_id,
        authorization,
        {"owner", "editor", "viewer"},
    )
    await rate_limiter.enforce(
        "tag.read",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await list_tags(db, roadmap_id)


@router.post(
    "/{roadmap_id}/tags",
    response_model=RoadmapResponse,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": RoadmapConflictResponse}},
)
async def post_tag(
    roadmap_id: str,
    payload: CreateTagRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "tag.create",
        _participant_rate_key(participant.id, roadmap_id),
        limit=60,
        window_seconds=60,
    )
    try:
        return await create_tag(db, roadmap_id, payload, participant)
    except RoadmapConflictError as exc:
        return JSONResponse(status_code=409, content=exc.response.model_dump(mode="json"))


@router.put(
    "/{roadmap_id}/tags/{tag_id}",
    response_model=RoadmapResponse,
    responses={409: {"model": RoadmapConflictResponse}},
)
async def put_tag(
    roadmap_id: str,
    tag_id: str,
    payload: UpdateTagRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "tag.update",
        _participant_rate_key(participant.id, roadmap_id),
        limit=60,
        window_seconds=60,
    )
    try:
        return await update_tag(db, roadmap_id, tag_id, payload, participant)
    except RoadmapConflictError as exc:
        return JSONResponse(status_code=409, content=exc.response.model_dump(mode="json"))


@router.delete(
    "/{roadmap_id}/tags/{tag_id}",
    response_model=RoadmapResponse,
    responses={409: {"model": RoadmapConflictResponse}},
)
async def remove_tag(
    roadmap_id: str,
    tag_id: str,
    last_updated_at: datetime = Query(...),
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "tag.delete",
        _participant_rate_key(participant.id, roadmap_id),
        limit=60,
        window_seconds=60,
    )
    try:
        return await delete_tag(
            db,
            roadmap_id,
            tag_id,
            last_updated_at,
            participant,
        )
    except RoadmapConflictError as exc:
        return JSONResponse(status_code=409, content=exc.response.model_dump(mode="json"))
