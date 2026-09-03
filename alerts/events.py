"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/events.py
Description: Explainable rule-based alert generation engine, severity tiering,
             SQLite event database with operator false-positive triage,
             and real-time HUD rendering.
"""

from dataclasses import asdict
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
import sys
import time
from typing import Any, Dict, List, Optional, Set, Tuple
import uuid

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import cv2
import numpy as np

from alerts.notify import send_mobile_alert
from alerts.schema import AlertSeverity, AlertType, OperatorStatus, SecurityEvent
from alerts.sound_alerts import play_alert
from alerts.threat_analyzer import BorderThreatAnalyzer
from alerts.zones import Zone, ZoneManager, ZoneType
from detection_tracking.track import TrackedObject


class EventDatabase:
    """
    Lightweight SQLite database for security alerts, supporting explainable audit trails
    and operator false-positive triage.
    """

    def __init__(self, db_path: str = "data/events.db"):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
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
            # Migration check for existing databases
            cursor.execute("PRAGMA table_info(security_events)")
            existing_cols = {row[1] for row in cursor.fetchall()}
            if "rule_name" not in existing_cols:
                cursor.execute("ALTER TABLE security_events ADD COLUMN rule_name TEXT DEFAULT 'Spatial Geometry Rule'")
            if "rule_metrics_json" not in existing_cols:
                cursor.execute("ALTER TABLE security_events ADD COLUMN rule_metrics_json TEXT DEFAULT '{}'")
            if "confidence" not in existing_cols:
                cursor.execute("ALTER TABLE security_events ADD COLUMN confidence REAL DEFAULT 0.85")
            if "operator_status" not in existing_cols:
                cursor.execute("ALTER TABLE security_events ADD COLUMN operator_status TEXT DEFAULT 'UNREVIEWED'")
            if "operator_notes" not in existing_cols:
                cursor.execute("ALTER TABLE security_events ADD COLUMN operator_notes TEXT")

            cursor.execute("CREATE INDEX IF NOT EXISTS idx_cam_time ON security_events(camera_id, timestamp_ms)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_severity ON security_events(severity)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_alert_type ON security_events(alert_type)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_op_status ON security_events(operator_status)")
            conn.commit()

    def insert_event(self, event: SecurityEvent):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO security_events VALUES (
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
                event.confidence,
                event.operator_status.value,
                event.operator_notes,
                event.thumbnail_path,
            ))
            conn.commit()

    def update_operator_status(self, event_id: str, status: OperatorStatus, notes: Optional[str] = None):
        """Update operator review state (Confirm or Dismiss as False Positive)."""
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
        """Returns live counts of reviewed, confirmed, and dismissed false positives."""
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


class TrackState:
    """Maintains state history for a tracked object across video frames."""
    def __init__(self, track_id: int, initial_centroid: Tuple[float, float], timestamp_ms: float):
        self.track_id = track_id
        self.initial_centroid = initial_centroid
        self.last_centroid = initial_centroid
        self.first_seen_ms = timestamp_ms
        self.last_seen_ms = timestamp_ms

        # zone_id -> entry_timestamp_ms
        self.zone_entry_times: Dict[str, float] = {}
        self.loitering_alerted_zones: Set[str] = set()
        self.intrusion_alerted_zones: Set[str] = set()
        self.crossed_tripwires: Set[str] = set()
        self.alert_cooldowns: Dict[str, float] = {}


class AlertEngine:
    """
    Evaluates tracking data against spatial zones & virtual tripwires,
    enforcing loitering thresholds, direction violations, and severity tiering.
    """

    def __init__(
        self,
        zone_manager: ZoneManager,
        db: Optional[EventDatabase] = None,
        thumbnail_dir: str = "data/thumbnails",
        alert_cooldown_sec: float = 3.0,
    ):
        self.zone_manager = zone_manager
        self.db = db if db is not None else EventDatabase()
        self.thumbnail_dir = thumbnail_dir
        self.alert_cooldown_ms = alert_cooldown_sec * 1000.0
        self.threat_analyzer = BorderThreatAnalyzer()
        os.makedirs(self.thumbnail_dir, exist_ok=True)

        # camera_id -> Dict[track_id, TrackState]
        self.track_states: Dict[str, Dict[int, TrackState]] = {}
        # Recent active alerts for HUD overlay
        self.recent_alerts: List[SecurityEvent] = []

    def reset_camera(self, camera_id: str):
        if camera_id in self.track_states:
            self.track_states[camera_id].clear()

    def _save_thumbnail(self, frame: np.ndarray, bbox: List[float], event_id: str) -> Optional[str]:
        """Saves a cropped thumbnail of the offending object for the dashboard."""
        try:
            h, w = frame.shape[:2]
            x1, y1, x2, y2 = [int(c) for c in bbox]
            pad_w = int((x2 - x1) * 0.2)
            pad_h = int((y2 - y1) * 0.2)
            x1 = max(0, x1 - pad_w)
            y1 = max(0, y1 - pad_h)
            x2 = min(w, x2 + pad_w)
            y2 = min(h, y2 + pad_h)

            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                return None

            path = os.path.join(self.thumbnail_dir, f"{event_id}.jpg")
            cv2.imwrite(path, crop)
            return path
        except Exception:
            return None

    def evaluate_frame(
        self,
        camera_id: str,
        frame_idx: int,
        timestamp_ms: float,
        tracks: List[TrackedObject],
        raw_frame: Optional[np.ndarray] = None,
    ) -> List[SecurityEvent]:
        """
        Processes active tracked objects against spatial zones with full explainability.
        """
        if camera_id not in self.track_states:
            self.track_states[camera_id] = {}

        current_states = self.track_states[camera_id]
        zones = self.zone_manager.get_zones(camera_id)
        events: List[SecurityEvent] = []

        active_track_ids = {t.track_id for t in tracks}

        # Purge stale tracks absent for > 5 seconds
        stale_ids = [tid for tid, state in current_states.items() if tid not in active_track_ids and (timestamp_ms - state.last_seen_ms) > 5000.0]
        for tid in stale_ids:
            del current_states[tid]

        for track in tracks:
            tid = track.track_id
            if tid not in current_states:
                current_states[tid] = TrackState(tid, track.centroid, timestamp_ms)

            state = current_states[tid]
            state.last_seen_ms = timestamp_ms
            curr_centroid = track.centroid
            state.last_centroid = curr_centroid

            for zone in zones:
                # 1. Check Tripwire Crossing
                if zone.zone_type == ZoneType.TRIPWIRE:
                    if len(track.trajectory) >= 2:
                        p_prev = track.trajectory[-2]
                        p_curr = track.trajectory[-1]
                        crossed, direction = zone.check_tripwire_crossing(p_prev, p_curr)

                        if crossed and zone.zone_id not in state.crossed_tripwires:
                            state.crossed_tripwires.add(zone.zone_id)
                            event_id = f"evt_tw_{camera_id}_{tid}_{int(timestamp_ms)}"
                            
                            is_dir_violation = zone.allowed_direction and (direction != zone.allowed_direction)
                            severity = AlertSeverity.CRITICAL if is_dir_violation else AlertSeverity(zone.severity)
                            alert_type = AlertType.DIRECTION_VIOLATION if is_dir_violation else AlertType.TRIPWIRE_CROSS

                            details = (
                                f"{track.class_name.upper()} (Track #{tid}) breached Tripwire '{zone.name}' "
                                f"heading {direction} at coord ({int(curr_centroid[0])}, {int(curr_centroid[1])})."
                            )

                            thumb_path = self._save_thumbnail(raw_frame, track.bbox, event_id) if raw_frame is not None else None

                            event = SecurityEvent(
                                event_id=event_id,
                                timestamp_iso=datetime.now(timezone.utc).isoformat(),
                                timestamp_ms=timestamp_ms,
                                camera_id=camera_id,
                                track_id=tid,
                                class_name=track.class_name,
                                alert_type=alert_type,
                                severity=severity,
                                zone_id=zone.zone_id,
                                zone_name=zone.name,
                                details=details,
                                bbox=track.bbox,
                                centroid=curr_centroid,
                                rule_name="2D Tripwire Vector Intersection",
                                rule_metrics={
                                    "tripwire_endpoints": zone.points[:2],
                                    "crossing_direction": direction,
                                    "frame_index": frame_idx,
                                },
                                confidence=track.confidence,
                                thumbnail_path=thumb_path,
                            )
                            events.append(event)
                            self.db.insert_event(event)

                # 2. Check Restricted Polygon & Caution Zones
                elif zone.zone_type in (ZoneType.RESTRICTED_POLYGON, ZoneType.CAUTION_ZONE):
                    inside = zone.contains_point(curr_centroid)
                    
                    if inside:
                        if zone.zone_id not in state.zone_entry_times:
                            state.zone_entry_times[zone.zone_id] = timestamp_ms

                        time_in_zone_sec = (timestamp_ms - state.zone_entry_times[zone.zone_id]) / 1000.0

                        # A. Initial Zone Intrusion Alert
                        if zone.zone_id not in state.intrusion_alerted_zones and zone.is_class_restricted(track.class_name):
                            state.intrusion_alerted_zones.add(zone.zone_id)
                            event_id = f"evt_int_{camera_id}_{tid}_{int(timestamp_ms)}"
                            thumb_path = self._save_thumbnail(raw_frame, track.bbox, event_id) if raw_frame is not None else None
                            
                            severity = AlertSeverity(zone.severity)
                            details = (
                                f"Restricted zone incursion: {track.class_name.upper()} (Track #{tid}) "
                                f"entered '{zone.name}' at coord ({int(curr_centroid[0])}, {int(curr_centroid[1])})."
                            )

                            event = SecurityEvent(
                                event_id=event_id,
                                timestamp_iso=datetime.now(timezone.utc).isoformat(),
                                timestamp_ms=timestamp_ms,
                                camera_id=camera_id,
                                track_id=tid,
                                class_name=track.class_name,
                                alert_type=AlertType.ZONE_INTRUSION,
                                severity=severity,
                                zone_id=zone.zone_id,
                                zone_name=zone.name,
                                details=details,
                                bbox=track.bbox,
                                centroid=curr_centroid,
                                rule_name="Point-in-Polygon Boundary Containment",
                                rule_metrics={
                                    "polygon_vertex_count": len(zone.points),
                                    "entry_timestamp_ms": round(state.zone_entry_times[zone.zone_id], 2),
                                },
                                confidence=track.confidence,
                                thumbnail_path=thumb_path,
                            )
                            events.append(event)
                            self.db.insert_event(event)

                        # B. Loitering Detection Alert
                        if (
                            time_in_zone_sec >= zone.loitering_time_sec
                            and zone.zone_id not in state.loitering_alerted_zones
                        ):
                            state.loitering_alerted_zones.add(zone.zone_id)
                            event_id = f"evt_loit_{camera_id}_{tid}_{int(timestamp_ms)}"
                            thumb_path = self._save_thumbnail(raw_frame, track.bbox, event_id) if raw_frame is not None else None

                            details = (
                                f"Suspicious loitering: {track.class_name.upper()} (Track #{tid}) "
                                f"remained in '{zone.name}' for {time_in_zone_sec:.1f}s (threshold: {zone.loitering_time_sec}s)."
                            )

                            event = SecurityEvent(
                                event_id=event_id,
                                timestamp_iso=datetime.now(timezone.utc).isoformat(),
                                timestamp_ms=timestamp_ms,
                                camera_id=camera_id,
                                track_id=tid,
                                class_name=track.class_name,
                                alert_type=AlertType.LOITERING,
                                severity=AlertSeverity.WARNING,
                                zone_id=zone.zone_id,
                                zone_name=zone.name,
                                details=details,
                                bbox=track.bbox,
                                centroid=curr_centroid,
                                rule_name="Temporal Dwell-Time Threshold",
                                rule_metrics={
                                    "dwell_time_s": round(time_in_zone_sec, 2),
                                    "loitering_threshold_s": zone.loitering_time_sec,
                                },
                                confidence=track.confidence,
                                thumbnail_path=thumb_path,
                            )
                            events.append(event)
                            self.db.insert_event(event)

                    else:
                        if zone.zone_id in state.zone_entry_times:
                            del state.zone_entry_times[zone.zone_id]
                        state.intrusion_alerted_zones.discard(zone.zone_id)
                        state.loitering_alerted_zones.discard(zone.zone_id)

        # 3. Behavioral Tactical Threat Analysis (Rapid approach vector, group cluster)
        tactical_threats = self.threat_analyzer.analyze_frame_threats(
            camera_id=camera_id,
            frame_idx=frame_idx,
            timestamp_ms=timestamp_ms,
            tracks=tracks,
        )
        for t_ev in tactical_threats:
            if raw_frame is not None:
                t_ev.thumbnail_path = self._save_thumbnail(raw_frame, t_ev.bbox, t_ev.event_id)
            events.append(t_ev)
            self.db.insert_event(t_ev)

        if events:
            self.recent_alerts.extend(events)
            self.recent_alerts = self.recent_alerts[-5:]
            
            severities = [ev.severity.value for ev in events]
            if "CRITICAL" in severities:
                play_alert("CRITICAL")
            elif "WARNING" in severities:
                play_alert("WARNING")
            else:
                play_alert("INFO")

            # Dispatch Instant Mobile & Telegram Notification (Non-blocking async)
            for ev in events:
                if ev.severity in (AlertSeverity.CRITICAL, AlertSeverity.WARNING):
                    send_mobile_alert(ev)

        return events

    def draw_alerts_hud(self, frame: np.ndarray) -> np.ndarray:
        """
        Renders an animated alert banner, blinking warning border, and threat highlights.
        """
        if not self.recent_alerts:
            return frame

        annotated = frame.copy()
        h, w = annotated.shape[:2]

        latest = self.recent_alerts[-1]
        is_critical = latest.severity == AlertSeverity.CRITICAL
        banner_color = (0, 0, 220) if is_critical else (0, 140, 255)

        # 1. Highlight the threat target's bounding box
        x1, y1, x2, y2 = [int(c) for c in latest.bbox]
        cv2.rectangle(annotated, (x1, y1), (x2, y2), banner_color, 3)
        badge_text = f"ALERT: {latest.alert_type.value}"
        cv2.putText(annotated, badge_text, (x1, max(18, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, banner_color, 2, cv2.LINE_AA)

        # 2. Outer screen alert perimeter
        cv2.rectangle(annotated, (0, 0), (w - 1, h - 1), banner_color, 4)

        # 3. Translucent bottom alert banner
        banner_h = 52
        overlay = annotated.copy()
        cv2.rectangle(overlay, (0, h - banner_h), (w, h), banner_color, -1)
        cv2.addWeighted(overlay, 0.85, annotated, 0.15, 0, annotated)

        # Alert icon/text with rule explanation
        alert_title = f"🚨 [{latest.severity.value}] {latest.alert_type.value} | {latest.zone_name or 'BORDER PERIMETER'}"
        cv2.putText(annotated, alert_title, (15, h - 28), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(annotated, f"Rule: {latest.rule_name} | {latest.details}", (15, h - 9), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (240, 240, 240), 1, cv2.LINE_AA)

        return annotated
