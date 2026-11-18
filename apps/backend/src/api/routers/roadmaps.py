"""Compose focused roadmap route domains into the public router."""

from fastapi import APIRouter

from api.features.agent_client import router as roadmap_client
from api.features.collaboration import router as roadmap_locks
from api.features.history import activity_router as roadmap_activity
from api.features.history import versions_router as roadmap_versions
from api.features.phases import router as roadmap_structure
from api.features.realtime import router as roadmap_realtime
from api.features.roadmaps import focused_router as roadmap_focused
from api.features.roadmaps import router as roadmap_core
from api.features.sharing import router as roadmap_sharing
from api.features.tags import router as roadmap_tags
from api.features.tasks import router as roadmap_tasks
from api.features.tasks import structure_router as roadmap_task_structure

_DOMAIN_ROUTERS = (
    roadmap_core.router,
    roadmap_focused.router,
    roadmap_client.router,
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
