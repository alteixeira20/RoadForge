"""Compose focused roadmap route domains into the public router."""

from fastapi import APIRouter

from api.routers import (
    roadmap_activity,
    roadmap_core,
    roadmap_locks,
    roadmap_realtime,
    roadmap_sharing,
    roadmap_structure,
    roadmap_tags,
    roadmap_task_structure,
    roadmap_tasks,
    roadmap_versions,
)

_DOMAIN_ROUTERS = (
    roadmap_core.router,
    roadmap_structure.router,
    roadmap_versions.router,
    roadmap_activity.router,
    roadmap_tasks.router,
    roadmap_task_structure.router,
    roadmap_locks.router,
    roadmap_sharing.router,
    roadmap_realtime.router,
    roadmap_tags.router,
)

router = APIRouter()
for _domain_router in _DOMAIN_ROUTERS:
    router.routes.extend(_domain_router.routes)
