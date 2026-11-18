"""Add tag_registry_json to roadmaps.

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("roadmaps", sa.Column("tag_registry_json", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("roadmaps", "tag_registry_json")
