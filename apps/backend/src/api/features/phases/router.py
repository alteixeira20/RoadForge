"""Focused roadmap structure collaboration routes."""

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.features.phases.patch_service import patch_phase, patch_roadmap_name
from api.features.phases.schemas import (
    CreatePhaseRequest,
    PatchPhaseRequest,
    PatchRoadmapNameRequest,
    ReorderPhasesRequest,
)
from api.features.phases.structure_service import create_phase, delete_phase, reorder_phases
from api.features.roadmaps.core_schemas import RoadmapResponse
from api.shared.auth.auth_service import require_participant
from api.shared.auth.session_policy import OWNER_EDITOR
from api.shared.security.rate_limit_service import enforce_rate_limit, participant_rate_key

router = APIRouter(tags=["roadmaps"])


@router.patch("/{roadmap_id}/name", response_model=RoadmapResponse)
async def patch_name(
    roadmap_id: str,
    payload: PatchRoadmapNameRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit(
          "roadmap.name.patch", participant_rate_key(participant.id, roadmap_id),
    )
    return await patch_roadmap_name(db, roadmap_id, payload, participant)


@router.post(
    "/{roadmap_id}/phases",
    response_model=RoadmapResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_roadmap_phase(
    roadmap_id: str,
    payload: CreatePhaseRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("phase.create.post", participant_rate_key(participant.id, roadmap_id))
    return await create_phase(db, roadmap_id, payload, participant)


@router.put("/{roadmap_id}/phases/order", response_model=RoadmapResponse)
async def reorder_roadmap_phases(
    roadmap_id: str,
    payload: ReorderPhasesRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("phase.reorder.put", participant_rate_key(participant.id, roadmap_id))
    return await reorder_phases(db, roadmap_id, payload, participant)


@router.patch("/{roadmap_id}/phases/{phase_id}", response_model=RoadmapResponse)
async def patch_roadmap_phase(
    roadmap_id: str,
    phase_id: str,
    payload: PatchPhaseRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit(
          "phase.update.patch", participant_rate_key(participant.id, roadmap_id),
    )
    return await patch_phase(db, roadmap_id, phase_id, payload, participant)


@router.delete("/{roadmap_id}/phases/{phase_id}", response_model=RoadmapResponse)
async def delete_roadmap_phase(
    roadmap_id: str,
    phase_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("phase.delete", participant_rate_key(participant.id, roadmap_id))
    return await delete_phase(db, roadmap_id, phase_id, participant)
