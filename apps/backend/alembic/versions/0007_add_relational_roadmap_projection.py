"""Add relational roadmap projection tables.

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "roadmap_phases",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("roadmap_id", sa.String(), nullable=False),
        sa.Column("client_phase_id", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("num", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("color", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("source_json", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["roadmap_id"], ["roadmaps.id"], name="fk_roadmap_phases_roadmap", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_roadmap_phases"),
        sa.UniqueConstraint("roadmap_id", "client_phase_id", name="uq_roadmap_phases_client_id"),
    )
    op.create_index("ix_roadmap_phases_roadmap_position", "roadmap_phases", ["roadmap_id", "position"])

    op.create_table(
        "roadmap_tasks",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("roadmap_id", sa.String(), nullable=False),
        sa.Column("phase_id", sa.String(), nullable=False),
        sa.Column("client_task_id", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("next", sa.Boolean(), nullable=True),
        sa.Column("est", sa.Text(), nullable=True),
        sa.Column("desc", sa.Text(), nullable=True),
        sa.Column("parent_task_id", sa.String(), nullable=True),
        sa.Column("tags_json", postgresql.JSONB(), nullable=True),
        sa.Column("source_json", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["roadmap_id"], ["roadmaps.id"], name="fk_roadmap_tasks_roadmap", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["phase_id"], ["roadmap_phases.id"], name="fk_roadmap_tasks_phase", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_task_id"], ["roadmap_tasks.id"], name="fk_roadmap_tasks_parent", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_roadmap_tasks"),
        sa.UniqueConstraint("roadmap_id", "client_task_id", name="uq_roadmap_tasks_client_id"),
    )
    op.create_index("ix_roadmap_tasks_roadmap_phase_position", "roadmap_tasks", ["roadmap_id", "phase_id", "position"])
    op.create_index("ix_roadmap_tasks_roadmap_done", "roadmap_tasks", ["roadmap_id", "done"])
    op.create_index("ix_roadmap_tasks_roadmap_next", "roadmap_tasks", ["roadmap_id", "next"])
    op.create_index("ix_roadmap_tasks_parent_task_id", "roadmap_tasks", ["parent_task_id"])

    op.create_table(
        "roadmap_task_dependencies",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("roadmap_id", sa.String(), nullable=False),
        sa.Column("task_id", sa.String(), nullable=False),
        sa.Column("depends_on_task_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("task_id <> depends_on_task_id", name="ck_roadmap_task_dependencies_not_self"),
        sa.ForeignKeyConstraint(["roadmap_id"], ["roadmaps.id"], name="fk_roadmap_task_dependencies_roadmap", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["roadmap_tasks.id"], name="fk_roadmap_task_dependencies_task", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["depends_on_task_id"], ["roadmap_tasks.id"], name="fk_roadmap_task_dependencies_depends_on", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_roadmap_task_dependencies"),
        sa.UniqueConstraint("task_id", "depends_on_task_id", name="uq_roadmap_task_dependencies_edge"),
    )
    op.create_index("ix_roadmap_task_dependencies_roadmap_task", "roadmap_task_dependencies", ["roadmap_id", "task_id"])
    op.create_index("ix_roadmap_task_dependencies_roadmap_depends_on", "roadmap_task_dependencies", ["roadmap_id", "depends_on_task_id"])

    op.create_table(
        "roadmap_task_assignees",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("roadmap_id", sa.String(), nullable=False),
        sa.Column("task_id", sa.String(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("participant_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["roadmap_id"], ["roadmaps.id"], name="fk_roadmap_task_assignees_roadmap", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["roadmap_tasks.id"], name="fk_roadmap_task_assignees_task", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], name="fk_roadmap_task_assignees_participant", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_roadmap_task_assignees"),
        sa.UniqueConstraint("task_id", "display_name", name="uq_roadmap_task_assignees_name"),
    )
    op.create_index("ix_roadmap_task_assignees_roadmap_display_name", "roadmap_task_assignees", ["roadmap_id", "display_name"])
    op.create_index("ix_roadmap_task_assignees_roadmap_task_position", "roadmap_task_assignees", ["roadmap_id", "task_id", "position"])
    op.create_index("ix_roadmap_task_assignees_participant_id", "roadmap_task_assignees", ["participant_id"])


def downgrade() -> None:
    op.drop_index("ix_roadmap_task_assignees_participant_id", table_name="roadmap_task_assignees")
    op.drop_index("ix_roadmap_task_assignees_roadmap_task_position", table_name="roadmap_task_assignees")
    op.drop_index("ix_roadmap_task_assignees_roadmap_display_name", table_name="roadmap_task_assignees")
    op.drop_table("roadmap_task_assignees")
    op.drop_index("ix_roadmap_task_dependencies_roadmap_depends_on", table_name="roadmap_task_dependencies")
    op.drop_index("ix_roadmap_task_dependencies_roadmap_task", table_name="roadmap_task_dependencies")
    op.drop_table("roadmap_task_dependencies")
    op.drop_index("ix_roadmap_tasks_parent_task_id", table_name="roadmap_tasks")
    op.drop_index("ix_roadmap_tasks_roadmap_next", table_name="roadmap_tasks")
    op.drop_index("ix_roadmap_tasks_roadmap_done", table_name="roadmap_tasks")
    op.drop_index("ix_roadmap_tasks_roadmap_phase_position", table_name="roadmap_tasks")
    op.drop_table("roadmap_tasks")
    op.drop_index("ix_roadmap_phases_roadmap_position", table_name="roadmap_phases")
    op.drop_table("roadmap_phases")
