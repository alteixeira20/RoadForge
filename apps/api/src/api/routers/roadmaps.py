from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.database import get_db
from api.schemas.roadmap import (
    CreateRoadmapRequest,
    CreateRoadmapResponse,
    RoadmapResponse,
    ShareLinkResponse,
    ShareRole,
    UpdateRoadmapRequest,
)
from api.services.roadmap_service import (
    create_roadmap,
    get_roadmap,
    get_share_links,
    revoke_share_link,
    rotate_share_link,
    update_roadmap,
)

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


@router.post(
    "/{roadmap_id}/share-links/{role}/rotate",
    response_model=ShareLinkResponse,
)
async def post_rotate_share_link(
    roadmap_id: str,
    role: ShareRole,
    db: AsyncSession = Depends(get_db),
) -> ShareLinkResponse:
    settings = get_settings()
    return await rotate_share_link(db, roadmap_id, role, settings.web_base_url)


@router.delete("/{roadmap_id}/share-links/{role}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_share_link(
    roadmap_id: str,
    role: ShareRole,
    db: AsyncSession = Depends(get_db),
) -> Response:
    await revoke_share_link(db, roadmap_id, role)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
