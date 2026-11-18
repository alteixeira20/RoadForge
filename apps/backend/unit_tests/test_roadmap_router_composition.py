from fastapi.routing import APIRoute

from api.features.history import activity_router as roadmap_activity
from api.features.agent_client import router as roadmap_client
from api.features.roadmaps import router as roadmap_core
from api.features.roadmaps import focused_router as roadmap_focused
from api.features.collaboration import router as roadmap_locks
from api.features.realtime import router as roadmap_realtime
from api.features.sharing import router as roadmap_sharing
from api.features.phases import router as roadmap_structure
from api.features.tags import router as roadmap_tags
from api.features.tasks import structure_router as roadmap_task_structure
from api.features.tasks import router as roadmap_tasks
from api.features.history import versions_router as roadmap_versions
from api.routers import roadmaps

_CORE_ROUTES = {
    ("POST", ""),
    ("POST", "/join"),
    ("GET", "/{roadmap_id}"),
    ("PUT", "/{roadmap_id}"),
    ("DELETE", "/{roadmap_id}"),
}
_FOCUSED_ROUTES = {
    ("GET", "/{roadmap_id}/summary"),
    ("GET", "/{roadmap_id}/revision"),
    ("GET", "/{roadmap_id}/tasks/search"),
    ("GET", "/{roadmap_id}/tasks/{task_id}"),
    ("GET", "/{roadmap_id}/context"),
}
_CLIENT_ROUTES = {
    ("PATCH", "/{roadmap_id}/client/tasks/{task_id}"),
    ("PATCH", "/{roadmap_id}/client/tasks/{task_id}/done"),
    ("POST", "/{roadmap_id}/client/phases/{phase_id}/tasks"),
    ("DELETE", "/{roadmap_id}/client/tasks/{task_id}"),
    ("PUT", "/{roadmap_id}/client/tasks/{task_id}/dependencies/{dependency_id}"),
    ("DELETE", "/{roadmap_id}/client/tasks/{task_id}/dependencies/{dependency_id}"),
    ("POST", "/{roadmap_id}/client/phases"),
    ("PATCH", "/{roadmap_id}/client/phases/{phase_id}"),
    ("DELETE", "/{roadmap_id}/client/phases/{phase_id}"),
    ("PATCH", "/{roadmap_id}/client/name"),
    ("POST", "/{roadmap_id}/client/tags"),
}
_STRUCTURE_ROUTES = {
    ("PATCH", "/{roadmap_id}/name"),
    ("POST", "/{roadmap_id}/phases"),
    ("PUT", "/{roadmap_id}/phases/order"),
    ("PATCH", "/{roadmap_id}/phases/{phase_id}"),
    ("DELETE", "/{roadmap_id}/phases/{phase_id}"),
}
_VERSION_ROUTES = {
    ("GET", "/{roadmap_id}/versions"),
    ("POST", "/{roadmap_id}/versions/checkpoint"),
    ("GET", "/{roadmap_id}/versions/{version_id}"),
    ("POST", "/{roadmap_id}/versions/{version_id}/restore"),
}
_ACTIVITY_ROUTES = {("GET", "/{roadmap_id}/activity")}
_TASK_ROUTES = {
    ("PATCH", "/{roadmap_id}/tasks/{task_id}"),
    ("PATCH", "/{roadmap_id}/tasks/{task_id}/done"),
    ("PATCH", "/{roadmap_id}/tasks/{task_id}/claim"),
    ("DELETE", "/{roadmap_id}/tasks/{task_id}/claim"),
}
_TASK_STRUCTURE_ROUTES = {
    ("POST", "/{roadmap_id}/phases/{phase_id}/tasks"),
    ("DELETE", "/{roadmap_id}/tasks/{task_id}"),
    ("PUT", "/{roadmap_id}/phases/{phase_id}/tasks/order"),
    ("PUT", "/{roadmap_id}/tasks/{parent_id}/subtasks/order"),
    ("PUT", "/{roadmap_id}/tasks/{task_id}/dependencies/{dependency_id}"),
    ("DELETE", "/{roadmap_id}/tasks/{task_id}/dependencies/{dependency_id}"),
}
_LOCK_ROUTES = {
    ("POST", "/{roadmap_id}/locks"),
    ("GET", "/{roadmap_id}/locks"),
    ("DELETE", "/{roadmap_id}/locks/{target}"),
}
_SHARING_ROUTES = {
    ("GET", "/{roadmap_id}/share-links"),
    ("POST", "/{roadmap_id}/share-links/{role}/rotate"),
    ("DELETE", "/{roadmap_id}/share-links/{role}"),
    ("GET", "/{roadmap_id}/participants"),
    ("POST", "/{roadmap_id}/participants/{participant_id}/revoke"),
    ("PUT", "/{roadmap_id}/password"),
}
_REALTIME_ROUTES = {
    ("POST", "/{roadmap_id}/events/ticket"),
    ("GET", "/{roadmap_id}/events"),
}
_TAG_ROUTES = {
    ("GET", "/{roadmap_id}/tags"),
    ("POST", "/{roadmap_id}/tags"),
    ("PUT", "/{roadmap_id}/tags/{tag_id}"),
    ("PUT", "/{roadmap_id}/tags/order"),
    ("DELETE", "/{roadmap_id}/tags/{tag_id}"),
}

_DOMAIN_CONTRACTS = (
    (roadmap_core.router, _CORE_ROUTES),
    (roadmap_focused.router, _FOCUSED_ROUTES),
    (roadmap_client.router, _CLIENT_ROUTES),
    (roadmap_structure.router, _STRUCTURE_ROUTES),
    (roadmap_versions.router, _VERSION_ROUTES),
    (roadmap_activity.router, _ACTIVITY_ROUTES),
    (roadmap_tasks.router, _TASK_ROUTES),
    (roadmap_task_structure.router, _TASK_STRUCTURE_ROUTES),
    (roadmap_locks.router, _LOCK_ROUTES),
    (roadmap_sharing.router, _SHARING_ROUTES),
    (roadmap_realtime.router, _REALTIME_ROUTES),
    (roadmap_tags.router, _TAG_ROUTES),
)
_EXPECTED_PUBLIC_ROUTES = set().union(*(expected for _, expected in _DOMAIN_CONTRACTS))


def _route_keys(router) -> list[tuple[str, str]]:
    return sorted(
        (method, route.path)
        for route in router.routes
        if isinstance(route, APIRoute)
        for method in route.methods
    )


def test_composed_router_matches_public_method_path_contract() -> None:
    assert set(_route_keys(roadmaps.router)) == _EXPECTED_PUBLIC_ROUTES
    assert len(_EXPECTED_PUBLIC_ROUTES) == 57


def test_composed_router_has_no_duplicate_method_path_routes() -> None:
    keys = _route_keys(roadmaps.router)
    assert len(keys) == len(set(keys))


def test_each_domain_router_owns_exactly_its_contract() -> None:
    for domain_router, expected in _DOMAIN_CONTRACTS:
        assert set(_route_keys(domain_router)) == expected
