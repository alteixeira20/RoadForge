"""
Shared fixtures and helpers for projection test files.

Used by:
  test_roadmap_projection_roundtrip.py  (RF-1906)
  test_roadmap_projection_parity.py     (RF-1907)
  test_roadmap_projection_read_flag.py  (RF-1910)
"""

from __future__ import annotations

from httpx import AsyncClient

# Two-phase snapshot with tasks covering all mapped fields.
# Phase ph_a: two tasks (tk_a1 has all scalars + tags + assignees; tk_a2 deps on tk_a1).
# Phase ph_b: one task with a cross-phase parentId and a tag.
PHASES_WITH_TASKS = [
    {
        "id": "ph_a",
        "num": "1",
        "name": "Alpha",
        "color": "blue",
        "status": "active",
        "progress": 50,
        "tasks": [
            {
                "id": "tk_a1",
                "title": "Alpha task one",
                "done": False,
                "next": True,
                "est": "2d",
                "desc": "First task description",
                "tags": ["tag-a", "tag-b"],
                "assignees": ["Alice", "Bob"],
            },
            {
                "id": "tk_a2",
                "title": "Alpha task two",
                "done": True,
                "assignees": ["Alice"],
                "deps": ["tk_a1"],
            },
        ],
    },
    {
        "id": "ph_b",
        "num": "2",
        "name": "Beta",
        "color": "green",
        "status": "future",
        "progress": 0,
        "tasks": [
            {
                "id": "tk_b1",
                "title": "Beta task one",
                "done": False,
                "parentId": "tk_a1",
                "tags": ["tag-c"],
            },
        ],
    },
]


async def create_with_phases(client: AsyncClient) -> dict:
    resp = await client.post(
        "/api/roadmaps",
        json={
            "name": "Projection Test",
            "owner_display_name": "Owner",
            "phases": PHASES_WITH_TASKS,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
