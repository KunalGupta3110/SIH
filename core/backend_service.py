"""
IBVAP Sentinel backend service.

This module keeps the production-facing backend logic in one readable place:
SQLite schema setup, deterministic threat scoring, idempotent event ingestion,
incident correlation, evidence ledger verification, FCM token storage, and
safe hardware simulation hooks.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
from typing import Any, Dict, List, Optional, Tuple


ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = ROOT_DIR / "data" / "events.db"
GENESIS_SEED = "sentinel::genesis::ssb-gurdaspur::2026"
IST = timezone(timedelta(hours=5, minutes=30))
HANDOFF_MIN_SEC = 6.0
HANDOFF_MAX_SEC = 14.0


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical_json(data: Dict[str, Any]) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_file(file_path: Optional[str]) -> str:
    if not file_path:
        return sha256_text("")
    path = Path(file_path)
    if not path.is_absolute():
        path = ROOT_DIR / path
    if not path.exists():
        return sha256_text("")
    hasher = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(8192), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def is_night_window_ist(timestamp_iso: Optional[str]) -> bool:
    """Night window required by the project: 20:00-05:00 IST."""
    try:
        if timestamp_iso:
            dt = datetime.fromisoformat(timestamp_iso.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = datetime.now(timezone.utc)
        hour = dt.astimezone(IST).hour
        return hour >= 20 or hour < 5
    except Exception:
        return False


def calculate_threat_score(
    *,
    in_restricted_zone: bool = False,
    movement_toward_border: bool = False,
    loitering_seconds: float = 0.0,
    cross_camera_reid_match: bool = False,
    timestamp_iso: Optional[str] = None,
) -> Dict[str, Any]:
    """Deterministic explainable scoring, no ML or arbitrary weighting."""
    factors: List[Dict[str, Any]] = []

    if in_restricted_zone:
        factors.append({"factor": "Restricted Zone Penetration", "points": 30})
    if movement_toward_border:
        factors.append({"factor": "Movement Toward Border", "points": 20})
    if float(loitering_seconds or 0.0) > 240.0:
        factors.append({"factor": "Loitering >240 seconds", "points": 15})
    if cross_camera_reid_match:
        factors.append({"factor": "Cross-Camera Re-ID Match", "points": 12})
    if is_night_window_ist(timestamp_iso):
        factors.append({"factor": "Night Window 20:00-05:00 IST", "points": 10})

    score = min(100, sum(item["points"] for item in factors))
    if score >= 70:
        severity = "CRITICAL"
    elif score >= 40:
        severity = "WARNING"
    else:
        severity = "INFO"

    return {
        "threat_score": score,
        "severity": severity,
        "itemized_breakdown": factors,
    }


class SentinelBackend:
    """Small SQLite-backed backend service for FastAPI and tests."""

    def __init__(self, db_path: str | os.PathLike[str] = DEFAULT_DB_PATH):
        self.db_path = Path(db_path)
        if not self.db_path.is_absolute():
            self.db_path = ROOT_DIR / self.db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    def _init_db(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS security_events (
                    event_id TEXT PRIMARY KEY,
                    timestamp_iso TEXT NOT NULL,
                    timestamp_ms REAL,
                    camera_id TEXT NOT NULL,
                    track_id INTEGER,
                    class_name TEXT,
                    alert_type TEXT,
                    severity TEXT,
                    zone_id TEXT,
                    zone_name TEXT,
                    details TEXT,
                    bbox_json TEXT,
                    centroid_json TEXT,
                    rule_name TEXT,
                    rule_metrics_json TEXT,
                    confidence REAL DEFAULT 0.85,
                    operator_status TEXT DEFAULT 'UNREVIEWED',
                    operator_notes TEXT,
                    operator_updated_at TEXT,
                    thumbnail_path TEXT
                );

                CREATE TABLE IF NOT EXISTS incidents (
                    incident_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    closed_at TEXT,
                    status TEXT DEFAULT 'open',
                    threat_score INTEGER DEFAULT 0,
                    confidence REAL DEFAULT 0.85,
                    primary_object_id TEXT,
                    target_class TEXT,
                    severity TEXT,
                    cameras_json TEXT DEFAULT '[]',
                    story_summary TEXT,
                    score_breakdown_json TEXT DEFAULT '[]',
                    cryptographic_hash TEXT
                );

                CREATE TABLE IF NOT EXISTS incident_events (
                    incident_id TEXT NOT NULL,
                    event_id TEXT NOT NULL,
                    contribution_weight REAL DEFAULT 1.0,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (incident_id, event_id),
                    FOREIGN KEY (incident_id) REFERENCES incidents(incident_id),
                    FOREIGN KEY (event_id) REFERENCES security_events(event_id)
                );

                CREATE TABLE IF NOT EXISTS audit_ledger (
                    block_index INTEGER PRIMARY KEY,
                    previous_hash TEXT NOT NULL,
                    data_hash TEXT NOT NULL,
                    current_hash TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    timestamp TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS fcm_tokens (
                    token TEXT PRIMARY KEY,
                    device_id TEXT,
                    platform TEXT,
                    registered_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS system_audit (
                    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action TEXT NOT NULL,
                    payload_json TEXT DEFAULT '{}',
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_security_events_cam_time
                    ON security_events(camera_id, timestamp_iso);
                CREATE INDEX IF NOT EXISTS idx_security_events_status
                    ON security_events(operator_status);
                CREATE INDEX IF NOT EXISTS idx_security_events_severity
                    ON security_events(severity);
                CREATE INDEX IF NOT EXISTS idx_incidents_status
                    ON incidents(status);
                CREATE INDEX IF NOT EXISTS idx_incidents_object
                    ON incidents(primary_object_id);
                CREATE INDEX IF NOT EXISTS idx_incident_events_event
                    ON incident_events(event_id);
                CREATE INDEX IF NOT EXISTS idx_fcm_tokens_device
                    ON fcm_tokens(device_id);
                """
            )
            self._migrate_existing_db(conn)
            self._ensure_genesis_block(conn)

    def _migrate_existing_db(self, conn: sqlite3.Connection) -> None:
        required_event_columns = {
            "operator_updated_at": "TEXT",
        }
        existing = {row["name"] for row in conn.execute("PRAGMA table_info(security_events)")}
        for column, column_type in required_event_columns.items():
            if column not in existing:
                conn.execute(f"ALTER TABLE security_events ADD COLUMN {column} {column_type}")

    def _ensure_genesis_block(self, conn: sqlite3.Connection) -> None:
        row = conn.execute("SELECT block_index FROM audit_ledger WHERE block_index = 0").fetchone()
        if row:
            return
        payload = {
            "genesis": GENESIS_SEED,
            "timestamp": "2026-01-01T00:00:00+00:00",
        }
        payload_json = canonical_json(payload)
        data_hash = sha256_text(payload_json)
        current_hash = sha256_text("0" * 64 + data_hash)
        conn.execute(
            """
            INSERT INTO audit_ledger
                (block_index, previous_hash, data_hash, current_hash, payload_json, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (0, "0" * 64, data_hash, current_hash, payload_json, payload["timestamp"]),
        )

    def get_table_names(self) -> List[str]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
            return [row["name"] for row in rows]

    def ingest_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        event_id = str(event.get("event_id") or "").strip()
        if not event_id:
            raise ValueError("event_id is required")

        with self.connect() as conn:
            existing = conn.execute(
                """
                SELECT ie.incident_id
                FROM security_events se
                LEFT JOIN incident_events ie ON ie.event_id = se.event_id
                WHERE se.event_id = ?
                LIMIT 1
                """,
                (event_id,),
            ).fetchone()
            if existing:
                incident = self.get_incident(existing["incident_id"]) if existing["incident_id"] else None
                return {"duplicate": True, "event_id": event_id, "incident": incident}

            normalized = self._normalize_event(event)
            conn.execute(
                """
                INSERT INTO security_events (
                    event_id, timestamp_iso, timestamp_ms, camera_id, track_id,
                    class_name, alert_type, severity, zone_id, zone_name, details,
                    bbox_json, centroid_json, rule_name, rule_metrics_json,
                    confidence, operator_status, operator_notes, thumbnail_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized["event_id"],
                    normalized["timestamp_iso"],
                    normalized["timestamp_ms"],
                    normalized["camera_id"],
                    normalized["track_id"],
                    normalized["class_name"],
                    normalized["alert_type"],
                    normalized["severity"],
                    normalized["zone_id"],
                    normalized["zone_name"],
                    normalized["details"],
                    normalized["bbox_json"],
                    normalized["centroid_json"],
                    normalized["rule_name"],
                    normalized["rule_metrics_json"],
                    normalized["confidence"],
                    "UNREVIEWED",
                    None,
                    normalized["thumbnail_path"],
                ),
            )
            incident = self._correlate_event(conn, normalized)
            conn.commit()

        return {"duplicate": False, "event_id": event_id, "incident": incident}

    def _normalize_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        timestamp_iso = event.get("timestamp_iso") or utc_now_iso()
        timestamp_ms = event.get("timestamp_ms")
        if timestamp_ms is None:
            timestamp_ms = datetime.fromisoformat(timestamp_iso.replace("Z", "+00:00")).timestamp() * 1000.0

        bbox = event.get("bbox") if event.get("bbox") is not None else event.get("bbox_json", [])
        centroid = event.get("centroid") if event.get("centroid") is not None else event.get("centroid_json", [])
        rule_metrics = dict(event.get("rule_metrics") or {})
        for key in (
            "in_restricted_zone",
            "movement_toward_border",
            "loitering_seconds",
            "cross_camera_reid_match",
            "reid_global_id",
        ):
            if key in event and key not in rule_metrics:
                rule_metrics[key] = event[key]

        return {
            "event_id": str(event["event_id"]),
            "timestamp_iso": timestamp_iso,
            "timestamp_ms": float(timestamp_ms),
            "camera_id": str(event.get("camera_id") or "CAM_UNKNOWN"),
            "track_id": int(event.get("track_id") or 0),
            "class_name": str(event.get("class_name") or "person"),
            "alert_type": str(event.get("alert_type") or "ZONE_INTRUSION"),
            "severity": str(event.get("severity") or "INFO"),
            "zone_id": event.get("zone_id"),
            "zone_name": event.get("zone_name"),
            "details": str(event.get("details") or ""),
            "bbox_json": bbox if isinstance(bbox, str) else json.dumps(bbox),
            "centroid_json": centroid if isinstance(centroid, str) else json.dumps(centroid),
            "rule_name": str(event.get("rule_name") or "Spatial Geometry Rule"),
            "rule_metrics": rule_metrics,
            "rule_metrics_json": json.dumps(rule_metrics),
            "confidence": float(event.get("confidence") or 0.85),
            "thumbnail_path": event.get("thumbnail_path"),
        }

    def _event_flags(self, event: Dict[str, Any], force_cross_camera: bool = False) -> Dict[str, Any]:
        metrics = event.get("rule_metrics") or {}
        alert_type = event["alert_type"].upper()
        details = event["details"].upper()
        return {
            "in_restricted_zone": bool(metrics.get("in_restricted_zone")) or "INTRUSION" in alert_type,
            "movement_toward_border": bool(metrics.get("movement_toward_border")) or "TRIPWIRE" in alert_type or "BORDER" in details,
            "loitering_seconds": float(metrics.get("loitering_seconds") or metrics.get("loitering_sec") or 0.0),
            "cross_camera_reid_match": force_cross_camera or bool(metrics.get("cross_camera_reid_match")) or "CROSS_CAMERA" in alert_type,
            "timestamp_iso": event["timestamp_iso"],
        }

    def _primary_object_id(self, event: Dict[str, Any]) -> str:
        metrics = event.get("rule_metrics") or {}
        explicit = metrics.get("reid_global_id") or metrics.get("global_target_id") or event.get("primary_object_id")
        if explicit:
            return str(explicit)
        return f"TRG-{int(event['track_id']):04d}" if int(event["track_id"]) else f"TRG-{event['class_name'].upper()}"

    def _correlate_event(self, conn: sqlite3.Connection, event: Dict[str, Any]) -> Dict[str, Any]:
        primary_object_id = self._primary_object_id(event)
        event_time = datetime.fromisoformat(event["timestamp_iso"].replace("Z", "+00:00"))
        if event_time.tzinfo is None:
            event_time = event_time.replace(tzinfo=timezone.utc)

        incident = self._find_matching_incident(conn, primary_object_id, event, event_time)
        force_cross_camera = False

        if incident is None:
            incident_id = self._next_incident_id(conn)
            created_at = event["timestamp_iso"]
            cameras = [event["camera_id"]]
            event_ids: List[str] = []
        else:
            incident_id = incident["incident_id"]
            created_at = incident["created_at"]
            cameras = json.loads(incident["cameras_json"] or "[]")
            event_ids = self._incident_event_ids(conn, incident_id)
            if event["camera_id"] not in cameras:
                cameras.append(event["camera_id"])
                force_cross_camera = True

        score_input = self._event_flags(event, force_cross_camera=force_cross_camera or len(cameras) > 1)
        scoring = calculate_threat_score(**score_input)
        story = self._build_story(primary_object_id, event, cameras, scoring)
        confidence = min(0.99, event["confidence"] + (len(scoring["itemized_breakdown"]) * 0.02))

        conn.execute(
            """
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
            """,
            (
                incident_id,
                created_at,
                scoring["threat_score"],
                confidence,
                primary_object_id,
                event["class_name"],
                scoring["severity"],
                json.dumps(cameras),
                story,
                json.dumps(scoring["itemized_breakdown"]),
            ),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO incident_events
                (incident_id, event_id, contribution_weight, created_at)
            VALUES (?, ?, 1.0, ?)
            """,
            (incident_id, event["event_id"], utc_now_iso()),
        )
        event_ids.append(event["event_id"])

        block = self._seal_incident(conn, incident_id, scoring["threat_score"], cameras, story, event["thumbnail_path"])
        conn.execute(
            "UPDATE incidents SET cryptographic_hash = ? WHERE incident_id = ?",
            (block["current_hash"], incident_id),
        )

        return {
            "incident_id": incident_id,
            "created_at": created_at,
            "status": "open",
            "threat_score": scoring["threat_score"],
            "confidence": confidence,
            "primary_object_id": primary_object_id,
            "target_class": event["class_name"],
            "severity": scoring["severity"],
            "cameras_involved": cameras,
            "story_summary": story,
            "score_breakdown": scoring["itemized_breakdown"],
            "event_ids": list(dict.fromkeys(event_ids)),
            "cryptographic_hash": block["current_hash"],
        }

    def _find_matching_incident(
        self,
        conn: sqlite3.Connection,
        primary_object_id: str,
        event: Dict[str, Any],
        event_time: datetime,
    ) -> Optional[sqlite3.Row]:
        rows = conn.execute(
            """
            SELECT *
            FROM incidents
            WHERE status = 'open'
              AND target_class = ?
            ORDER BY created_at DESC
            LIMIT 20
            """,
            (event["class_name"],),
        ).fetchall()
        for row in rows:
            if row["primary_object_id"] == primary_object_id:
                return row

            last_event = self._last_event_for_incident(conn, row["incident_id"])
            if not last_event or last_event["camera_id"] == event["camera_id"]:
                continue
            previous_time = datetime.fromisoformat(last_event["timestamp_iso"].replace("Z", "+00:00"))
            if previous_time.tzinfo is None:
                previous_time = previous_time.replace(tzinfo=timezone.utc)
            gap = abs((event_time - previous_time).total_seconds())
            if HANDOFF_MIN_SEC <= gap <= HANDOFF_MAX_SEC:
                return row
        return None

    def _last_event_for_incident(self, conn: sqlite3.Connection, incident_id: str) -> Optional[sqlite3.Row]:
        return conn.execute(
            """
            SELECT se.*
            FROM incident_events ie
            JOIN security_events se ON se.event_id = ie.event_id
            WHERE ie.incident_id = ?
            ORDER BY se.timestamp_iso DESC
            LIMIT 1
            """,
            (incident_id,),
        ).fetchone()

    def _incident_event_ids(self, conn: sqlite3.Connection, incident_id: str) -> List[str]:
        rows = conn.execute(
            "SELECT event_id FROM incident_events WHERE incident_id = ? ORDER BY created_at",
            (incident_id,),
        ).fetchall()
        return [row["event_id"] for row in rows]

    def _next_incident_id(self, conn: sqlite3.Connection) -> str:
        row = conn.execute(
            """
            SELECT incident_id FROM incidents
            WHERE incident_id LIKE 'INC-%'
            ORDER BY CAST(SUBSTR(incident_id, 5) AS INTEGER) DESC
            LIMIT 1
            """
        ).fetchone()
        next_id = 1 if row is None else int(row["incident_id"][4:]) + 1
        return f"INC-{next_id:04d}"

    def _build_story(
        self,
        primary_object_id: str,
        event: Dict[str, Any],
        cameras: List[str],
        scoring: Dict[str, Any],
    ) -> str:
        sequence = " -> ".join(cameras)
        return (
            f"Target {primary_object_id} ({event['class_name']}) observed across "
            f"{len(cameras)} camera node(s): {sequence}. Latest event "
            f"{event['alert_type']} scored {scoring['threat_score']}/100 "
            f"({scoring['severity']})."
        )

    def _seal_incident(
        self,
        conn: sqlite3.Connection,
        incident_id: str,
        threat_score: int,
        camera_ids: List[str],
        rule_evidence: str,
        thumbnail_path: Optional[str],
    ) -> Dict[str, Any]:
        latest = conn.execute(
            "SELECT * FROM audit_ledger ORDER BY block_index DESC LIMIT 1"
        ).fetchone()
        timestamp = utc_now_iso()
        payload = {
            "incident_id": incident_id,
            "threat_score": threat_score,
            "camera_ids": camera_ids,
            "rule_evidence": rule_evidence,
            "thumbnail_sha256": sha256_file(thumbnail_path),
            "timestamp": timestamp,
        }
        payload_json = canonical_json(payload)
        data_hash = sha256_text(payload_json)
        previous_hash = latest["current_hash"] if latest else "0" * 64
        current_hash = sha256_text(previous_hash + data_hash)
        block_index = int(latest["block_index"]) + 1 if latest else 0
        conn.execute(
            """
            INSERT INTO audit_ledger
                (block_index, previous_hash, data_hash, current_hash, payload_json, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (block_index, previous_hash, data_hash, current_hash, payload_json, timestamp),
        )
        return {
            "block_index": block_index,
            "previous_hash": previous_hash,
            "data_hash": data_hash,
            "current_hash": current_hash,
            "payload_json": payload_json,
            "timestamp": timestamp,
        }

    def verify_chain(self) -> Tuple[bool, Optional[int], str, List[Dict[str, Any]]]:
        logs: List[Dict[str, Any]] = []
        with self.connect() as conn:
            rows = conn.execute("SELECT * FROM audit_ledger ORDER BY block_index").fetchall()
        if not rows:
            return False, 0, "audit_ledger is empty", logs

        for index, row in enumerate(rows):
            payload_json = row["payload_json"]
            expected_data_hash = sha256_text(payload_json)
            if row["data_hash"] != expected_data_hash:
                reason = "modified payload or data hash"
                logs.append({"block_index": row["block_index"], "status": "FAIL", "reason": reason})
                return False, row["block_index"], reason, logs

            expected_previous = "0" * 64 if index == 0 else rows[index - 1]["current_hash"]
            if row["previous_hash"] != expected_previous:
                reason = "modified previous hash or broken chain linkage"
                logs.append({"block_index": row["block_index"], "status": "FAIL", "reason": reason})
                return False, row["block_index"], reason, logs

            expected_current = sha256_text(row["previous_hash"] + row["data_hash"])
            if row["current_hash"] != expected_current:
                reason = "modified current hash"
                logs.append({"block_index": row["block_index"], "status": "FAIL", "reason": reason})
                return False, row["block_index"], reason, logs

            logs.append(
                {
                    "block_index": row["block_index"],
                    "status": "VERIFIED",
                    "current_hash": row["current_hash"],
                }
            )

        return True, None, "chain verified", logs

    def get_incident(self, incident_id: str) -> Optional[Dict[str, Any]]:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM incidents WHERE incident_id = ?", (incident_id,)).fetchone()
            if not row:
                return None
            return self._incident_row_to_dict(conn, row)

    def get_incidents(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM incidents ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [self._incident_row_to_dict(conn, row) for row in rows]

    def get_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM security_events ORDER BY timestamp_iso DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [dict(row) for row in rows]

    def _incident_row_to_dict(self, conn: sqlite3.Connection, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "incident_id": row["incident_id"],
            "created_at": row["created_at"],
            "closed_at": row["closed_at"],
            "status": row["status"],
            "threat_score": row["threat_score"],
            "confidence": row["confidence"],
            "primary_object_id": row["primary_object_id"],
            "target_class": row["target_class"],
            "severity": row["severity"],
            "cameras_involved": json.loads(row["cameras_json"] or "[]"),
            "story_summary": row["story_summary"],
            "score_breakdown": json.loads(row["score_breakdown_json"] or "[]"),
            "cryptographic_hash": row["cryptographic_hash"],
            "event_ids": self._incident_event_ids(conn, row["incident_id"]),
        }

    def acknowledge_incident(
        self,
        incident_id: str,
        status: str = "CONFIRMED",
        notes: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        if status not in {"CONFIRMED", "DISMISSED_FP"}:
            raise ValueError("status must be CONFIRMED or DISMISSED_FP")
        timestamp = utc_now_iso()
        with self.connect() as conn:
            row = conn.execute("SELECT incident_id FROM incidents WHERE incident_id = ?", (incident_id,)).fetchone()
            if not row:
                return None
            conn.execute("UPDATE incidents SET status = ? WHERE incident_id = ?", (status, incident_id))
            conn.execute(
                """
                UPDATE security_events
                SET operator_status = ?, operator_notes = ?, operator_updated_at = ?
                WHERE event_id IN (
                    SELECT event_id FROM incident_events WHERE incident_id = ?
                )
                """,
                (status, notes, timestamp, incident_id),
            )
            conn.execute(
                "INSERT INTO system_audit(action, payload_json, created_at) VALUES (?, ?, ?)",
                ("incident_acknowledge", json.dumps({"incident_id": incident_id, "status": status}), timestamp),
            )
            conn.commit()
        return self.get_incident(incident_id)

    def edge_status(self, arm_state: str, camera_count: int = 6) -> Dict[str, Any]:
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        with self.connect() as conn:
            events_24h = conn.execute(
                "SELECT COUNT(*) AS n FROM security_events WHERE timestamp_iso >= ?",
                (since.isoformat(),),
            ).fetchone()["n"]
            unreviewed = conn.execute(
                "SELECT COUNT(*) AS n FROM security_events WHERE operator_status = 'UNREVIEWED'"
            ).fetchone()["n"]
        return {
            "connection": "online",
            "online": True,
            "arm_state": arm_state,
            "camera_count": camera_count,
            "active_camera_count": camera_count,
            "events_last_24h": int(events_24h),
            "unreviewed_event_count": int(unreviewed),
            "unverified_faces_last_24h": int(unreviewed),
            "last_heartbeat": utc_now_iso(),
        }

    def register_fcm_token(self, token: str, device_id: Optional[str], platform: Optional[str]) -> Dict[str, Any]:
        registered_at = utc_now_iso()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO fcm_tokens(token, device_id, platform, registered_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(token) DO UPDATE SET
                    device_id = excluded.device_id,
                    platform = excluded.platform,
                    registered_at = excluded.registered_at
                """,
                (token, device_id, platform, registered_at),
            )
            conn.commit()
        return {"token": token, "device_id": device_id, "platform": platform, "registered_at": registered_at}

    def record_arm_state(self, arm_state: str) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO system_audit(action, payload_json, created_at) VALUES (?, ?, ?)",
                ("arm_state", json.dumps({"arm_state": arm_state}), utc_now_iso()),
            )
            conn.commit()

    def simulate_handoff(self) -> Dict[str, Any]:
        base = datetime.now(timezone.utc).replace(microsecond=0)
        sim_track_id = (int(base.timestamp()) % 900) + 40
        first = {
            "event_id": f"EVT-SIM-{int(base.timestamp())}-A",
            "timestamp_iso": base.isoformat(),
            "camera_id": "CAM_ALPHA",
            "track_id": sim_track_id,
            "class_name": "person",
            "alert_type": "ZONE_INTRUSION",
            "details": "Target entered restricted zone near border approach.",
            "confidence": 0.91,
            "in_restricted_zone": True,
            "movement_toward_border": True,
            "loitering_seconds": 300.0,
        }
        second = {
            "event_id": f"EVT-SIM-{int(base.timestamp())}-B",
            "timestamp_iso": (base + timedelta(seconds=9)).isoformat(),
            "camera_id": "CAM_BRAVO",
            "track_id": sim_track_id,
            "class_name": "person",
            "alert_type": "CROSS_CAMERA_MATCH",
            "details": "Same target reacquired by Re-ID inside 6-14 second handoff window.",
            "confidence": 0.94,
            "in_restricted_zone": True,
            "movement_toward_border": True,
            "cross_camera_reid_match": True,
            "loitering_seconds": 300.0,
        }
        return {
            "events": [self.ingest_event(first), self.ingest_event(second)],
            "handoff_window_seconds": [HANDOFF_MIN_SEC, HANDOFF_MAX_SEC],
        }


_default_backend: Optional[SentinelBackend] = None


def get_backend() -> SentinelBackend:
    global _default_backend
    if _default_backend is None:
        _default_backend = SentinelBackend()
    return _default_backend
