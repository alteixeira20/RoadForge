import api.services.projection as projection
import api.services.roadmap_projection_service as facade

_PUBLIC_EXPORTS = {
    "ProjectionBackfillResult",
    "ProjectionDriftFinding",
    "ProjectionDriftReport",
    "ProjectionParityResult",
    "backfill_all_roadmap_projections",
    "backfill_and_report_projection_drift",
    "clear_roadmap_projection",
    "rebuild_roadmap_projection",
    "report_projection_drift",
    "report_roadmap_projection_drift",
    "serialize_projection_to_snapshot",
    "sync_roadmap_projection_best_effort",
    "sync_task_projection",
    "sync_task_projection_best_effort",
    "validate_projection_parity",
}


def test_projection_facade_exports_exact_public_surface() -> None:
    assert set(facade.__all__) == _PUBLIC_EXPORTS
    assert set(projection.__all__) == _PUBLIC_EXPORTS


def test_projection_facade_reexports_package_objects_by_identity() -> None:
    for name in _PUBLIC_EXPORTS:
        assert getattr(facade, name) is getattr(projection, name)
