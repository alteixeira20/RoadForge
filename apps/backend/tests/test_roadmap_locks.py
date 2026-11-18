"""Role and lifecycle contracts for roadmap edit locks and realtime tickets."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

import api.routers.roadmap_locks as locks_router
import api.routers.roadmap_realtime as realtime_router
from api.services.lock_service import MemoryLockService
from api.services.ticket_service import MemoryTicketService
from tests.conftest import create_roadmap

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _invite_token(body: dict, role: str) -> str:
    link = next(link for link in body["share_links"] if link["role"] == role)
    return link["url"].split("token=")[-1]


async def _rotate_link(
    client: AsyncClient,
    roadmap_id: str,
    owner_token: str,
    role: str,
) -> str:
    response = await client.post(
        f"/api/roadmaps/{roadmap_id}/share-links/{role}/rotate",
        headers=_auth(owner_token),
    )
    assert response.status_code == 200, response.text
    return response.json()["url"].split("token=")[-1]


async def _join(client: AsyncClient, token: str, display_name: str) -> dict:
    response = await client.post(
        "/api/roadmaps/join",
        json={"token": token, "display_name": display_name},
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture(autouse=True)
def _fresh_realtime_stores(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(locks_router, "lock_service", MemoryLockService())
    monkeypatch.setattr(realtime_router, "ticket_service", MemoryTicketService())


async def test_owner_acquires_refreshes_lists_and_releases_lock(client: AsyncClient):
    body = await create_roadmap(client)
    headers = _auth(body["owner_session_token"])
    endpoint = f"/api/roadmaps/{body['id']}/locks"

    acquired = await client.post(
        endpoint,
        headers=headers,
        json={"target": "task:tk_1"},
    )
    assert acquired.status_code == 200, acquired.text
    first = acquired.json()
    assert first["display_name"] == "Owner"
    assert first["target"] == "task:tk_1"

    refreshed = await client.post(
        endpoint,
        headers=headers,
        json={"target": "task:tk_1"},
    )
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["expires_at"] >= first["expires_at"]

    listed = await client.get(endpoint, headers=headers)
    assert listed.status_code == 200
    assert [lock["target"] for lock in listed.json()] == ["task:tk_1"]

    released = await client.delete(
        f"{endpoint}/task:tk_1",
        headers=headers,
    )
    assert released.status_code == 204
    assert (await client.get(endpoint, headers=headers)).json() == []


async def test_competing_editor_cannot_take_or_release_lock(client: AsyncClient):
    body = await create_roadmap(client)
    editor_a = await _join(
        client,
        _invite_token(body, "editor"),
        "Editor A",
    )
    editor_b = await _join(
        client,
        await _rotate_link(
            client,
            body["id"],
            body["owner_session_token"],
            "editor",
        ),
        "Editor B",
    )
    endpoint = f"/api/roadmaps/{body['id']}/locks"

    acquired = await client.post(
        endpoint,
        headers=_auth(editor_a["session_token"]),
        json={"target": "phase:phase-1"},
    )
    assert acquired.status_code == 200, acquired.text

    conflict = await client.post(
        endpoint,
        headers=_auth(editor_b["session_token"]),
        json={"target": "phase:phase-1"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "Target is locked by another participant"

    release = await client.delete(
        f"{endpoint}/phase:phase-1",
        headers=_auth(editor_b["session_token"]),
    )
    assert release.status_code == 204
    listed = await client.get(endpoint, headers=_auth(editor_b["session_token"]))
    assert len(listed.json()) == 1
    assert listed.json()[0]["display_name"] == "Editor A"


async def test_viewer_can_read_locks_and_activity_but_not_mutate_locks(
    client: AsyncClient,
):
    body = await create_roadmap(client)
    viewer = await _join(
        client,
        _invite_token(body, "viewer"),
        "Viewer",
    )
    headers = _auth(viewer["session_token"])
    endpoint = f"/api/roadmaps/{body['id']}/locks"

    assert (await client.get(endpoint, headers=headers)).status_code == 200
    assert (
        await client.get(
            f"/api/roadmaps/{body['id']}/activity",
            headers=headers,
        )
    ).status_code == 200
    assert (
        await client.post(
            endpoint,
            headers=headers,
            json={"target": "task:tk_1"},
        )
    ).status_code == 403
    assert (
        await client.delete(
            f"{endpoint}/task:tk_1",
            headers=headers,
        )
    ).status_code == 403


@pytest.mark.parametrize("role", ["owner", "editor", "viewer"])
async def test_all_roles_can_create_realtime_ticket(
    client: AsyncClient,
    role: str,
):
    body = await create_roadmap(client)
    if role == "owner":
        token = body["owner_session_token"]
    else:
        joined = await _join(client, _invite_token(body, role), role.title())
        token = joined["session_token"]

    response = await client.post(
        f"/api/roadmaps/{body['id']}/events/ticket",
        headers=_auth(token),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"expires_in": 30}
    assert "HttpOnly" in response.headers["set-cookie"]
    assert (
        await client.get(
            f"/api/roadmaps/{body['id']}/activity",
            headers=_auth(token),
        )
    ).status_code == 200
    assert (
        await client.get(
            f"/api/roadmaps/{body['id']}/locks",
            headers=_auth(token),
        )
    ).status_code == 200


async def test_lock_target_validation_rejects_path_or_query_syntax(client: AsyncClient):
    body = await create_roadmap(client)
    endpoint = f"/api/roadmaps/{body['id']}/locks"

    response = await client.post(
        endpoint,
        headers=_auth(body["owner_session_token"]),
        json={"target": "task/one?token=secret"},
    )

    assert response.status_code == 422
