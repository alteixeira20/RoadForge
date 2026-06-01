from __future__ import annotations

from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.models.base import Base

_ROLES = ("owner", "editor", "viewer")
_ROLE_CHECK = sa.CheckConstraint("role IN ('owner', 'editor', 'viewer')", name="ck_role")


class Roadmap(Base):
    __tablename__ = "roadmaps"

    id: Mapped[str] = mapped_column(sa.String, primary_key=True)
    name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    owner_display_name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    # Full phases snapshot stored as JSONB — shape: {"phases": [...]}
    snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    schema_version: Mapped[str] = mapped_column(sa.String(16), nullable=False, server_default="1.0")
    is_password_enabled: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.false()
    )
    password_hash: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)

    share_links: Mapped[list[ShareLink]] = relationship(
        "ShareLink", back_populates="roadmap", cascade="all, delete-orphan"
    )
    participants: Mapped[list[Participant]] = relationship(
        "Participant", back_populates="roadmap", cascade="all, delete-orphan"
    )
    activity_logs: Mapped[list[ActivityLog]] = relationship(
        "ActivityLog", back_populates="roadmap", cascade="all, delete-orphan"
    )
    versions: Mapped[list[RoadmapVersion]] = relationship(
        "RoadmapVersion", back_populates="roadmap", cascade="all, delete-orphan"
    )
    projection_phases: Mapped[list[RoadmapPhase]] = relationship(
        "RoadmapPhase", back_populates="roadmap", cascade="all, delete-orphan"
    )

    __table_args__ = (
        sa.Index("ix_roadmaps_created_at", "created_at"),
        sa.Index("ix_roadmaps_updated_at", "updated_at"),
    )


class ShareLink(Base):
    __tablename__ = "share_links"

    id: Mapped[str] = mapped_column(sa.String, primary_key=True)
    roadmap_id: Mapped[str] = mapped_column(
        sa.String, sa.ForeignKey("roadmaps.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(sa.String(16), nullable=False)
    # SHA-256 hex of the raw invite token; private raw tokens shown only on create/rotate.
    # Uniqueness enforced by uq_share_links_token_hash in __table_args__ below
    # (no column-level unique=True).
    token_hash: Mapped[str] = mapped_column(sa.Text, nullable=False)
    # Raw token is persisted only for public read-only viewer/demo links so owners can re-copy them.
    public_token: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    # Non-secret short prefix shown in UI for identification (e.g. "ed_2bD7").
    token_prefix: Mapped[str] = mapped_column(sa.String(16), nullable=False)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default=sa.true())
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )
    rotated_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)

    roadmap: Mapped[Roadmap] = relationship("Roadmap", back_populates="share_links")
    participants: Mapped[list[Participant]] = relationship(
        "Participant", back_populates="share_link"
    )

    __table_args__ = (
        _ROLE_CHECK,
        # One active link per roadmap+role for MVP; rotate replaces in-place.
        sa.UniqueConstraint("roadmap_id", "role", name="uq_share_links_roadmap_role"),
        sa.UniqueConstraint("token_hash", name="uq_share_links_token_hash"),
        sa.Index("ix_share_links_roadmap_id", "roadmap_id"),
    )


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(sa.String, primary_key=True)
    roadmap_id: Mapped[str] = mapped_column(
        sa.String, sa.ForeignKey("roadmaps.id", ondelete="CASCADE"), nullable=False
    )
    display_name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    role: Mapped[str] = mapped_column(sa.String(16), nullable=False)
    share_link_id: Mapped[str | None] = mapped_column(
        sa.String, sa.ForeignKey("share_links.id", ondelete="SET NULL"), nullable=True
    )
    # SHA-256 hex digest of the session token returned to the client.
    # Uniqueness enforced by uq_participants_session_token_hash in __table_args__.
    session_token_hash: Mapped[str] = mapped_column(sa.Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    session_expires_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)

    roadmap: Mapped[Roadmap] = relationship("Roadmap", back_populates="participants")
    share_link: Mapped[ShareLink | None] = relationship("ShareLink", back_populates="participants")
    activity_logs: Mapped[list[ActivityLog]] = relationship(
        "ActivityLog", back_populates="participant"
    )

    __table_args__ = (
        sa.CheckConstraint("role IN ('owner', 'editor', 'viewer')", name="ck_participant_role"),
        sa.UniqueConstraint("session_token_hash", name="uq_participants_session_token_hash"),
        sa.Index("ix_participants_roadmap_id", "roadmap_id"),
        sa.Index("ix_participants_roadmap_revoked", "roadmap_id", "revoked_at"),
        sa.Index("ix_participants_roadmap_session_expires", "roadmap_id", "session_expires_at"),
        sa.Index("ix_participants_share_link_id", "share_link_id"),
    )


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[str] = mapped_column(sa.String, primary_key=True)
    roadmap_id: Mapped[str] = mapped_column(
        sa.String, sa.ForeignKey("roadmaps.id", ondelete="CASCADE"), nullable=False
    )
    # Nullable so log entries survive participant deletion.
    participant_id: Mapped[str | None] = mapped_column(
        sa.String, sa.ForeignKey("participants.id", ondelete="SET NULL"), nullable=True
    )
    # Denormalised display name so logs remain readable after participant deletion.
    actor_name: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    action: Mapped[str] = mapped_column(sa.Text, nullable=False)
    entity_type: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    entity_id: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    before_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    after_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )

    roadmap: Mapped[Roadmap] = relationship("Roadmap", back_populates="activity_logs")
    participant: Mapped[Participant | None] = relationship(
        "Participant", back_populates="activity_logs"
    )

    __table_args__ = (
        # Queries are almost always filtered by roadmap and ordered newest-first.
        sa.Index("ix_activity_logs_roadmap_created", "roadmap_id", sa.text("created_at DESC")),
    )


class RoadmapVersion(Base):
    __tablename__ = "roadmap_versions"

    id: Mapped[str] = mapped_column(sa.String, primary_key=True)
    roadmap_id: Mapped[str] = mapped_column(
        sa.String, sa.ForeignKey("roadmaps.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    roadmap_name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    participant_id: Mapped[str | None] = mapped_column(
        sa.String, sa.ForeignKey("participants.id", ondelete="SET NULL"), nullable=True
    )
    actor_name: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    action: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )

    roadmap: Mapped[Roadmap] = relationship("Roadmap", back_populates="versions")
    participant: Mapped[Participant | None] = relationship("Participant")

    __table_args__ = (
        sa.UniqueConstraint("roadmap_id", "version_number", name="uq_roadmap_versions_number"),
        sa.Index("ix_roadmap_versions_roadmap_created", "roadmap_id", sa.text("created_at DESC")),
        sa.Index("ix_roadmap_versions_roadmap_number", "roadmap_id", "version_number"),
    )


class RoadmapPhase(Base):
    __tablename__ = "roadmap_phases"

    id: Mapped[str] = mapped_column(sa.String, primary_key=True)
    roadmap_id: Mapped[str] = mapped_column(
        sa.String, sa.ForeignKey("roadmaps.id", ondelete="CASCADE"), nullable=False
    )
    client_phase_id: Mapped[str] = mapped_column(sa.Text, nullable=False)
    position: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    num: Mapped[str] = mapped_column(sa.Text, nullable=False)
    name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    color: Mapped[str] = mapped_column(sa.Text, nullable=False)
    status: Mapped[str] = mapped_column(sa.Text, nullable=False)
    progress: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    source_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )

    roadmap: Mapped[Roadmap] = relationship("Roadmap", back_populates="projection_phases")
    tasks: Mapped[list[RoadmapTask]] = relationship(
        "RoadmapTask", back_populates="phase", cascade="all, delete-orphan"
    )

    __table_args__ = (
        sa.UniqueConstraint("roadmap_id", "client_phase_id", name="uq_roadmap_phases_client_id"),
        sa.Index("ix_roadmap_phases_roadmap_position", "roadmap_id", "position"),
    )


class RoadmapTask(Base):
    __tablename__ = "roadmap_tasks"

    id: Mapped[str] = mapped_column(sa.String, primary_key=True)
    roadmap_id: Mapped[str] = mapped_column(
        sa.String, sa.ForeignKey("roadmaps.id", ondelete="CASCADE"), nullable=False
    )
    phase_id: Mapped[str] = mapped_column(
        sa.String, sa.ForeignKey("roadmap_phases.id", ondelete="CASCADE"), nullable=False
    )
    client_task_id: Mapped[str] = mapped_column(sa.Text, nullable=False)
    position: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    title: Mapped[str] = mapped_column(sa.Text, nullable=False)
    done: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default=sa.false())
    next: Mapped[bool | None] = mapped_column(sa.Boolean, nullable=True)
    est: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    desc: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    parent_task_id: Mapped[str | None] = mapped_column(
        sa.String, sa.ForeignKey("roadmap_tasks.id", ondelete="SET NULL"), nullable=True
    )
    tags_json: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    claimed_by_display_name: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    claimed_by_participant_id: Mapped[str | None] = mapped_column(sa.String, nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    source_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )

    phase: Mapped[RoadmapPhase] = relationship("RoadmapPhase", back_populates="tasks")
    parent_task: Mapped[RoadmapTask | None] = relationship("RoadmapTask", remote_side=[id])
    dependencies: Mapped[list[RoadmapTaskDependency]] = relationship(
        "RoadmapTaskDependency",
        back_populates="task",
        cascade="all, delete-orphan",
        foreign_keys="RoadmapTaskDependency.task_id",
    )
    assignees: Mapped[list[RoadmapTaskAssignee]] = relationship(
        "RoadmapTaskAssignee", back_populates="task", cascade="all, delete-orphan"
    )

    __table_args__ = (
        sa.UniqueConstraint("roadmap_id", "client_task_id", name="uq_roadmap_tasks_client_id"),
        sa.Index("ix_roadmap_tasks_roadmap_phase_position", "roadmap_id", "phase_id", "position"),
        sa.Index("ix_roadmap_tasks_roadmap_done", "roadmap_id", "done"),
        sa.Index("ix_roadmap_tasks_roadmap_next", "roadmap_id", "next"),
        sa.Index("ix_roadmap_tasks_parent_task_id", "parent_task_id"),
    )


class RoadmapTaskDependency(Base):
    __tablename__ = "roadmap_task_dependencies"

    id: Mapped[str] = mapped_column(sa.String, primary_key=True)
    roadmap_id: Mapped[str] = mapped_column(
        sa.String, sa.ForeignKey("roadmaps.id", ondelete="CASCADE"), nullable=False
    )
    task_id: Mapped[str] = mapped_column(
        sa.String, sa.ForeignKey("roadmap_tasks.id", ondelete="CASCADE"), nullable=False
    )
    depends_on_task_id: Mapped[str] = mapped_column(
        sa.String, sa.ForeignKey("roadmap_tasks.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )

    task: Mapped[RoadmapTask] = relationship(
        "RoadmapTask", back_populates="dependencies", foreign_keys=[task_id]
    )
    depends_on_task: Mapped[RoadmapTask] = relationship(
        "RoadmapTask", foreign_keys=[depends_on_task_id]
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "task_id", "depends_on_task_id", name="uq_roadmap_task_dependencies_edge"
        ),
        sa.CheckConstraint(
            "task_id <> depends_on_task_id", name="ck_roadmap_task_dependencies_not_self"
        ),
        sa.Index("ix_roadmap_task_dependencies_roadmap_task", "roadmap_id", "task_id"),
        sa.Index(
            "ix_roadmap_task_dependencies_roadmap_depends_on",
            "roadmap_id",
            "depends_on_task_id",
        ),
    )


class RoadmapTaskAssignee(Base):
    __tablename__ = "roadmap_task_assignees"

    id: Mapped[str] = mapped_column(sa.String, primary_key=True)
    roadmap_id: Mapped[str] = mapped_column(
        sa.String, sa.ForeignKey("roadmaps.id", ondelete="CASCADE"), nullable=False
    )
    task_id: Mapped[str] = mapped_column(
        sa.String, sa.ForeignKey("roadmap_tasks.id", ondelete="CASCADE"), nullable=False
    )
    display_name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    position: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    participant_id: Mapped[str | None] = mapped_column(
        sa.String, sa.ForeignKey("participants.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )

    task: Mapped[RoadmapTask] = relationship("RoadmapTask", back_populates="assignees")
    participant: Mapped[Participant | None] = relationship("Participant")

    __table_args__ = (
        sa.UniqueConstraint("task_id", "display_name", name="uq_roadmap_task_assignees_name"),
        sa.Index("ix_roadmap_task_assignees_roadmap_display_name", "roadmap_id", "display_name"),
        sa.Index(
            "ix_roadmap_task_assignees_roadmap_task_position", "roadmap_id", "task_id", "position"
        ),
        sa.Index("ix_roadmap_task_assignees_participant_id", "participant_id"),
    )
