"""Server-side validation for the canonical roadmap snapshot.

The browser importer repairs legacy data, but the API is also a public write
surface. These checks keep the JSON snapshot deterministic for partial writes,
exports, collaboration, and future agent integrations.
"""

from __future__ import annotations

from collections.abc import Iterable

from fastapi import HTTPException

from api.schemas.roadmap import PhaseDTO, TagDefinitionDTO

_MAX_REPORTED_ERRORS = 8


def _duplicates(values: Iterable[str], *, casefold: bool = False) -> set[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        key = value.casefold() if casefold else value
        if key in seen:
            duplicates.add(value)
        seen.add(key)
    return duplicates


def _cycle_nodes(graph: dict[str, list[str]]) -> set[str]:
    """Return nodes participating in a directed cycle."""
    visiting: set[str] = set()
    visited: set[str] = set()
    cycles: set[str] = set()

    def visit(node: str, path: list[str]) -> None:
        if node in visited:
            return
        if node in visiting:
            try:
                start = path.index(node)
            except ValueError:
                start = 0
            cycles.update(path[start:])
            cycles.add(node)
            return

        visiting.add(node)
        path.append(node)
        for target in graph.get(node, []):
            if target in graph:
                visit(target, path)
        path.pop()
        visiting.remove(node)
        visited.add(node)

    for node in graph:
        visit(node, [])
    return cycles


def _raise_validation_errors(errors: list[str]) -> None:
    if not errors:
        return
    shown = errors[:_MAX_REPORTED_ERRORS]
    omitted = len(errors) - len(shown)
    detail = "; ".join(shown)
    if omitted:
        detail += f"; and {omitted} more issue{'s' if omitted != 1 else ''}"
    raise HTTPException(status_code=422, detail=f"Invalid roadmap: {detail}")


def validate_roadmap_domain(
    phases: list[PhaseDTO],
    tag_registry: list[TagDefinitionDTO] | None = None,
) -> None:
    """Validate cross-object invariants that individual DTOs cannot enforce.

    Phase progress is intentionally excluded: it is a derived presentation value
    recalculated from task completion by RoadForge clients and mutation helpers.
    Tag definitions are also optional metadata: tasks may use stable tag IDs before
    a label/color definition is added, which keeps agent writes atomic.
    """
    errors: list[str] = []

    duplicate_phase_ids = _duplicates(phase.id for phase in phases)
    if duplicate_phase_ids:
        errors.append(f"duplicate phase IDs: {', '.join(sorted(duplicate_phase_ids))}")

    duplicate_phase_nums = _duplicates(
        (phase.num for phase in phases),
        casefold=True,
    )
    if duplicate_phase_nums:
        errors.append(f"duplicate phase numbers: {', '.join(sorted(duplicate_phase_nums))}")

    all_tasks = [task for phase in phases for task in phase.tasks]
    task_by_id = {task.id: task for task in all_tasks}
    phase_by_task_id = {
        task.id: phase.id
        for phase in phases
        for task in phase.tasks
    }
    children_by_parent_id: dict[str, list] = {}
    for task in all_tasks:
        if task.parentId:
            children_by_parent_id.setdefault(task.parentId, []).append(task)

    duplicate_task_ids = _duplicates(task.id for task in all_tasks)
    if duplicate_task_ids:
        errors.append(f"duplicate task IDs: {', '.join(sorted(duplicate_task_ids))}")

    if tag_registry is not None:
        duplicate_tag_ids = _duplicates(tag.id for tag in tag_registry)
        duplicate_tag_labels = _duplicates(
            (" ".join(tag.label.split()) for tag in tag_registry),
            casefold=True,
        )
        if duplicate_tag_ids:
            errors.append(f"duplicate tag IDs: {', '.join(sorted(duplicate_tag_ids))}")
        if duplicate_tag_labels:
            errors.append("duplicate tag labels")
    parent_graph: dict[str, list[str]] = {task.id: [] for task in all_tasks}
    dependency_graph: dict[str, list[str]] = {task.id: [] for task in all_tasks}

    for phase in phases:
        for task in phase.tasks:
            for field_name, values in (
                ("assignees", task.assignees or []),
                ("tags", task.tags or []),
                ("dependencies", task.deps or []),
            ):
                if _duplicates(values, casefold=field_name != "dependencies"):
                    errors.append(f"task {task.id!r} has duplicate {field_name}")

            if task.done and any((task.claimedBy, task.claimedById, task.claimedAt)):
                errors.append(f"completed task {task.id!r} must not remain claimed")

            if task.complexity == "very_high":
                direct_children = children_by_parent_id.get(task.id, [])
                if task.parentId:
                    errors.append(
                        f"very-high complexity task {task.id!r} must be top-level"
                    )
                elif len(direct_children) < 2:
                    errors.append(
                        f"very-high complexity task {task.id!r} requires at least two direct subtasks"
                    )
                elif task.done and any(not child.done for child in direct_children):
                    errors.append(
                        f"very-high complexity task {task.id!r} cannot be complete before its subtasks"
                    )

            if task.parentId:
                if task.parentId == task.id:
                    errors.append(f"task {task.id!r} cannot be its own parent")
                elif task.parentId not in task_by_id:
                    errors.append(
                        f"task {task.id!r} references missing parent {task.parentId!r}"
                    )
                elif phase_by_task_id.get(task.parentId) != phase.id:
                    errors.append(
                        f"task {task.id!r} parent must be in the same phase"
                    )
                else:
                    parent_graph[task.id].append(task.parentId)

            for dependency_id in task.deps or []:
                if dependency_id == task.id:
                    errors.append(f"task {task.id!r} cannot depend on itself")
                elif dependency_id not in task_by_id:
                    errors.append(
                        f"task {task.id!r} references missing dependency {dependency_id!r}"
                    )
                else:
                    dependency_graph[task.id].append(dependency_id)

    parent_cycles = _cycle_nodes(parent_graph)
    if parent_cycles:
        errors.append(f"parent cycle includes: {', '.join(sorted(parent_cycles))}")

    dependency_cycles = _cycle_nodes(dependency_graph)
    if dependency_cycles:
        errors.append(
            f"dependency cycle includes: {', '.join(sorted(dependency_cycles))}"
        )

    _raise_validation_errors(errors)
