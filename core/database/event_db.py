"""
Cyber Camera Surveillance Platform
Module: core/database/event_db.py
Description: SQLite Event Database with operator triage status, explainable AI metrics, and audit stats.
"""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
import sys
from typing import Any, Dict, List, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from core.database.schema import AlertSeverity, AlertType, OperatorStatus, SecurityEvent


class EventDatabase:
    """Manages SQLite storage for security events and operator audit logs."""

    def __init__(self, db_path: str = "data/events.db"):
        self.db_path = os.path.join(ROOT_DIR, db_path) if not os.path.isabs(db_path) else db_path
        os.makedirs(os.path.dirname(self.db_path) or ".", exist_ok=True)
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS security_events (
                    event_id TEXT PRIMARY KEY,
                    timestamp_iso TEXT,
                    timestamp_ms REAL,
                    camera_id TEXT,
                    track_id INTEGER,
                    class_name TEXT,
                    alert_type TEXT,
                    severity TEXT,
                    zone_id TEXT,
                    zone_name TEXT,
                    details TEXT,
                    bbox_json TEXT,
                    centroid_json TEXT,
                    rule_name TEXT DEFAULT 'Spatial Geometry Rule',
                    rule_metrics_json TEXT DEFAULT '{}',
                    confidence REAL DEFAULT 0.85,
                    operator_status TEXT DEFAULT 'UNREVIEWED',
                    operator_notes TEXT,
                    thumbnail_path TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_cam_time ON security_events(camera_id, timestamp_ms)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_severity ON security_events(severity)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_op_status ON security_events(operator_status)")
            conn.commit()

    def insert_event(self, event: SecurityEvent):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO security_events (
                    event_id, timestamp_iso, timestamp_ms, camera_id, track_id,
                    class_name, alert_type, severity, zone_id, zone_name,
                    details, bbox_json, centroid_json, rule_name, rule_metrics_json,
                    confidence, operator_status, operator_notes, thumbnail_path
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            """, (
                event.event_id,
                event.timestamp_iso,
                event.timestamp_ms,
                event.camera_id,
                event.track_id,
                event.class_name,
                event.alert_type.value,
                event.severity.value,
                event.zone_id,
                event.zone_name,
                event.details,
                json.dumps(event.bbox),
                json.dumps(event.centroid),
                event.rule_name,
                json.dumps(event.rule_metrics),
                float(event.confidence) if event.confidence is not None else 0.85,
                event.operator_status.value,
                event.operator_notes,
                event.thumbnail_path,
            ))
            conn.commit()

    def update_operator_status(self, event_id: str, status: OperatorStatus, notes: Optional[str] = None):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE security_events 
                SET operator_status = ?, operator_notes = ? 
                WHERE event_id = ?
            """, (status.value, notes, event_id))
            conn.commit()

    def get_recent_events(
        self,
        limit: int = 50,
        camera_id: Optional[str] = None,
        severity: Optional[str] = None,
        operator_status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            query = "SELECT * FROM security_events WHERE 1=1"
            params: List[Any] = []
            if camera_id:
                query += " AND camera_id = ?"
                params.append(camera_id)
            if severity:
                query += " AND severity = ?"
                params.append(severity)
            if operator_status:
                query += " AND operator_status = ?"
                params.append(operator_status)
            query += " ORDER BY timestamp_ms DESC LIMIT ?"
            params.append(limit)

            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def get_operator_audit_stats(self) -> Dict[str, int]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT operator_status, COUNT(*) FROM security_events GROUP BY operator_status")
            counts = {row[0]: row[1] for row in cursor.fetchall()}
            return {
                "total": sum(counts.values()),
                "unreviewed": counts.get(OperatorStatus.UNREVIEWED.value, 0),
                "confirmed": counts.get(OperatorStatus.CONFIRMED.value, 0),
                "dismissed_fp": counts.get(OperatorStatus.DISMISSED_FP.value, 0),
            }
