"""Backfill session_expires_at for existing participants.

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-28

Participants created before Phase 13 (0006) have NULL session_expires_at,
making their sessions effectively immortal. This migration backfills a 30-day
expiry from now() for every such row so that Phase 16 expiry enforcement has
no NULL gaps to handle.
"""

from __future__ import annotations

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE participants
        SET session_expires_at = NOW() + INTERVAL '30 days'
        WHERE session_expires_at IS NULL
        """
    )


def downgrade() -> None:
    # Intentional no-op.
    #
    # Resetting backfilled expiries back to NULL would re-introduce immortal
    # sessions for all pre-Phase-13 participants, which is strictly worse than
    # leaving a reasonable expiry in place. If you need to roll back Phase 16
    # enforcement, revert the enforcement code — do not NULL out the expiry
    # timestamps here.
    pass
