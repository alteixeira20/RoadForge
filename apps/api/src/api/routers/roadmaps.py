"""Compose roadmap routes while domain modules are extracted.

`roadmaps_legacy` is a temporary migration source. It must disappear after the
remaining route domains move into focused modules.
"""

import sys
from types import ModuleType

from fastapi import APIRouter

from api.routers import roadmap_activity, roadmap_versions, roadmaps_legacy

_MIGRATED_PREFIXES = ("/{roadmap_id}/versions",)
_MIGRATED_PATHS = {"/{roadmap_id}/activity"}
_FORWARD_TO_LEGACY = {
    "create_roadmap",
    "get_settings",
    "join_roadmap",
    "lock_service",
    "rate_limiter",
    "ticket_service",
}


class _RoadmapRouterModule(ModuleType):
    """Keep historical test monkeypatch seams working during decomposition."""

    def __setattr__(self, name: str, value: object) -> None:
        super().__setattr__(name, value)
        if name in _FORWARD_TO_LEGACY:
            setattr(roadmaps_legacy, name, value)


_module = sys.modules[__name__]
_module.__class__ = _RoadmapRouterModule
for _name in _FORWARD_TO_LEGACY:
    setattr(_module, _name, getattr(roadmaps_legacy, _name))


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
