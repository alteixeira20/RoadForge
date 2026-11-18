"""Add participant session expiry field.

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("session_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_participants_roadmap_session_expires",
        "participants",
        ["roadmap_id", "session_expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_participants_roadmap_session_expires", table_name="participants")
    op.drop_column("participants", "session_expires_at")
