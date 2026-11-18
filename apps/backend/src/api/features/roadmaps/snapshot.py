'Roadmap snapshot and conflict helpers.'

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.features.roadmaps.core_schemas import RoadmapResponse
from api.features.roadmaps.projection import (
    serialize_projection_to_snapshot,
    validate_projection_parity,
)
from api.features.roadmaps.snapshot_schemas import PhaseDTO
from api.models.roadmap import Roadmap

logger = logging.getLogger(__name__)


def snapshot_from_phases(phases: list[PhaseDTO]) -> dict:
    return {"phases": [p.model_dump(exclude_none=True) for p in phases]}


def phases_from_snapshot(snapshot_json: dict) -> list[PhaseDTO]:
    return [PhaseDTO(**p) for p in snapshot_json.get("phases", [])]


def roadmap_response(roadmap: Roadmap, phases: list[PhaseDTO]) -> RoadmapResponse:
    return RoadmapResponse(
        id=roadmap.id,
        name=roadmap.name,
        owner_display_name=roadmap.owner_display_name,
        schema_version=roadmap.schema_version,
        phases=phases,
        tag_registry=roadmap.tag_registry_json or None,
        is_password_enabled=roadmap.is_password_enabled,
        created_at=roadmap.created_at,
        updated_at=roadmap.updated_at,
    )


async def phases_for_read(db: AsyncSession, roadmap: Roadmap) -> list[PhaseDTO]:
    if not get_settings().roadmap_projection_read_enabled:
        return phases_from_snapshot(roadmap.snapshot_json)

    try:
        parity = await validate_projection_parity(db, roadmap)
        if not parity.ok:
            logger.warning(
                "roadmap projection parity failed; falling back to snapshot",
                extra={"roadmap_id": roadmap.id, "issues": parity.issues},
            )
            return phases_from_snapshot(roadmap.snapshot_json)

        projection_snapshot = await serialize_projection_to_snapshot(db, roadmap.id)
        return phases_from_snapshot(projection_snapshot)
    except Exception as exc:
        logger.warning(
            "roadmap projection read failed; falling back to snapshot",
            extra={"roadmap_id": roadmap.id, "error": str(exc)},
            exc_info=True,
        )
        return phases_from_snapshot(roadmap.snapshot_json)
