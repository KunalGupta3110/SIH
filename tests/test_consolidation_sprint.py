"""
IBVAP Sentinel — tests/test_consolidation_sprint.py

Acceptance test suite for the 4-Phase Consolidation & Feature Sprint:
  Phase 1: Real Predictive Handoff with per-camera topology transit windows.
  Phase 2: Site-Specific False Alarm Calibration with dismiss reasons.
  Phase 3: Real Camera Health heartbeats and operator-triggered fault simulation.
  Phase 4: Offline-First Event Queue buffering and reconnect-and-sync draining.
"""

from datetime import datetime, timezone
import json
import os
import sys
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from fastapi.testclient import TestClient
from backend.main import app
from backend import database, camera_topology, correlation_engine


class TestConsolidationSprint(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        database.init_database()

    def test_01_phase1_predictive_handoff_topology_windows(self):
        """Phase 1 Acceptance: Topological transit windows dynamically scaled by velocity."""
        # Check CAM_ALPHA -> CAM_BRAVO window
        window_walk = camera_topology.get_transit_window("CAM_ALPHA", "CAM_BRAVO", velocity_px_s=60.0)
        self.assertIsNotNone(window_walk)
        min_w, max_w, meta = window_walk
        self.assertEqual(min_w, 6.0)
        self.assertEqual(max_w, 14.0)
        self.assertEqual(meta["distance_m"], 26.3)

        # Check simulate-handoff endpoint
        with TestClient(app) as client:
            res = client.post("/events/simulate-handoff")
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertIn("predicted_window_min_s", data)
            self.assertIn("predicted_window_max_s", data)
            self.assertTrue(data["handoff_confirmed"])

            # Verify narrative in incidents
            inc_res = client.get("/incidents/correlated")
            self.assertEqual(inc_res.status_code, 200)
            incidents = inc_res.json()
            self.assertTrue(len(incidents) > 0)
            latest = incidents[0]
            self.assertIn("CAM_ALPHA", latest["story_summary"])
            self.assertIn("CAM_BRAVO", latest["story_summary"])

    def test_02_phase2_site_specific_calibration(self):
        """Phase 2 Acceptance: Triage dismissal with structured reasons and calibration stats."""
        with TestClient(app) as client:
            # Create a test incident
            now_str = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
            client.post("/events", json={
                "event_id": f"CALIB_EVT_{now_str}",
                "camera_id": "CAM_ALPHA",
                "alert_type": "ZONE_INTRUSION",
                "in_restricted_zone": True,
            })
            incidents = client.get("/incidents").json()
            self.assertTrue(len(incidents) > 0)
            inc_id = incidents[0]["incident_id"]

            # Dismiss with valid reason
            res_ack = client.post(f"/incidents/{inc_id}/acknowledge", json={
                "status": "DISMISSED_FP",
                "dismiss_reason": "vegetation",
            })
            self.assertEqual(res_ack.status_code, 200)
            self.assertEqual(res_ack.json()["dismiss_reason"], "vegetation")

            # Verify calibration endpoint
            res_cal = client.get("/calibration/CAM_ALPHA")
            self.assertEqual(res_cal.status_code, 200)
            cal_data = res_cal.json()
            self.assertIn("by_reason", cal_data)
            self.assertGreaterEqual(cal_data["by_reason"].get("vegetation", 0), 1)

    def test_03_phase3_camera_health_and_fault_simulation(self):
        """Phase 3 Acceptance: Camera heartbeat status and operator fault simulation."""
        with TestClient(app) as client:
            res = client.get("/cameras/health")
            self.assertEqual(res.status_code, 200)
            cams = res.json()["cameras"]
            self.assertTrue(len(cams) >= 4)

            # Trigger simulated fault
            res_fault = client.post("/cameras/CAM_BRAVO/simulate-fault")
            self.assertEqual(res_fault.status_code, 200)

            # Verify status is FAULT
            res_after = client.get("/cameras/health")
            cam_b = next(c for c in res_after.json()["cameras"] if c["camera_id"] == "CAM_BRAVO")
            self.assertEqual(cam_b["status"], "FAULT")

            # Clear fault
            client.post("/cameras/CAM_BRAVO/clear-fault")
            res_cleared = client.get("/cameras/health")
            cam_b_cleared = next(c for c in res_cleared.json()["cameras"] if c["camera_id"] == "CAM_BRAVO")
            self.assertNotEqual(cam_b_cleared["status"], "FAULT")

    def test_04_phase4_offline_first_queue_and_reconnect_sync(self):
        """Phase 4 Acceptance: Offline event queue buffering and reconnect sync draining."""
        with TestClient(app) as client:
            # 1. Toggle network off
            res_off = client.post("/network/toggle")
            self.assertEqual(res_off.status_code, 200)
            self.assertTrue(res_off.json()["simulated_down"])

            # 2. Ingest events while offline
            evt_id1 = f"OFF_1_{datetime.now(timezone.utc).timestamp()}"
            evt_id2 = f"OFF_2_{datetime.now(timezone.utc).timestamp()}"

            r1 = client.post("/events", json={"event_id": evt_id1, "camera_id": "CAM_ALPHA", "in_restricted_zone": True})
            r2 = client.post("/events", json={"event_id": evt_id2, "camera_id": "CAM_BRAVO", "in_restricted_zone": True})

            self.assertEqual(r1.json()["status"], "queued_offline")
            self.assertEqual(r2.json()["status"], "queued_offline")

            # 3. Toggle network on (reconnect & drain)
            res_on = client.post("/network/toggle")
            self.assertEqual(res_on.status_code, 200)
            self.assertFalse(res_on.json()["simulated_down"])
            self.assertGreaterEqual(res_on.json()["drained_events"], 2)


if __name__ == "__main__":
    unittest.main()
