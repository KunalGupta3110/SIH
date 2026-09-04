"""
IBVAP Sentinel — backend/database.py

ONE job: talk to the SQLite database. Nothing in here calculates a threat
score or decides whether two events belong to the same incident — it just
stores and fetches rows.

The database lives at data/events.db. It's opened in WAL mode, which lets
the FastAPI server read the database at the same time something else is
writing to it, without locking up.

Every function here takes plain Python values (strings, numbers, dicts) and
returns plain Python values (dicts, lists of dicts) — never a database
cursor or row object — so nothing outside this file needs to know anything
about SQL.
"""

from datetime import datetime, timedelta, timezone
import json
import os
import sqlite3

# Tests point this at a temporary file instead of the real database.
# Everything else just calls the functions below and never touches this
# directly.
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
            cryptographic_hash TEXT
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
    an event with this event_id already existed (nothing is changed in
    that case — this is what makes event ingestion idempotent).
    """
    if event_exists(event["event_id"]):
        return False

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
        event.get("timestamp_iso") or _now_iso(),
        event.get("timestamp_ms"),
        event.get("camera_id"),
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
            "SELECT * FROM security_events WHERE camera_id = ? "
            "ORDER BY timestamp_iso DESC LIMIT ?",
            (camera_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM security_events ORDER BY timestamp_iso DESC LIMIT ?",
            (limit,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def count_events_last_24h() -> int:
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    conn = get_connection()
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM security_events WHERE timestamp_iso >= ?",
        (since,),
    ).fetchone()
    conn.close()
    return row["n"] if row else 0


def count_unreviewed_events() -> int:
    conn = get_connection()
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM security_events WHERE operator_status = 'UNREVIEWED'"
    ).fetchone()
    conn.close()
    return row["n"] if row else 0


# ---------------------------------------------------------------------------
# incidents + incident_events
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
            cameras_json, story_summary, score_breakdown_json, cryptographic_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    """Called after every new event that joins this incident, so the
    incident's score/story always reflect the latest evidence."""
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


def update_incident_status(incident_id: str, status: str) -> None:
    """Operator marks an incident CONFIRMED or DISMISSED_FP."""
    conn = get_connection()
    conn.execute(
        "UPDATE incidents SET status = ?, closed_at = ? WHERE incident_id = ?",
        (status, _now_iso(), incident_id),
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
    """Which incident (if any) already contains this event."""
    conn = get_connection()
    row = conn.execute(
        "SELECT incident_id FROM incident_events WHERE event_id = ? LIMIT 1",
        (event_id,),
    ).fetchone()
    conn.close()
    return row["incident_id"] if row else None


def get_events_for_incident(incident_id: str) -> list[dict]:
    """All events that make up one incident's story, oldest first."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT security_events.* FROM security_events
        JOIN incident_events ON incident_events.event_id = security_events.event_id
        WHERE incident_events.incident_id = ?
        ORDER BY security_events.timestamp_iso ASC
    """, (incident_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# audit_ledger
# ---------------------------------------------------------------------------

def insert_ledger_block(block: dict) -> int:
    """Store one sealed evidence block. Returns its block_index."""
    conn = get_connection()
    cur = conn.execute("""
        INSERT INTO audit_ledger (previous_hash, data_hash, current_hash, payload_json, timestamp)
        VALUES (?, ?, ?, ?, ?)
    """, (
        block["previous_hash"], block["data_hash"], block["current_hash"],
        block["payload_json"], block.get("timestamp") or _now_iso(),
    ))
    conn.commit()
    block_index = cur.lastrowid
    conn.close()
    return block_index


def get_all_ledger_blocks() -> list[dict]:
    """Every block, oldest first — the order the chain was built in."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM audit_ledger ORDER BY block_index ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_last_ledger_block() -> dict | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM audit_ledger ORDER BY block_index DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return _row_to_dict(row)


# ---------------------------------------------------------------------------
# fcm_tokens
# ---------------------------------------------------------------------------

def insert_fcm_token(token: str, device_id: str, platform: str) -> None:
    """Save (or refresh) one device's push-notification token."""
    conn = get_connection()
    conn.execute("""
        INSERT INTO fcm_tokens (token, device_id, platform, registered_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(token) DO UPDATE SET
            device_id = excluded.device_id,
            platform = excluded.platform,
            registered_at = excluded.registered_at
    """, (token, device_id, platform, _now_iso()))
    conn.commit()
    conn.close()


def get_all_fcm_tokens() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM fcm_tokens").fetchall()
    conn.close()
    return [dict(r) for r in rows]
