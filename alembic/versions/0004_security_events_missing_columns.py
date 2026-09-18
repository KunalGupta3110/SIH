"""Repair security_events schema drift for upgraded databases.

Older databases created by the pre-Alembic bootstrap were missing one or more
columns that the ORM and API expect today. This migration is intentionally
idempotent and only adds the missing columns that were introduced later.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-18
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return inspect(op.get_bind()).has_table(name)


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _has_table("security_events"):
        return

    with op.batch_alter_table("security_events") as batch:
        for column_name, column_def in (
            ("operator_updated_at", sa.Column("operator_updated_at", sa.String, nullable=True)),
            ("thumbnail_path", sa.Column("thumbnail_path", sa.String, nullable=True)),
            ("plate_text", sa.Column("plate_text", sa.String, nullable=True)),
            ("plate_confidence", sa.Column("plate_confidence", sa.Float, nullable=True)),
            ("is_hotlist", sa.Column("is_hotlist", sa.Integer, server_default="0")),
            ("hotlist_reason", sa.Column("hotlist_reason", sa.String, nullable=True)),
        ):
            if not _has_column("security_events", column_name):
                batch.add_column(column_def)


def downgrade() -> None:
    if not _has_table("security_events"):
        return

    with op.batch_alter_table("security_events") as batch:
        for column_name in ("operator_updated_at", "thumbnail_path", "plate_text", "plate_confidence", "is_hotlist", "hotlist_reason"):
            if _has_column("security_events", column_name):
                batch.drop_column(column_name)