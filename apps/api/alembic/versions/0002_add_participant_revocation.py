"""Add participant session revocation.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_participants_roadmap_revoked",
        "participants",
        ["roadmap_id", "revoked_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_participants_roadmap_revoked", table_name="participants")
    op.drop_column("participants", "revoked_at")
