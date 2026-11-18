from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.features.collaboration.lock_service import lock_service
from api.features.collaboration.schemas import LockRequest, LockResponse
from api.shared.auth.auth_service import require_participant
from api.shared.auth.session_policy import ALL_ROLES, OWNER_EDITOR
from api.shared.security.rate_limit_service import enforce_rate_limit, participant_rate_key

router = APIRouter(tags=["roadmaps"])


@router.post("/{roadmap_id}/locks", response_model=LockResponse)
async def post_lock(
    roadmap_id: str,
    payload: LockRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> LockResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("locks.acquire", participant_rate_key(participant.id, roadmap_id))
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
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("locks.release", participant_rate_key(participant.id, roadmap_id))
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
        db, roadmap_id, authorization, ALL_ROLES
    )
    await enforce_rate_limit("locks.read", participant_rate_key(participant.id, roadmap_id))
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
