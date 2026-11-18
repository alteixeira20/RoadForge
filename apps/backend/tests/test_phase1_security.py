"""Phase-1 credential transport and cross-roadmap authorization regressions."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import api.routers.roadmap_realtime as roadmaps_router
from api.models.roadmap import Participant
from api.services.ticket_service import (
    EVENT_TICKET_COOKIE_NAME,
    EVENT_TICKET_TTL_SECONDS,
    event_ticket_cookie_path,
)
from tests.conftest import create_roadmap

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _rotate(
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
    return response.json()["url"]


async def _join(client: AsyncClient, invite_url: str, name: str = "Member") -> dict:
    token = invite_url.split("token=", 1)[1]
    response = await client.post(
        "/api/roadmaps/join",
        json={"token": token, "display_name": name},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_new_invites_use_fragments_not_query_credentials(client: AsyncClient):
    body = await create_roadmap(client)

    for link in body["share_links"]:
        assert "/join#token=" in link["url"]
        assert "/join?token=" not in link["url"]

    rotated = await _rotate(
        client,
        body["id"],
        body["owner_session_token"],
        "viewer",
    )
    assert "/join#token=" in rotated
    assert "/join?token=" not in rotated


async def test_share_link_listing_never_reveals_raw_invites(client: AsyncClient):
    body = await create_roadmap(client)

    listed = await client.get(
        f"/api/roadmaps/{body['id']}/share-links",
        headers=_auth(body["owner_session_token"]),
    )
    assert listed.status_code == 200, listed.text
    assert all(link["url"] is None for link in listed.json())

    viewer_url = await _rotate(
        client,
        body["id"],
        body["owner_session_token"],
        "viewer",
    )
    listed_again = await client.get(
        f"/api/roadmaps/{body['id']}/share-links",
        headers=_auth(body["owner_session_token"]),
    )
    assert all(link["url"] is None for link in listed_again.json())
    assert (await _join(client, viewer_url, "Viewer"))["role"] == "viewer"


async def test_session_token_is_strictly_roadmap_scoped(client: AsyncClient):
    first = await create_roadmap(client, name="First")
    second = await create_roadmap(client, name="Second")
    token = first["owner_session_token"]

    assert (
        await client.get(
            f"/api/roadmaps/{second['id']}",
            headers=_auth(token),
        )
    ).status_code == 401
    assert (
        await client.get(
            f"/api/roadmaps/{second['id']}/share-links",
            headers=_auth(token),
        )
    ).status_code == 401
    assert (
        await client.post(
            f"/api/roadmaps/{second['id']}/events/ticket",
            headers=_auth(token),
        )
    ).status_code == 401


async def test_role_change_is_enforced_on_the_next_request(
    client: AsyncClient,
    db_session: AsyncSession,
):
    body = await create_roadmap(client)
    editor = await _join(
        client,
        await _rotate(
            client,
            body["id"],
            body["owner_session_token"],
            "editor",
        ),
        "Editor",
    )

    result = await db_session.execute(
        select(Participant).where(Participant.id == editor["participant_id"])
    )
    participant = result.scalar_one()
    participant.role = "viewer"
    await db_session.commit()

    denied = await client.post(
        f"/api/roadmaps/{body['id']}/locks",
        headers=_auth(editor["session_token"]),
        json={"target": "task:tk_1"},
    )
    assert denied.status_code == 403


async def test_event_ticket_bootstrap_sets_scoped_httponly_cookie(client: AsyncClient):
    body = await create_roadmap(client)
    response = await client.post(
        f"/api/roadmaps/{body['id']}/events/ticket",
        headers=_auth(body["owner_session_token"]),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"expires_in": EVENT_TICKET_TTL_SECONDS}
    cookie = response.headers["set-cookie"]
    assert EVENT_TICKET_COOKIE_NAME in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=strict" in cookie
    assert f"Path={event_ticket_cookie_path(body['id'])}" in cookie
    assert f"Max-Age={EVENT_TICKET_TTL_SECONDS}" in cookie
    assert "ticket" not in response.json()


async def test_event_cookie_is_secure_outside_development(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    body = await create_roadmap(client)
    monkeypatch.setattr(
        roadmaps_router,
        "get_settings",
        lambda: SimpleNamespace(is_production_like=True),
    )

    response = await client.post(
        f"/api/roadmaps/{body['id']}/events/ticket",
        headers=_auth(body["owner_session_token"]),
    )

    assert response.status_code == 200, response.text
    assert "Secure" in response.headers["set-cookie"]


async def test_event_stream_rejects_legacy_query_ticket_without_cookie(
    client: AsyncClient,
):
    body = await create_roadmap(client)

    response = await client.get(
        f"/api/roadmaps/{body['id']}/events?ticket=legacy-query-secret",
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired event ticket"