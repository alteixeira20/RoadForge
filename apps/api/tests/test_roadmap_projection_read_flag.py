"""
RF-1910 — Projection-read flag behavior tests.

Groups:
  H  Flag disabled by default
  I  Flag enabled with parity OK — GET returns same shape as snapshot path
  J  Flag enabled with parity failure — falls back to canonical snapshot
  K  Flag enabled with serialization failure — falls back to canonical snapshot
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.services import roadmap_service
from api.services.roadmap_projection_service import clear_roadmap_projection
from tests.helpers_projection import auth, create_with_phases

pytestmark = pytest.mark.asyncio


# ─── Group H — Flag disabled by default ──────────────────────────────────────


async def test_projection_read_flag_is_disabled_by_default():
    assert get_settings().roadmap_projection_read_enabled is False


async def test_get_roadmap_reads_from_snapshot_when_flag_disabled(client):
    body = await create_with_phases(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    resp = await client.get(f"/api/roadmaps/{roadmap_id}", headers=auth(owner_token))

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["phases"]) == 2
    assert data["phases"][0]["id"] == "ph_a"
    assert data["phases"][1]["id"] == "ph_b"


# ─── Group I — Flag enabled with parity OK ───────────────────────────────────


async def test_get_roadmap_returns_same_shape_when_projection_read_enabled(
    client, monkeypatch
):
    body = await create_with_phases(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    monkeypatch.setattr(get_settings(), "roadmap_projection_read_enabled", True)

    resp = await client.get(f"/api/roadmaps/{roadmap_id}", headers=auth(owner_token))

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["phases"]) == 2
    assert data["phases"][0]["id"] == "ph_a"
    assert data["phases"][1]["id"] == "ph_b"


# ─── Group K — Flag enabled, serialization failure falls back safely ─────────


async def test_get_roadmap_falls_back_to_snapshot_when_projection_serialization_fails(
    client, monkeypatch
):
    body = await create_with_phases(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    async def _raise_projection_error(*args, **kwargs):
        raise ValueError("forced projection serialization failure")

    monkeypatch.setattr(get_settings(), "roadmap_projection_read_enabled", True)
    monkeypatch.setattr(
        roadmap_service,
        "serialize_projection_to_snapshot",
        _raise_projection_error,
    )

    resp = await client.get(f"/api/roadmaps/{roadmap_id}", headers=auth(owner_token))

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["phases"]) == 2
    assert data["phases"][0]["id"] == "ph_a"
    assert data["phases"][1]["id"] == "ph_b"
    assert len(data["phases"][0]["tasks"]) == 2
    assert len(data["phases"][1]["tasks"]) == 1


# ─── Group J — Flag enabled, parity failure falls back safely ─────────────────


async def test_get_roadmap_falls_back_to_snapshot_when_projection_cleared(
    client, db_session: AsyncSession, monkeypatch
):
    body = await create_with_phases(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    # Clear projection rows — parity will fail (0 phases vs 2 in snapshot)
    await clear_roadmap_projection(db_session, roadmap_id)

    monkeypatch.setattr(get_settings(), "roadmap_projection_read_enabled", True)

    resp = await client.get(f"/api/roadmaps/{roadmap_id}", headers=auth(owner_token))

    # Must return 200 with snapshot phases, not empty projection
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["phases"]) == 2
    assert data["phases"][0]["id"] == "ph_a"
    assert data["phases"][1]["id"] == "ph_b"
