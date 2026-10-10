"""announcements + message threads gaps (ticket #61)

Revision ID: b61a2c3d4e5f
Revises: c59a1b2c3d4e
Create Date: 2026-10-10 00:00:00.000000

Adds the ticket #61 gaps:

* ``announcements.target_class_id`` — nullable class audience (NULL = school-wide).
* Soft retraction columns (``retracted_at``/``retracted_by``/``retract_reason``).
* ``announcement_revisions`` append-only edit history.
* ``message_threads.student_id`` — the student a thread is about.
* ``message_threads.created_by`` — who opened the thread (moderation/removal).
* ``message_threads.moderation_audit`` — free-form note emitted by moderation.
* ``message_thread_reads`` — explicit per-user read markers (replaces the old
  GET-side-effect read tracking).

Downgrade drops everything added here, so the chain round-trips on SQLite.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b61a2c3d4e5f"
down_revision: str | None = "c59a1b2c3d4e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- announcements: class audience + soft retraction ------------------
    op.add_column(
        "announcements", sa.Column("target_class_id", sa.Integer(), nullable=True)
    )
    op.create_index(
        "ix_announcements_target_class_id", "announcements", ["target_class_id"]
    )
    op.add_column("announcements", sa.Column("retracted_at", sa.DateTime(), nullable=True))
    op.add_column("announcements", sa.Column("retracted_by", sa.Integer(), nullable=True))
    op.add_column("announcements", sa.Column("retract_reason", sa.Text(), nullable=True))

    # --- announcement edit history ----------------------------------------
    op.create_table(
        "announcement_revisions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("announcement_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("edited_by", sa.Integer(), nullable=False),
        sa.Column("edited_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("change_note", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["announcement_id"], ["announcements.id"]),
        sa.ForeignKeyConstraint(["edited_by"], ["users.id"]),
        sa.UniqueConstraint("announcement_id", "version", name="uq_announcement_version"),
    )
    op.create_index(
        "ix_announcement_revisions_announcement_id",
        "announcement_revisions",
        ["announcement_id"],
    )

    # --- message threads: student context + creator + moderation ----------
    op.add_column("message_threads", sa.Column("student_id", sa.Integer(), nullable=True))
    op.create_index(
        "ix_message_threads_student_id", "message_threads", ["student_id"]
    )
    op.add_column("message_threads", sa.Column("created_by", sa.Integer(), nullable=True))
    op.add_column(
        "message_threads", sa.Column("moderation_audit", sa.Text(), nullable=True)
    )

    # --- explicit per-user read markers -----------------------------------
    op.create_table(
        "message_thread_reads",
        sa.Column("thread_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("read_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["thread_id"], ["message_threads.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("thread_id", "user_id"),
    )


def downgrade() -> None:
    op.drop_table("message_thread_reads")

    with op.batch_alter_table("message_threads", schema=None) as batch_op:
        batch_op.drop_column("moderation_audit")
        batch_op.drop_column("created_by")
    op.drop_index("ix_message_threads_student_id", table_name="message_threads")
    with op.batch_alter_table("message_threads", schema=None) as batch_op:
        batch_op.drop_column("student_id")

    op.drop_index(
        "ix_announcement_revisions_announcement_id",
        table_name="announcement_revisions",
    )
    op.drop_table("announcement_revisions")

    with op.batch_alter_table("announcements", schema=None) as batch_op:
        batch_op.drop_column("retract_reason")
        batch_op.drop_column("retracted_by")
        batch_op.drop_column("retracted_at")
    op.drop_index("ix_announcements_target_class_id", table_name="announcements")
    with op.batch_alter_table("announcements", schema=None) as batch_op:
        batch_op.drop_column("target_class_id")
