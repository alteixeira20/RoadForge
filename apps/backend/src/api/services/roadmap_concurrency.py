"""Deterministic compare-and-swap checks for roadmap mutations."""

from __future__ import annotations

from datetime import datetime

from api.models.roadmap import Roadmap
from api.schemas.roadmap import PhaseDTO
from api.services.roadmap_helpers import RoadmapConflictError, _roadmap_conflict_response
from api.services.session_policy import ensure_aware_utc


def ensure_roadmap_is_current(
    roadmap: Roadmap,
    last_updated_at: datetime,
    client_phases: list[PhaseDTO] | None = None,
) -> datetime:
    """Require the client revision timestamp to exactly match the locked row.

    The previous greater-than comparison trusted client clocks: a timestamp in
    the future could bypass conflict detection. Exact equality turns the echoed
    server timestamp into an opaque compare-and-swap token while retaining API
    compatibility until RoadForge exposes an integer revision to all clients.
    """
    client_ts = ensure_aware_utc(last_updated_at)
    server_ts = ensure_aware_utc(roadmap.updated_at)
    if server_ts != client_ts:
        raise RoadmapConflictError(
            _roadmap_conflict_response(roadmap, client_ts, client_phases)
        )
    return client_ts
