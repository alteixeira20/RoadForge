from fastapi.routing import APIRoute

from api.routers import (
    roadmap_activity,
    roadmap_locks,
    roadmap_tasks,
    roadmap_versions,
    roadmaps,
    roadmaps_legacy,
)


def _route_keys(router) -> list[tuple[str, str]]:
    return sorted(
        (method, route.path)
        for route in router.routes
        if isinstance(route, APIRoute)
        for method in route.methods
    )


def test_composed_router_preserves_legacy_method_path_contract() -> None:
    assert _route_keys(roadmaps.router) == _route_keys(roadmaps_legacy.router)


def test_composed_router_has_no_duplicate_method_path_routes() -> None:
    keys = _route_keys(roadmaps.router)
    assert len(keys) == len(set(keys))


def test_extracted_domains_own_the_migrated_routes() -> None:
    version_keys = set(_route_keys(roadmap_versions.router))
    activity_keys = set(_route_keys(roadmap_activity.router))
    task_keys = set(_route_keys(roadmap_tasks.router))
    lock_keys = set(_route_keys(roadmap_locks.router))
    composed_keys = set(_route_keys(roadmaps.router))

    assert version_keys
    assert activity_keys
    assert task_keys
    assert lock_keys

    for domain_keys in (version_keys, activity_keys, task_keys, lock_keys):
        assert domain_keys <= composed_keys

    assert all(path.startswith("/{roadmap_id}/versions") for _, path in version_keys)
    assert {path for _, path in activity_keys} == {"/{roadmap_id}/activity"}
    assert all(path.startswith("/{roadmap_id}/tasks") for _, path in task_keys)
    assert all(path.startswith("/{roadmap_id}/locks") for _, path in lock_keys)

    assert len(task_keys) == 4
    assert len(lock_keys) == 3
