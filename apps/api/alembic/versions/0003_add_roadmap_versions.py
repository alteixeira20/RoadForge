"""Add roadmap versions.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "roadmap_versions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("roadmap_id", sa.String(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("roadmap_name", sa.Text(), nullable=False),
        sa.Column("snapshot_json", postgresql.JSONB(), nullable=False),
        sa.Column("participant_id", sa.String(), nullable=True),
        sa.Column("actor_name", sa.Text(), nullable=True),
        sa.Column("action", sa.Text(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["roadmap_id"], ["roadmaps.id"], name="fk_roadmap_versions_roadmap", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["participant_id"], ["participants.id"], name="fk_roadmap_versions_participant", ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_roadmap_versions"),
        sa.UniqueConstraint("roadmap_id", "version_number", name="uq_roadmap_versions_number"),
    )
    op.create_index(
        "ix_roadmap_versions_roadmap_created",
        "roadmap_versions",
        ["roadmap_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_roadmap_versions_roadmap_number",
        "roadmap_versions",
        ["roadmap_id", "version_number"],
    )


def downgrade() -> None:
    op.drop_index("ix_roadmap_versions_roadmap_number", table_name="roadmap_versions")
    op.drop_index("ix_roadmap_versions_roadmap_created", table_name="roadmap_versions")
    op.drop_table("roadmap_versions")
