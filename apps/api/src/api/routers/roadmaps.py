from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.database import get_db
from api.schemas.roadmap import (
    CreateRoadmapRequest,
    CreateRoadmapResponse,
    RoadmapResponse,
    ShareLinkResponse,
    UpdateRoadmapRequest,
)
from api.services.roadmap_service import create_roadmap, get_roadmap, get_share_links, update_roadmap

router = APIRouter(tags=["roadmaps"])


@router.post("", response_model=CreateRoadmapResponse, status_code=status.HTTP_201_CREATED)
async def post_roadmap(
    payload: CreateRoadmapRequest,
    db: AsyncSession = Depends(get_db),
) -> CreateRoadmapResponse:
    settings = get_settings()
    return await create_roadmap(db, payload, settings.web_base_url)


@router.get("/{roadmap_id}", response_model=RoadmapResponse)
async def fetch_roadmap(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
) -> RoadmapResponse:
    return await get_roadmap(db, roadmap_id)


@router.put("/{roadmap_id}", response_model=RoadmapResponse)
async def put_roadmap(
    roadmap_id: str,
    payload: UpdateRoadmapRequest,
    db: AsyncSession = Depends(get_db),
) -> RoadmapResponse:
    return await update_roadmap(db, roadmap_id, payload)


@router.get("/{roadmap_id}/share-links", response_model=list[ShareLinkResponse])
async def fetch_share_links(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[ShareLinkResponse]:
    return await get_share_links(db, roadmap_id)
