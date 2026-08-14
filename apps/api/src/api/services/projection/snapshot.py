from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

_PHASE_KEYS = {"id", "num", "name", "color", "status", "progress", "tasks"}
_TASK_KEYS = {
    "id",
    "title",
    "done",
    "next",
    "est",
    "desc",
    "parentId",
    "tags",
    "assignees",
    "deps",
    "claimedBy",
    "claimedById",
    "claimedAt",
}


def source_json(row: dict[str, Any], explicit_keys: set[str]) -> dict[str, Any] | None:
    extra = {key: value for key, value in row.items() if key not in explicit_keys}
    return extra or None


def parse_claimed_at(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def snapshot_phases(snapshot_json: dict[str, Any]) -> list[dict[str, Any]]:
    phases = snapshot_json.get("phases", [])
    return phases if isinstance(phases, list) else []


def snapshot_counts(snapshot_json: dict[str, Any]) -> tuple[int, int]:
    phases = snapshot_phases(snapshot_json)
    task_count = 0
    for phase in phases:
        if isinstance(phase, dict) and isinstance(phase.get("tasks"), list):
            task_count += len(phase["tasks"])
    return len(phases), task_count
