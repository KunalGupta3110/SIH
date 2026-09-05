"""
IBVAP Sentinel — backend/database.py

ONE job: talk to the SQLite database. Nothing in here calculates a threat
score or decides whether two events belong to the same incident — it just
stores and fetches rows.

The database lives at data/events.db. It's opened in WAL mode, which lets
the FastAPI server read the database at the same time something else is
writing to it, without locking up.
"""

from datetime import datetime, timedelta, timezone
import json
import os
import sqlite3

DB_PATH = os.path.join("data", "events.db")


def get_connection() -> sqlite3.Connection:
    """Open a connection to the database, with WAL mode turned on."""
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row   # lets us read columns by name
    return conn


def init_database() -> None:
    """
    Create every table this backend needs, if it doesn't already exist.
    Safe to call every time the app starts — CREATE TABLE IF NOT EXISTS
    does nothing when the table is already there.
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
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

    cur.execute("""
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
            cryptographic_hash TEXT,
            dismiss_reason TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS incident_events (
            incident_id TEXT,
            event_id TEXT,
            contribution_weight REAL DEFAULT 1.0,
            created_at TEXT,
            PRIMARY KEY (incident_id, event_id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS audit_ledger (
            block_index INTEGER PRIMARY KEY AUTOINCREMENT,
            previous_hash TEXT,
            data_hash TEXT,
            current_hash TEXT,
            payload_json TEXT,
            timestamp TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS fcm_tokens (
            token TEXT PRIMARY KEY,
            device_id TEXT,
            platform TEXT,
            registered_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS camera_health (
            camera_id TEXT PRIMARY KEY,
            last_seen_at TEXT,
            fault_status TEXT DEFAULT 'NORMAL',
            name TEXT,
            location TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS edge_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payload_json TEXT,
            queued_at TEXT
        )
    """)

    # Migration safety: ensure dismiss_reason column exists on older databases
    try:
        cur.execute("ALTER TABLE incidents ADD COLUMN dismiss_reason TEXT")
    except sqlite3.OperationalError:
        pass  # column already exists

    # Seed default camera records if empty
    default_cams = [
        ("CAM_ALPHA", "Checkpost Alpha Main Gate", "Sector 4 Northern Crossing (Optical PTZ 4K)"),
        ("CAM_BRAVO", "BOP Bravo Outer Perimeter", "Eastern Fenced Corridor (FLIR Thermal LWIR)"),
        ("CAM_CHARLIE", "Tower Charlie Thermal Pan", "Ridge Watchpoint 7 (Thermal IR)"),
        ("CAM_DELTA", "Riverine Sentry Delta", "Creek Sector 2 (Day/Night Optical)"),
    ]
    for cid, cname, cloc in default_cams:
        cur.execute("""
            INSERT OR IGNORE INTO camera_health (camera_id, last_seen_at, fault_status, name, location)
            VALUES (?, NULL, 'NORMAL', ?, ?)
        """, (cid, cname, cloc))

    conn.commit()
    conn.close()


def _row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# security_events
# ---------------------------------------------------------------------------

def event_exists(event_id: str) -> bool:
    """True if we've already stored an event with this exact event_id."""
    conn = get_connection()
    row = conn.execute(
        "SELECT 1 FROM security_events WHERE event_id = ?", (event_id,)
    ).fetchone()
    conn.close()
    return row is not None


def insert_event(event: dict) -> bool:
    """
    Store a new security event. Returns True if it was inserted, False if
    an event with this event_id already existed (idempotent).
    Also updates camera heartbeat timestamp for real camera health tracking.
    """
    if event_exists(event["event_id"]):
        return False

    now_iso = event.get("timestamp_iso") or _now_iso()
    cam_id = event.get("camera_id")

    conn = get_connection()
    conn.execute("""
        INSERT INTO security_events (
            event_id, timestamp_iso, timestamp_ms, camera_id, track_id,
            class_name, alert_type, severity, zone_id, zone_name, details,
            bbox_json, centroid_json, rule_name, rule_metrics_json,
            confidence, operator_status, operator_notes, thumbnail_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        event["event_id"],
        now_iso,
        event.get("timestamp_ms"),
        cam_id,
        event.get("track_id"),
        event.get("class_name"),
        event.get("alert_type"),
        event.get("severity", "INFO"),
        event.get("zone_id"),
        event.get("zone_name"),
        event.get("details", ""),
        json.dumps(event.get("bbox") or []),
        json.dumps(event.get("centroid") or []),
        event.get("rule_name", "Spatial Geometry Rule"),
        json.dumps(event.get("rule_metrics") or {}),
        event.get("confidence", 0.85),
        "UNREVIEWED",
        None,
        event.get("thumbnail_path"),
    ))

    # Update camera heartbeat in camera_health table
    if cam_id:
        conn.execute("""
            INSERT INTO camera_health (camera_id, last_seen_at, fault_status, name, location)
            VALUES (?, ?, 'NORMAL', ?, 'Border Sector')
            ON CONFLICT(camera_id) DO UPDATE SET last_seen_at = excluded.last_seen_at
        """, (cam_id, now_iso, f"Camera {cam_id}"))

    conn.commit()
    conn.close()
    return True


def get_event(event_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM security_events WHERE event_id = ?", (event_id,)
    ).fetchone()
    conn.close()
    return _row_to_dict(row)


def get_recent_events(limit: int = 50, camera_id: str | None = None) -> list[dict]:
    """Most recent events first. Optionally filter to one camera."""
    conn = get_connection()
    if camera_id:
        rows = conn.execute(
            "SELECT * FROM security_events WHERE camera_id = ? ORDER BY timestamp_iso DESC LIMIT ?",
            (camera_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM security_events ORDER BY timestamp_iso DESC LIMIT ?",
            (limit,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# incidents
# ---------------------------------------------------------------------------

def next_incident_id() -> str:
    """INC-0001, INC-0002, ... — just one more than however many exist."""
    conn = get_connection()
    row = conn.execute("SELECT COUNT(*) AS n FROM incidents").fetchone()
    conn.close()
    return f"INC-{row['n'] + 1:04d}"


def insert_incident(incident: dict) -> None:
    conn = get_connection()
    conn.execute("""
        INSERT INTO incidents (
            incident_id, created_at, closed_at, status, threat_score,
            confidence, primary_object_id, target_class, severity,
            cameras_json, story_summary, score_breakdown_json, cryptographic_hash,
            dismiss_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        incident["incident_id"],
        incident.get("created_at") or _now_iso(),
        incident.get("closed_at"),
        incident.get("status", "open"),
        incident.get("threat_score", 0),
        incident.get("confidence", 0.85),
        incident.get("primary_object_id"),
        incident.get("target_class", "person"),
        incident.get("severity", "INFO"),
        json.dumps(incident.get("cameras") or []),
        incident.get("story_summary", ""),
        json.dumps(incident.get("score_breakdown") or []),
        incident.get("cryptographic_hash"),
        incident.get("dismiss_reason"),
    ))
    conn.commit()
    conn.close()


def get_incident(incident_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM incidents WHERE incident_id = ?", (incident_id,)
    ).fetchone()
    conn.close()
    return _row_to_dict(row)


def get_all_incidents(limit: int = 50) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM incidents ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_incident_score(
    incident_id: str, threat_score: int, severity: str,
    score_breakdown: list, cameras: list, story_summary: str,
) -> None:
    conn = get_connection()
    conn.execute("""
        UPDATE incidents
        SET threat_score = ?, severity = ?, score_breakdown_json = ?,
            cameras_json = ?, story_summary = ?
        WHERE incident_id = ?
    """, (
        threat_score, severity, json.dumps(score_breakdown),
        json.dumps(cameras), story_summary, incident_id,
    ))
    conn.commit()
    conn.close()


def update_incident_status(incident_id: str, status: str, dismiss_reason: str | None = None) -> None:
    """Operator marks an incident CONFIRMED or DISMISSED_FP with optional calibration reason."""
    conn = get_connection()
    conn.execute(
        "UPDATE incidents SET status = ?, dismiss_reason = ?, closed_at = ? WHERE incident_id = ?",
        (status, dismiss_reason, _now_iso(), incident_id),
    )
    conn.commit()
    conn.close()


def set_incident_hash(incident_id: str, cryptographic_hash: str) -> None:
    conn = get_connection()
    conn.execute(
        "UPDATE incidents SET cryptographic_hash = ? WHERE incident_id = ?",
        (cryptographic_hash, incident_id),
    )
    conn.commit()
    conn.close()


def link_event_to_incident(incident_id: str, event_id: str, weight: float = 1.0) -> None:
    conn = get_connection()
    conn.execute("""
        INSERT OR IGNORE INTO incident_events
            (incident_id, event_id, contribution_weight, created_at)
        VALUES (?, ?, ?, ?)
    """, (incident_id, event_id, weight, _now_iso()))
    conn.commit()
    conn.close()


def get_incident_id_for_event(event_id: str) -> str | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT incident_id FROM incident_events WHERE event_id = ? LIMIT 1",
        (event_id,),
    ).fetchone()
    conn.close()
    return row["incident_id"] if row else None


def get_events_for_incident(incident_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute("""
        SELECT e.*
        FROM security_events e
        JOIN incident_events ie ON e.event_id = ie.event_id
        WHERE ie.incident_id = ?
        ORDER BY e.timestamp_iso ASC
    """, (incident_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# calibration statistics (Phase 2)
# ---------------------------------------------------------------------------

def get_calibration_stats(camera_id: str | None = None) -> dict:
    """
    Counts false-positive dismissals by reason to tune site-specific detection thresholds.
    """
    conn = get_connection()
    cur = conn.cursor()

    if camera_id:
        rows = cur.execute("""
            SELECT i.dismiss_reason, COUNT(*) as count
            FROM incidents i
            JOIN incident_events ie ON i.incident_id = ie.incident_id
            JOIN security_events se ON ie.event_id = se.event_id
            WHERE i.status = 'DISMISSED_FP' AND se.camera_id = ? AND i.dismiss_reason IS NOT NULL
            GROUP BY i.dismiss_reason
        """, (camera_id,)).fetchall()
        
        total_row = cur.execute("""
            SELECT COUNT(DISTINCT i.incident_id) as total
            FROM incidents i
            JOIN incident_events ie ON i.incident_id = ie.incident_id
            JOIN security_events se ON ie.event_id = se.event_id
            WHERE i.status = 'DISMISSED_FP' AND se.camera_id = ?
        """, (camera_id,)).fetchone()
    else:
        rows = cur.execute("""
            SELECT dismiss_reason, COUNT(*) as count
            FROM incidents
            WHERE status = 'DISMISSED_FP' AND dismiss_reason IS NOT NULL
            GROUP BY dismiss_reason
        """).fetchall()
        total_row = cur.execute("SELECT COUNT(*) as total FROM incidents WHERE status = 'DISMISSED_FP'").fetchone()

    conn.close()

    by_reason = {r["dismiss_reason"]: r["count"] for r in rows}
    total_dismissed = total_row["total"] if total_row else sum(by_reason.values())

    return {
        "camera_id": camera_id or "ALL_SITE_CAMERAS",
        "total_dismissed": total_dismissed,
        "by_reason": by_reason,
    }


# ---------------------------------------------------------------------------
# camera health diagnostics (Phase 3)
# ---------------------------------------------------------------------------

def get_camera_health_records() -> list[dict]:
    """
    Computes ONLINE, STALE, OFFLINE, or FAULT states for each camera based on last_seen_at.
      - ONLINE if seen within 60s
      - STALE if 60s - 300s
      - OFFLINE if >300s or never seen
      - FAULT if manually triggered demo fault
    """
    conn = get_connection()
    rows = conn.execute("SELECT * FROM camera_health ORDER BY camera_id ASC").fetchall()
    conn.close()

    now = datetime.now(timezone.utc)
    results = []

    for r in rows:
        cam_id = r["camera_id"]
        fault = r["fault_status"]
        last_seen = r["last_seen_at"]

        if fault == "FAULT":
            status = "FAULT"
            details = "Operator-triggered demo fault status"
        elif last_seen:
            try:
                dt = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
                elapsed = (now - dt).total_seconds()
                if elapsed <= 60.0:
                    status = "ONLINE"
                    details = f"Active feed (last heartbeat {int(elapsed)}s ago)"
                elif elapsed <= 300.0:
                    status = "STALE"
                    details = f"Warning: delayed heartbeat ({int(elapsed)}s ago)"
                else:
                    status = "OFFLINE"
                    details = f"Stream offline (>300s since last frame)"
            except Exception:
                status = "OFFLINE"
                details = "Timestamp parse error"
        else:
            status = "OFFLINE"
            details = "No stream frames received yet"

        results.append({
            "camera_id": cam_id,
            "name": r["name"] or f"Camera {cam_id}",
            "location": r["location"] or "Border Sector",
            "status": status,
            "last_seen_at": last_seen,
            "details": details,
        })

    return results


def set_camera_fault(camera_id: str, is_fault: bool = True) -> dict:
    conn = get_connection()
    fault_val = "FAULT" if is_fault else "NORMAL"
    conn.execute(
        "UPDATE camera_health SET fault_status = ? WHERE camera_id = ?",
        (fault_val, camera_id),
    )
    conn.commit()
    conn.close()
    return {"camera_id": camera_id, "fault_status": fault_val}


# ---------------------------------------------------------------------------
# edge offline queue (Phase 4)
# ---------------------------------------------------------------------------

def queue_edge_event(payload_json: str) -> int:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO edge_queue (payload_json, queued_at) VALUES (?, ?)",
        (payload_json, _now_iso()),
    )
    conn.commit()
    rowid = cur.lastrowid
    conn.close()
    return rowid


def get_queued_events() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM edge_queue ORDER BY id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def clear_queued_events() -> None:
    conn = get_connection()
    conn.execute("DELETE FROM edge_queue")
    conn.commit()
    conn.close()


def get_queued_count() -> int:
    conn = get_connection()
    row = conn.execute("SELECT COUNT(*) as n FROM edge_queue").fetchone()
    conn.close()
    return row["n"] if row else 0


# ---------------------------------------------------------------------------
# audit ledger
# ---------------------------------------------------------------------------

def get_last_ledger_block() -> dict | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM audit_ledger ORDER BY block_index DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return _row_to_dict(row)


def insert_ledger_block(block: dict) -> None:
    conn = get_connection()
    conn.execute("""
        INSERT INTO audit_ledger (previous_hash, data_hash, current_hash, payload_json, timestamp)
        VALUES (?, ?, ?, ?, ?)
    """, (
        block["previous_hash"],
        block["data_hash"],
        block["current_hash"],
        block["payload_json"],
        block.get("timestamp") or _now_iso(),
    ))
    conn.commit()
    conn.close()


def get_all_ledger_blocks() -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM audit_ledger ORDER BY block_index ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
