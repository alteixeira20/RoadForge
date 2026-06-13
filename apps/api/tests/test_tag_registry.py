"""
Tag registry CRUD endpoint tests.

Covers:
- GET /api/roadmaps/{id}/tags  — viewer, owner
- POST /api/roadmaps/{id}/tags — owner/editor can create; viewer cannot
- PUT /api/roadmaps/{id}/tags/{tag_id}
- DELETE /api/roadmaps/{id}/tags/{tag_id}
  - unused tag succeeds
  - used tag returns 409 and leaves registry unchanged
  - unknown tag returns 404
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.helpers_projection import auth
from tests.conftest import create_roadmap

pytestmark = pytest.mark.asyncio

# ─── Shared snapshot with one tagged task ────────────────────────────────────

_PHASES_WITH_TAG = [
    {
        "id": "ph_1",
        "num": "1",
        "name": "Phase One",
        "color": "#888",
        "status": "active",
        "progress": 0,
        "tasks": [
            {
                "id": "tk_1",
                "title": "Tagged task",
                "done": False,
                "tags": ["used-tag"],
            },
        ],
    }
]


# ─── Helpers ─────────────────────────────────────────────────────────────────


async def _create_roadmap_with_tags(
    client: AsyncClient,
    *,
    tag_registry: list[dict] | None = None,
    phases: list[dict] | None = None,
) -> dict:
    body: dict = {
        "name": "Tag Test Roadmap",
        "owner_display_name": "Owner",
        "phases": phases or [],
    }
    if tag_registry:
        body["tag_registry"] = tag_registry
    resp = await client.post("/api/roadmaps", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _join_as(client: AsyncClient, invite_url: str, name: str) -> dict:
    token = invite_url.split("token=")[-1]
    resp = await client.post(
        "/api/roadmaps/join",
        json={"token": token, "display_name": name},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _rotate_link(
    client: AsyncClient,
    roadmap_id: str,
    owner_token: str,
    role: str,
) -> str:
    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/share-links/{role}/rotate",
        headers=auth(owner_token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["url"]


def _get_tags(client: AsyncClient, roadmap_id: str, token: str):
    return client.get(f"/api/roadmaps/{roadmap_id}/tags", headers=auth(token))


def _post_tag(
    client: AsyncClient,
    roadmap_id: str,
    token: str,
    updated_at: str,
    payload: dict,
):
    return client.post(
        f"/api/roadmaps/{roadmap_id}/tags",
        headers=auth(token),
        json={**payload, "last_updated_at": updated_at},
    )


def _put_tag(
    client: AsyncClient,
    roadmap_id: str,
    token: str,
    tag_id: str,
    updated_at: str,
    payload: dict,
):
    return client.put(
        f"/api/roadmaps/{roadmap_id}/tags/{tag_id}",
        headers=auth(token),
        json={**payload, "last_updated_at": updated_at},
    )


def _delete_tag(
    client: AsyncClient,
    roadmap_id: str,
    token: str,
    tag_id: str,
    updated_at: str,
):
    return client.delete(
        f"/api/roadmaps/{roadmap_id}/tags/{tag_id}",
        headers=auth(token),
        params={"last_updated_at": updated_at},
    )


# ─── GET /tags ────────────────────────────────────────────────────────────────


async def test_owner_can_list_tags(client: AsyncClient):
    body = await _create_roadmap_with_tags(
        client, tag_registry=[{"id": "infra", "label": "Infrastructure"}]
    )
    resp = await client.get(
        f"/api/roadmaps/{body['id']}/tags",
        headers=auth(body["owner_session_token"]),
    )
    assert resp.status_code == 200, resp.text
    tags = resp.json()
    assert len(tags) == 1
    assert tags[0]["id"] == "infra"
    assert tags[0]["label"] == "Infrastructure"


async def test_viewer_can_list_tags(client: AsyncClient):
    body = await _create_roadmap_with_tags(
        client, tag_registry=[{"id": "design", "label": "Design"}]
    )
    viewer_url = await _rotate_link(client, body["id"], body["owner_session_token"], "viewer")
    viewer = await _join_as(client, viewer_url, "Viewer")

    resp = await client.get(
        f"/api/roadmaps/{body['id']}/tags",
        headers=auth(viewer["session_token"]),
    )
    assert resp.status_code == 200
    assert resp.json()[0]["id"] == "design"


async def test_list_tags_returns_empty_when_no_registry(client: AsyncClient):
    body = await create_roadmap(client)
    resp = await client.get(
        f"/api/roadmaps/{body['id']}/tags",
        headers=auth(body["owner_session_token"]),
    )
    assert resp.status_code == 200
    assert resp.json() == []


# ─── POST /tags ───────────────────────────────────────────────────────────────


async def test_owner_can_create_tag(client: AsyncClient):
    body = await create_roadmap(client)
    resp = await _post_tag(
        client,
        body["id"],
        body["owner_session_token"],
        body["updated_at"],
        {"label": "Backend"},
    )
    assert resp.status_code == 201, resp.text
    tag = resp.json()["tag_registry"][0]
    assert tag["id"] == "backend"
    assert tag["label"] == "Backend"
    assert tag["createdAt"] is not None


async def test_editor_can_create_tag(client: AsyncClient):
    body = await create_roadmap(client)
    editor_url = await _rotate_link(client, body["id"], body["owner_session_token"], "editor")
    editor = await _join_as(client, editor_url, "Editor")

    resp = await _post_tag(
        client,
        body["id"],
        editor["session_token"],
        body["updated_at"],
        {"label": "Frontend"},
    )
    assert resp.status_code == 201
    assert resp.json()["tag_registry"][0]["id"] == "frontend"


async def test_viewer_cannot_create_tag(client: AsyncClient):
    body = await create_roadmap(client)
    viewer_url = await _rotate_link(client, body["id"], body["owner_session_token"], "viewer")
    viewer = await _join_as(client, viewer_url, "Viewer")

    resp = await _post_tag(
        client,
        body["id"],
        viewer["session_token"],
        body["updated_at"],
        {"label": "Sneaky"},
    )
    assert resp.status_code == 403


async def test_create_tag_with_explicit_id_and_color(client: AsyncClient):
    body = await create_roadmap(client)
    resp = await _post_tag(
        client,
        body["id"],
        body["owner_session_token"],
        body["updated_at"],
        {"id": "my-custom-id", "label": "Custom", "color": "#ff0000"},
    )
    assert resp.status_code == 201
    tag = resp.json()["tag_registry"][0]
    assert tag["id"] == "my-custom-id"
    assert tag["color"] == "#ff0000"


async def test_create_tag_duplicate_id_returns_409(client: AsyncClient):
    body = await create_roadmap(client)
    token = body["owner_session_token"]
    first = await _post_tag(
        client,
        body["id"],
        token,
        body["updated_at"],
        {"id": "dup-tag", "label": "First"},
    )
    resp = await _post_tag(
        client,
        body["id"],
        token,
        first.json()["updated_at"],
        {"id": "dup-tag", "label": "Second"},
    )
    assert resp.status_code == 409


async def test_create_tag_duplicate_normalized_label_returns_409(client: AsyncClient):
    body = await _create_roadmap_with_tags(
        client,
        tag_registry=[{"id": "backend", "label": "Back End"}],
    )

    resp = await _post_tag(
        client,
        body["id"],
        body["owner_session_token"],
        body["updated_at"],
        {"id": "backend-two", "label": "  back   end  "},
    )

    assert resp.status_code == 409
    assert "label" in resp.json()["detail"].lower()


@pytest.mark.parametrize(
    "payload",
    [
        {"id": "Invalid ID", "label": "Invalid ID"},
        {"id": "valid-id", "label": "Invalid Color", "color": "red"},
    ],
)
async def test_create_tag_rejects_invalid_id_or_color(client: AsyncClient, payload: dict):
    body = await create_roadmap(client)

    resp = await _post_tag(
        client,
        body["id"],
        body["owner_session_token"],
        body["updated_at"],
        payload,
    )

    assert resp.status_code == 422


async def test_create_tag_rejects_stale_roadmap_timestamp(client: AsyncClient):
    body = await create_roadmap(client)
    first = await _post_tag(
        client,
        body["id"],
        body["owner_session_token"],
        body["updated_at"],
        {"label": "First"},
    )
    assert first.status_code == 201

    stale = await _post_tag(
        client,
        body["id"],
        body["owner_session_token"],
        body["updated_at"],
        {"label": "Second"},
    )

    assert stale.status_code == 409
    assert stale.json()["code"] == "roadmap_conflict"


# ─── PUT /tags/{tag_id} ───────────────────────────────────────────────────────


async def test_update_tag_changes_label_and_color(client: AsyncClient):
    body = await _create_roadmap_with_tags(
        client, tag_registry=[{"id": "infra", "label": "Old Label"}]
    )
    token = body["owner_session_token"]
    resp = await _put_tag(
        client,
        body["id"],
        token,
        "infra",
        body["updated_at"],
        {"label": "Infrastructure", "color": "#7c3aed"},
    )
    assert resp.status_code == 200, resp.text
    tag = resp.json()["tag_registry"][0]
    assert tag["label"] == "Infrastructure"
    assert tag["color"] == "#7c3aed"
    assert tag["updatedAt"] is not None


async def test_update_tag_clears_color_when_null(client: AsyncClient):
    body = await _create_roadmap_with_tags(
        client, tag_registry=[{"id": "infra", "label": "Infra", "color": "#ff0000"}]
    )
    token = body["owner_session_token"]
    resp = await _put_tag(
        client,
        body["id"],
        token,
        "infra",
        body["updated_at"],
        {"color": None},
    )
    assert resp.status_code == 200
    assert resp.json()["tag_registry"][0].get("color") is None


async def test_viewer_cannot_update_tag(client: AsyncClient):
    body = await _create_roadmap_with_tags(
        client, tag_registry=[{"id": "infra", "label": "Infra"}]
    )
    viewer_url = await _rotate_link(client, body["id"], body["owner_session_token"], "viewer")
    viewer = await _join_as(client, viewer_url, "Viewer")

    resp = await _put_tag(
        client,
        body["id"],
        viewer["session_token"],
        body["updated_at"],
        {"label": "Hacked"},
    )
    assert resp.status_code == 403


async def test_update_unknown_tag_returns_404(client: AsyncClient):
    body = await create_roadmap(client)
    resp = await _put_tag(
        client,
        body["id"],
        body["owner_session_token"],
        "nonexistent",
        body["updated_at"],
        {"label": "X"},
    )
    assert resp.status_code == 404


# ─── DELETE /tags/{tag_id} ────────────────────────────────────────────────────


async def test_delete_unused_tag_succeeds(client: AsyncClient):
    body = await _create_roadmap_with_tags(
        client, tag_registry=[{"id": "unused", "label": "Unused"}]
    )
    token = body["owner_session_token"]
    resp = await _delete_tag(client, body["id"], token, "unused", body["updated_at"])
    assert resp.status_code == 200

    # Verify registry is now empty
    tags = (await client.get(
        f"/api/roadmaps/{body['id']}/tags",
        headers=auth(token),
    )).json()
    assert tags == []


async def test_delete_used_tag_returns_409(client: AsyncClient):
    body = await _create_roadmap_with_tags(
        client,
        tag_registry=[{"id": "used-tag", "label": "Used"}],
        phases=_PHASES_WITH_TAG,
    )
    token = body["owner_session_token"]
    resp = await _delete_tag(client, body["id"], token, "used-tag", body["updated_at"])
    assert resp.status_code == 409
    assert "used" in resp.json()["detail"].lower()

    # Registry must still contain the tag
    tags = (await client.get(
        f"/api/roadmaps/{body['id']}/tags",
        headers=auth(token),
    )).json()
    assert any(t["id"] == "used-tag" for t in tags)


async def test_delete_unknown_tag_returns_404(client: AsyncClient):
    body = await create_roadmap(client)
    resp = await _delete_tag(
        client,
        body["id"],
        body["owner_session_token"],
        "ghost",
        body["updated_at"],
    )
    assert resp.status_code == 404


async def test_viewer_cannot_delete_tag(client: AsyncClient):
    body = await _create_roadmap_with_tags(
        client, tag_registry=[{"id": "infra", "label": "Infra"}]
    )
    viewer_url = await _rotate_link(client, body["id"], body["owner_session_token"], "viewer")
    viewer = await _join_as(client, viewer_url, "Viewer")

    resp = await _delete_tag(
        client,
        body["id"],
        viewer["session_token"],
        "infra",
        body["updated_at"],
    )
    assert resp.status_code == 403
