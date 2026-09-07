"""
IBVAP Sentinel — core/db/models.py

SQLAlchemy ORM models for the full schema. Four tables carry forward the
exact shape core.backend_service already used and tested (security_events,
incidents, incident_events, fcm_tokens) — this migration changes *how* they
are read/written (ORM instead of hand-rolled sqlite3), not their columns, so
existing data and existing tests keep working. Everything else here is new:
cameras/camera_adjacency (backing core.camera_topology with real rows),
detections (raw per-frame AI output), tracked_targets (the Re-ID registry),
enrolled_people (the watchlist the mobile app's /enrollment/people needs),
and evidence_blocks/operator_audit_log (renamed+extended from
audit_ledger/system_audit for the Section 65B evidence trail).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.db.base import Base


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Camera topology — real rows backing core.camera_topology's transit windows,
# instead of only the hardcoded DEFAULT_TOPOLOGY dict.
# ---------------------------------------------------------------------------

class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    camera_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String, default="")
    location_desc: Mapped[str] = mapped_column(String, default="")
    fov_deg: Mapped[float] = mapped_column(Float, default=90.0)
    lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lon: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, default="ONLINE")  # ONLINE/OFFLINE/FROZEN/FAULT
    created_at: Mapped[str] = mapped_column(String, default=_utc_now_iso)


class CameraAdjacency(Base):
    """One directed edge in the camera graph: source -> target transit window."""
    __tablename__ = "camera_adjacency"
    __table_args__ = (UniqueConstraint("source_camera_id", "target_camera_id", name="uq_camera_edge"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_camera_id: Mapped[str] = mapped_column(String, ForeignKey("cameras.camera_id"), index=True)
    target_camera_id: Mapped[str] = mapped_column(String, ForeignKey("cameras.camera_id"), index=True)
    min_transit_s: Mapped[float] = mapped_column(Float)
    max_transit_s: Mapped[float] = mapped_column(Float)
    distance_m: Mapped[float] = mapped_column(Float, default=0.0)
    exit_heading: Mapped[str] = mapped_column(String, default="")


# ---------------------------------------------------------------------------
# Raw AI pipeline output — one row per detected object per processed frame.
# Distinct from security_events: a Detection is what the model saw; a
# SecurityEvent is what the rules engine decided about it (zone/tripwire/
# loitering breach). Most detections never become an event.
# ---------------------------------------------------------------------------

class Detection(Base):
    __tablename__ = "detections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    camera_id: Mapped[str] = mapped_column(String, index=True)
    timestamp_iso: Mapped[str] = mapped_column(String, index=True)
    timestamp_ms: Mapped[float] = mapped_column(Float, default=0.0)
    track_id: Mapped[int] = mapped_column(Integer, default=0)
    class_name: Mapped[str] = mapped_column(String, default="person")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    bbox_json: Mapped[str] = mapped_column(Text, default="[]")
    centroid_json: Mapped[str] = mapped_column(Text, default="[]")
    global_target_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    source: Mapped[str] = mapped_column(String, default="yolov8n+bytetrack")
    created_at: Mapped[str] = mapped_column(String, default=_utc_now_iso)


# ---------------------------------------------------------------------------
# Persistent Re-ID registry — the "current registry, predicted next camera"
# view the frontend's target-tracking screen needs.
# ---------------------------------------------------------------------------

class TrackedTarget(Base):
    __tablename__ = "tracked_targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    global_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    class_name: Mapped[str] = mapped_column(String, default="person")
    first_seen_camera_id: Mapped[str] = mapped_column(String, default="")
    first_seen_at: Mapped[str] = mapped_column(String, default=_utc_now_iso)
    current_camera_id: Mapped[str] = mapped_column(String, default="")
    last_seen_at: Mapped[str] = mapped_column(String, default=_utc_now_iso)
    predicted_next_camera_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    predicted_arrival_min_s: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    predicted_arrival_max_s: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    velocity_px_s: Mapped[float] = mapped_column(Float, default=0.0)
    heading: Mapped[str] = mapped_column(String, default="")
    embedding_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    camera_history_json: Mapped[str] = mapped_column(Text, default="[]")


# ---------------------------------------------------------------------------
# Security events / incidents / incident_events — column-for-column the same
# shape core.backend_service already created via raw SQL. Kept as-is so the
# ingest/correlate/score logic (already written and tested) doesn't change.
# ---------------------------------------------------------------------------

class SecurityEvent(Base):
    __tablename__ = "security_events"

    event_id: Mapped[str] = mapped_column(String, primary_key=True)
    timestamp_iso: Mapped[str] = mapped_column(String, nullable=False)
    timestamp_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    camera_id: Mapped[str] = mapped_column(String, nullable=False)
    track_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    class_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    alert_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    zone_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    zone_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bbox_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    centroid_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rule_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    rule_metrics_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.85)
    operator_status: Mapped[str] = mapped_column(String, default="UNREVIEWED")
    operator_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    operator_updated_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class Incident(Base):
    __tablename__ = "incidents"

    incident_id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    closed_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="open")
    threat_score: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[float] = mapped_column(Float, default=0.85)
    primary_object_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    target_class: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    cameras_json: Mapped[str] = mapped_column(Text, default="[]")
    story_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    score_breakdown_json: Mapped[str] = mapped_column(Text, default="[]")
    cryptographic_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    dismiss_reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class IncidentEvent(Base):
    __tablename__ = "incident_events"

    incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.incident_id"), primary_key=True)
    event_id: Mapped[str] = mapped_column(String, ForeignKey("security_events.event_id"), primary_key=True)
    contribution_weight: Mapped[float] = mapped_column(Float, default=1.0)
    created_at: Mapped[str] = mapped_column(String, nullable=False)


class FcmToken(Base):
    __tablename__ = "fcm_tokens"

    token: Mapped[str] = mapped_column(String, primary_key=True)
    device_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    platform: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    registered_at: Mapped[str] = mapped_column(String, nullable=False)


# ---------------------------------------------------------------------------
# Evidence chain + operator audit — renamed/extended from audit_ledger and
# system_audit. Same hash-chain columns and same guarantee (each block's
# current_hash = SHA256(previous_hash + data_hash)); now also links back to
# the incident it sealed and records which operator action triggered it,
# which the Section 65B certificate needs.
# ---------------------------------------------------------------------------

class EvidenceBlock(Base):
    __tablename__ = "evidence_blocks"

    block_index: Mapped[int] = mapped_column(Integer, primary_key=True)
    previous_hash: Mapped[str] = mapped_column(String, nullable=False)
    data_hash: Mapped[str] = mapped_column(String, nullable=False)
    current_hash: Mapped[str] = mapped_column(String, nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[str] = mapped_column(String, nullable=False)
    linked_incident_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    operator_action: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class OperatorAuditLog(Base):
    """Every operator-triggered action (siren silence, arm/disarm, dispatch,
    acknowledge) — the human side of the Section 65B chain of custody."""
    __tablename__ = "operator_audit_log"

    audit_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    action: Mapped[str] = mapped_column(String, nullable=False)
    actor: Mapped[str] = mapped_column(String, default="operator")
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[str] = mapped_column(String, nullable=False)


# ---------------------------------------------------------------------------
# Watchlist — backs the Flutter app's /enrollment/people.
# ---------------------------------------------------------------------------

class EnrolledPerson(Base):
    __tablename__ = "enrolled_people"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    person_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, default="authorized")  # authorized | watchlist
    reference_embedding_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    photo_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String, default=_utc_now_iso)
