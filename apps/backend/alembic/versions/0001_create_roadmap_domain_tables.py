"""Create roadmap domain tables.

Revision ID: 0001
Revises:
Create Date: 2026-05-08

Tables created:
- roadmaps
- share_links
- participants
- activity_logs
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── roadmaps ──────────────────────────────────────────────────────────────
    op.create_table(
        "roadmaps",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("owner_display_name", sa.Text(), nullable=False),
        sa.Column("snapshot_json", postgresql.JSONB(), nullable=False),
        sa.Column("schema_version", sa.String(length=16), nullable=False, server_default="1.0"),
        sa.Column("is_password_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("password_hash", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_roadmaps"),
    )
    op.create_index("ix_roadmaps_created_at", "roadmaps", ["created_at"])
    op.create_index("ix_roadmaps_updated_at", "roadmaps", ["updated_at"])

    # ── share_links ───────────────────────────────────────────────────────────
    op.create_table(
        "share_links",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("roadmap_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("token_prefix", sa.String(length=16), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("role IN ('owner', 'editor', 'viewer')", name="ck_role"),
        sa.ForeignKeyConstraint(
            ["roadmap_id"], ["roadmaps.id"], name="fk_share_links_roadmap", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_share_links"),
        sa.UniqueConstraint("token_hash", name="uq_share_links_token_hash"),
        sa.UniqueConstraint("roadmap_id", "role", name="uq_share_links_roadmap_role"),
    )
    op.create_index("ix_share_links_roadmap_id", "share_links", ["roadmap_id"])
    # token_hash uniqueness is covered by uq_share_links_token_hash constraint above.

    # ── participants ──────────────────────────────────────────────────────────
    op.create_table(
        "participants",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("roadmap_id", sa.String(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("session_token_hash", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "role IN ('owner', 'editor', 'viewer')", name="ck_participant_role"
        ),
        sa.ForeignKeyConstraint(
            ["roadmap_id"], ["roadmaps.id"], name="fk_participants_roadmap", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_participants"),
        sa.UniqueConstraint("session_token_hash", name="uq_participants_session_token_hash"),
    )
    op.create_index("ix_participants_roadmap_id", "participants", ["roadmap_id"])
    # session_token_hash uniqueness is covered by uq_participants_session_token_hash constraint above.

    # ── activity_logs ─────────────────────────────────────────────────────────
    op.create_table(
        "activity_logs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("roadmap_id", sa.String(), nullable=False),
        sa.Column("participant_id", sa.String(), nullable=True),
        sa.Column("actor_name", sa.Text(), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=True),
        sa.Column("entity_id", sa.Text(), nullable=True),
        sa.Column("before_json", postgresql.JSONB(), nullable=True),
        sa.Column("after_json", postgresql.JSONB(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["roadmap_id"], ["roadmaps.id"], name="fk_activity_logs_roadmap", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["participant_id"],
            ["participants.id"],
            name="fk_activity_logs_participant",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_activity_logs"),
    )
    # Composite index for the most common query pattern: latest events for a roadmap.
    op.create_index(
        "ix_activity_logs_roadmap_created",
        "activity_logs",
        ["roadmap_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_activity_logs_roadmap_created", table_name="activity_logs")
    op.drop_table("activity_logs")
    op.drop_index("ix_participants_roadmap_id", table_name="participants")
    op.drop_table("participants")
    op.drop_index("ix_share_links_roadmap_id", table_name="share_links")
    op.drop_table("share_links")
    op.drop_index("ix_roadmaps_updated_at", table_name="roadmaps")
    op.drop_index("ix_roadmaps_created_at", table_name="roadmaps")
    op.drop_table("roadmaps")
