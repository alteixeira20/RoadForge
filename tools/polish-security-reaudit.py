from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count}, found {actual}: {old[:120]!r}")
    p.write_text(text.replace(old, new, count))


# Fix the revocation transaction indentation damaged by the broad commit transform.
replace(
    "apps/api/src/api/services/sharing_service.py",
    "    try:\n        await enforce_activity_log_cap(db, roadmap_id)\n    await db.commit()\n    except Exception:\n",
    "    try:\n        await enforce_activity_log_cap(db, roadmap_id)\n        await db.commit()\n    except Exception:\n",
)

# Force the locked invite row to refresh from PostgreSQL instead of trusting a stale
# identity-map object if rotation raced the initial token lookup.
replace(
    "apps/api/src/api/services/roadmap_join_service.py",
    "        select(ShareLink).where(ShareLink.id == share_link.id).with_for_update()\n",
    "        select(ShareLink)\n        .where(ShareLink.id == share_link.id)\n        .with_for_update()\n        .execution_options(populate_existing=True)\n",
)

# Keep imports Ruff/isort-clean after the security additions.
replace(
    "apps/api/src/api/services/roadmap_service.py",
    "import logging\n\nimport sqlalchemy as sa\nfrom fastapi import HTTPException\nfrom datetime import datetime, timezone\n\nfrom sqlalchemy import select\n",
    "import logging\nfrom datetime import datetime, timezone\n\nimport sqlalchemy as sa\nfrom fastapi import HTTPException\nfrom sqlalchemy import select\n",
)
replace(
    "apps/api/src/api/services/roadmap_service.py",
    "from api.models.roadmap import ActivityLog, Participant, Roadmap, ShareLink\nfrom api.services.activity_log_limit import enforce_activity_log_cap\nfrom api.schemas.roadmap import (\n",
    "from api.models.roadmap import ActivityLog, Participant, Roadmap, ShareLink\nfrom api.schemas.roadmap import (\n",
)
replace(
    "apps/api/src/api/services/roadmap_service.py",
    ")\n\n# PatchTaskClaimRequest is intentionally omitted — the claim endpoint has no body.\nfrom api.services.event_bus import Event, event_bus\n",
    ")\n\n# PatchTaskClaimRequest is intentionally omitted — the claim endpoint has no body.\nfrom api.services.activity_log_limit import enforce_activity_log_cap\nfrom api.services.event_bus import Event, event_bus\n",
)
replace(
    "apps/api/src/api/services/version_service.py",
    "import logging\n\nimport sqlalchemy as sa\nfrom copy import deepcopy\nfrom datetime import datetime, timezone\n\nfrom fastapi import HTTPException\n",
    "import logging\nfrom copy import deepcopy\nfrom datetime import datetime, timezone\n\nimport sqlalchemy as sa\nfrom fastapi import HTTPException\n",
)
replace(
    "apps/api/src/api/services/version_service.py",
    "from api.models.roadmap import ActivityLog, Participant, Roadmap, RoadmapVersion\nfrom api.services.activity_log_limit import enforce_activity_log_cap\nfrom api.schemas.roadmap import (\n",
    "from api.models.roadmap import ActivityLog, Participant, Roadmap, RoadmapVersion\nfrom api.schemas.roadmap import (\n",
)
replace(
    "apps/api/src/api/services/version_service.py",
    ")\nfrom api.services.event_bus import Event, event_bus\n",
    ")\nfrom api.services.activity_log_limit import enforce_activity_log_cap\nfrom api.services.event_bus import Event, event_bus\n",
)
for path in [
    "apps/api/src/api/services/roadmap_task_service.py",
    "apps/api/src/api/services/roadmap_tag_service.py",
]:
    replace(
        path,
        "from api.services.activity_log_limit import enforce_activity_log_cap\nfrom api.schemas.roadmap import (\n",
        "from api.schemas.roadmap import (\n",
    )
    replace(
        path,
        ")\nfrom api.services.event_bus import Event, event_bus\n",
        ")\nfrom api.services.activity_log_limit import enforce_activity_log_cap\nfrom api.services.event_bus import Event, event_bus\n",
    )
replace(
    "apps/api/src/api/services/sharing_service.py",
    "from api.models.roadmap import ActivityLog, Participant, ShareLink\nfrom api.services.activity_log_limit import enforce_activity_log_cap\nfrom api.schemas.roadmap import (\n",
    "from api.models.roadmap import ActivityLog, Participant, ShareLink\nfrom api.schemas.roadmap import (\n",
)
replace(
    "apps/api/src/api/services/sharing_service.py",
    ")\nfrom api.services.auth_service import is_participant_revoked\n",
    ")\nfrom api.services.activity_log_limit import enforce_activity_log_cap\nfrom api.services.auth_service import is_participant_revoked\n",
)
replace(
    "apps/api/src/api/services/roadmap_join_service.py",
    "from api.config import get_settings\nfrom api.models.roadmap import ActivityLog, Participant, Roadmap, ShareLink\nfrom api.services.activity_log_limit import enforce_activity_log_cap\nfrom api.schemas.roadmap import JoinRoadmapRequest, JoinRoadmapResponse\n",
    "from api.config import get_settings\nfrom api.models.roadmap import ActivityLog, Participant, Roadmap, ShareLink\nfrom api.schemas.roadmap import JoinRoadmapRequest, JoinRoadmapResponse\nfrom api.services.activity_log_limit import enforce_activity_log_cap\n",
)

# The helper name is historical; document its full fail-closed authorization semantics.
replace(
    "apps/api/src/api/services/auth_service.py",
    '    """Fail closed: a missing participant is treated as revoked.\n\n    Used by the SSE stream, which authenticates via a single-use ticket\n    (no Authorization header) rather than `require_participant`.\n    """\n',
    '    """Fail closed for SSE authorization.\n\n    Missing/revoked/expired participants and soft-deleted roadmaps are all\n    treated as unauthorized. The SSE route authenticates with a single-use\n    ticket rather than `require_participant`, so this must enforce the same\n    lifecycle boundary as normal API requests.\n    """\n',
)
