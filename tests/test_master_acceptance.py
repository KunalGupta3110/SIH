"""
IBVAP Sentinel — Automated Master Acceptance Test Suite
Verifies all core acceptance criteria against the live unified backend architecture.
"""

from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend import threat_engine, database, correlation_engine, evidence_ledger, camera_topology


def test_acceptance_criteria():
    print("\n" + "="*70)
    print(" [TEST SUITE] RUNNING IBVAP SENTINEL MASTER ACCEPTANCE VERIFICATION")
    print("="*70 + "\n")

    # 1. Pure Threat Score Function Test
    print("[TEST 1/5] Testing Pure Explainable Threat Scoring...")
    score_res = threat_engine.calculate_threat_score(
        in_restricted_zone=True,
        moving_toward_border=True,
        loitering_seconds=300,
        cross_camera_reid_match=True,
        hour_ist=12,
    )
    assert score_res["score"] == 77, f"Expected 77, got {score_res['score']}"
    assert score_res["severity"] == "CRITICAL", f"Expected CRITICAL, got {score_res['severity']}"
    assert len(score_res["factors"]) == 4, "Expected 4 itemized factors"
    print(" -> [PASS] Pure scoring calculated transparently: 77/100 (CRITICAL)")

    # 2. Idempotent Ingestion & Incident Correlation Test
    print("\n[TEST 2/5] Testing Idempotent Event Ingestion & Correlation...")
    test_db = "data/test_events.db"
    if os.path.exists(test_db):
        os.remove(test_db)
    database.DB_PATH = test_db
    database.init_database()

    now = datetime.now(timezone.utc)
    ev1 = {
        "event_id": "test_evt_001",
        "timestamp_iso": now.isoformat(),
        "camera_id": "CAM_ALPHA",
        "track_id": 42,
        "class_name": "person",
        "alert_type": "ZONE_INTRUSION",
        "zone_id": "zone_01",
        "zone_name": "Restricted North Fence",
        "details": "Target crossed red line at Cam Alpha",
        "rule_metrics_json": json.dumps({"in_restricted_zone": True, "moving_toward_border": True}),
    }
    database.insert_event(ev1)
    inc_id1, _ = correlation_engine.correlate_event(ev1)
    assert inc_id1 is not None, "Failed to correlate incident"

    # Replay same event_id to verify idempotency
    inserted_again = database.insert_event(ev1)
    assert inserted_again is False, "Idempotency failed: duplicated event inserted"
    print(f" -> [PASS] Event test_evt_001 correlated into {inc_id1} (Idempotent: verified)")

    # 3. Cross-Camera Incident Extension Test
    print("\n[TEST 3/5] Testing Cross-Camera Trajectory Linkage & Predictive Handoff...")
    ev2 = {
        "event_id": "test_evt_002",
        "timestamp_iso": (now + timedelta(seconds=8.0)).isoformat(),
        "camera_id": "CAM_BRAVO",
        "track_id": 42,
        "class_name": "person",
        "alert_type": "PREDICTIVE_HANDOFF",
        "zone_id": "zone_02",
        "zone_name": "BOP Bravo Eastern Perimeter",
        "details": "Target matched at Cam Bravo via Re-ID within topological window",
        "rule_metrics_json": json.dumps({"cross_camera_reid_match": True, "in_restricted_zone": True}),
    }
    database.insert_event(ev2)
    inc_id2, _ = correlation_engine.correlate_event(ev2)
    assert inc_id2 == inc_id1, f"Failed to link cross-camera incident: {inc_id2} != {inc_id1}"
    events_in_inc = database.get_events_for_incident(inc_id1)
    cams = {e["camera_id"] for e in events_in_inc}
    assert "CAM_ALPHA" in cams and "CAM_BRAVO" in cams
    print(f" -> [PASS] Cross-camera linkage verified: {sorted(cams)}")

    # 4. Cryptographic Hash Chain & Genesis Test
    print("\n[TEST 4/5] Testing SHA-256 Tamper-Evident Evidence Chain...")
    b1 = evidence_ledger.seal_incident(
        incident_id=inc_id1,
        threat_score=77,
        camera_ids=list(cams),
        rule_evidence=score_res["factors"],
        thumbnail_sha256="abc123hash",
        timestamp=datetime.now(timezone.utc).isoformat(),
        previous_hash=evidence_ledger.GENESIS_VALUE,
    )
    database.insert_ledger_block(b1)
    blocks = database.get_all_ledger_blocks()
    res = evidence_ledger.verify_chain(blocks)
    assert res["is_valid"] is True, f"Chain failed verification: {res['reason']}"
    print(f" -> [PASS] Sealed Block ({b1['current_hash'][:16]}...) verified 100% untampered")

    # 5. Live Tamper Detection Test
    print("\n[TEST 5/5] Testing Live Tamper Detection...")
    tampered_blocks = [dict(b) for b in blocks]
    tampered_blocks[0]["payload_json"] = '{"incident_id": "FORGED", "threat_score": 0}'
    tamper_res = evidence_ledger.verify_chain(tampered_blocks)
    assert tamper_res["is_valid"] is False, "Failed to catch tamper"
    assert tamper_res["broken_index"] == 0, f"Expected broken block 0, got {tamper_res['broken_index']}"
    print(f" -> [PASS] Tamper correctly flagged live at Block #{tamper_res['broken_index']} ({tamper_res['reason']})")

    # Clean up test files safely on Windows
    try:
        if os.path.exists(test_db):
            os.remove(test_db)
    except Exception:
        pass

    print("\n" + "="*70)
    print(" [OK] ALL ACCEPTANCE CRITERIA VERIFIED & PASSED (5/5)")
    print("="*70 + "\n")


if __name__ == "__main__":
    test_acceptance_criteria()
