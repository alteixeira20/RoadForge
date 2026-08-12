import pytest
from fastapi import HTTPException

from api.schemas.roadmap import PhaseDTO
from api.services.roadmap_validation import validate_roadmap_domain


def phase(tasks: list[dict]) -> PhaseDTO:
    return PhaseDTO.model_validate({
        'id': 'phase-1',
        'num': '01',
        'name': 'Phase',
        'color': '#808080',
        'status': 'active',
        'progress': 0,
        'tasks': tasks,
    })


def test_very_high_requires_two_direct_subtasks() -> None:
    phases = [phase([{
        'id': 'parent',
        'title': 'Parent',
        'done': False,
        'complexity': 'very_high',
    }])]
    with pytest.raises(HTTPException) as exc:
        validate_roadmap_domain(phases)
    assert 'requires at least two direct subtasks' in str(exc.value.detail)


def test_very_high_accepts_two_direct_subtasks() -> None:
    phases = [phase([
        {'id': 'parent', 'title': 'Parent', 'done': False, 'complexity': 'very_high'},
        {'id': 'one', 'title': 'One', 'done': False, 'complexity': 'medium', 'parentId': 'parent'},
        {'id': 'two', 'title': 'Two', 'done': False, 'complexity': 'high', 'parentId': 'parent'},
    ])]
    validate_roadmap_domain(phases)


def test_nested_task_cannot_be_very_high() -> None:
    phases = [phase([
        {'id': 'parent', 'title': 'Parent', 'done': False, 'complexity': 'medium'},
        {'id': 'nested', 'title': 'Nested', 'done': False, 'complexity': 'very_high', 'parentId': 'parent'},
    ])]
    with pytest.raises(HTTPException) as exc:
        validate_roadmap_domain(phases)
    assert 'must be top-level' in str(exc.value.detail)
