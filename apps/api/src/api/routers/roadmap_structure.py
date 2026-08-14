"""Focused roadmap structure collaboration routes."""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.schemas.collaboration import PatchPhaseRequest, PatchRoadmapNameRequest
from api.schemas.roadmap import RoadmapResponse
from api.services.auth_service import require_participant
from api.services.rate_limit_service import rate_limiter
from api.services.roadmap_structure_service import patch_phase, patch_roadmap_name

router = APIRouter(tags=["roadmaps"])
_OWNER_EDITOR = {"owner", "editor"}


def _participant_rate_key(participant_id: str, roadmap_id: str) -> str:
    return f"{participant_id}:{roadmap_id}"


@router.patch("/{roadmap_id}/name", response_model=RoadmapResponse)
async def patch_name(
    roadmap_id: str,
    payload: PatchRoadmapNameRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "roadmap.name.patch",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await patch_roadmap_name(db, roadmap_id, payload, participant)


@router.patch("/{roadmap_id}/phases/{phase_id}", response_model=RoadmapResponse)
async def patch_roadmap_phase(
    roadmap_id: str,
    phase_id: str,
    payload: PatchPhaseRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "phase.update.patch",
        _participant_rate_key(participant.id, roadmap_id),
        limit=180,
        window_seconds=60,
    )
    return await patch_phase(db, roadmap_id, phase_id, payload, participant)
