"""Remove plaintext public viewer invite tokens.

Revision ID: 0011
Revises: 0010
Create Date: 2026-08-12

Legacy viewer invites that had recoverable raw material are revoked by this
migration before the plaintext column is removed. Owners rotate the viewer link
once after upgrade to issue a new reveal-once credential. Owner/editor hashes
and existing participant sessions are unchanged.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Viewer invite tokens are the only invite credentials that were stored
    # reversibly. Revoke those legacy links before removing the raw column so
    # a token recovered from an old DB copy cannot continue joining the live
    # deployment after the migration.
    op.execute(
        "UPDATE share_links "
        "SET is_active = false, public_token = NULL "
        "WHERE role = 'viewer' AND public_token IS NOT NULL"
    )
    op.drop_column("share_links", "public_token")


def downgrade() -> None:
    # A downgrade can restore the old schema shape but cannot reconstruct
    # secrets that were intentionally removed.
    op.add_column(
        "share_links",
        sa.Column("public_token", sa.Text(), nullable=True),
    )
