'Roadmap version persistence helpers.'

from copy import deepcopy

import sqlalchemy as sa
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.models.roadmap import Participant, Roadmap, RoadmapVersion
from api.shared.ids import generate_id

_MAX_ROADMAP_VERSIONS = 100
_VERSION_WORTHY_ACTIONS = frozenset({
    "roadmap.created",
    "roadmap.imported",
    "import.replaced",
    "roadmap.restored",
    "roadmap.checkpoint",
})

def should_create_version(action: str | None, metadata: dict | None) -> bool:
    if action is None:
        return False
    return action in _VERSION_WORTHY_ACTIONS


def snapshot_counts(snapshot_json: dict) -> tuple[int, int]:
    phases = snapshot_json.get("phases", [])
    if not isinstance(phases, list):
        return 0, 0
    task_count = sum(len(p.get("tasks", [])) for p in phases if isinstance(p, dict))
    return len(phases), task_count


def version_snapshot(roadmap: Roadmap) -> dict:
    """Build the portable version envelope without copying volatile server state."""
    phases = roadmap.snapshot_json.get("phases", [])
    return {
        "phases": deepcopy(phases) if isinstance(phases, list) else [],
        "tag_registry": deepcopy(roadmap.tag_registry_json or []),
    }


async def trim_old_versions(db: AsyncSession, roadmap_id: str) -> None:
    rows_result = await db.execute(
        select(
            RoadmapVersion.id,
            sa.func.pg_column_size(RoadmapVersion.snapshot_json),
        )
        .where(RoadmapVersion.roadmap_id == roadmap_id)
        .order_by(RoadmapVersion.version_number.desc())
    )
    rows = rows_result.all()
    byte_cap = get_settings().max_version_history_bytes_per_roadmap
    total_bytes = 0
    old_ids: list[str] = []
    for index, (version_id, stored_bytes) in enumerate(rows):
        size = int(stored_bytes or 0)
        preserve = index < 3
        if (
            index >= _MAX_ROADMAP_VERSIONS
            or (not preserve and total_bytes + size > byte_cap)
        ):
            old_ids.extend(row[0] for row in rows[index:])
            break
        total_bytes += size
    if old_ids:
        await db.execute(delete(RoadmapVersion).where(RoadmapVersion.id.in_(old_ids)))


async def create_roadmap_version(
    db: AsyncSession,
    roadmap: Roadmap,
    participant: Participant | None,
    action: str | None,
    metadata_json: dict | None = None,
    force: bool = False,
) -> None:
    latest_result = await db.execute(
        select(RoadmapVersion)
        .where(RoadmapVersion.roadmap_id == roadmap.id)
        .order_by(RoadmapVersion.version_number.desc())
        .limit(1)
    )
    latest = latest_result.scalar_one_or_none()
    current_snapshot = version_snapshot(roadmap)

    if not force and latest and (
        latest.roadmap_name == roadmap.name and latest.snapshot_json == current_snapshot
    ):
        return

    next_number = (latest.version_number if latest else 0) + 1
    db.add(RoadmapVersion(
        id=generate_id("rv_"),
        roadmap_id=roadmap.id,
        version_number=next_number,
        roadmap_name=roadmap.name,
        snapshot_json=current_snapshot,
        participant_id=participant.id if participant else None,
        actor_name=participant.display_name if participant else None,
        action=action,
        metadata_json=metadata_json,
    ))
    await db.flush()
    # Trim is called after flush so the freshly inserted version is visible
    # in the count, ensuring the cap is accurate.
    await trim_old_versions(db, roadmap.id)
