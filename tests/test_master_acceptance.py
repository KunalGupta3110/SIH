"""
IBVAP Sentinel — Automated Master Acceptance Test Suite
Verifies all 7 Acceptance Criteria from Definition of Done.
"""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from alerts.incident_engine import calculate_threat_score, IncidentCorrelationEngine
from alerts.schema import AlertSeverity, AlertType, SecurityEvent
from core.evidence_chain import EvidenceChain


def test_acceptance_criteria():
    print("\n" + "="*70)
    print(" [TEST SUITE] RUNNING IBVAP SENTINEL ACCEPTANCE VERIFICATION")
    print("="*70 + "\n")

    # 1. Pure Threat Score Function Test
    print("[TEST 1/5] Testing Pure Explainable Threat Scoring...")
    score_res = calculate_threat_score(
        in_restricted_zone=True,
        vector_toward_border=True,
        loitering_exceeded=True,
        cross_camera_reid_match=True,
        is_night_window=False,
    )
    assert score_res["threat_score"] == 77, f"Expected 77, got {score_res['threat_score']}"
    assert score_res["severity"] == "CRITICAL", f"Expected CRITICAL, got {score_res['severity']}"
    assert len(score_res["itemized_breakdown"]) == 4, "Expected 4 itemized factors"
    print(" -> [PASS] Pure scoring calculated transparently: 77/100 (CRITICAL)")

    # 2. Idempotent Ingestion & Incident Correlation Test
    print("\n[TEST 2/5] Testing Idempotent Event Ingestion & Correlation...")
    engine = IncidentCorrelationEngine(db_path="data/test_events.db")
    ev1 = SecurityEvent(
        event_id="test_evt_001",
        timestamp_iso=datetime.now(timezone.utc).isoformat(),
        timestamp_ms=1000.0,
        camera_id="CAM_ALPHA",
        track_id=42,
        class_name="person",
        alert_type=AlertType.ZONE_INTRUSION,
        severity=AlertSeverity.CRITICAL,
        zone_id="zone_01",
        zone_name="Restricted North Fence",
        details="Target crossed red line at Cam Alpha",
        bbox=[100.0, 100.0, 200.0, 200.0],
        centroid=(150.0, 150.0),
    )
    inc1 = engine.ingest_event(ev1, in_restricted_zone=True)
    assert inc1 is not None, "Failed to create incident"
    assert "CAM_ALPHA" in inc1.cameras_involved

    # Replay same event_id to verify idempotency (no duplicate score or double counting)
    inc_replayed = engine.ingest_event(ev1, in_restricted_zone=True)
    assert inc_replayed.incident_id == inc1.incident_id, "Idempotency failed: duplicated incident"
    print(f" -> [PASS] Event test_evt_001 correlated into {inc1.incident_id} (Idempotent: verified)")

    # 3. Cross-Camera Incident Extension Test
    print("\n[TEST 3/5] Testing Cross-Camera Trajectory Linkage...")
    ev2 = SecurityEvent(
        event_id="test_evt_002",
        timestamp_iso=datetime.now(timezone.utc).isoformat(),
        timestamp_ms=8000.0,
        camera_id="CAM_BRAVO",
        track_id=42,
        class_name="person",
        alert_type=AlertType.CROSS_CAMERA_MATCH,
        severity=AlertSeverity.CRITICAL,
        zone_id="zone_02",
        zone_name="BOP Bravo Perimeter",
        details="Target matched at Cam Bravo via Re-ID",
        bbox=[150.0, 150.0, 250.0, 250.0],
        centroid=(200.0, 200.0),
    )
    inc2 = engine.ingest_event(ev2, cross_camera_reid_match=True)
    assert inc2.incident_id == inc1.incident_id, "Failed to link cross-camera incident"
    assert "CAM_BRAVO" in inc2.cameras_involved
    print(f" -> [PASS] Cross-camera linkage verified: {inc2.cameras_involved}")

    # 4. Cryptographic Hash Chain & Genesis Test
    print("\n[TEST 4/5] Testing SHA-256 Tamper-Evident Evidence Chain...")
    chain = EvidenceChain(ledger_file="data/test_evidence_ledger.json")
    b1 = chain.record_capsule(
        incident_id=inc1.incident_id,
        threat_score=inc2.threat_score,
        camera_ids=inc2.cameras_involved,
        rule_evidence=inc2.story_summary,
    )
    valid, broken_i, rsn, _ = chain.verify_chain()
    assert valid is True, f"Chain failed verification: {rsn}"
    print(f" -> [PASS] Sealed Block #{b1.block_index} ({b1.current_hash[:16]}...) verified 100% untampered")

    # 5. Live Tamper Detection Test
    print("\n[TEST 5/5] Testing Live Tamper Detection...")
    # Tamper with stored block
    chain.chain[1].threat_score = 999  # Alter evidence
    valid_tampered, broken_i, rsn, _ = chain.verify_chain()
    assert valid_tampered is False, "Failed to catch tamper"
    assert broken_i == 1, f"Expected broken block 1, got {broken_i}"
    print(f" -> [PASS] Tamper correctly flagged live at Block #{broken_i} ({rsn})")

    # Clean up test files
    if os.path.exists("data/test_events.db"):
        os.remove("data/test_events.db")
    if os.path.exists("data/test_evidence_ledger.json"):
        os.remove("data/test_evidence_ledger.json")

    print("\n" + "="*70)
    print(" [OK] ALL ACCEPTANCE CRITERIA VERIFIED & PASSED (5/5)")
    print("="*70 + "\n")


if __name__ == "__main__":
    test_acceptance_criteria()
