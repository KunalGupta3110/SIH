"""
IBVAP Sentinel FastAPI Gateway.

Frontend-facing API for edge status, event ingestion, incident timelines,
evidence-chain audit, mobile token registration, and safe hardware simulation.
The heavier camera/CV stack is imported lazily only for stream endpoints.
"""

import asyncio
from datetime import datetime, timezone
import logging
import os
from pathlib import Path
import sys
import time
from typing import Any, Dict, List, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger("ibvap.gateway")

from core.backend_service import get_backend
from services.hardware_bridge.serial_controller import get_hardware_controller


app = FastAPI(
    title="IBVAP Sentinel Backend API",
    description="Reliable SQLite-backed gateway for the IBVAP Sentinel command center and mobile app.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

THUMBNAIL_DIR = ROOT_DIR / "data" / "thumbnails"
THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/thumbnails", StaticFiles(directory=str(THUMBNAIL_DIR)), name="thumbnails")

STATIC_HTML = ROOT_DIR / "apps" / "web_command_center" / "static" / "command_center.html"
if not STATIC_HTML.exists():
    STATIC_HTML = ROOT_DIR / "apps" / "web_command_center" / "static" / "index.html"

CURRENT_ARM_STATE = {"arm_state": "armed"}


# ─────────────────────────────────────────────────────────────────────────────
# Real-time incident stream (WebSocket push, not polling)
# ─────────────────────────────────────────────────────────────────────────────
class IncidentStreamManager:
    """Tracks connected dashboard clients and pushes incident updates to them."""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)
        logger.info("incident stream: client connected (%d total)", len(self._clients))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)
        logger.info("incident stream: client disconnected (%d total)", len(self._clients))

    async def broadcast(self, message: Dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._clients)
        dead: List[WebSocket] = []
        for websocket in targets:
            try:
                await websocket.send_json(message)
            except Exception:  # noqa: BLE001 - a dead socket must never break ingestion
                dead.append(websocket)
        if dead:
            async with self._lock:
                for websocket in dead:
                    self._clients.discard(websocket)


incident_stream = IncidentStreamManager()


async def broadcast_incident_update(incident: Optional[Dict[str, Any]]) -> None:
    """Push a single correlated incident to every connected dashboard client."""
    if not incident or not incident.get("incident_id"):
        return
    await incident_stream.broadcast({"type": "incident_update", "payload": incident})


async def _broadcast_from_ingest_result(result: Optional[Dict[str, Any]]) -> None:
    """Resolve an incident from an ingest_event() result and broadcast it."""
    if not result:
        return
    incident = result.get("incident")
    if not incident and result.get("incident_id"):
        incident = await run_in_threadpool(get_backend().get_incident, result["incident_id"])
    await broadcast_incident_update(incident)


@app.websocket("/ws/incidents")
async def incidents_websocket(websocket: WebSocket) -> None:
    await incident_stream.connect(websocket)
    try:
        await websocket.send_json(
            {"type": "connected", "payload": {"ts": datetime.now(timezone.utc).isoformat()}}
        )
        # The dashboard is a passive consumer; this loop just keeps the socket open
        # and lets us notice a client-side disconnect promptly.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        pass
    finally:
        await incident_stream.disconnect(websocket)


class ArmStateRequest(BaseModel):
    arm_state: str = Field(pattern="^(armed|disarmed)$")


class EventIn(BaseModel):
    event_id: str
    timestamp_iso: Optional[str] = None
    timestamp_ms: Optional[float] = None
    camera_id: str
    track_id: Optional[int] = 0
    class_name: Optional[str] = "person"
    alert_type: Optional[str] = "ZONE_INTRUSION"
    severity: Optional[str] = None
    zone_id: Optional[str] = None
    zone_name: Optional[str] = None
    details: Optional[str] = ""
    bbox: Optional[list] = None
    centroid: Optional[list] = None
    rule_name: Optional[str] = "Spatial Geometry Rule"
    rule_metrics: Optional[Dict[str, Any]] = None
    confidence: Optional[float] = 0.85
    thumbnail_path: Optional[str] = None
    in_restricted_zone: Optional[bool] = None
    movement_toward_border: Optional[bool] = None
    loitering_seconds: Optional[float] = None
    cross_camera_reid_match: Optional[bool] = None
    reid_global_id: Optional[str] = None


class AcknowledgeRequest(BaseModel):
    status: str = "CONFIRMED"
    notes: Optional[str] = None


class RegisterTokenRequest(BaseModel):
    token: str
    device_id: Optional[str] = None
    platform: Optional[str] = None


def api_incident_to_mobile(incident: Dict[str, Any], base_url: str) -> Dict[str, Any]:
    """Keep Flutter's established incident shape while exposing richer fields."""
    threat_type = "unknown_person"
    if incident.get("target_class") in {"car", "truck", "bus", "motorcycle"}:
        threat_type = "vehicle"

    return {
        "id": incident["incident_id"],
        "incident_id": incident["incident_id"],
        "threat_type": threat_type,
        "timestamp": incident["created_at"],
        "camera_name": " -> ".join(incident.get("cameras_involved") or ["Border Node"]),
        "thumbnail_url": f"{base_url}/thumbnails/evt_anpr_DL01AB1234.jpg",
        "detail_image_url": f"{base_url}/thumbnails/evt_anpr_DL01AB1234.jpg",
        "confidence": incident.get("confidence", 0.85),
        "notes": incident.get("story_summary"),
        "acknowledged": incident.get("status") in {"CONFIRMED", "DISMISSED_FP"},
        "status": incident.get("status"),
        "severity": incident.get("severity"),
        "threat_score": incident.get("threat_score"),
        "cameras_involved": incident.get("cameras_involved", []),
        "score_breakdown": incident.get("score_breakdown", []),
        "cryptographic_hash": incident.get("cryptographic_hash"),
        "event_ids": incident.get("event_ids", []),
    }


@app.get("/")
@app.get("/hud")
def root_hud():
    if STATIC_HTML.exists():
        return FileResponse(str(STATIC_HTML))
    return {"platform": "IBVAP Sentinel", "status": "online", "docs": "/docs"}


@app.get("/edge/status")
@app.get("/v1/edge/status")
def get_edge_status():
    return get_backend().edge_status(CURRENT_ARM_STATE["arm_state"], camera_count=6)


@app.post("/edge/arm-state")
@app.post("/v1/edge/arm-state")
def set_arm_state(req: ArmStateRequest):
    CURRENT_ARM_STATE["arm_state"] = req.arm_state
    get_backend().record_arm_state(req.arm_state)
    return get_edge_status()


@app.post("/events")
@app.post("/v1/events")
@app.post("/events/ingest")
async def ingest_event(event: EventIn):
    try:
        result = await run_in_threadpool(
            get_backend().ingest_event, event.model_dump(exclude_none=True)
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _broadcast_from_ingest_result(result)
    return {"ok": True, **result}


@app.get("/incidents")
@app.get("/v1/incidents")
def get_incidents(request: Request):
    base_url = str(request.base_url).rstrip("/")
    return [api_incident_to_mobile(item, base_url) for item in get_backend().get_incidents()]


@app.get("/incidents/correlated")
@app.get("/v1/incidents/correlated")
def get_correlated_incidents():
    return get_backend().get_incidents()


@app.get("/incidents/{incident_id}")
@app.get("/v1/incidents/{incident_id}")
def get_incident_by_id(incident_id: str, request: Request):
    incident = get_backend().get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return api_incident_to_mobile(incident, str(request.base_url).rstrip("/"))


@app.post("/incidents/{incident_id}/acknowledge")
@app.post("/v1/incidents/{incident_id}/acknowledge")
def acknowledge_incident(incident_id: str, request: Request, payload: Optional[AcknowledgeRequest] = None):
    payload = payload or AcknowledgeRequest()
    try:
        incident = get_backend().acknowledge_incident(incident_id, status=payload.status, notes=payload.notes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    get_hardware_controller().send_command("SIREN_OFF")
    return api_incident_to_mobile(incident, str(request.base_url).rstrip("/"))


@app.get("/audit/blockchain")
@app.get("/v1/audit/blockchain")
@app.get("/audit/verify")
@app.get("/v1/audit/verify")
def verify_audit_chain():
    is_valid, broken_index, reason, logs = get_backend().verify_chain()
    return {
        "is_valid": is_valid,
        "broken_index": broken_index,
        "reason": reason,
        "logs": logs,
    }


@app.post("/siren/silence")
@app.post("/v1/siren/silence")
def silence_siren():
    result = get_hardware_controller().send_command("SIREN_OFF")
    return {"status": "silenced", "hardware": result, "timestamp": datetime.now(timezone.utc).isoformat()}


@app.post("/notifications/register-token")
@app.post("/v1/notifications/register-token")
def register_device_token(payload: RegisterTokenRequest):
    token = get_backend().register_fcm_token(payload.token, payload.device_id, payload.platform)
    return {"status": "registered", **token}


@app.post("/events/simulate-handoff")
@app.post("/v1/events/simulate-handoff")
async def simulate_handoff():
    result = await run_in_threadpool(get_backend().simulate_handoff)
    for entry in result.get("events", []):
        await _broadcast_from_ingest_result(entry)
    return {"ok": True, **result}


@app.post("/events/run-live-inference")
@app.post("/v1/events/run-live-inference")
async def run_live_inference_endpoint():
    """Run genuine YOLOv8 model inference on demo footage and ingest breach incident."""
    from backend.live_inference import run_live_yolo_inference
    try:
        result = await run_in_threadpool(run_live_yolo_inference)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    await _broadcast_from_ingest_result(result)
    return {"ok": True, **result}


@app.get("/events/live-detections")
@app.get("/v1/events/live-detections")
def get_live_detections_endpoint():
    """Return raw per-frame YOLOv8 detection logs."""
    from backend.live_inference import load_genuine_detections
    try:
        detections = load_genuine_detections()
        return {"total": len(detections), "detections": detections}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _stream_manager():
    from core.vision.multi_stream_engine import get_stream_manager

    return get_stream_manager()


def frame_generator(camera_id: str):
    cam_proc = _stream_manager().get_camera(camera_id)
    if not cam_proc:
        return
    while True:
        jpg_bytes = cam_proc.get_jpeg_frame()
        if jpg_bytes:
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpg_bytes + b"\r\n"
        time.sleep(0.033)


@app.get("/stream/{camera_id}")
def stream_camera(camera_id: str):
    return StreamingResponse(frame_generator(camera_id), media_type="multipart/x-mixed-replace; boundary=frame")


@app.get("/stream/cam1/live")
def stream_cam1():
    return stream_camera("CAM_ALPHA")


@app.get("/stream/cam2/live")
def stream_cam2():
    return stream_camera("CAM_BRAVO")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
