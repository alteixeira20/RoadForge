from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from api.schemas.roadmap import PhaseDTO, TagDefinitionDTO, TaskDTO
from api.services.roadmap_concurrency import ensure_roadmap_is_current
from api.services.roadmap_helpers import RoadmapConflictError
from api.services.roadmap_validation import validate_roadmap_domain


def task(
    task_id: str,
    *,
    done: bool = False,
    deps: list[str] | None = None,
    parent_id: str | None = None,
    tags: list[str] | None = None,
) -> TaskDTO:
    return TaskDTO(
        id=task_id,
        title=task_id,
        done=done,
        deps=deps,
        parentId=parent_id,
        tags=tags,
    )


def phase(
    phase_id: str,
    tasks: list[TaskDTO],
    *,
    num: str = "01",
) -> PhaseDTO:
    progress = round(sum(1 for item in tasks if item.done) / len(tasks) * 100) if tasks else 0
    return PhaseDTO(
        id=phase_id,
        num=num,
        name=phase_id,
        color="#f97316",
        status="active",
        progress=progress,
        tasks=tasks,
    )


def test_future_client_timestamp_cannot_bypass_conflict_detection() -> None:
    now = datetime.now(timezone.utc)
    roadmap = SimpleNamespace(
        id="rm_test",
        name="Test",
        owner_display_name="Owner",
        schema_version="1.0",
        snapshot_json={"phases": []},
        tag_registry_json=None,
        is_password_enabled=False,
        created_at=now,
        updated_at=now,
    )

    with pytest.raises(RoadmapConflictError):
        ensure_roadmap_is_current(roadmap, now + timedelta(days=1))


def test_exact_echoed_timestamp_is_accepted() -> None:
    now = datetime.now(timezone.utc)
    roadmap = SimpleNamespace(updated_at=now)

    assert ensure_roadmap_is_current(roadmap, now) == now


def test_rejects_duplicate_task_ids_across_phases() -> None:
    phases = [
        phase("p1", [task("same")]),
        phase("p2", [task("same")], num="02"),
    ]

    with pytest.raises(HTTPException, match="duplicate task IDs"):
        validate_roadmap_domain(phases)


def test_rejects_missing_and_cyclic_dependencies() -> None:
    missing = [phase("p1", [task("a", deps=["missing"])])]
    with pytest.raises(HTTPException, match="missing dependency"):
        validate_roadmap_domain(missing)

    cyclic = [
        phase("p1", [
            task("a", deps=["b"]),
            task("b", deps=["a"]),
        ])
    ]
    with pytest.raises(HTTPException, match="dependency cycle"):
        validate_roadmap_domain(cyclic)


def test_rejects_cross_phase_parent() -> None:
    cross_phase = [
        phase("p1", [task("parent")]),
        phase("p2", [task("child", parent_id="parent")], num="02"),
    ]
    with pytest.raises(HTTPException, match="same phase"):
        validate_roadmap_domain(cross_phase)


def test_allows_stale_derived_progress_for_repair() -> None:
    stale = phase("p1", [task("done", done=True)])
    stale.progress = 0

    validate_roadmap_domain([stale])


def test_allows_task_tags_before_registry_metadata_exists() -> None:
    phases = [phase("p1", [task("a", tags=["missing"])])]
    registry = [TagDefinitionDTO(id="known", label="Known")]

    validate_roadmap_domain(phases, registry)
