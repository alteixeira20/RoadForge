"""Compose roadmap routes while domain modules are extracted from the legacy router.

This module is intentionally small. `roadmaps_legacy` is a temporary migration
source and must disappear once the remaining route domains have moved into
focused modules.
"""

from fastapi import APIRouter

from api.routers import roadmap_activity, roadmap_versions, roadmaps_legacy

_MIGRATED_PREFIXES = ("/{roadmap_id}/versions",)
_MIGRATED_PATHS = {"/{roadmap_id}/activity"}


def _route_is_migrated(route: object) -> bool:
    path = getattr(route, "path", "")
    return path in _MIGRATED_PATHS or any(
        path.startswith(prefix) for prefix in _MIGRATED_PREFIXES
    )


router = APIRouter()
router.routes.extend(
    route for route in roadmaps_legacy.router.routes if not _route_is_migrated(route)
)
router.include_router(roadmap_versions.router)
router.include_router(roadmap_activity.router)
