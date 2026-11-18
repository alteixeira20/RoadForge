from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from api.features.roadmaps import mutation_pipeline as pipeline


@pytest.mark.parametrize("projection", ["full", "task", "none"])
async def test_validation_to_post_commit_publish_order(monkeypatch, projection):
    calls = []
    revision = datetime(2026, 11, 18, tzinfo=timezone.utc)
    roadmap = SimpleNamespace(id="rm_example", updated_at=None)
    participant = SimpleNamespace(id="pt_example")
    activity = object()

    def add(item):
        assert roadmap.updated_at == revision
        assert item is activity
        calls.append("activity")

    db = SimpleNamespace(
        add=add,
        commit=AsyncMock(side_effect=lambda: calls.append("commit")),
        refresh=AsyncMock(side_effect=lambda _: calls.append("refresh")),
    )
    full = AsyncMock(side_effect=lambda *_: calls.append("full"))
    task = AsyncMock(side_effect=lambda *_: calls.append("task"))
    cap = AsyncMock(side_effect=lambda *_: calls.append("cap"))
    publish = AsyncMock(side_effect=lambda _: calls.append("publish"))
    monkeypatch.setattr(pipeline, "sync_roadmap_projection_best_effort", full)
    monkeypatch.setattr(pipeline, "sync_task_projection_best_effort", task)
    monkeypatch.setattr(pipeline, "enforce_activity_log_cap", cap)
    monkeypatch.setattr(pipeline.event_bus, "publish", publish)

    await pipeline.commit_roadmap_snapshot_mutation(
        db, roadmap, participant, action="task.updated", activity=activity,
        projection=projection, task_id="tk_example", updated_at=revision,
        event_payload={"changed_fields": ["title"]},
    )

    projected = [] if projection == "none" else [projection]
    assert calls == ["activity", *projected, "cap", "commit", "refresh", "publish"]
    if projection == "task":
        task.assert_awaited_once_with(db, roadmap, "tk_example", "task.updated")
    event = publish.await_args.args[0]
    assert event.action == "roadmap.updated"
    assert event.payload == {
        "roadmap_id": "rm_example",
        "participant_id": "pt_example",
        "updated_at": revision.isoformat(),
        "action": "task.updated",
        "changed_fields": ["title"],
    }


async def test_failed_commit_never_refreshes_or_publishes(monkeypatch):
    cap = AsyncMock()
    publish = AsyncMock()
    monkeypatch.setattr(pipeline, "enforce_activity_log_cap", cap)
    monkeypatch.setattr(pipeline.event_bus, "publish", publish)
    db = SimpleNamespace(
        add=Mock(), commit=AsyncMock(side_effect=RuntimeError("commit failed")),
        refresh=AsyncMock(),
    )
    roadmap = SimpleNamespace(id="rm_example", updated_at=None)

    with pytest.raises(RuntimeError, match="commit failed"):
        await pipeline.commit_roadmap_snapshot_mutation(
            db, roadmap, SimpleNamespace(id="pt_example"), action="roadmap.renamed",
            activity=object(), projection="none",
        )

    cap.assert_awaited_once_with(db, "rm_example")
    db.refresh.assert_not_awaited()
    publish.assert_not_awaited()
