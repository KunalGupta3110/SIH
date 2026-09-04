"""
IBVAP Sentinel — tests/test_dossier.py
Unit tests for Forensic Incident Dossier HTML rendering and Retrospective Upload Analysis.
"""

import sys
from pathlib import Path
import unittest

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend import database, dossier_generator, retrospective_engine, evidence_ledger


class TestDossierAndUpload(unittest.TestCase):

    def setUp(self):
        database.init_database()

    def test_dossier_generation(self):
        inc = {
            "incident_id": "INC-TEST-99",
            "threat_score": 85,
            "severity": "CRITICAL",
            "status": "CONFIRMED",
            "created_at": "2026-09-04T22:00:00Z",
            "story_summary": "Target tracked CAM_ALPHA -> CAM_BRAVO in 8s.",
            "cameras_json": '["CAM_ALPHA", "CAM_BRAVO"]',
            "score_breakdown_json": '[{"factor": "Red Zone", "points": 30, "reason": "Centroid in polygon"}]',
            "cryptographic_hash": "a1b2c3d4e5f6",
        }
        events = [
            {"camera_id": "CAM_ALPHA", "alert_type": "ZONE_ENTRY", "timestamp_iso": "2026-09-04T22:00:00Z", "details": "Red zone breach"},
            {"camera_id": "CAM_BRAVO", "alert_type": "PREDICTIVE_HANDOFF", "timestamp_iso": "2026-09-04T22:00:08Z", "details": "Arrival confirmed"},
        ]
        block = {
            "current_hash": "blockhash123",
            "previous_hash": evidence_ledger.GENESIS_VALUE,
            "data_hash": "datahash456",
        }
        html = dossier_generator.generate_incident_dossier_html(inc, events, block)
        self.assertIn("SECTION 65B", html)
        self.assertIn("INC-TEST-99", html)
        self.assertIn("SHA-256", html)
        self.assertIn("blockhash123", html)

    def test_retrospective_upload_analysis(self):
        sample_video_path = ROOT_DIR / "data" / "cross_cam_real_demo_web.mp4"
        if sample_video_path.exists():
            with open(sample_video_path, "rb") as f:
                content = f.read()
            
            res = retrospective_engine.analyze_uploaded_video(
                file_bytes=content,
                filename="test_upload.mp4",
                camera_id="CAM_ALPHA"
            )
            self.assertEqual(res["status"], "success")
            self.assertIn("incident_id", res)
            self.assertIn("sealed_block_hash", res["analysis_results"])


if __name__ == "__main__":
    unittest.main()
