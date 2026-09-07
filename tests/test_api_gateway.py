"""
IBVAP Sentinel — tests/test_api_gateway.py

Acceptance tests for the features wired into services/api_gateway/server.py
during the backend consolidation:
  - Topology-aware predictive handoff narrative (core.camera_topology).
  - 1-click forensic incident dossier (core.dossier).
  - Operator dismiss-reason feedback -> site calibration stats.
  - Simulated camera fault injection / clearing (core.vision.camera_health).
  - Offline-first event queue buffering and reconnect-and-drain.
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import pytest
from fastapi.testclient import TestClient

import core.backend_service as backend_service
from core.rules import site_calibration
from services.api_gateway import server as gateway


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """Every test gets its own throwaway SentinelBackend, calibration store,
    and a clean network/offline-queue state — none of it touches real
    project data (data/events.db, data/site_alert_calibration.json)."""
    test_backend = backend_service.SentinelBackend(tmp_path / "test_events.db")
    monkeypatch.setattr(backend_service, "_default_backend", test_backend)
    monkeypatch.setattr(
        site_calibration, "_calibration_engine",
        site_calibration.SiteAlertCalibrationEngine(config_path=str(tmp_path / "site_calibration.json")),
    )
    gateway.NETWORK_STATE["simulated_down"] = False
    gateway.OFFLINE_EVENT_QUEUE.clear()
    with TestClient(gateway.app) as test_client:
        yield test_client
    gateway.NETWORK_STATE["simulated_down"] = False
    gateway.OFFLINE_EVENT_QUEUE.clear()


def test_topology_aware_handoff_narrative(client):
    """Cross-camera events inside CAM_ALPHA<->CAM_BRAVO's topology window (6-14s)
    should join one incident with a predicted-vs-confirmed story narrative."""
    start = datetime.now(timezone.utc)
    client.post("/events", json={
        "event_id": "GW-ALPHA-1",
        "camera_id": "CAM_ALPHA",
        "timestamp_iso": start.isoformat(),
        "in_restricted_zone": True,
        "movement_toward_border": True,
    })
    res = client.post("/events", json={
        "event_id": "GW-BRAVO-1",
        "camera_id": "CAM_BRAVO",
        "timestamp_iso": (start + timedelta(seconds=9)).isoformat(),
        "cross_camera_reid_match": True,
    })
    incident = res.json()["incident"]
    assert incident["cameras_involved"] == ["CAM_ALPHA", "CAM_BRAVO"]
    assert "expected CAM_BRAVO arrival" in incident["story_summary"]
    assert "confirmed at" in incident["story_summary"]


def test_incident_dossier_renders_html(client):
    res = client.post("/events/simulate-handoff")
    incident_id = res.json()["events"][1]["incident"]["incident_id"]

    dossier_res = client.get(f"/incidents/{incident_id}/dossier")
    assert dossier_res.status_code == 200
    assert "text/html" in dossier_res.headers["content-type"]
    assert "SECTION 65B" in dossier_res.text
    assert incident_id in dossier_res.text
    assert "SHA-256" in dossier_res.text


def test_dossier_404_for_unknown_incident(client):
    res = client.get("/incidents/INC-DOES-NOT-EXIST/dossier")
    assert res.status_code == 404


def test_dismiss_reason_feeds_site_calibration(client):
    client.post("/events", json={
        "event_id": "GW-CALIB-1",
        "camera_id": "CAM_ALPHA",
        "alert_type": "ZONE_INTRUSION",
        "in_restricted_zone": True,
    })
    incident_id = client.get("/incidents").json()[0]["incident_id"]

    res = client.post(f"/incidents/{incident_id}/acknowledge", json={
        "status": "DISMISSED_FP",
        "dismiss_reason": "vegetation",
    })
    assert res.status_code == 200
    assert res.json()["dismiss_reason"] == "vegetation"
    assert res.json()["status"] == "DISMISSED_FP"

    cal = client.get("/calibration/CAM_ALPHA").json()
    assert cal["by_reason"]["vegetation"] >= 1
    assert cal["total_dismissed"] >= 1


def test_camera_health_fault_simulation_and_clear(client):
    health = client.get("/cameras/health").json()
    assert health["count"] >= 4
    assert any(c["camera_id"] == "CAM_BRAVO" for c in health["cameras"])

    faulted = client.post("/cameras/CAM_BRAVO/simulate-fault").json()
    assert faulted["status"] == "FAULT"

    after_fault = client.get("/cameras/health").json()
    cam_bravo = next(c for c in after_fault["cameras"] if c["camera_id"] == "CAM_BRAVO")
    assert cam_bravo["status"] == "FAULT"
    assert cam_bravo["simulated_fault"] is True

    cleared = client.post("/cameras/CAM_BRAVO/clear-fault").json()
    assert cleared["status"] == "ONLINE"

    res_unknown = client.post("/cameras/CAM_DOES_NOT_EXIST/simulate-fault")
    assert res_unknown.status_code == 404


def test_offline_queue_buffers_and_drains_on_reconnect(client):
    status = client.get("/network/status").json()
    assert status["simulated_down"] is False

    toggled_off = client.post("/network/toggle").json()
    assert toggled_off["simulated_down"] is True

    r1 = client.post("/events", json={"event_id": "GW-OFF-1", "camera_id": "CAM_ALPHA", "in_restricted_zone": True})
    r2 = client.post("/events", json={"event_id": "GW-OFF-2", "camera_id": "CAM_BRAVO", "in_restricted_zone": True})
    assert r1.json()["status"] == "queued_offline"
    assert r2.json()["status"] == "queued_offline"
    assert client.get("/network/status").json()["queued_events_count"] == 2

    # Nothing should have been correlated into an incident while offline.
    assert client.get("/incidents").json() == []

    toggled_on = client.post("/network/toggle").json()
    assert toggled_on["simulated_down"] is False
    assert toggled_on["drained_events"] == 2
    assert toggled_on["queued_events_count"] == 0

    incidents = client.get("/incidents").json()
    assert len(incidents) >= 1
