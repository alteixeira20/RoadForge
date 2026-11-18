import pytest
from fastapi import HTTPException

from api.services.phase_structure_service import _phase_dicts


def test_phase_structure_snapshot_parser_accepts_only_object_phase_lists() -> None:
    phases = [{"id": "ph_a"}, {"id": "ph_b"}]

    assert _phase_dicts({"phases": phases}) is phases


@pytest.mark.parametrize(
    "snapshot",
    [
        {},
        {"phases": None},
        {"phases": "not-a-list"},
        {"phases": [{"id": "ph_a"}, "corrupt-phase"]},
    ],
)
def test_phase_structure_snapshot_parser_fails_closed(snapshot: dict) -> None:
    with pytest.raises(HTTPException) as exc_info:
        _phase_dicts(snapshot)

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Stored roadmap phase snapshot is invalid"
