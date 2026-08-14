"""Database lookup helpers for active roadmaps."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import Roadmap


async def fetch_active_roadmap(db: AsyncSession, roadmap_id: str) -> Roadmap:
    result = await db.execute(
        select(Roadmap).where(Roadmap.id == roadmap_id, Roadmap.deleted_at.is_(None))
    )
    roadmap = result.scalar_one_or_none()
    if roadmap is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    return roadmap


async def fetch_active_roadmap_for_update(db: AsyncSession, roadmap_id: str) -> Roadmap:
    result = await db.execute(
        select(Roadmap)
        .where(Roadmap.id == roadmap_id, Roadmap.deleted_at.is_(None))
        .with_for_update()
    )
    roadmap = result.scalar_one_or_none()
    if roadmap is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    return roadmap
