"""Create system_settings — generic operator-tunable key/value store.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not inspect(op.get_bind()).has_table("system_settings"):
        op.create_table(
            "system_settings",
            sa.Column("key", sa.String, primary_key=True),
            sa.Column("value", sa.Text, nullable=False),
            sa.Column("updated_at", sa.String, nullable=False),
        )


def downgrade() -> None:
    if inspect(op.get_bind()).has_table("system_settings"):
        op.drop_table("system_settings")
