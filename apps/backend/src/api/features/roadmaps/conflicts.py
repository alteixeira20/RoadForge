'Roadmap snapshot and conflict helpers.'

from datetime import datetime

from api.features.roadmaps.conflict_schemas import (
    RoadmapConflictMetadata,
    RoadmapConflictResponse,
    RoadmapConflictServerSnapshot,
    RoadmapConflictSummary,
)
from api.features.roadmaps.snapshot import phases_from_snapshot
from api.features.roadmaps.snapshot_schemas import PhaseDTO
from api.models.roadmap import Roadmap


class RoadmapConflictError(Exception):
    def __init__(self, response: RoadmapConflictResponse) -> None:
        self.response = response
        super().__init__(response.detail)


def change_summary_fields(
    change_summary: dict | None,
    *,
    default_action: str,
    default_entity_type: str,
    default_entity_id: str,
) -> tuple[str, str, str, dict | None]:
    if change_summary is None:
        return default_action, default_entity_type, default_entity_id, None

    action = change_summary["action"]
    entity_type = change_summary.get("entity_type")
    entity_id = change_summary.get("entity_id")
    return (
        action,
        entity_type if isinstance(entity_type, str) else default_entity_type,
        entity_id if isinstance(entity_id, str) else default_entity_id,
        change_summary,
    )


def phase_task_ids(phases: list[PhaseDTO]) -> tuple[set[str], set[str]]:
    phase_ids = {phase.id for phase in phases}
    task_ids = {task.id for phase in phases for task in phase.tasks}
    return phase_ids, task_ids


def conflict_summary(
    server_phases: list[PhaseDTO], client_phases: list[PhaseDTO] | None
) -> RoadmapConflictSummary:
    phase_count = len(server_phases)
    task_count = sum(len(phase.tasks) for phase in server_phases)
    if client_phases is None:
        return RoadmapConflictSummary(phase_count=phase_count, task_count=task_count)

    server_phase_ids, server_task_ids = phase_task_ids(server_phases)
    client_phase_ids, client_task_ids = phase_task_ids(client_phases)
    return RoadmapConflictSummary(
        phase_count=phase_count,
        task_count=task_count,
        phase_ids=sorted(server_phase_ids.symmetric_difference(client_phase_ids)),
        task_ids=sorted(server_task_ids.symmetric_difference(client_task_ids)),
    )


def roadmap_conflict_response(
    roadmap: Roadmap,
    client_last_updated_at: datetime,
    client_phases: list[PhaseDTO] | None,
) -> RoadmapConflictResponse:
    server_phases = phases_from_snapshot(roadmap.snapshot_json)
    return RoadmapConflictResponse(
        detail="Roadmap was updated by another session",
        conflict=RoadmapConflictMetadata(
            roadmap_id=roadmap.id,
            server_updated_at=roadmap.updated_at,
            client_last_updated_at=client_last_updated_at,
            server=RoadmapConflictServerSnapshot(
                name=roadmap.name,
                phases=server_phases,
            ),
            summary=conflict_summary(server_phases, client_phases),
        ),
    )
