"""Shared schema enums, constants, and validation helpers."""

from typing import Literal

ShareRole = Literal["owner", "editor", "viewer"]
PhaseStatus = Literal["done", "active", "next", "future"]

ALLOWED_CHANGE_SUMMARY_ACTIONS: frozenset[str] = frozenset({
    "roadmap.created",
    "roadmap.imported",
    "import.replaced",
    "roadmap.updated",
    "roadmap.renamed",
    "roadmap.restored",
    "roadmap.checkpoint",
    "roadmap.batch_changed",
    "roadmap.phases_reordered",
    "phase.created",
    "phase.updated",
    "phase.deleted",
    "phase.reordered",
    "phase.completed",
    "phase.reopened",
    "task.created",
    "task.updated",
    "task.deleted",
    "task.completed",
    "task.reopened",
    "task.reordered",
    "task.dependency.linked",
    "task.dependency.unlinked",
})


def validate_change_summary(v: object) -> object:
    """Validate a change_summary dict for allowed actions."""
    if v is None:
        return None
    if not isinstance(v, dict):
        return v
    action = v.get("action")
    if not isinstance(action, str) or not action:
        raise ValueError("change_summary.action is required")
    if action not in ALLOWED_CHANGE_SUMMARY_ACTIONS:
        raise ValueError("change_summary.action is not allowed")
    return v
