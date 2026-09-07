"""Create the tables that are genuinely new in the ORM migration.

security_events / incidents / incident_events / fcm_tokens already exist in
any pre-existing data/events.db (they were created by core.backend_service's
old hand-rolled sqlite3 bootstrap) — this migration creates them too, but
only if they're missing, so a fresh clone with no database file yet ends up
with the same schema as an upgraded existing one.

Revision ID: 0001
Revises:
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return inspect(bind).has_table(name)


def upgrade() -> None:
    if not _has_table("security_events"):
        op.create_table(
            "security_events",
            sa.Column("event_id", sa.String, primary_key=True),
            sa.Column("timestamp_iso", sa.String, nullable=False),
            sa.Column("timestamp_ms", sa.Float, nullable=True),
            sa.Column("camera_id", sa.String, nullable=False),
            sa.Column("track_id", sa.Integer, nullable=True),
            sa.Column("class_name", sa.String, nullable=True),
            sa.Column("alert_type", sa.String, nullable=True),
            sa.Column("severity", sa.String, nullable=True),
            sa.Column("zone_id", sa.String, nullable=True),
            sa.Column("zone_name", sa.String, nullable=True),
            sa.Column("details", sa.Text, nullable=True),
            sa.Column("bbox_json", sa.Text, nullable=True),
            sa.Column("centroid_json", sa.Text, nullable=True),
            sa.Column("rule_name", sa.String, nullable=True),
            sa.Column("rule_metrics_json", sa.Text, nullable=True),
            sa.Column("confidence", sa.Float, server_default="0.85"),
            sa.Column("operator_status", sa.String, server_default="UNREVIEWED"),
            sa.Column("operator_notes", sa.Text, nullable=True),
            sa.Column("operator_updated_at", sa.String, nullable=True),
            sa.Column("thumbnail_path", sa.String, nullable=True),
        )
        op.create_index("idx_security_events_cam_time", "security_events", ["camera_id", "timestamp_iso"])
        op.create_index("idx_security_events_status", "security_events", ["operator_status"])
        op.create_index("idx_security_events_severity", "security_events", ["severity"])

    if not _has_table("incidents"):
        op.create_table(
            "incidents",
            sa.Column("incident_id", sa.String, primary_key=True),
            sa.Column("created_at", sa.String, nullable=False),
            sa.Column("closed_at", sa.String, nullable=True),
            sa.Column("status", sa.String, server_default="open"),
            sa.Column("threat_score", sa.Integer, server_default="0"),
            sa.Column("confidence", sa.Float, server_default="0.85"),
            sa.Column("primary_object_id", sa.String, nullable=True),
            sa.Column("target_class", sa.String, nullable=True),
            sa.Column("severity", sa.String, nullable=True),
            sa.Column("cameras_json", sa.Text, server_default="[]"),
            sa.Column("story_summary", sa.Text, nullable=True),
            sa.Column("score_breakdown_json", sa.Text, server_default="[]"),
            sa.Column("cryptographic_hash", sa.String, nullable=True),
            sa.Column("dismiss_reason", sa.String, nullable=True),
        )
        op.create_index("idx_incidents_status", "incidents", ["status"])
        op.create_index("idx_incidents_object", "incidents", ["primary_object_id"])

    if not _has_table("incident_events"):
        op.create_table(
            "incident_events",
            sa.Column("incident_id", sa.String, sa.ForeignKey("incidents.incident_id"), primary_key=True),
            sa.Column("event_id", sa.String, sa.ForeignKey("security_events.event_id"), primary_key=True),
            sa.Column("contribution_weight", sa.Float, server_default="1.0"),
            sa.Column("created_at", sa.String, nullable=False),
        )
        op.create_index("idx_incident_events_event", "incident_events", ["event_id"])

    if not _has_table("fcm_tokens"):
        op.create_table(
            "fcm_tokens",
            sa.Column("token", sa.String, primary_key=True),
            sa.Column("device_id", sa.String, nullable=True),
            sa.Column("platform", sa.String, nullable=True),
            sa.Column("registered_at", sa.String, nullable=False),
        )
        op.create_index("idx_fcm_tokens_device", "fcm_tokens", ["device_id"])

    if not _has_table("cameras"):
        op.create_table(
            "cameras",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("camera_id", sa.String, unique=True, nullable=False),
            sa.Column("name", sa.String, server_default=""),
            sa.Column("location_desc", sa.String, server_default=""),
            sa.Column("fov_deg", sa.Float, server_default="90.0"),
            sa.Column("lat", sa.Float, nullable=True),
            sa.Column("lon", sa.Float, nullable=True),
            sa.Column("status", sa.String, server_default="ONLINE"),
            sa.Column("created_at", sa.String, nullable=False),
        )
        op.create_index("idx_cameras_camera_id", "cameras", ["camera_id"], unique=True)

    if not _has_table("camera_adjacency"):
        op.create_table(
            "camera_adjacency",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("source_camera_id", sa.String, sa.ForeignKey("cameras.camera_id"), nullable=False),
            sa.Column("target_camera_id", sa.String, sa.ForeignKey("cameras.camera_id"), nullable=False),
            sa.Column("min_transit_s", sa.Float, nullable=False),
            sa.Column("max_transit_s", sa.Float, nullable=False),
            sa.Column("distance_m", sa.Float, server_default="0.0"),
            sa.Column("exit_heading", sa.String, server_default=""),
            sa.UniqueConstraint("source_camera_id", "target_camera_id", name="uq_camera_edge"),
        )

    if not _has_table("detections"):
        op.create_table(
            "detections",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("camera_id", sa.String, nullable=False),
            sa.Column("timestamp_iso", sa.String, nullable=False),
            sa.Column("timestamp_ms", sa.Float, server_default="0.0"),
            sa.Column("track_id", sa.Integer, server_default="0"),
            sa.Column("class_name", sa.String, server_default="person"),
            sa.Column("confidence", sa.Float, server_default="0.0"),
            sa.Column("bbox_json", sa.Text, server_default="[]"),
            sa.Column("centroid_json", sa.Text, server_default="[]"),
            sa.Column("global_target_id", sa.String, nullable=True),
            sa.Column("source", sa.String, server_default="yolov8n+bytetrack"),
            sa.Column("created_at", sa.String, nullable=False),
        )
        op.create_index("idx_detections_camera_time", "detections", ["camera_id", "timestamp_iso"])
        op.create_index("idx_detections_global_target", "detections", ["global_target_id"])

    if not _has_table("tracked_targets"):
        op.create_table(
            "tracked_targets",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("global_id", sa.String, unique=True, nullable=False),
            sa.Column("class_name", sa.String, server_default="person"),
            sa.Column("first_seen_camera_id", sa.String, server_default=""),
            sa.Column("first_seen_at", sa.String, nullable=False),
            sa.Column("current_camera_id", sa.String, server_default=""),
            sa.Column("last_seen_at", sa.String, nullable=False),
            sa.Column("predicted_next_camera_id", sa.String, nullable=True),
            sa.Column("predicted_arrival_min_s", sa.Float, nullable=True),
            sa.Column("predicted_arrival_max_s", sa.Float, nullable=True),
            sa.Column("velocity_px_s", sa.Float, server_default="0.0"),
            sa.Column("heading", sa.String, server_default=""),
            sa.Column("embedding_json", sa.Text, nullable=True),
            sa.Column("camera_history_json", sa.Text, server_default="[]"),
        )
        op.create_index("idx_tracked_targets_global_id", "tracked_targets", ["global_id"], unique=True)

    if not _has_table("enrolled_people"):
        op.create_table(
            "enrolled_people",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("person_id", sa.String, unique=True, nullable=False),
            sa.Column("name", sa.String, nullable=False),
            sa.Column("role", sa.String, server_default="authorized"),
            sa.Column("reference_embedding_json", sa.Text, nullable=True),
            sa.Column("photo_path", sa.String, nullable=True),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column("created_at", sa.String, nullable=False),
        )
        op.create_index("idx_enrolled_people_person_id", "enrolled_people", ["person_id"], unique=True)


def downgrade() -> None:
    for table in (
        "enrolled_people",
        "tracked_targets",
        "detections",
        "camera_adjacency",
        "cameras",
    ):
        if _has_table(table):
            op.drop_table(table)
    # incidents/security_events/etc. are intentionally left alone on
    # downgrade — they predate this migration and other code depends on them.
