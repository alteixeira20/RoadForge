"""Add task claim fields to roadmap_tasks.

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("roadmap_tasks", sa.Column("claimed_by_display_name", sa.Text(), nullable=True))
    op.add_column("roadmap_tasks", sa.Column("claimed_by_participant_id", sa.String(), nullable=True))
    op.add_column("roadmap_tasks", sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("roadmap_tasks", "claimed_at")
    op.drop_column("roadmap_tasks", "claimed_by_participant_id")
    op.drop_column("roadmap_tasks", "claimed_by_display_name")
