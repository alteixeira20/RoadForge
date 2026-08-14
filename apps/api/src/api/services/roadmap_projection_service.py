"""Compatibility facade for the focused roadmap projection package.

New code should import from ``api.services.projection``. This module preserves
RoadForge's existing internal import surface while consumers migrate in a
follow-up cleanup; it intentionally owns no projection behavior.
"""

from api.services.projection import (
    ProjectionBackfillResult,
    ProjectionDriftFinding,
    ProjectionDriftReport,
    ProjectionParityResult,
    backfill_all_roadmap_projections,
    backfill_and_report_projection_drift,
    clear_roadmap_projection,
    rebuild_roadmap_projection,
    report_projection_drift,
    report_roadmap_projection_drift,
    serialize_projection_to_snapshot,
    sync_roadmap_projection_best_effort,
    sync_task_projection,
    sync_task_projection_best_effort,
    validate_projection_parity,
)

__all__ = [
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
]
