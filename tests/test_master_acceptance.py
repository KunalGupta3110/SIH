"""
IBVAP Sentinel backend acceptance tests.

These tests focus on the backend/database contract required by the project:
deterministic scoring, idempotent ingestion, 6-14 second handoff correlation,
and SHA-256 audit ledger verification.
"""

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from core.backend_service import SentinelBackend, calculate_threat_score


def make_backend(tmp_path):
    return SentinelBackend(tmp_path / "events.db")


def test_threat_score_returns_77_critical():
    result = calculate_threat_score(
        in_restricted_zone=True,
        movement_toward_border=True,
        loitering_seconds=241,
        cross_camera_reid_match=True,
        timestamp_iso="2026-09-05T10:00:00+00:00",
    )

    assert result["threat_score"] == 77
    assert result["severity"] == "CRITICAL"
    assert [item["points"] for item in result["itemized_breakdown"]] == [30, 20, 15, 12]


def test_event_ingestion_is_idempotent(tmp_path):
    backend = make_backend(tmp_path)
    event = {
        "event_id": "EVT-001",
        "timestamp_iso": "2026-09-05T10:31:02+00:00",
        "camera_id": "CAM_ALPHA",
        "track_id": 7,
        "class_name": "person",
        "alert_type": "ZONE_INTRUSION",
        "in_restricted_zone": True,
        "movement_toward_border": True,
    }

    first = backend.ingest_event(event)
    second = backend.ingest_event(event)

    assert first["duplicate"] is False
    assert second["duplicate"] is True
    assert len(backend.get_events()) == 1
    assert len(backend.get_incidents()) == 1
    assert first["incident"]["incident_id"] == second["incident"]["incident_id"]


def test_handoff_window_correlates_alpha_and_bravo(tmp_path):
    backend = make_backend(tmp_path)
    t1 = datetime(2026, 9, 5, 10, 31, 2, tzinfo=timezone.utc)
    t2 = t1 + timedelta(seconds=9)

    backend.ingest_event(
        {
            "event_id": "EVT-ALPHA",
            "timestamp_iso": t1.isoformat(),
            "camera_id": "CAM_ALPHA",
            "track_id": 11,
            "class_name": "person",
            "alert_type": "ZONE_INTRUSION",
            "in_restricted_zone": True,
            "movement_toward_border": True,
        }
    )
    second = backend.ingest_event(
        {
            "event_id": "EVT-BRAVO",
            "timestamp_iso": t2.isoformat(),
            "camera_id": "CAM_BRAVO",
            "track_id": 99,
            "class_name": "person",
            "alert_type": "CROSS_CAMERA_MATCH",
            "cross_camera_reid_match": True,
        }
    )

    incident = second["incident"]
    assert incident["incident_id"] == "INC-0001"
    assert incident["cameras_involved"] == ["CAM_ALPHA", "CAM_BRAVO"]
    assert set(incident["event_ids"]) == {"EVT-ALPHA", "EVT-BRAVO"}


def test_untouched_evidence_ledger_verifies(tmp_path):
    backend = make_backend(tmp_path)
    backend.ingest_event(
        {
            "event_id": "EVT-LEDGER",
            "timestamp_iso": "2026-09-05T10:31:02+00:00",
            "camera_id": "CAM_ALPHA",
            "track_id": 1,
            "class_name": "person",
            "alert_type": "ZONE_INTRUSION",
            "in_restricted_zone": True,
        }
    )

    is_valid, broken_index, reason, logs = backend.verify_chain()
    assert is_valid is True
    assert broken_index is None
    assert reason == "chain verified"
    assert len(logs) == 2


def test_tampered_historical_ledger_block_reports_exact_index(tmp_path):
    backend = make_backend(tmp_path)
    backend.ingest_event(
        {
            "event_id": "EVT-TAMPER",
            "timestamp_iso": "2026-09-05T10:31:02+00:00",
            "camera_id": "CAM_ALPHA",
            "track_id": 1,
            "class_name": "person",
            "alert_type": "ZONE_INTRUSION",
            "in_restricted_zone": True,
        }
    )

    with backend.connect() as conn:
        row = conn.execute("SELECT payload_json FROM audit_ledger WHERE block_index = 1").fetchone()
        payload = json.loads(row["payload_json"])
        payload["threat_score"] = 999
        conn.execute(
            "UPDATE audit_ledger SET payload_json = ? WHERE block_index = 1",
            (json.dumps(payload, sort_keys=True),),
        )
        conn.commit()

    is_valid, broken_index, reason, _ = backend.verify_chain()
    assert is_valid is False
    assert broken_index == 1
    assert reason == "modified payload or data hash"
