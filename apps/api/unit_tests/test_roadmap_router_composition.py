from fastapi.routing import APIRoute

from api.routers import (
    roadmap_activity,
    roadmap_core,
    roadmap_locks,
    roadmap_realtime,
    roadmap_sharing,
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
    core_keys = set(_route_keys(roadmap_core.router))
    version_keys = set(_route_keys(roadmap_versions.router))
    activity_keys = set(_route_keys(roadmap_activity.router))
    task_keys = set(_route_keys(roadmap_tasks.router))
    lock_keys = set(_route_keys(roadmap_locks.router))
    sharing_keys = set(_route_keys(roadmap_sharing.router))
    realtime_keys = set(_route_keys(roadmap_realtime.router))
    composed_keys = set(_route_keys(roadmaps.router))

    expected_core_keys = {
        ("POST", ""),
        ("POST", "/join"),
        ("GET", "/{roadmap_id}"),
        ("PUT", "/{roadmap_id}"),
        ("DELETE", "/{roadmap_id}"),
    }
    assert core_keys == expected_core_keys

    assert version_keys
    assert activity_keys
    assert task_keys
    assert lock_keys
    assert sharing_keys
    assert realtime_keys

    for domain_keys in (
        core_keys,
        version_keys,
        activity_keys,
        task_keys,
        lock_keys,
        sharing_keys,
        realtime_keys,
    ):
        assert domain_keys <= composed_keys

    assert all(path.startswith("/{roadmap_id}/versions") for _, path in version_keys)
    assert {path for _, path in activity_keys} == {"/{roadmap_id}/activity"}
    assert all(path.startswith("/{roadmap_id}/tasks") for _, path in task_keys)
    assert all(path.startswith("/{roadmap_id}/locks") for _, path in lock_keys)
    assert all(
        path.startswith("/{roadmap_id}/share-links")
        or path.startswith("/{roadmap_id}/participants")
        for _, path in sharing_keys
    )
    assert all(path.startswith("/{roadmap_id}/events") for _, path in realtime_keys)

    assert len(task_keys) == 4
    assert len(lock_keys) == 3
    assert len(sharing_keys) == 5
    assert len(realtime_keys) == 2
