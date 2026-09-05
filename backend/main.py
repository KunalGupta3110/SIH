"""
IBVAP - Intelligent Border Video Analytics Platform
Module: backend/main.py
Description: FastAPI central API server for aggregating camera events,
             serving cross-camera Re-ID ledgers, zone configurations,
             and statistics to command dashboards.
"""

from datetime import datetime, timezone 
import json
import os
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from alerts.events import EventDatabase
from alerts.zones import Zone, ZoneManager
from core.backend_service import get_backend
from services.hardware_bridge.serial_controller import get_hardware_controller

app = FastAPI(
    title="IBVAP - Intelligent Border Video Analytics Platform API",
    version="1.0.0",
    description="Central surveillance API for Sashastra Seema Bal (SSB) Border Surveillance MVP",
)

# Enable CORS for frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db = EventDatabase("data/events.db")
zone_manager = ZoneManager("data/zones_config.json" if os.path.exists("data/zones_config.json") else None)

# Serve thumbnail assets if available
THUMBNAIL_DIR = "data/thumbnails"
os.makedirs(THUMBNAIL_DIR, exist_ok=True)


@app.get("/")
def get_system_status():
    """System health check & operational status."""
    return {
        "system": "IBVAP - Intelligent Border Video Analytics Platform",
        "ps_id": "26187",
        "organization": "Ministry of Home Affairs / SSB",
        "status": "OPERATIONAL",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "modules": {
            "detection": "YOLOv8n (CPU/GPU)",
            "tracking": "ByteTrack",
            "alerts": "Polygon Zones + Virtual Tripwires",
            "reid": "Cross-Camera ResNet18 Multi-Shot Embeddings",
        }
    }


@app.get("/api/alerts")
def get_security_alerts(
    limit: int = Query(50, ge=1, le=500),
    camera_id: Optional[str] = None,
    severity: Optional[str] = None,
):
    """Fetch security alerts with optional filtering by camera or severity."""
    events = db.get_recent_events(limit=limit, camera_id=camera_id, severity=severity)
    return {"total": len(events), "events": events}


@app.get("/api/zones/{camera_id}")
def get_camera_zones(camera_id: str):
    """Retrieve all polygon and tripwire zones for a specific camera."""
    zones = zone_manager.get_zones(camera_id)
    return {"camera_id": camera_id, "zones": [z.to_dict() for z in zones]}


@app.get("/api/reid/tracks")
def get_cross_camera_tracks():
    """Retrieve stitched global target movements across cameras."""
    ledger_path = "data/cross_camera_ledger.json"
    if os.path.exists(ledger_path):
        try:
            with open(ledger_path, "r") as f:
                return json.load(f)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read Re-ID ledger: {str(e)}")
    return {"total_global_targets": 0, "targets": []}


@app.get("/api/stats")
def get_surveillance_stats():
    """Returns real-time overview metrics for the command dashboard."""
    all_events = db.get_recent_events(limit=1000)
    critical_count = sum(1 for e in all_events if e.get("severity") == "CRITICAL")
    warning_count = sum(1 for e in all_events if e.get("severity") == "WARNING")
    
    unique_cams = list({e.get("camera_id") for e in all_events if e.get("camera_id")})
    
    return {
        "total_alerts": len(all_events),
        "critical_intrusions": critical_count,
        "warnings": warning_count,
        "active_cameras": len(unique_cams) if unique_cams else 2,
        "camera_ids": unique_cams or ["cam_01", "cam_02"],
        "system_status": "ACTIVE_MONITORING",
    }


@app.get("/api/thumbnails/{image_name}")
def get_event_thumbnail(image_name: str):
    """Serve cropped event thumbnail image."""
    img_path = os.path.join(THUMBNAIL_DIR, image_name)
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(img_path, media_type="image/jpeg")


@app.post("/api/events/run-live-inference")
@app.post("/events/run-live-inference")
def run_live_inference_api():
    """Execute live YOLOv8 inference and ingest incident."""
    from backend.live_inference import run_live_yolo_inference
    try:
        result = run_live_yolo_inference()
        return {"ok": True, **result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/events/run-real-reid")
@app.post("/events/run-real-reid")
def run_real_reid_api():
    """Execute or retrieve authentic 2-camera Re-ID model inference telemetry."""
    from backend.live_inference import run_live_reid_inference
    try:
        result = run_live_reid_inference()
        return {"ok": True, **result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/events/real-reid-telemetry")
@app.get("/events/real-reid-telemetry")
def get_real_reid_telemetry_api():
    """Return precomputed real Re-ID telemetry log."""
    telemetry_path = ROOT_DIR / "data" / "demo_footage" / "ibvap_real_reid_telemetry.json"
    if not telemetry_path.exists():
        raise HTTPException(status_code=404, detail="Re-ID telemetry not found")
    with open(telemetry_path, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Persistent Siren Silence State & Edge Control (Phase 4 Bug Fix)
# ---------------------------------------------------------------------------
SILENCED_STATE_FILE = ROOT_DIR / "data" / "silenced_incidents.json"
CURRENT_ARM_STATE = {"arm_state": "armed"}

def _load_silenced_incidents() -> set[str]:
    if SILENCED_STATE_FILE.exists():
        try:
            with open(SILENCED_STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return set(data)
        except Exception:
            pass
    return set()

def _save_silenced_incidents(ids: set[str]) -> None:
    try:
        SILENCED_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(SILENCED_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(sorted(list(ids)), f, indent=2)
    except Exception as e:
        print(f"[IBVAP] Failed to save silenced incident state: {e}")

silenced_incident_ids: set[str] = _load_silenced_incidents()

def is_siren_active() -> bool:
    """True if there is an unacknowledged critical incident that has NOT been silenced."""
    try:
        backend = get_backend()
        incidents = backend.get_incidents()
        for inc in incidents:
            if inc.get("severity") == "CRITICAL" and inc.get("status") not in {"CONFIRMED", "DISMISSED_FP"}:
                inc_id = inc.get("incident_id")
                if inc_id and inc_id not in silenced_incident_ids:
                    return True
    except Exception as e:
        print(f"[IBVAP Siren] Error checking active critical alerts: {e}")
    return False

class ArmStateRequest(BaseModel):
    arm_state: str = "armed"

class AcknowledgeRequest(BaseModel):
    status: str = "CONFIRMED"
    notes: Optional[str] = None
    dismiss_reason: Optional[str] = None

@app.get("/edge/status")
@app.get("/api/edge/status")
@app.get("/v1/edge/status")
def get_edge_status_api():
    backend = get_backend()
    status = backend.edge_status(CURRENT_ARM_STATE.get("arm_state", "armed"), camera_count=6)
    active = is_siren_active()
    status["siren_active"] = active
    status["silenced_incident_count"] = len(silenced_incident_ids)
    status["connection"] = "online"
    status["online"] = True
    return status

@app.post("/edge/arm-state")
@app.post("/api/edge/arm-state")
def set_arm_state_api(req: ArmStateRequest):
    CURRENT_ARM_STATE["arm_state"] = req.arm_state
    backend = get_backend()
    backend.record_arm_state(req.arm_state)
    return get_edge_status_api()

@app.post("/siren/silence")
@app.post("/api/siren/silence")
@app.post("/v1/siren/silence")
def silence_siren_api():
    backend = get_backend()
    incidents = backend.get_incidents()
    newly_silenced = []
    for inc in incidents:
        if inc.get("severity") == "CRITICAL" and inc.get("status") not in {"CONFIRMED", "DISMISSED_FP"}:
            inc_id = inc.get("incident_id")
            if inc_id:
                silenced_incident_ids.add(inc_id)
                newly_silenced.append(inc_id)
    _save_silenced_incidents(silenced_incident_ids)
    try:
        get_hardware_controller().send_command("SIREN_OFF")
    except Exception:
        pass
    return {
        "status": "silenced",
        "siren_active": False,
        "silenced_incidents": newly_silenced,
        "total_silenced_count": len(silenced_incident_ids),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.post("/siren/reset")
@app.post("/api/siren/reset")
def reset_siren_api():
    silenced_incident_ids.clear()
    _save_silenced_incidents(silenced_incident_ids)
    return {"status": "reset", "silenced_incident_count": 0}

@app.get("/incidents/correlated")
@app.get("/api/incidents/correlated")
@app.get("/incidents")
@app.get("/api/incidents")
def get_correlated_incidents_api(limit: int = Query(50, ge=1, le=500)):
    backend = get_backend()
    return backend.get_incidents()[:limit]

@app.get("/incidents/{incident_id}")
@app.get("/api/incidents/{incident_id}")
def get_incident_by_id_api(incident_id: str):
    backend = get_backend()
    inc = backend.get_incident(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return inc

@app.post("/incidents/{incident_id}/acknowledge")
@app.post("/api/incidents/{incident_id}/acknowledge")
def acknowledge_incident_api(incident_id: str, payload: Optional[AcknowledgeRequest] = None):
    backend = get_backend()
    p = payload or AcknowledgeRequest()
    inc = backend.acknowledge_incident(incident_id, status=p.status, notes=p.notes or p.dismiss_reason)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    try:
        get_hardware_controller().send_command("SIREN_OFF")
    except Exception:
        pass
    return inc

@app.post("/events/simulate-handoff")
@app.post("/api/events/simulate-handoff")
def simulate_handoff_api():
    backend = get_backend()
    result = backend.simulate_handoff()
    return {"ok": True, **result}

@app.get("/cameras/health")
@app.get("/api/cameras/health")
def get_cameras_health_api():
    cams = [
        {"camera_id": "CAM_ALPHA", "name": "Checkpost Alpha Main Gate", "location": "Sector 4 Northern Crossing", "status": "ONLINE", "health_score": 98, "fps": 29.8},
        {"camera_id": "CAM_BRAVO", "name": "BOP Bravo Outer Perimeter", "location": "Eastern Fenced Corridor", "status": "ONLINE", "health_score": 96, "fps": 29.5},
        {"camera_id": "CAM_CHARLIE", "name": "Tower Charlie Thermal Pan", "location": "Ridge Watchpoint 7", "status": "ONLINE", "health_score": 92, "fps": 25.0},
        {"camera_id": "CAM_DELTA", "name": "Riverine Sentry Delta", "location": "Creek Sector 2", "status": "ONLINE", "health_score": 95, "fps": 29.8},
        {"camera_id": "CAM_ECHO", "name": "Outpost Echo Ridge Line", "location": "Northern Plateau Sector 4-B", "status": "ONLINE", "health_score": 94, "fps": 29.0},
        {"camera_id": "CAM_FOXTROT", "name": "Sentry Foxtrot Deep Creek", "location": "Southern Gully Checkpoint", "status": "ONLINE", "health_score": 97, "fps": 29.8},
    ]
    return {"count": len(cams), "cameras": cams}

@app.get("/audit/blockchain")
@app.get("/api/audit/blockchain")
def get_blockchain_ledger_api():
    backend = get_backend()
    ledger = backend.get_blockchain_ledger()
    return {"blocks_sealed": len(ledger), "blocks": ledger}

@app.get("/audit/verify")
@app.get("/api/audit/verify")
def verify_blockchain_ledger_api():
    backend = get_backend()
    is_valid, broken_idx, reason, logs = backend.verify_chain()
    return {"is_valid": is_valid, "broken_index": broken_idx, "reason": reason, "logs": logs}


if __name__ == "__main__":
    import uvicorn
    print("[IBVAP Backend] Starting API Server on http://0.0.0.0:8000...")
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
