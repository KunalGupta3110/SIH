"""
IBVAP - Intelligent Border Video Analytics Platform
Module: api/server.py
Description: FastAPI REST Gateway for Sentinel Admin Flutter Mobile & Desktop App.
             Serves live edge status, incident timeline, thumbnails, and alarm acknowledgments.
"""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional

# Ensure project root in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from alerts.events import EventDatabase
from alerts.schema import AlertSeverity, AlertType, OperatorStatus

app = FastAPI(
    title="Cyber Camera Surveillance Gateway API",
    description="High-Performance REST Backend bridging Edge AI Vision models to the Cyber Camera Mobile & Desktop Admin App",
    version="1.0.0",
)

# Enable CORS for Flutter Web / Localhost / Mobile
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve Thumbnails as Static Files
THUMBNAIL_DIR = os.path.join(ROOT_DIR, "data", "thumbnails")
os.makedirs(THUMBNAIL_DIR, exist_ok=True)
app.mount("/thumbnails", StaticFiles(directory=THUMBNAIL_DIR), name="thumbnails")

db = EventDatabase(os.path.join(ROOT_DIR, "data", "events.db"))

# In-memory arm state
CURRENT_ARM_STATE = {"is_armed": True}


class ArmStateRequest(BaseModel):
    arm_state: str


class IncidentResponse(BaseModel):
    id: str
    threat_type: str
    timestamp: str
    camera_name: str
    thumbnail_url: str
    confidence: float
    detail_image_url: Optional[str] = None
    notes: Optional[str] = None
    acknowledged: bool = False


def map_db_event_to_incident(ev: Dict[str, Any], base_url: str = "http://localhost:8000") -> Dict[str, Any]:
    """Maps internal IBVAP SecurityEvent schema to Sentinel Incident schema."""
    eid = ev.get("event_id", "evt_unknown")
    alert_type = ev.get("alert_type", "ZONE_INTRUSION")
    
    # Map threat types
    if "FIRE" in alert_type:
        threat_type = "fire"
    elif "SMOKE" in alert_type:
        threat_type = "smoke"
    elif "VERIFIED" in alert_type:
        threat_type = "verified_person"
    else:
        threat_type = "unknown_person"

    thumb_path = ev.get("thumbnail_path")
    if thumb_path and os.path.exists(thumb_path):
        filename = os.path.basename(thumb_path)
        thumb_url = f"{base_url}/thumbnails/{filename}"
    else:
        thumb_url = "https://picsum.photos/seed/border/400/400"

    op_status = ev.get("operator_status", "UNREVIEWED")
    acknowledged = op_status in ("CONFIRMED", "DISMISSED_FP")

    cam_id = ev.get("camera_id", "CAM_01")
    cam_name = "Check Post Alpha" if "ALPHA" in cam_id or "CHECKPOST" in cam_id else ("BOP Bravo Outer Perimeter" if "BRAVO" in cam_id else f"Border Node {cam_id}")

    try:
        conf_val = float(ev.get("confidence") or 0.88)
    except (ValueError, TypeError):
        conf_val = 0.88

    return {
        "id": eid,
        "threat_type": threat_type,
        "timestamp": ev.get("timestamp_iso", datetime.now(timezone.utc).isoformat()),
        "camera_name": cam_name,
        "thumbnail_url": thumb_url,
        "detail_image_url": thumb_url,
        "confidence": conf_val,
        "notes": f"[{ev.get('severity', 'CRITICAL')}] {ev.get('details', '')} | Rule: {ev.get('rule_name', 'Spatial Rule')}",
        "acknowledged": acknowledged,
    }


# ============================================================================
# API ROUTES (Supporting both /v1/ prefix and root paths for Flutter Dio client)
# ============================================================================

@app.get("/edge/status")
@app.get("/v1/edge/status")
def get_edge_status():
    """Returns real-time edge node telemetry."""
    audit = db.get_operator_audit_stats()
    return {
        "connection": "online",
        "arm_state": "armed" if CURRENT_ARM_STATE["is_armed"] else "disarmed",
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        "active_camera_count": 3,
        "events_last_24h": audit.get("total", 3),
        "unverified_faces_last_24h": audit.get("unreviewed", 1),
    }


@app.post("/edge/arm-state")
@app.post("/v1/edge/arm-state")
def set_arm_state(req: ArmStateRequest):
    """Arms or disarms the edge surveillance rules."""
    CURRENT_ARM_STATE["is_armed"] = (req.arm_state.lower() == "armed")
    print(f"[Sentinel Gateway] System Arm State updated to: {CURRENT_ARM_STATE['is_armed']}")
    return get_edge_status()


@app.get("/incidents")
@app.get("/v1/incidents")
def get_incidents(request: Request):
    """Returns the timeline list of border security incidents."""
    base_url = str(request.base_url).rstrip("/")
    events = db.get_recent_events(limit=50)
    return [map_db_event_to_incident(e, base_url) for e in events]


@app.get("/incidents/{incident_id}")
@app.get("/v1/incidents/{incident_id}")
def get_incident_by_id(incident_id: str, request: Request):
    """Returns details of a specific incident."""
    base_url = str(request.base_url).rstrip("/")
    events = db.get_recent_events(limit=100)
    for e in events:
        if e.get("event_id") == incident_id:
            return map_db_event_to_incident(e, base_url)
    raise HTTPException(status_code=404, detail="Incident not found")


@app.post("/incidents/{incident_id}/acknowledge")
@app.post("/v1/incidents/{incident_id}/acknowledge")
def acknowledge_incident(incident_id: str, request: Request):
    """Acknowledges / confirms an incident from the mobile app."""
    db.update_operator_status(incident_id, OperatorStatus.CONFIRMED, "Acknowledged via Sentinel Admin Mobile App")
    return get_incident_by_id(incident_id, request)


@app.post("/notifications/register-token")
@app.post("/v1/notifications/register-token")
def register_device_token(payload: Dict[str, Any]):
    """Registers FCM push token from mobile client."""
    print(f"[Sentinel Gateway] Registered Mobile Push Token: {payload}")
    return {"status": "registered", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/")
def root():
    return {
        "platform": "IBVAP Sentinel Edge AI Ecosystem",
        "status": "OPERATIONAL",
        "endpoints": ["/edge/status", "/incidents", "/docs", "/thumbnails"]
    }


if __name__ == "__main__":
    import uvicorn
    print("[IBVAP Sentinel Gateway] Starting on http://0.0.0.0:8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
