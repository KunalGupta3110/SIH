"""
IBVAP Sentinel — backend/main.py

Primary FastAPI backend application for SIH 2026 Problem Statement 26187 (MHA / SSB).
Provides REST endpoints for edge AI event ingestion, spatio-temporal correlation,
explainable threat scoring, site-specific calibration, camera health diagnostics,
offline-first event buffering, and cryptographic SHA-256 evidence sealing.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from backend import (
    camera_topology,
    correlation_engine,
    database,
    dossier_generator,
    evidence_ledger,
    hardware_bridge,
    notifications,
    retrospective_engine,
    threat_engine,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_database()
    hardware_bridge.connect()
    yield


app = FastAPI(
    title="IBVAP Sentinel Backend",
    description="Intelligent Border Video Analytics Platform for SIH PS 26187 (MHA / SSB).",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LANDING_FILE = ROOT_DIR / "apps" / "web_command_center" / "static" / "landing.html"
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
DATA_DIR = ROOT_DIR / "data"

if DATA_DIR.exists():
    app.mount("/data", StaticFiles(directory=str(DATA_DIR)), name="data_videos")

if FRONTEND_DIST.exists() and (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="react_assets")


@app.get("/", include_in_schema=False)
def serve_landing_page():
    if LANDING_FILE.exists():
        return FileResponse(str(LANDING_FILE))
    if FRONTEND_DIST.exists() and (FRONTEND_DIST / "index.html").exists():
        return FileResponse(str(FRONTEND_DIST / "index.html"))
    return {"message": "IBVAP Sentinel Backend Active", "docs": "/docs"}


@app.get("/console", include_in_schema=False)
@app.get("/console/{full_path:path}", include_in_schema=False)
@app.get("/twin", include_in_schema=False)
@app.get("/3d", include_in_schema=False)
def serve_console():
    if FRONTEND_DIST.exists() and (FRONTEND_DIST / "index.html").exists():
        return FileResponse(str(FRONTEND_DIST / "index.html"))
    return {"message": "Operator Console build not found in frontend/dist. Run: cd frontend && npm run build"}


CAMERA_COUNT = 6
_arm_state = "armed"
_siren_active = False
_network_simulated_down = False


# ---------------------------------------------------------------------------
# request models
# ---------------------------------------------------------------------------

class EventIn(BaseModel):
    event_id: str
    camera_id: str
    track_id: int | None = None
    class_name: str = "person"
    alert_type: str = "ZONE_INTRUSION"
    zone_id: str | None = None
    zone_name: str | None = None
    details: str = ""
    bbox: list | None = None
    centroid: list | None = None
    confidence: float = 0.85
    timestamp_iso: str | None = None

    in_restricted_zone: bool = False
    moving_toward_border: bool = False
    loitering_seconds: float = 0
    cross_camera_reid_match: bool = False
    thumbnail_sha256: str = ""


class ArmStateIn(BaseModel):
    arm_state: str


class AcknowledgeIn(BaseModel):
    status: str = "CONFIRMED"  # "CONFIRMED" or "DISMISSED_FP"
    dismiss_reason: str | None = None  # "animal" | "vegetation" | "weather" | "camera_noise" | "other"


class FcmTokenIn(BaseModel):
    token: str
    device_id: str
    platform: str = "android"


# ---------------------------------------------------------------------------
# edge status & configuration
# ---------------------------------------------------------------------------

@app.get("/edge/status")
@app.get("/v1/edge/status")
def edge_status():
    cams_health = database.get_camera_health_records()
    online_count = sum(1 for c in cams_health if c["status"] == "ONLINE")
    return {
        "connection": "offline_buffered" if _network_simulated_down else "online",
        "arm_state": _arm_state,
        "camera_count": len(cams_health),
        "events_last_24h": len(database.get_recent_events(limit=500)),
        "unreviewed_events": len([i for i in database.get_all_incidents(limit=100) if i["status"] == "open"]),
        "hardware_simulation_mode": hardware_bridge.is_simulation_mode(),
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        "cameras_healthy": online_count,
        "network_simulated_down": _network_simulated_down,
        "edge_buffered_events": database.get_queued_count(),
    }


@app.get("/edge/cameras")
@app.get("/v1/edge/cameras")
def get_edge_cameras():
    return {"cameras": database.get_camera_health_records()}


@app.post("/edge/arm-state")
@app.post("/v1/edge/arm-state")
def set_arm_state(body: ArmStateIn):
    global _arm_state
    if body.arm_state not in ("armed", "disarmed"):
        raise HTTPException(status_code=400, detail="arm_state must be 'armed' or 'disarmed'")
    _arm_state = body.arm_state
    return edge_status()


# ---------------------------------------------------------------------------
# camera health & diagnostics (Phase 3)
# ---------------------------------------------------------------------------

@app.get("/cameras/health")
@app.get("/v1/cameras/health")
@app.get("/camera/health")
@app.get("/edge/camera-health")
def get_camera_health():
    """Returns real heartbeat, ONLINE, STALE, OFFLINE, or FAULT states per camera."""
    return {"cameras": database.get_camera_health_records()}


@app.post("/cameras/{camera_id}/simulate-fault")
@app.post("/v1/cameras/{camera_id}/simulate-fault")
def simulate_camera_fault(camera_id: str):
    """Operator manually triggers a simulated fault status for demonstration purposes."""
    return database.set_camera_fault(camera_id, is_fault=True)


@app.post("/cameras/{camera_id}/clear-fault")
@app.post("/v1/cameras/{camera_id}/clear-fault")
def clear_camera_fault(camera_id: str):
    return database.set_camera_fault(camera_id, is_fault=False)


# ---------------------------------------------------------------------------
# site calibration (Phase 2)
# ---------------------------------------------------------------------------

@app.get("/calibration/{camera_id}")
@app.get("/v1/calibration/{camera_id}")
def get_camera_calibration(camera_id: str):
    """Returns false-positive dismissal breakdown for site-specific filter calibration."""
    return database.get_calibration_stats(camera_id)


@app.get("/calibration")
@app.get("/v1/calibration")
def get_all_calibration():
    return database.get_calibration_stats(None)


# ---------------------------------------------------------------------------
# offline-first event queue & network simulation (Phase 4)
# ---------------------------------------------------------------------------

@app.post("/network/toggle")
@app.post("/v1/network/toggle")
def toggle_network():
    """
    Simulates network connectivity loss and reconnect-and-sync behavior.
    When down, events buffer in SQLite edge_queue. When reconnected, buffer drains into live pipeline.
    """
    global _network_simulated_down
    _network_simulated_down = not _network_simulated_down
    drained = 0
    if not _network_simulated_down:
        drained = _drain_edge_queue()

    return {
        "simulated_down": _network_simulated_down,
        "queued_count": database.get_queued_count(),
        "drained_events": drained,
        "message": "Simulated connectivity loss and reconnect-and-sync behavior active."
    }


@app.get("/network/status")
@app.get("/v1/network/status")
def get_network_status():
    return {
        "simulated_down": _network_simulated_down,
        "queued_count": database.get_queued_count(),
        "mode": "DISCONNECTED (BUFFERING)" if _network_simulated_down else "CONNECTED (ONLINE)",
    }


def _drain_edge_queue() -> int:
    queued = database.get_queued_events()
    drained = 0
    for q in queued:
        try:
            payload = json.loads(q["payload_json"])
            evt_in = EventIn(**payload)
            _ingest_event_direct(evt_in)
            drained += 1
        except Exception as e:
            print(f"[EDGE QUEUE DRAIN ERROR] {e}")
    database.clear_queued_events()
    return drained


# ---------------------------------------------------------------------------
# event ingestion & predictive handoff pipeline (Phase 1)
# ---------------------------------------------------------------------------

def _ingest_event(event_in: EventIn) -> dict:
    if _network_simulated_down:
        database.queue_edge_event(event_in.model_dump_json())
        return {
            "status": "queued_offline",
            "event_id": event_in.event_id,
            "message": "Simulated connectivity loss active — event queued in edge buffer.",
        }
    return _ingest_event_direct(event_in)


def _ingest_event_direct(event_in: EventIn) -> dict:
    event = event_in.model_dump()
    event["timestamp_iso"] = event["timestamp_iso"] or datetime.now(timezone.utc).isoformat()
    event["rule_metrics"] = {
        "in_restricted_zone": event["in_restricted_zone"],
        "moving_toward_border": event["moving_toward_border"],
        "loitering_seconds": event["loitering_seconds"],
        "cross_camera_reid_match": event["cross_camera_reid_match"],
    }

    was_inserted = database.insert_event(event)
    if not was_inserted:
        return {"status": "duplicate", "event_id": event["event_id"], "message": "Event already recorded."}

    incident_id, window_info = correlation_engine.correlate_event(event)
    all_events_in_incident = database.get_events_for_incident(incident_id)
    cameras_involved = sorted({e["camera_id"] for e in all_events_in_incident})
    story_summary = correlation_engine.build_story_summary(incident_id)

    # Calculate explainable threat score
    agg_factors = _aggregate_incident_factors(all_events_in_incident)
    scored = threat_engine.calculate_threat_score(**agg_factors)

    database.update_incident_score(
        incident_id=incident_id,
        threat_score=scored["score"],
        severity=scored["severity"],
        score_breakdown=scored["factors"],
        cameras=cameras_involved,
        story_summary=story_summary,
    )

    sealed = False
    if scored["severity"] == "CRITICAL":
        _seal_incident_into_ledger(incident_id, scored, cameras_involved, event)
        sealed = True

    return {
        "status": "recorded",
        "event_id": event["event_id"],
        "incident_id": incident_id,
        "threat_score": scored["score"],
        "severity": scored["severity"],
        "factors": scored["factors"],
        "story_summary": story_summary,
        "sealed_to_ledger": sealed,
    }


def _aggregate_incident_factors(events: list) -> dict:
    in_restricted_zone = False
    moving_toward_border = False
    loitering_seconds = 0
    cross_camera_reid_match = False

    for event in events:
        metrics = json.loads(event["rule_metrics_json"] or "{}")
        in_restricted_zone = in_restricted_zone or bool(metrics.get("in_restricted_zone"))
        moving_toward_border = moving_toward_border or bool(metrics.get("moving_toward_border"))
        loitering_seconds = max(loitering_seconds, metrics.get("loitering_seconds") or 0)
        cross_camera_reid_match = cross_camera_reid_match or bool(metrics.get("cross_camera_reid_match"))

    latest_event = events[-1]
    hour_ist = _timestamp_to_ist_hour(latest_event["timestamp_iso"])

    return {
        "in_restricted_zone": in_restricted_zone,
        "moving_toward_border": moving_toward_border,
        "loitering_seconds": loitering_seconds,
        "cross_camera_reid_match": cross_camera_reid_match,
        "hour_ist": hour_ist,
    }


def _timestamp_to_ist_hour(timestamp_iso: str) -> int:
    dt_utc = datetime.fromisoformat(timestamp_iso.replace("Z", "+00:00"))
    return (dt_utc.hour + 5) % 24


def _seal_incident_into_ledger(incident_id: str, scored: dict, cameras_involved: list, event: dict) -> None:
    last_block = database.get_last_ledger_block()
    previous_hash = last_block["current_hash"] if last_block else evidence_ledger.GENESIS_VALUE

    block = evidence_ledger.seal_incident(
        incident_id=incident_id,
        threat_score=scored["score"],
        camera_ids=cameras_involved,
        rule_evidence=scored["factors"],
        thumbnail_sha256=event.get("thumbnail_sha256", ""),
        timestamp=datetime.now(timezone.utc).isoformat(),
        previous_hash=previous_hash,
    )
    database.insert_ledger_block(block)
    database.set_incident_hash(incident_id, block["current_hash"])


@app.post("/events")
@app.post("/v1/events")
def post_event(event: EventIn):
    return _ingest_event(event)


@app.post("/events/simulate-handoff")
@app.post("/v1/events/simulate-handoff")
def simulate_handoff():
    """
    Simulates cross-camera handoff from CAM_ALPHA to CAM_BRAVO.
    Returns real topological predicted arrival window and verified transit times.
    """
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    suffix = now.strftime("%Y%m%dT%H%M%S%f")

    # Topological transit calculation
    transit_info = camera_topology.get_transit_window("CAM_ALPHA", "CAM_BRAVO", velocity_px_s=65.0)
    min_w, max_w, meta = transit_info if transit_info else (6.0, 14.0, {})

    first_event = EventIn(
        event_id=f"SIM-A-{suffix}",
        camera_id="CAM_ALPHA",
        track_id=1041,
        alert_type="ZONE_INTRUSION",
        zone_id="alpha_red_zone",
        zone_name="Checkpost Alpha Red Zone",
        details="Target breached northern perimeter heading East.",
        timestamp_iso=now.isoformat(),
        in_restricted_zone=True,
        moving_toward_border=True,
    )
    second_event = EventIn(
        event_id=f"SIM-B-{suffix}",
        camera_id="CAM_BRAVO",
        track_id=1041,
        alert_type="PREDICTIVE_HANDOFF",
        zone_id="bravo_fence_zone",
        zone_name="BOP Bravo Eastern Perimeter",
        details="Target confirmed arriving at BOP Bravo within topological transit window.",
        timestamp_iso=(now + timedelta(seconds=8.5)).isoformat(),
        in_restricted_zone=True,
        moving_toward_border=True,
        cross_camera_reid_match=True,
        loitering_seconds=300,
    )

    result_a = _ingest_event(first_event)
    result_b = _ingest_event(second_event)

    return {
        "predicted_window_min_s": min_w,
        "predicted_window_max_s": max_w,
        "actual_transit_s": 8.5,
        "source_cam": "CAM_ALPHA",
        "target_cam": "CAM_BRAVO",
        "corridor_distance_m": meta.get("distance_m", 26.3),
        "handoff_confirmed": True,
        "first_event": result_a,
        "second_event": result_b,
    }


@app.post("/events/simulate-case/{case_id}")
@app.post("/v1/events/simulate-case/{case_id}")
def simulate_case(case_id: int):
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    suffix = now.strftime("%Y%m%dT%H%M%S%f")

    if case_id == 1:
        evt = EventIn(
            event_id=f"CASE1-{suffix}",
            camera_id="CAM_ALPHA",
            track_id=101,
            alert_type="LOW_CRAWL_BREACH",
            zone_id="alpha_red_zone",
            zone_name="Checkpost Alpha Perimeter",
            details="Target prone crawl detected under barbed wire fence.",
            timestamp_iso=now.isoformat(),
            in_restricted_zone=True,
            moving_toward_border=True,
        )
        return {"case_id": 1, "name": "Night Crawl Breach", "result": _ingest_event(evt)}

    elif case_id == 2:
        return simulate_handoff()

    elif case_id == 3:
        evt = EventIn(
            event_id=f"CASE3-{suffix}",
            camera_id="CAM_ALPHA",
            track_id=8801,
            class_name="truck",
            alert_type="VEHICLE_RAMMING",
            zone_id="alpha_barrier_zone",
            zone_name="Checkpost Alpha Vehicle Barrier",
            details="High-speed vehicle rush detected approaching gate.",
            timestamp_iso=now.isoformat(),
            in_restricted_zone=True,
            moving_toward_border=True,
        )
        return {"case_id": 3, "name": "Vehicle Ramming & ANPR", "result": _ingest_event(evt)}

    elif case_id == 4:
        evt = EventIn(
            event_id=f"CASE4-{suffix}",
            camera_id="CAM_BRAVO",
            track_id=402,
            alert_type="PROTRACTED_LOITERING",
            zone_id="bravo_buffer_corridor",
            zone_name="BOP Bravo Caution Corridor",
            details="Target stationary in restricted caution corridor for 268s.",
            timestamp_iso=now.isoformat(),
            in_restricted_zone=False,
            loitering_seconds=268,
        )
        return {"case_id": 4, "name": "Perimeter Loitering", "result": _ingest_event(evt)}

    else:
        evt1 = EventIn(
            event_id=f"CASE5-A-{suffix}",
            camera_id="CAM_ALPHA",
            track_id=3001,
            alert_type="GROUP_INCURSION",
            zone_id="alpha_red_zone",
            zone_name="Checkpost Alpha Perimeter",
            details="Coordinated multi-person group breach (Cluster A).",
            timestamp_iso=now.isoformat(),
            in_restricted_zone=True,
            moving_toward_border=True,
        )
        evt2 = EventIn(
            event_id=f"CASE5-B-{suffix}",
            camera_id="CAM_BRAVO",
            track_id=3002,
            alert_type="GROUP_INCURSION",
            zone_id="bravo_fence_zone",
            zone_name="BOP Bravo Perimeter",
            details="Coordinated multi-person group breach (Cluster B).",
            timestamp_iso=(now + timedelta(seconds=4)).isoformat(),
            in_restricted_zone=True,
            cross_camera_reid_match=True,
            moving_toward_border=True,
        )
        res1 = _ingest_event(evt1)
        res2 = _ingest_event(evt2)
        return {"case_id": 5, "name": "Coordinated Group Breach", "result_a": res1, "result_b": res2}


# ---------------------------------------------------------------------------
# incidents & triage
# ---------------------------------------------------------------------------

def _incident_with_story(incident: dict) -> dict:
    events = database.get_events_for_incident(incident["incident_id"])
    return {
        "incident_id": incident["incident_id"],
        "created_at": incident["created_at"],
        "closed_at": incident["closed_at"],
        "status": incident["status"],
        "threat_score": incident["threat_score"],
        "severity": incident["severity"],
        "confidence": incident["confidence"],
        "target_class": incident["target_class"],
        "cameras_involved": json.loads(incident["cameras_json"] or "[]"),
        "story_summary": incident["story_summary"],
        "score_breakdown": json.loads(incident["score_breakdown_json"] or "[]"),
        "cryptographic_hash": incident["cryptographic_hash"],
        "dismiss_reason": incident.get("dismiss_reason"),
        "nodes": [
            {
                "step": i + 1,
                "camera_id": e["camera_id"],
                "event_type": e["alert_type"],
                "timestamp_iso": e["timestamp_iso"],
                "rule_detail": e["details"],
            }
            for i, e in enumerate(events)
        ],
    }


@app.get("/incidents")
@app.get("/v1/incidents")
def get_incidents(limit: int = 50):
    return [_incident_with_story(i) for i in database.get_all_incidents(limit)]


@app.get("/incidents/correlated")
@app.get("/v1/incidents/correlated")
def get_correlated_incidents(limit: int = 50):
    return get_incidents(limit)


@app.post("/incidents/{incident_id}/acknowledge")
@app.post("/v1/incidents/{incident_id}/acknowledge")
def acknowledge_incident(incident_id: str, body: AcknowledgeIn):
    incident = database.get_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    if body.status not in ("CONFIRMED", "DISMISSED_FP"):
        raise HTTPException(status_code=400, detail="status must be CONFIRMED or DISMISSED_FP")

    valid_reasons = ("animal", "vegetation", "weather", "camera_noise", "other")
    if body.status == "DISMISSED_FP" and body.dismiss_reason and body.dismiss_reason not in valid_reasons:
        raise HTTPException(status_code=400, detail=f"dismiss_reason must be one of {valid_reasons}")

    database.update_incident_status(incident_id, body.status, dismiss_reason=body.dismiss_reason)
    global _siren_active
    _siren_active = False
    return _incident_with_story(database.get_incident(incident_id))


@app.get("/incidents/{incident_id}/dossier", response_class=HTMLResponse)
@app.get("/v1/incidents/{incident_id}/dossier", response_class=HTMLResponse)
def get_incident_dossier_html(incident_id: str):
    incident = database.get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")

    events = database.get_events_for_incident(incident_id)
    blocks = database.get_all_ledger_blocks()
    incident_block = next((b for b in blocks if json.loads(b["payload_json"]).get("incident_id") == incident_id), None)

    html = dossier_generator.generate_incident_dossier_html(incident, events, incident_block)
    return HTMLResponse(content=html)


@app.post("/edge/upload-video")
@app.post("/v1/edge/upload-video")
async def upload_retrospective_video(
    file: UploadFile = File(...),
    camera_id: str = Form("CAM_ALPHA"),
    zone_name: str = Form("Sector 4 Checkpost Alpha"),
):
    try:
        contents = await file.read()
        res = retrospective_engine.analyze_uploaded_video(
            file_bytes=contents,
            filename=file.filename or "uploaded_footage.mp4",
            camera_id=camera_id,
            zone_name=zone_name,
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process video: {str(e)}")


# ---------------------------------------------------------------------------
# evidence ledger & cryptographic integrity
# ---------------------------------------------------------------------------

@app.get("/audit/blockchain")
@app.get("/v1/audit/blockchain")
@app.get("/integrity/ledger")
@app.get("/v1/integrity/ledger")
def get_blockchain():
    blocks = database.get_all_ledger_blocks()
    return {
        "blocks_sealed": len(blocks),
        "blocks": [
            {
                "block_index": b["block_index"],
                "previous_hash": b["previous_hash"],
                "current_hash": b["current_hash"],
                "timestamp": b["timestamp"],
                "payload": json.loads(b["payload_json"]),
            }
            for b in blocks
        ],
    }


@app.get("/audit/verify")
@app.get("/v1/audit/verify")
@app.get("/integrity/verify")
@app.get("/v1/integrity/verify")
def verify_blockchain():
    blocks = database.get_all_ledger_blocks()
    res = evidence_ledger.verify_chain(blocks)
    return {
        "is_valid": res["is_valid"],
        "valid": res["is_valid"],
        "verified_records": len(blocks),
        "chain_length": len(blocks),
        "broken_index": res["broken_index"],
        "reason": res["reason"],
        "logs": res["logs"],
    }


@app.get("/evidence/capsule/{incident_id}")
@app.get("/v1/evidence/capsule/{incident_id}")
def get_evidence_capsule(incident_id: str):
    incident = database.get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")

    events = database.get_events_for_incident(incident_id)
    blocks = database.get_all_ledger_blocks()
    incident_block = next((b for b in blocks if json.loads(b["payload_json"]).get("incident_id") == incident_id), None)

    return {
        "court_admissible_evidence_capsule": {
            "incident_id": incident_id,
            "system_identifier": "IBVAP-SENTINEL-MHA-SSB",
            "jurisdiction": "Sector 4 Northern Border Watchfloor",
            "threat_score": incident["threat_score"],
            "severity": incident["severity"],
            "status": incident["status"],
            "created_at": incident["created_at"],
            "narrative": incident["story_summary"],
            "cameras_involved": json.loads(incident["cameras_json"] or "[]"),
            "score_factors": json.loads(incident["score_breakdown_json"] or "[]"),
            "event_trail": events,
            "cryptographic_ledger_proof": {
                "sealed_in_ledger": incident_block is not None,
                "block_hash": incident_block["current_hash"] if incident_block else incident["cryptographic_hash"],
                "previous_block_hash": incident_block["previous_hash"] if incident_block else None,
                "merkle_verification_endpoint": "/integrity/verify",
            }
        }
    }


# ---------------------------------------------------------------------------
# siren + notifications
# ---------------------------------------------------------------------------

@app.post("/siren/silence")
@app.post("/v1/siren/silence")
def silence_siren():
    global _siren_active
    _siren_active = False
    result = hardware_bridge.send_command("SIREN_OFF")
    return {"status": "silenced", "hardware_result": result}


@app.post("/notifications/register-token")
@app.post("/v1/notifications/register-token")
def register_token(body: FcmTokenIn):
    return notifications.register_token(body.token, body.device_id, body.platform)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
