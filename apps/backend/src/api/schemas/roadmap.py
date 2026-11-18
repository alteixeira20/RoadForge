"""Schema barrel - re-exports all domain schemas for backward compatibility.

All schema classes live in their domain modules. This module provides a
single import surface so existing code continues to work unchanged.
"""

from api.features.collaboration.schemas import LockRequest, LockResponse
from api.features.history.activity_schemas import ActivityLogListResponse, ActivityLogResponse
from api.features.history.version_schemas import (
    CheckpointResponse,
    RestoreRoadmapVersionRequest,
    RoadmapVersionDetailResponse,
    RoadmapVersionSummaryResponse,
)
from api.features.phases.schemas import (
    CreatePhaseRequest,
    PatchPhaseRequest,
    PatchRoadmapNameRequest,
    ReorderPhasesRequest,
)
from api.features.realtime.schemas import EventTicketResponse
from api.features.roadmaps.conflict_schemas import (
    RoadmapConflictMetadata,
    RoadmapConflictResponse,
    RoadmapConflictServerSnapshot,
    RoadmapConflictSummary,
)
from api.features.roadmaps.core_schemas import (
    CreateRoadmapRequest,
    CreateRoadmapResponse,
    DeleteRoadmapResponse,
    RoadmapResponse,
    UpdateRoadmapRequest,
)
from api.features.roadmaps.shared_schemas import (
    ALLOWED_CHANGE_SUMMARY_ACTIONS,
    PhaseStatus,
    ShareRole,
    validate_change_summary,
)
from api.features.sharing.join_schemas import JoinRoadmapRequest, JoinRoadmapResponse
from api.features.sharing.sharing_schemas import (
    ParticipantResponse,
    ParticipantSummaryResponse,
    RoadmapPasswordResponse,
    ShareLinkResponse,
    UpdatePasswordRequest,
)
from api.features.tags.schemas import (
    CreateTagRequest,
    ReorderTagsRequest,
    TagDefinitionDTO,
    TagResponse,
    UpdateTagRequest,
    validate_tag_registry_uniqueness,
)
from api.features.tasks.structure_schemas import (
    CreateTaskStructureRequest,
    ReorderTaskStructureRequest,
)
from api.features.tasks.task_schemas import (
    PatchTaskDoneRequest,
    PatchTaskRequest,
    PhaseDTO,
    RoadmapSnapshotDTO,
    TaskDTO,
    TaskExternalLinkDTO,
)

__all__ = [
    # Activity
    "ActivityLogListResponse",
    "ActivityLogResponse",
    # Collaboration
    "CreatePhaseRequest",
    "PatchPhaseRequest",
    "PatchRoadmapNameRequest",
    "ReorderPhasesRequest",
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
    "RoadmapPasswordResponse",
    "ShareLinkResponse",
    "UpdatePasswordRequest",
    # Tags
    "CreateTagRequest",
    "ReorderTagsRequest",
    "TagDefinitionDTO",
    "TagResponse",
    "UpdateTagRequest",
    "validate_tag_registry_uniqueness",
    # Task structure
    "CreateTaskStructureRequest",
    "ReorderTaskStructureRequest",
    # Tasks
    "PatchTaskRequest",
    "PatchTaskDoneRequest",
    "PhaseDTO",
    "RoadmapSnapshotDTO",
    "TaskExternalLinkDTO",
    "TaskDTO",
    # Versions
    "CheckpointResponse",
    "RestoreRoadmapVersionRequest",
    "RoadmapVersionDetailResponse",
    "RoadmapVersionSummaryResponse",
]
