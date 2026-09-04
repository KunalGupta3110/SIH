"""
IBVAP Sentinel — Incident Correlation Engine & Threat Scoring
Module: alerts/incident_engine.py
Description: Pure-function explainable threat scoring, idempotent event ingestion,
             and multi-event correlation grouping raw camera alerts into unified incident stories.
"""

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import sqlite3
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from alerts.schema import AlertSeverity, AlertType, SecurityEvent


# ============================================================================
# 1. PURE-FUNCTION EXPLAINABLE THREAT SCORING MODEL
# ============================================================================

def calculate_threat_score(
    in_restricted_zone: bool = False,
    vector_toward_border: bool = False,
    loitering_exceeded: bool = False,
    cross_camera_reid_match: bool = False,
    is_night_window: bool = False,
    raw_confidence: float = 0.85,
) -> Dict[str, Any]:
    """
    Pure function computing transparent, itemized threat score.
    Returns score (0-100), severity tier, confidence, and itemized factor breakdown.

    Rule Matrix:
      +30  Restricted-zone crossing
      +20  Movement vector toward border line
      +15  Loitering beyond threshold
      +12  Cross-camera continuation (Re-ID match, confirmed)
      +10  Unusual time-of-day (night window)
    """
    factors: List[Dict[str, Any]] = []
    total_score = 0

    if in_restricted_zone:
        points = 30
        total_score += points
        factors.append({
            "factor": "Restricted Zone Crossing",
            "points": points,
            "description": "Target centroid intersected designated restricted polygon perimeter.",
        })

    if vector_toward_border:
        points = 20
        total_score += points
        factors.append({
            "factor": "Movement Vector Toward Border Line",
            "points": points,
            "description": "Kinematic trajectory indicates direct approach toward primary border boundary.",
        })

    if loitering_exceeded:
        points = 15
        total_score += points
        factors.append({
            "factor": "Loitering Beyond Threshold",
            "points": points,
            "description": "Target dwell time in caution buffer exceeded security threshold.",
        })

    if cross_camera_reid_match:
        points = 12
        total_score += points
        factors.append({
            "factor": "Cross-Camera Continuation (Re-ID Match)",
            "points": points,
            "description": "Appearance embedding verified target continuation across non-overlapping nodes.",
        })

    if is_night_window:
        points = 10
        total_score += points
        factors.append({
            "factor": "Unusual Time-Of-Day (Night Window)",
            "points": points,
            "description": "Movement detected within high-risk nocturnal surveillance window (22:00 - 05:00).",
        })

    # Base baseline if event triggered without specific modifier
    if total_score == 0:
        total_score = 15
        factors.append({
            "factor": "Baseline Security Detection",
            "points": 15,
            "description": "Unclassified target activity registered within monitored field of view.",
        })

    total_score = min(100, max(0, total_score))

    if total_score >= 70:
        severity = "CRITICAL"
    elif total_score >= 40:
        severity = "WARNING"
    else:
        severity = "INFO"

    confidence_pct = round(min(0.99, max(0.50, raw_confidence + (len(factors) * 0.02))) * 100, 1)

    return {
        "threat_score": total_score,
        "severity": severity,
        "confidence_pct": confidence_pct,
        "itemized_breakdown": factors,
    }


def is_nocturnal_window(timestamp_iso: Optional[str] = None) -> bool:
    """Checks if timestamp falls within nocturnal surveillance hours (22:00 - 05:00)."""
    try:
        if timestamp_iso:
            dt = datetime.fromisoformat(timestamp_iso.replace("Z", "+00:00"))
        else:
            dt = datetime.now(timezone.utc)
        hour = dt.hour
        return hour >= 22 or hour < 5
    except Exception:
        return False


# ============================================================================
# 2. INCIDENT DATA MODEL & SQLITE EXTENSION
# ============================================================================

@dataclass
class IncidentRecord:
    incident_id: str
    created_at: str
    closed_at: Optional[str] = None
    status: str = "open"  # 'open' or 'closed'
    threat_score: int = 0
    confidence: float = 0.85
    primary_object_id: str = "TRG-UNKNOWN"
    target_class: str = "person"
    severity: str = "WARNING"
    cameras_involved: List[str] = field(default_factory=list)
    story_summary: str = ""
    score_breakdown: List[Dict[str, Any]] = field(default_factory=list)
    event_ids: List[str] = field(default_factory=list)
    cryptographic_hash: Optional[str] = None


class IncidentCorrelationEngine:
    """
    Correlates raw security events into unified, multi-event incident stories.
    Extends existing data/events.db schema with 'incidents' and 'incident_events' tables.
    """

    def __init__(self, db_path: str = "data/events.db", rolling_window_sec: float = 300.0):
        self.db_path = db_path
        self.rolling_window_sec = rolling_window_sec
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        self._init_tables()

    def _get_conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _init_tables(self):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            # Incidents Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS incidents (
                    incident_id TEXT PRIMARY KEY,
                    created_at TEXT,
                    closed_at TEXT,
                    status TEXT DEFAULT 'open',
                    threat_score INTEGER DEFAULT 0,
                    confidence REAL DEFAULT 0.85,
                    primary_object_id TEXT,
                    target_class TEXT DEFAULT 'person',
                    severity TEXT DEFAULT 'WARNING',
                    cameras_json TEXT DEFAULT '[]',
                    story_summary TEXT DEFAULT '',
                    score_breakdown_json TEXT DEFAULT '[]',
                    cryptographic_hash TEXT
                )
            """)
            # Incident Events Join Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS incident_events (
                    incident_id TEXT,
                    event_id TEXT,
                    contribution_weight REAL DEFAULT 1.0,
                    created_at TEXT,
                    PRIMARY KEY (incident_id, event_id),
                    FOREIGN KEY (incident_id) REFERENCES incidents(incident_id),
                    FOREIGN KEY (event_id) REFERENCES security_events(event_id)
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_inc_status ON incidents(status)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_inc_obj ON incidents(primary_object_id)")
            conn.commit()

    def ingest_event(
        self,
        event: SecurityEvent,
        in_restricted_zone: bool = False,
        vector_toward_border: bool = False,
        loitering_exceeded: bool = False,
        cross_camera_reid_match: bool = False,
    ) -> IncidentRecord:
        """
        Idempotent event ingestion:
        - Deduplicates by event_id so replaying doesn't double-count.
        - Matches active open incident with same primary_object_id / track within rolling window.
        - Computes transparent threat score & updates incident story.
        """
        event_id = event.event_id
        target_id = f"TRG-{event.track_id:04d}" if event.track_id else f"TRG-{event.class_name.upper()}"
        cam_id = event.camera_id or "CAM_01"
        now_iso = event.timestamp_iso or datetime.now(timezone.utc).isoformat()
        is_night = is_nocturnal_window(now_iso)

        with self._get_conn() as conn:
            cursor = conn.cursor()

            # Check if event already correlated (idempotent check)
            cursor.execute("SELECT incident_id FROM incident_events WHERE event_id = ?", (event_id,))
            row = cursor.fetchone()
            if row:
                # Return existing incident without duplicate scoring
                return self.get_incident(row[0])

            # Find active open incident for target
            cursor.execute("""
                SELECT incident_id, created_at, cameras_json, score_breakdown_json, threat_score
                FROM incidents
                WHERE primary_object_id = ? AND status = 'open'
                ORDER BY created_at DESC LIMIT 1
            """, (target_id,))
            inc_row = cursor.fetchone()

            if inc_row:
                inc_id, created_at, cams_json, breakdown_json, current_score = inc_row
                cameras = json.loads(cams_json or "[]")
                if cam_id not in cameras:
                    cameras.append(cam_id)
                    cross_camera_reid_match = True  # Multi-camera transit confirmed
            else:
                inc_id = f"INC-{int(time.time() % 100000):04d}"
                created_at = now_iso
                cameras = [cam_id]

            # Calculate transparent threat score
            scoring = calculate_threat_score(
                in_restricted_zone=in_restricted_zone or ("INTRUSION" in event.alert_type.value if hasattr(event.alert_type, 'value') else "INTRUSION" in str(event.alert_type)),
                vector_toward_border=vector_toward_border or ("TRIPWIRE" in event.alert_type.value if hasattr(event.alert_type, 'value') else "TRIPWIRE" in str(event.alert_type)),
                loitering_exceeded=loitering_exceeded or ("LOITERING" in event.alert_type.value if hasattr(event.alert_type, 'value') else "LOITERING" in str(event.alert_type)),
                cross_camera_reid_match=cross_camera_reid_match or len(cameras) > 1,
                is_night_window=is_night,
                raw_confidence=float(event.confidence or 0.85),
            )

            story = f"Target {target_id} ({event.class_name}) active across {len(cameras)} node(s) ({' -> '.join(cameras)}) triggering {event.alert_type if isinstance(event.alert_type, str) else event.alert_type.value}."

            # Upsert incident
            cursor.execute("""
                INSERT INTO incidents (
                    incident_id, created_at, status, threat_score, confidence,
                    primary_object_id, target_class, severity, cameras_json,
                    story_summary, score_breakdown_json
                ) VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(incident_id) DO UPDATE SET
                    threat_score = excluded.threat_score,
                    confidence = excluded.confidence,
                    severity = excluded.severity,
                    cameras_json = excluded.cameras_json,
                    story_summary = excluded.story_summary,
                    score_breakdown_json = excluded.score_breakdown_json
            """, (
                inc_id,
                created_at,
                scoring["threat_score"],
                scoring["confidence_pct"] / 100.0,
                target_id,
                event.class_name,
                scoring["severity"],
                json.dumps(cameras),
                story,
                json.dumps(scoring["itemized_breakdown"]),
            ))

            # Insert join row (Idempotent)
            cursor.execute("""
                INSERT OR IGNORE INTO incident_events (incident_id, event_id, contribution_weight, created_at)
                VALUES (?, ?, 1.0, ?)
            """, (inc_id, event_id, now_iso))

            conn.commit()

        return self.get_incident(inc_id)

    def get_incident(self, incident_id: str) -> Optional[IncidentRecord]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT incident_id, created_at, closed_at, status, threat_score, confidence,
                       primary_object_id, target_class, severity, cameras_json, story_summary,
                       score_breakdown_json, cryptographic_hash
                FROM incidents WHERE incident_id = ?
            """, (incident_id,))
            row = cursor.fetchone()
            if not row:
                return None

            cursor.execute("SELECT event_id FROM incident_events WHERE incident_id = ?", (incident_id,))
            event_ids = [r[0] for r in cursor.fetchall()]

            return IncidentRecord(
                incident_id=row[0],
                created_at=row[1],
                closed_at=row[2],
                status=row[3],
                threat_score=row[4],
                confidence=row[5],
                primary_object_id=row[6],
                target_class=row[7],
                severity=row[8],
                cameras_involved=json.loads(row[9] or "[]"),
                story_summary=row[10],
                score_breakdown=json.loads(row[11] or "[]"),
                event_ids=event_ids,
                cryptographic_hash=row[12],
            )

    def get_recent_incidents(self, limit: int = 20) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM incidents
                ORDER BY created_at DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            results = []
            for r in rows:
                d = dict(r)
                d["cameras_involved"] = json.loads(d.get("cameras_json") or "[]")
                d["score_breakdown"] = json.loads(d.get("score_breakdown_json") or "[]")
                results.append(d)
            return results


# Global Default Singleton
_default_incident_engine = IncidentCorrelationEngine()

def get_incident_engine() -> IncidentCorrelationEngine:
    return _default_incident_engine
