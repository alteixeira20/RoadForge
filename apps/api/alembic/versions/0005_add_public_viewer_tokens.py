"""Add public viewer token storage.

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("share_links", sa.Column("public_token", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("share_links", "public_token")
