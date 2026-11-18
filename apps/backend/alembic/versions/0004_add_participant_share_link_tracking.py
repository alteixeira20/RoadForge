"""Add participant share-link tracking.

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("share_link_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_participants_share_link",
        "participants",
        "share_links",
        ["share_link_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_participants_share_link_id", "participants", ["share_link_id"])


def downgrade() -> None:
    op.drop_index("ix_participants_share_link_id", table_name="participants")
    op.drop_constraint("fk_participants_share_link", "participants", type_="foreignkey")
    op.drop_column("participants", "share_link_id")
