"""Compose roadmap routes while domain modules are extracted.

`roadmaps_legacy` is a temporary migration source. It must disappear after the
remaining route domains move into focused modules.
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
router.routes.extend(roadmap_versions.router.routes)
router.routes.extend(roadmap_activity.router.routes)
