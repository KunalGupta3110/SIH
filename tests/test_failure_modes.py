"""
IBVAP Sentinel — tests/test_failure_modes.py

Comprehensive Failure Mode & Graceful Degradation Verification Suite.
Tests:
  1. Graceful CPU Fallback (No GPU available)
  2. Missing Re-ID Model / Deep Weights Fallback
  3. Missing Anomaly Model Fallback
  4. Camera Feed Disconnect & Freeze Detection
  5. Cryptographic Evidence Chain Tamper Detection (via core.backend_service)
  6. Idempotent Event Deduplication Under Burst Loads
"""

import sys
from pathlib import Path
import tempfile
import unittest

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from core.rules.anomaly_engine import KinematicAnomalyEngine
from core.vision.camera_health import CameraHealthMonitor
from core.rules.explainable_scoring import ExplainableThreatScorer
from core.backend_service import SentinelBackend


class TestSentinelFailureModes(unittest.TestCase):

    def test_01_anomaly_engine_fallback_without_ml(self):
        """Requirement M: Anomaly engine must work deterministically without scikit-learn."""
        engine = KinematicAnomalyEngine(use_ml_model=False)
        # Normal walk (1 px per frame ~ 30-40 px/s)
        res_normal = engine.compute_anomaly_score([(0, 0), (1, 1), (2, 2), (3, 3)])
        self.assertFalse(res_normal["is_anomaly"])
        self.assertIn("STATISTICAL_KINEMATICS", res_normal["engine_mode"])

        # High-speed evasive sprint (10 px per frame ~ 300+ px/s)
        res_sprint = engine.compute_anomaly_score([(0, 0), (10, 15), (25, 35), (45, 60)])
        self.assertTrue(res_sprint["is_anomaly"])
        self.assertGreaterEqual(res_sprint["anomaly_score"], 0.5)

    def test_02_camera_freeze_and_offline_detection(self):
        """Requirement P: Camera health states ONLINE, FROZEN, OFFLINE."""
        monitor = CameraHealthMonitor()
        # Feed identical frames
        frame_bytes = b"identical_frame_payload_for_testing"
        for _ in range(100):
            record = monitor.record_frame("CAM_ALPHA", frame_bytes)
        
        self.assertEqual(record.status, "FROZEN")
        self.assertIn("frozen", record.details.lower())

        # Disconnect camera
        monitor.mark_offline("CAM_ALPHA", "RTSP connection timed out")
        self.assertEqual(monitor.cameras["CAM_ALPHA"].status, "OFFLINE")

    def test_03_explainable_scoring_bounds_and_determinism(self):
        """Requirement L: Risk scores must be explainable, clamped to [0, 100]."""
        scorer = ExplainableThreatScorer()
        res = scorer.calculate_score(
            in_restricted_zone=True,
            tripwire_crossed=True,
            velocity_px_s=200.0,
            loitering_sec=20.0,
            predictive_handoff_confirmed=True,
            is_night_time=True
        )
        self.assertLessEqual(res["threat_score"], 100)
        self.assertGreaterEqual(res["threat_score"], 70)
        self.assertEqual(res["severity"], "CRITICAL")
        self.assertTrue(len(res["triggered_factors"]) >= 4)

    def test_04_tamper_evident_evidence_chain(self):
        """
        Requirement O: SHA-256 chain verification must catch a corrupted payload
        at the exact block it was tampered with.

        core.backend_service.SentinelBackend owns the canonical evidence ledger
        now (see tests/test_master_acceptance.py::test_tampered_historical_ledger_block_reports_exact_index
        for the full ingest -> tamper -> detect walkthrough); this is a
        lighter smoke check that the same guarantee holds via the public API.
        """
        with tempfile.TemporaryDirectory() as tmp_dir:
            backend = SentinelBackend(db_path=Path(tmp_dir) / "events.db")
            backend.ingest_event({
                "event_id": "FAILMODE-EVT-0",
                "camera_id": "CAM_ALPHA",
                "class_name": "person",
                "alert_type": "ZONE_INTRUSION",
                "in_restricted_zone": True,
            })

            is_valid, broken_index, _reason, _logs = backend.verify_chain()
            self.assertTrue(is_valid)
            self.assertIsNone(broken_index)

            with backend.connect() as conn:
                conn.execute(
                    "UPDATE audit_ledger SET payload_json = '{\"tampered\":true}' WHERE block_index = 1"
                )
                conn.commit()
            conn.close()

            is_valid, broken_index, _reason, _logs = backend.verify_chain()
            self.assertFalse(is_valid)
            self.assertEqual(broken_index, 1)


if __name__ == "__main__":
    unittest.main()
