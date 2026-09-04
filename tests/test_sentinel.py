"""
IBVAP Sentinel — tests/test_sentinel.py

The five things the backend absolutely must get right:

  1. The threat score matches the spec's worked example.
  2. Sending the same event twice does not create two events or two incidents.
  3. Two events from different cameras 6-14s apart join the same incident.
  4. A clean evidence ledger verifies as valid.
  5. Editing an old ledger block makes verification fail, at the right block.

Run with:  pytest tests/test_sentinel.py -v
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import pytest
from fastapi.testclient import TestClient

from backend import database, evidence_ledger, threat_engine
import backend.main as main_module


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """
    Every test gets its own empty, throwaway database file — none of these
    tests touch data/events.db, the real one the rest of the project uses.
    """
    test_db_path = tmp_path / "test_events.db"
    monkeypatch.setattr(database, "DB_PATH", str(test_db_path))
    with TestClient(main_module.app) as test_client:
        yield test_client


# ---------------------------------------------------------------------------
# Test 1 — Threat Score
# ---------------------------------------------------------------------------

def test_threat_score_matches_spec_example():
    result = threat_engine.calculate_threat_score(
        in_restricted_zone=True,
        moving_toward_border=True,
        loitering_seconds=300,
        cross_camera_reid_match=True,
    )

    assert result["score"] == 77
    assert result["severity"] == "CRITICAL"

    points_by_factor = {f["factor"]: f["points"] for f in result["factors"]}
    assert points_by_factor["Restricted Zone Penetration"] == 30
    assert points_by_factor["Movement Toward Border"] == 20
    assert points_by_factor["Cross-Camera Re-ID Match"] == 12
    loiter_factor = next(f for f in result["factors"] if "Loitering" in f["factor"])
    assert loiter_factor["points"] == 15


def test_threat_score_severity_bands():
    assert threat_engine.calculate_threat_score()["severity"] == "INFO"                                # 0 points
    assert threat_engine.calculate_threat_score(moving_toward_border=True)["severity"] == "INFO"       # 20 points
    assert threat_engine.calculate_threat_score(
        in_restricted_zone=True, moving_toward_border=True
    )["severity"] == "WARNING"   # 30+20 = 50 points
    assert threat_engine.calculate_threat_score(
        in_restricted_zone=True, moving_toward_border=True, loitering_seconds=300
    )["severity"] == "WARNING"   # 30+20+15 = 65 points, still under the CRITICAL line
    assert threat_engine.calculate_threat_score(
        in_restricted_zone=True, moving_toward_border=True, loitering_seconds=300, cross_camera_reid_match=True
    )["severity"] == "CRITICAL"   # 30+20+15+12 = 77 points -> CRITICAL


# ---------------------------------------------------------------------------
# Test 2 — Idempotency
# ---------------------------------------------------------------------------

def test_duplicate_event_is_not_inserted_twice(client):
    event = {
        "event_id": "EVT-DUPLICATE-TEST-001",
        "camera_id": "CAM_ALPHA",
        "alert_type": "ZONE_INTRUSION",
        "in_restricted_zone": True,
    }

    first_response = client.post("/events", json=event)
    second_response = client.post("/events", json=event)

    assert first_response.status_code == 200
    assert first_response.json()["status"] == "recorded"

    assert second_response.status_code == 200
    assert second_response.json()["status"] == "duplicate"

    stored_events = database.get_recent_events(limit=100)
    matching = [e for e in stored_events if e["event_id"] == "EVT-DUPLICATE-TEST-001"]
    assert len(matching) == 1

    # and it must not have created two separate incidents either
    incidents = client.get("/incidents").json()
    assert len(incidents) == 1


# ---------------------------------------------------------------------------
# Test 3 — Cross-Camera Correlation
# ---------------------------------------------------------------------------

def test_events_6_to_14_seconds_apart_on_different_cameras_join_one_incident(client):
    start_time = datetime.now(timezone.utc)

    event_alpha = {
        "event_id": "EVT-CORR-ALPHA",
        "camera_id": "CAM_ALPHA",
        "alert_type": "ZONE_INTRUSION",
        "timestamp_iso": start_time.isoformat(),
        "in_restricted_zone": True,
    }
    event_bravo = {
        "event_id": "EVT-CORR-BRAVO",
        "camera_id": "CAM_BRAVO",
        "alert_type": "ZONE_INTRUSION",
        "timestamp_iso": (start_time + timedelta(seconds=9)).isoformat(),   # inside 6-14s
        "cross_camera_reid_match": True,
    }

    result_alpha = client.post("/events", json=event_alpha).json()
    result_bravo = client.post("/events", json=event_bravo).json()

    assert result_alpha["incident_id"] == result_bravo["incident_id"]

    incidents = client.get("/incidents").json()
    assert len(incidents) == 1
    assert set(incidents[0]["cameras_involved"]) == {"CAM_ALPHA", "CAM_BRAVO"}
    assert len(incidents[0]["nodes"]) == 2


def test_events_20_seconds_apart_do_not_correlate(client):
    """Outside the 6-14s window -> two separate incidents, not one."""
    start_time = datetime.now(timezone.utc)

    event_alpha = {
        "event_id": "EVT-NOCORR-ALPHA",
        "camera_id": "CAM_ALPHA",
        "timestamp_iso": start_time.isoformat(),
    }
    event_bravo = {
        "event_id": "EVT-NOCORR-BRAVO",
        "camera_id": "CAM_BRAVO",
        "timestamp_iso": (start_time + timedelta(seconds=20)).isoformat(),
    }

    result_alpha = client.post("/events", json=event_alpha).json()
    result_bravo = client.post("/events", json=event_bravo).json()

    assert result_alpha["incident_id"] != result_bravo["incident_id"]


# ---------------------------------------------------------------------------
# Test 4 — Blockchain (clean chain is valid)
# ---------------------------------------------------------------------------

def test_clean_ledger_verifies_as_valid(client):
    # simulate-handoff produces a CRITICAL incident, which seals a block
    response = client.post("/events/simulate-handoff").json()
    assert response["second_event"]["sealed_to_ledger"] is True

    result = client.get("/audit/verify").json()
    assert result["is_valid"] is True
    assert result["broken_index"] is None


# ---------------------------------------------------------------------------
# Test 5 — Tamper Detection
# ---------------------------------------------------------------------------

def test_editing_an_old_block_is_detected(client):
    # seal two blocks so there's a "downstream" block to break
    client.post("/events/simulate-handoff")
    client.post("/events/simulate-handoff")

    blocks_before = database.get_all_ledger_blocks()
    assert len(blocks_before) >= 2

    # tamper with the FIRST block's payload, as if someone edited old evidence
    conn = database.get_connection()
    conn.execute(
        "UPDATE audit_ledger SET payload_json = ? WHERE block_index = ?",
        ('{"incident_id":"FORGED","threat_score":0,"camera_ids":[],"rule_evidence":[],"thumbnail_sha256":"","timestamp":"x"}',
         blocks_before[0]["block_index"]),
    )
    conn.commit()
    conn.close()

    result = client.get("/audit/verify").json()
    assert result["is_valid"] is False
    assert result["broken_index"] == 0   # the first block (index 0 in the returned list) is the one we broke


def test_verify_chain_function_directly():
    """Same idea, but calling evidence_ledger.verify_chain() straight, with
    no database or HTTP involved — the simplest possible check of the
    hashing math itself."""
    block_1 = evidence_ledger.seal_incident(
        incident_id="INC-TEST-1", threat_score=77, camera_ids=["CAM_ALPHA"],
        rule_evidence=[], thumbnail_sha256="", timestamp="2026-01-01T00:00:00Z",
        previous_hash=evidence_ledger.GENESIS_VALUE,
    )
    block_2 = evidence_ledger.seal_incident(
        incident_id="INC-TEST-2", threat_score=50, camera_ids=["CAM_BRAVO"],
        rule_evidence=[], thumbnail_sha256="", timestamp="2026-01-01T00:05:00Z",
        previous_hash=block_1["current_hash"],
    )

    good_result = evidence_ledger.verify_chain([block_1, block_2])
    assert good_result["is_valid"] is True

    tampered_block_1 = dict(block_1)
    tampered_block_1["payload_json"] = '{"incident_id":"FORGED"}'
    bad_result = evidence_ledger.verify_chain([tampered_block_1, block_2])
    assert bad_result["is_valid"] is False
    assert bad_result["broken_index"] == 0
