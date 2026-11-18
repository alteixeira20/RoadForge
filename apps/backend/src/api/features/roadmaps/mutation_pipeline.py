"""Commit an already validated mutation to the locked roadmap row."""

from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession

from api.features.roadmaps.activity_log_limit import enforce_activity_log_cap
from api.features.roadmaps.projection import (
    sync_roadmap_projection_best_effort,
    sync_task_projection_best_effort,
)
from api.models.roadmap import ActivityLog, Participant, Roadmap
from api.shared.realtime.event_bus import Event, event_bus


async def commit_roadmap_snapshot_mutation(
    db: AsyncSession,
    roadmap: Roadmap,
    participant: Participant,
    *,
    action: str,
    activity: ActivityLog,
    projection: Literal["full", "task", "none"] = "full",
    task_id: str | None = None,
    event_payload: dict[str, Any] | None = None,
    updated_at: datetime | None = None,
) -> None:
    """Persist the mutation and publish its revision after the commit succeeds."""
    if projection == "task" and task_id is None:
        raise ValueError("Task projection requires a task ID")

    roadmap.updated_at = updated_at if updated_at is not None else datetime.now(timezone.utc)
    db.add(activity)
    if projection == "full":
        await sync_roadmap_projection_best_effort(db, roadmap, action)
    elif projection == "task" and task_id is not None:
        await sync_task_projection_best_effort(db, roadmap, task_id, action)

    await enforce_activity_log_cap(db, roadmap.id)
    await db.commit()
    await db.refresh(roadmap)

    await event_bus.publish(Event(
        roadmap_id=roadmap.id,
        action="roadmap.updated",
        payload={
            "roadmap_id": roadmap.id,
            "updated_at": roadmap.updated_at.isoformat(),
            "participant_id": participant.id,
            "action": action,
            **(event_payload or {}),
        },
    ))
