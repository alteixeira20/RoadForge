from pathlib import Path

import api.services.projection as projection

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


def test_projection_package_exports_exact_public_surface() -> None:
    assert set(projection.__all__) == _PUBLIC_EXPORTS


def test_legacy_projection_facade_is_removed_and_not_imported() -> None:
    api_root = Path(__file__).resolve().parents[1]
    service_root = api_root / "src" / "api" / "services"
    legacy_module = "roadmap_projection" + "_service"
    legacy_import = "api.services." + legacy_module

    assert not (service_root / f"{legacy_module}.py").exists()

    offenders: list[str] = []
    for source_root in (api_root / "src", api_root / "tests", api_root / "unit_tests"):
        for path in source_root.rglob("*.py"):
            if legacy_import in path.read_text(encoding="utf-8"):
                offenders.append(str(path.relative_to(api_root)))

    assert offenders == []
