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


if __name__ == "__main__":
    import uvicorn
    print("[IBVAP Backend] Starting API Server on http://0.0.0.0:8000...")
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
