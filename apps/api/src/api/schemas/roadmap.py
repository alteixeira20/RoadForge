"""Schema barrel — re-exports all domain schemas for backward compatibility.

All schema classes live in their domain modules. This module provides a
single import surface so existing code continues to work unchanged.
"""

from api.schemas.activity import ActivityLogListResponse, ActivityLogResponse
from api.schemas.conflicts import (
    RoadmapConflictMetadata,
    RoadmapConflictResponse,
    RoadmapConflictServerSnapshot,
    RoadmapConflictSummary,
)
from api.schemas.events import EventTicketResponse
from api.schemas.join import JoinRoadmapRequest, JoinRoadmapResponse
from api.schemas.locks import LockRequest, LockResponse
from api.schemas.roadmap_core import (
    CreateRoadmapRequest,
    CreateRoadmapResponse,
    DeleteRoadmapResponse,
    RoadmapResponse,
    UpdateRoadmapRequest,
)
from api.schemas.shared import (
    ALLOWED_CHANGE_SUMMARY_ACTIONS,
    PhaseStatus,
    ShareRole,
    validate_change_summary,
)
from api.schemas.sharing import (
    ParticipantResponse,
    ParticipantSummaryResponse,
    ShareLinkResponse,
)
from api.schemas.tags import (
    CreateTagRequest,
    TagDefinitionDTO,
    TagResponse,
    UpdateTagRequest,
    validate_tag_registry_uniqueness,
)
from api.schemas.tasks import (
    PatchTaskDoneRequest,
    PatchTaskRequest,
    PhaseDTO,
    RoadmapSnapshotDTO,
    TaskDTO,
)
from api.schemas.versions import (
    CheckpointResponse,
    RoadmapVersionDetailResponse,
    RoadmapVersionSummaryResponse,
)

__all__ = [
    # Activity
    "ActivityLogListResponse",
    "ActivityLogResponse",
    # Conflicts
    "RoadmapConflictMetadata",
    "RoadmapConflictResponse",
    "RoadmapConflictServerSnapshot",
    "RoadmapConflictSummary",
    # Events
    "EventTicketResponse",
    # Join
    "JoinRoadmapRequest",
    "JoinRoadmapResponse",
    # Locks
    "LockRequest",
    "LockResponse",
    # Core
    "CreateRoadmapRequest",
    "CreateRoadmapResponse",
    "DeleteRoadmapResponse",
    "RoadmapResponse",
    "UpdateRoadmapRequest",
    # Shared
    "ALLOWED_CHANGE_SUMMARY_ACTIONS",
    "PhaseStatus",
    "ShareRole",
    "validate_change_summary",
    # Sharing
    "ParticipantResponse",
    "ParticipantSummaryResponse",
    "ShareLinkResponse",
    # Tags
    "CreateTagRequest",
    "TagDefinitionDTO",
    "TagResponse",
    "UpdateTagRequest",
    "validate_tag_registry_uniqueness",
    # Tasks
    "PatchTaskRequest",
    "PatchTaskDoneRequest",
    "PhaseDTO",
    "RoadmapSnapshotDTO",
    "TaskDTO",
    # Versions
    "CheckpointResponse",
    "RoadmapVersionDetailResponse",
    "RoadmapVersionSummaryResponse",
]
