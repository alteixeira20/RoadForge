from __future__ import annotations

from api.services.roadmap_helpers import (
    _patch_task_claim_snapshot,
    _patch_task_done_snapshot,
)


def _snapshot() -> dict:
    return {
        "portableExtension": {"provider": "test", "kept": True},
        "phases": [
            {
                "id": "phase-1",
                "num": "01",
                "name": "Phase",
                "color": "blue",
                "status": "active",
                "progress": 0,
                "tasks": [
                    {
                        "id": "task-1",
                        "title": "First",
                        "done": False,
                        "assignees": ["Alice"],
                        "claimedBy": "Alice",
                        "claimedById": "pt_alice",
                        "claimedAt": "2026-08-03T12:00:00Z",
                    },
                    {"id": "task-2", "title": "Second", "done": False},
                ],
            }
        ],
    }


def test_done_patch_preserves_root_extensions_and_recalculates_progress() -> None:
    original = _snapshot()

    patched = _patch_task_done_snapshot(original, "task-1", True)

    assert patched is not None
    snapshot, _phase, _before = patched
    assert snapshot["portableExtension"] == original["portableExtension"]
    assert snapshot["phases"][0]["progress"] == 50
    task = snapshot["phases"][0]["tasks"][0]
    assert task["done"] is True
    assert "claimedBy" not in task
    assert "claimedById" not in task
    assert "claimedAt" not in task
    assert original["phases"][0]["tasks"][0]["done"] is False


def test_claim_patch_preserves_extensions_and_deduplicates_assignee() -> None:
    original = _snapshot()

    patched = _patch_task_claim_snapshot(
        original,
        "task-1",
        "Alice",
        "pt_alice",
        "2026-08-03T13:00:00Z",
    )

    assert patched is not None
    snapshot, _phase, _before = patched
    assert snapshot["portableExtension"] == original["portableExtension"]
    task = snapshot["phases"][0]["tasks"][0]
    assert task["assignees"] == ["Alice"]
    assert task["claimedBy"] == "Alice"


def test_unclaim_preserves_assignment_and_root_extensions() -> None:
    original = _snapshot()

    patched = _patch_task_claim_snapshot(original, "task-1", None, None, None)

    assert patched is not None
    snapshot, _phase, _before = patched
    assert snapshot["portableExtension"] == original["portableExtension"]
    task = snapshot["phases"][0]["tasks"][0]
    assert task["assignees"] == ["Alice"]
    assert "claimedBy" not in task
    assert "claimedById" not in task
    assert "claimedAt" not in task
