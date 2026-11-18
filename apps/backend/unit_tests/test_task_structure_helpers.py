import pytest
from fastapi import HTTPException

from api.services.task_structure_helpers import (
    phase_dicts,
    recompute_phase_progress,
    reorder_direct_children,
    reorder_top_level_tasks,
    task_subtree_block,
)


def _task(task_id: str, *, parent_id: str | None = None, done: bool = False) -> dict:
    task = {"id": task_id, "title": task_id, "done": done}
    if parent_id is not None:
        task["parentId"] = parent_id
    return task


def test_phase_progress_matches_javascript_math_round_at_half_percentage() -> None:
    phase = {
        "id": "phase-a",
        "progress": 0,
        "tasks": [_task("done", done=True), *[_task(f"open-{i}") for i in range(7)]],
    }

    updated = recompute_phase_progress(phase)

    assert updated["progress"] == 13
    assert phase["progress"] == 0


def test_subtree_block_is_recursive_parent_before_child_not_flat_array_order() -> None:
    tasks = [
        _task("root"),
        _task("sibling"),
        _task("grandchild", parent_id="child-a"),
        _task("child-a", parent_id="root"),
        _task("child-b", parent_id="root"),
        _task("great-grandchild", parent_id="grandchild"),
    ]

    block = task_subtree_block(tasks, "root")

    assert [task["id"] for task in block] == [
        "root",
        "child-a",
        "grandchild",
        "great-grandchild",
        "child-b",
    ]


def test_top_level_reorder_moves_recursive_subtrees_as_blocks() -> None:
    tasks = [
        _task("root-a"),
        _task("root-b"),
        _task("a-grandchild", parent_id="a-child"),
        _task("b-child", parent_id="root-b"),
        _task("a-child", parent_id="root-a"),
    ]

    reordered, before_ids, after_ids = reorder_top_level_tasks(tasks, ["root-b", "root-a"])

    assert before_ids == ["root-a", "root-b"]
    assert after_ids == ["root-b", "root-a"]
    assert [task["id"] for task in reordered] == [
        "root-b",
        "b-child",
        "root-a",
        "a-child",
        "a-grandchild",
    ]


def test_direct_child_reorder_keeps_nested_descendants_with_child_root() -> None:
    tasks = [
        _task("parent"),
        _task("child-a", parent_id="parent"),
        _task("grandchild-a", parent_id="child-a"),
        _task("child-b", parent_id="parent"),
        _task("grandchild-b", parent_id="child-b"),
        _task("other-root"),
    ]

    reordered, before_ids, after_ids = reorder_direct_children(
        tasks,
        "parent",
        ["child-b", "child-a"],
    )

    assert before_ids == ["child-a", "child-b"]
    assert after_ids == ["child-b", "child-a"]
    assert [task["id"] for task in reordered] == [
        "parent",
        "child-b",
        "grandchild-b",
        "child-a",
        "grandchild-a",
        "other-root",
    ]


def test_phase_dicts_fails_closed_on_malformed_stored_task_array() -> None:
    with pytest.raises(HTTPException) as exc_info:
        phase_dicts({"phases": [{"id": "phase-a", "tasks": [{"id": "ok"}, "corrupt"]}]})

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Stored roadmap task snapshot is invalid"
