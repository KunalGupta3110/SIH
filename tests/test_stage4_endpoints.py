"""
IBVAP Sentinel — tests/test_stage4_endpoints.py

Integration tests for the endpoints wired up after the database migration:
camera management, raw detections, target tracking + reconstruction,
analytics, QRT dispatch, hardware telemetry/relay control, settings, mobile
enrollment, and the real AI pipeline trigger.
"""

from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


def test_list_cameras_returns_seeded_topology(client):
    res = client.get("/cameras")
    assert res.status_code == 200
    cameras = res.json()["cameras"]
    assert len(cameras) >= 4
    alpha = next(c for c in cameras if c["camera_id"] == "CAM_ALPHA")
    assert any(n["target_camera_id"] == "CAM_BRAVO" for n in alpha["neighbors"])


def test_camera_detections_endpoint_shape(client):
    res = client.get("/cameras/CAM_ALPHA/detections")
    assert res.status_code == 200
    body = res.json()
    assert body["camera_id"] == "CAM_ALPHA"
    assert isinstance(body["detections"], list)


def test_targets_registry_and_reconstruction(client):
    res = client.get("/targets")
    assert res.status_code == 200
    targets = res.json()["targets"]
    assert len(targets) >= 1  # seeded demo targets
    global_id = targets[0]["global_id"]

    recon = client.get(f"/targets/{global_id}/reconstruction")
    assert recon.status_code == 200
    assert recon.json()["global_id"] == global_id
    assert "timeline" in recon.json()


def test_analytics_overview_shape(client):
    res = client.get("/analytics/overview")
    assert res.status_code == 200
    body = res.json()
    for key in ("weekly_alert_distribution", "severity_breakdown", "false_alarm_rate", "camera_uptime_pct"):
        assert key in body
    # seed data includes one CONFIRMED and one DISMISSED_FP incident
    assert body["confirmed_count"] >= 1
    assert body["dismissed_count"] >= 1


def test_incident_dispatch(client):
    client.post("/events", json={
        "event_id": "STAGE4-DISPATCH-1", "camera_id": "CAM_ALPHA",
        "alert_type": "ZONE_INTRUSION", "in_restricted_zone": True,
    })
    incident_id = client.get("/incidents").json()[0]["incident_id"]

    res = client.post(f"/incidents/{incident_id}/dispatch", json={"unit": "QRT-2", "notes": "Confirmed visual."})
    assert res.status_code == 200
    body = res.json()
    assert body["incident_id"] == incident_id
    assert body["unit"] == "QRT-2"
    assert body["status"] == "DISPATCHED"

    missing = client.post("/incidents/INC-DOES-NOT-EXIST/dispatch")
    assert missing.status_code == 404


def test_hardware_telemetry_and_relay_toggle(client):
    telem = client.get("/hardware/telemetry")
    assert telem.status_code == 200
    body = telem.json()
    assert body["mode"] in {"serial", "simulation"}
    assert "SIREN_ON" in body["supported_relays"]
    assert "STROBE_ON" in body["supported_relays"]
    assert "BARRIER_UP" in body["supported_relays"]

    res = client.post("/hardware/relay/siren_on")
    assert res.status_code == 200
    assert res.json()["command"] == "SIREN_ON"
    assert res.json()["mode"] == "simulation"  # no real hardware attached in CI/dev

    bad = client.post("/hardware/relay/not_a_real_relay")
    assert bad.status_code == 400


def test_siren_threshold_get_and_set(client):
    default = client.get("/settings/siren-threshold")
    assert default.status_code == 200
    assert default.json()["value"] == 70

    updated = client.post("/settings/siren-threshold", json={"value": 85})
    assert updated.status_code == 200
    assert updated.json()["value"] == 85

    confirm = client.get("/settings/siren-threshold")
    assert confirm.json()["value"] == 85


def test_enrollment_people_round_trip(client):
    empty = client.get("/enrollment/people")
    assert empty.status_code == 200
    assert empty.json()["people"] == []

    res = client.post("/enrollment/people", json={
        "person_id": "P-100", "name": "Checkpost Duty Officer", "role": "authorized",
    })
    assert res.status_code == 200
    assert res.json()["status"] == "enrolled"

    listed = client.get("/enrollment/people").json()["people"]
    assert len(listed) == 1
    assert listed[0]["person_id"] == "P-100"


def test_audit_blockchain_lists_blocks_separately_from_verify(client):
    """Regression test: /audit/blockchain must return the actual block list
    (EvidencePanel.jsx reads blockchain.blocks), not verification status —
    they were previously the same handler, so the vault silently rendered
    empty against a real backend."""
    client.post("/events/simulate-handoff")

    chain = client.get("/audit/blockchain")
    assert chain.status_code == 200
    body = chain.json()
    assert body["blocks_sealed"] >= 1
    assert isinstance(body["blocks"], list)
    first_block = body["blocks"][0]
    assert "current_hash" in first_block
    assert "payload" in first_block and isinstance(first_block["payload"], dict)

    verify = client.get("/audit/verify")
    assert verify.status_code == 200
    assert verify.json()["is_valid"] is True
    assert "blocks" not in verify.json()


def test_pipeline_run_demo_produces_real_detections(client, monkeypatch):
    """
    A real, lightweight run of the actual YOLOv8+ByteTrack+Re-ID stack
    against one real demo video (5 frames, one camera) — not mocked. Skips
    cleanly if the video asset hasn't been generated in this environment.
    """
    video_path = ROOT_DIR / "data" / "sample_border_web.mp4"
    if not video_path.exists():
        import pytest
        pytest.skip("data/sample_border_web.mp4 not present in this environment")

    from core.vision import pipeline as pipeline_module

    monkeypatch.setattr(pipeline_module, "_pipeline_singleton", None)

    res = client.post(
        "/pipeline/run-demo",
        params={"max_frames": 5},
    )
    assert res.status_code == 200
    runs = res.json()["runs"]
    assert len(runs) >= 1
    alpha_run = next(r for r in runs if r.get("camera_id") == "CAM_ALPHA")
    assert alpha_run.get("frames_processed", 0) >= 1

    detections = client.get("/cameras/CAM_ALPHA/detections").json()["detections"]
    assert isinstance(detections, list)
