from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.database import get_db
from api.schemas.roadmap import CreateRoadmapRequest, CreateRoadmapResponse
from api.services.roadmap_service import create_roadmap

router = APIRouter(tags=["roadmaps"])


@router.post("", response_model=CreateRoadmapResponse, status_code=status.HTTP_201_CREATED)
async def post_roadmap(
    payload: CreateRoadmapRequest,
    db: AsyncSession = Depends(get_db),
) -> CreateRoadmapResponse:
    settings = get_settings()
    return await create_roadmap(db, payload, settings.web_base_url)
