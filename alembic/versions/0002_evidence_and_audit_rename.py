"""Rename audit_ledger -> evidence_blocks and system_audit -> operator_audit_log.

Preserves every existing row (and therefore the existing hash-chain history)
rather than discarding it — this is a rename + column-add, not a drop and
recreate. If neither legacy table exists (a fresh database with no prior
data), the new tables are created directly instead.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return inspect(op.get_bind()).has_table(name)


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    # --- audit_ledger -> evidence_blocks ---
    if _has_table("audit_ledger") and not _has_table("evidence_blocks"):
        op.rename_table("audit_ledger", "evidence_blocks")

    if _has_table("evidence_blocks"):
        with op.batch_alter_table("evidence_blocks") as batch:
            if not _has_column("evidence_blocks", "linked_incident_id"):
                batch.add_column(sa.Column("linked_incident_id", sa.String, nullable=True))
            if not _has_column("evidence_blocks", "operator_action"):
                batch.add_column(sa.Column("operator_action", sa.String, nullable=True))
    else:
        op.create_table(
            "evidence_blocks",
            sa.Column("block_index", sa.Integer, primary_key=True),
            sa.Column("previous_hash", sa.String, nullable=False),
            sa.Column("data_hash", sa.String, nullable=False),
            sa.Column("current_hash", sa.String, nullable=False),
            sa.Column("payload_json", sa.Text, nullable=False),
            sa.Column("timestamp", sa.String, nullable=False),
            sa.Column("linked_incident_id", sa.String, nullable=True),
            sa.Column("operator_action", sa.String, nullable=True),
        )

    # --- system_audit -> operator_audit_log ---
    if _has_table("system_audit") and not _has_table("operator_audit_log"):
        op.rename_table("system_audit", "operator_audit_log")
        # sqlite renames the primary key column's autoincrement identity fine,
        # but the old PK column was named audit_id already — matches the new model.

    if _has_table("operator_audit_log"):
        with op.batch_alter_table("operator_audit_log") as batch:
            if not _has_column("operator_audit_log", "actor"):
                batch.add_column(sa.Column("actor", sa.String, server_default="operator"))
    else:
        op.create_table(
            "operator_audit_log",
            sa.Column("audit_id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("action", sa.String, nullable=False),
            sa.Column("actor", sa.String, server_default="operator"),
            sa.Column("payload_json", sa.Text, server_default="{}"),
            sa.Column("created_at", sa.String, nullable=False),
        )


def downgrade() -> None:
    if _has_table("evidence_blocks"):
        with op.batch_alter_table("evidence_blocks") as batch:
            if _has_column("evidence_blocks", "operator_action"):
                batch.drop_column("operator_action")
            if _has_column("evidence_blocks", "linked_incident_id"):
                batch.drop_column("linked_incident_id")
        op.rename_table("evidence_blocks", "audit_ledger")

    if _has_table("operator_audit_log"):
        with op.batch_alter_table("operator_audit_log") as batch:
            if _has_column("operator_audit_log", "actor"):
                batch.drop_column("actor")
        op.rename_table("operator_audit_log", "system_audit")
