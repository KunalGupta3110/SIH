"""
IBVAP Sentinel FastAPI Gateway.

Frontend-facing API for edge status, event ingestion, incident timelines,
evidence-chain audit, mobile token registration, and safe hardware simulation.
The heavier camera/CV stack is imported lazily only for stream endpoints.
"""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import os
from pathlib import Path
import sys
import time
from typing import Any, AsyncIterator, Dict, List, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger("ibvap.gateway")

from core import dossier
from core.backend_service import get_backend
from core.rules.site_calibration import get_calibration_summary, record_site_feedback
from core.vision.camera_health import CameraHealthMonitor
from services.hardware_bridge.serial_controller import get_hardware_controller

logger = logging.getLogger("ibvap.gateway")


@asynccontextmanager
async def _lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Migrate the schema (already done by get_backend()) and seed demo data
    so the dashboard isn't empty on a fresh clone. Never blocks startup —
    a seed failure is logged, not fatal, since the API is still usable
    without demo rows."""
    try:
        from core.db.seed import run_seed

        result = run_seed(get_backend())
        logger.info("Startup seed check: %s", result)
    except Exception:
        logger.exception("Demo data seed failed (non-fatal, API will still start)")
    yield


app = FastAPI(
    title="IBVAP Sentinel Backend API",
    description="Reliable SQLite-backed gateway for the IBVAP Sentinel command center and mobile app.",
    version="1.0.0",
    lifespan=_lifespan,
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

# Simulated camera fleet health, independent of any real video feed —
# lets an operator or demo trigger/clear a fault without hardware attached.
_camera_health_monitor = CameraHealthMonitor()

# Offline-first event queue: while NETWORK_STATE is "down" (operator/demo
# toggled), ingested events are buffered here instead of being correlated,
# then drained in order once the network comes back.
NETWORK_STATE = {"simulated_down": False}
OFFLINE_EVENT_QUEUE: list = []


def get_camera_health_monitor() -> CameraHealthMonitor:
    return _camera_health_monitor


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Last-resort safety net for a live demo: an unexpected error becomes a
    clean 500 JSON body with a logged traceback server-side, never a raw
    stack trace shown to the client or a crashed process.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": "Something went wrong processing this request.", "path": request.url.path},
    )


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
    dismiss_reason: Optional[str] = None


class RegisterTokenRequest(BaseModel):
    token: str
    device_id: Optional[str] = None
    platform: Optional[str] = None


class DispatchRequest(BaseModel):
    unit: str = "QRT-1"
    notes: Optional[str] = None


class SirenThresholdRequest(BaseModel):
    value: int = Field(ge=0, le=100)


class EnrollPersonRequest(BaseModel):
    person_id: str
    name: str
    role: str = Field(default="authorized", pattern="^(authorized|watchlist)$")
    reference_embedding: Optional[List[float]] = None
    photo_path: Optional[str] = None
    notes: Optional[str] = None


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
        "dismiss_reason": incident.get("dismiss_reason"),
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
    payload = event.model_dump(exclude_none=True)
    if NETWORK_STATE["simulated_down"]:
        OFFLINE_EVENT_QUEUE.append(payload)
        return {
            "ok": True,
            "status": "queued_offline",
            "event_id": payload.get("event_id"),
            "queued_events_count": len(OFFLINE_EVENT_QUEUE),
        }
    try:
        result = await run_in_threadpool(get_backend().ingest_event, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _broadcast_from_ingest_result(result)
    return {"ok": True, "status": "duplicate" if result.get("duplicate") else "recorded", **result}


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
        incident = get_backend().acknowledge_incident(
            incident_id, status=payload.status, notes=payload.notes, dismiss_reason=payload.dismiss_reason
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Feed operator triage back into per-camera site calibration, so recurring
    # environmental false alarms (vegetation, wildlife, glare...) get learned.
    is_confirmed = payload.status == "CONFIRMED"
    for camera_id in incident.get("cameras_involved") or []:
        record_site_feedback(camera_id, is_confirmed=is_confirmed, false_reason=payload.dismiss_reason)

    get_hardware_controller().send_command("SIREN_OFF")
    result = api_incident_to_mobile(incident, str(request.base_url).rstrip("/"))
    result["dismiss_reason"] = incident.get("dismiss_reason")
    return result


@app.get("/audit/blockchain")
@app.get("/v1/audit/blockchain")
def get_audit_blockchain():
    """The sealed evidence chain itself, most-recent-first — what the
    Evidence Vault UI renders as the linked-block visualization."""
    blocks = get_backend().get_ledger_blocks()
    return {"blocks_sealed": len(blocks), "blocks": blocks}


@app.get("/audit/verify")
@app.get("/v1/audit/verify")
@app.get("/integrity/verify")
@app.get("/v1/integrity/verify")
def verify_audit_chain():
    """Walks the chain and reports whether it's intact — separate from
    /audit/blockchain (which just lists the blocks) because verifying is an
    active, on-demand operator action ("Run cryptographic audit")."""
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


@app.get("/enrollment/people")
@app.get("/v1/enrollment/people")
def list_enrolled_people():
    return {"people": get_backend().list_enrolled_people()}


@app.post("/enrollment/people")
@app.post("/v1/enrollment/people")
def enroll_person(payload: EnrollPersonRequest):
    person = get_backend().enroll_person(
        person_id=payload.person_id,
        name=payload.name,
        role=payload.role,
        reference_embedding=payload.reference_embedding,
        photo_path=payload.photo_path,
        notes=payload.notes,
    )
    return {"status": "enrolled", **person}


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
    from core.live_inference import run_live_yolo_inference
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
    from core.live_inference import load_genuine_detections
    try:
        detections = load_genuine_detections()
        return {"total": len(detections), "detections": detections}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Camera management, raw detections, target tracking, reconstruction,
# analytics — all real reads against the SQLAlchemy-backed database.
# ---------------------------------------------------------------------------

@app.get("/cameras")
@app.get("/v1/cameras")
def list_cameras():
    return {"cameras": get_backend().get_cameras()}


@app.get("/cameras/{camera_id}/detections")
@app.get("/v1/cameras/{camera_id}/detections")
def get_camera_detections(camera_id: str, limit: int = Query(100, ge=1, le=1000)):
    return {"camera_id": camera_id, "detections": get_backend().get_detections(camera_id=camera_id, limit=limit)}


@app.get("/targets")
@app.get("/v1/targets")
def list_targets():
    return {"targets": get_backend().get_tracked_targets()}


@app.get("/targets/{global_id}/reconstruction")
@app.get("/v1/targets/{global_id}/reconstruction")
def get_target_reconstruction(global_id: str):
    return get_backend().get_target_reconstruction(global_id)


@app.get("/analytics/overview")
@app.get("/v1/analytics/overview")
def get_analytics_overview():
    return get_backend().get_analytics_overview()


@app.post("/incidents/{incident_id}/dispatch")
@app.post("/v1/incidents/{incident_id}/dispatch")
def dispatch_incident(incident_id: str, payload: Optional[DispatchRequest] = None):
    payload = payload or DispatchRequest()
    try:
        result = get_backend().dispatch_incident(incident_id, unit=payload.unit, notes=payload.notes)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    get_hardware_controller().send_command("RELAY_ON_1")
    return result


# ---------------------------------------------------------------------------
# Hardware control — telemetry read + relay toggle. Real serial I/O when a
# controller is attached; SIMULATION MODE (clearly labeled in the response)
# on every dev machine and demo laptop without one, per
# services/hardware_bridge/serial_controller.py.
# ---------------------------------------------------------------------------

@app.get("/hardware/telemetry")
@app.get("/v1/hardware/telemetry")
def get_hardware_telemetry():
    from services.hardware_bridge.serial_controller import SUPPORTED_COMMANDS

    controller = get_hardware_controller()
    return {
        "connected": controller.is_connected,
        "mode": "serial" if controller.is_connected else "simulation",
        "port": controller.port,
        "supported_relays": sorted(SUPPORTED_COMMANDS),
    }


@app.post("/hardware/relay/{relay_name}")
@app.post("/v1/hardware/relay/{relay_name}")
def toggle_hardware_relay(relay_name: str):
    try:
        result = get_hardware_controller().send_command(relay_name.upper())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result


# ---------------------------------------------------------------------------
# Settings — small operator-tunable key/value store.
# ---------------------------------------------------------------------------

@app.get("/settings/siren-threshold")
@app.get("/v1/settings/siren-threshold")
def get_siren_threshold():
    value = get_backend().get_setting("siren_threat_threshold", default="70")
    return {"key": "siren_threat_threshold", "value": int(value)}


@app.post("/settings/siren-threshold")
@app.post("/v1/settings/siren-threshold")
def set_siren_threshold(payload: SirenThresholdRequest):
    result = get_backend().set_setting("siren_threat_threshold", str(payload.value))
    return {**result, "value": int(result["value"])}


# ---------------------------------------------------------------------------
# AI pipeline trigger — runs the real YOLOv8+ByteTrack+Re-ID stack against
# the configured demo videos and writes real detections/events/incidents.
# Heavy deps (torch/opencv/ultralytics) are imported lazily here only, same
# pattern as the /stream endpoint below, so the rest of the API stays fast
# to import and usable even before those are installed.
# ---------------------------------------------------------------------------

@app.post("/pipeline/run-demo")
@app.post("/v1/pipeline/run-demo")
def run_demo_pipeline(max_frames: Optional[int] = Query(None, ge=1, le=5000)):
    try:
        from core.vision.pipeline import get_pipeline
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"AI pipeline dependencies not installed (torch/opencv/ultralytics): {exc}",
        ) from exc
    try:
        pipeline = get_pipeline()
        summaries = pipeline.process_all_configured_cameras(max_frames=max_frames)
    except Exception as exc:
        logger.exception("AI pipeline run failed")
        raise HTTPException(status_code=500, detail=f"Pipeline run failed: {exc}") from exc
    return {"runs": summaries}


@app.get("/incidents/{incident_id}/dossier")
@app.get("/v1/incidents/{incident_id}/dossier")
def get_incident_dossier(incident_id: str):
    """1-click, print-to-PDF forensic incident dossier (Section 65B formatted)."""
    backend = get_backend()
    incident = backend.get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    events = backend.get_events_for_incident(incident_id)
    block = backend.get_ledger_block_for_incident(incident_id)
    html = dossier.generate_incident_dossier_html(incident, events, block)
    return HTMLResponse(content=html)


@app.get("/calibration")
@app.get("/v1/calibration")
def get_calibration():
    return get_calibration_summary()


@app.get("/calibration/{camera_id}")
@app.get("/v1/calibration/{camera_id}")
def get_calibration_for_camera(camera_id: str):
    return get_calibration_summary(camera_id)


@app.get("/cameras/health")
@app.get("/v1/cameras/health")
def get_cameras_health():
    cameras = get_camera_health_monitor().get_all_health()
    return {"count": len(cameras), "cameras": cameras}


@app.post("/cameras/{camera_id}/simulate-fault")
@app.post("/v1/cameras/{camera_id}/simulate-fault")
def simulate_camera_fault(camera_id: str):
    record = get_camera_health_monitor().simulate_fault(camera_id)
    if not record:
        raise HTTPException(status_code=404, detail="Unknown camera_id")
    return {"camera_id": camera_id, "status": record.status, "message": "Simulated camera fault active."}


@app.post("/cameras/{camera_id}/clear-fault")
@app.post("/v1/cameras/{camera_id}/clear-fault")
def clear_camera_fault(camera_id: str):
    record = get_camera_health_monitor().clear_fault(camera_id)
    if not record:
        raise HTTPException(status_code=404, detail="Unknown camera_id")
    return {"camera_id": camera_id, "status": record.status, "message": "Simulated fault cleared."}


@app.get("/network/status")
@app.get("/v1/network/status")
def get_network_status():
    down = NETWORK_STATE["simulated_down"]
    return {
        "simulated_down": down,
        "status": "OFFLINE_BUFFERING" if down else "ONLINE_SYNCED",
        "queued_events_count": len(OFFLINE_EVENT_QUEUE),
        "message": "Network down. Events queued locally." if down else "Network healthy.",
    }


@app.post("/network/toggle")
@app.post("/v1/network/toggle")
def toggle_network():
    NETWORK_STATE["simulated_down"] = not NETWORK_STATE["simulated_down"]
    drained = 0
    if not NETWORK_STATE["simulated_down"]:
        backend = get_backend()
        while OFFLINE_EVENT_QUEUE:
            queued_event = OFFLINE_EVENT_QUEUE.pop(0)
            try:
                backend.ingest_event(queued_event)
                drained += 1
            except ValueError:
                continue
    return {
        "simulated_down": NETWORK_STATE["simulated_down"],
        "status": "OFFLINE_BUFFERING" if NETWORK_STATE["simulated_down"] else "ONLINE_SYNCED",
        "drained_events": drained,
        "queued_events_count": len(OFFLINE_EVENT_QUEUE),
        "message": (
            "Simulated network failure. Buffering."
            if NETWORK_STATE["simulated_down"]
            else f"Reconnected. Drained {drained} events."
        ),
    }


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
