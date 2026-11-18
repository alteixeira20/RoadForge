from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.schemas.roadmap import LockRequest, LockResponse
from api.services.auth_service import require_participant
from api.services.lock_service import lock_service
from api.services.rate_limit_service import rate_limiter

router = APIRouter(tags=["roadmaps"])


def _participant_rate_key(participant_id: str, roadmap_id: str) -> str:
    return f"{participant_id}:{roadmap_id}"


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
