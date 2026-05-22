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
    is_password_enabled: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default=sa.false())
    password_hash: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()
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
    # SHA-256 hex digest of the raw invite token; raw token shown only once at creation.
    # Uniqueness enforced by uq_share_links_token_hash in __table_args__ (no column-level unique=True).
    token_hash: Mapped[str] = mapped_column(sa.Text, nullable=False)
    # Non-secret short prefix shown in UI for identification (e.g. "ed_2bD7").
    token_prefix: Mapped[str] = mapped_column(sa.String(16), nullable=False)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default=sa.true())
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )
    rotated_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)

    roadmap: Mapped[Roadmap] = relationship("Roadmap", back_populates="share_links")

    __table_args__ = (
        _ROLE_CHECK,
        # One active link per roadmap+role for MVP; rotate replaces in-place.
        sa.UniqueConstraint("roadmap_id", "role", name="uq_share_links_roadmap_role"),
        # token_hash uniqueness is enforced by uq_share_links_token_hash above (no separate index needed).
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
    # SHA-256 hex digest of the session token returned to the client.
    # Uniqueness enforced by uq_participants_session_token_hash in __table_args__.
    session_token_hash: Mapped[str] = mapped_column(sa.Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)

    roadmap: Mapped[Roadmap] = relationship("Roadmap", back_populates="participants")
    activity_logs: Mapped[list[ActivityLog]] = relationship(
        "ActivityLog", back_populates="participant"
    )

    __table_args__ = (
        sa.CheckConstraint("role IN ('owner', 'editor', 'viewer')", name="ck_participant_role"),
        sa.UniqueConstraint("session_token_hash", name="uq_participants_session_token_hash"),
        sa.Index("ix_participants_roadmap_id", "roadmap_id"),
        sa.Index("ix_participants_roadmap_revoked", "roadmap_id", "revoked_at"),
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
    participant: Mapped[Participant | None] = relationship("Participant", back_populates="activity_logs")

    __table_args__ = (
        # Queries are almost always filtered by roadmap and ordered newest-first.
        sa.Index("ix_activity_logs_roadmap_created", "roadmap_id", sa.text("created_at DESC")),
    )
