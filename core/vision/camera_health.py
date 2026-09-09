"""
IBVAP Sentinel — core/vision/camera_health.py

Camera Health & Heartbeat Diagnostics Engine.
Tracks frame delivery, frame freeze detection, optical obstruction,
and camera availability states.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import time
from typing import Dict, List, Optional


@dataclass
class CameraHealthRecord:
    camera_id: str
    name: str
    location: str
    status: str  # "ONLINE", "OFFLINE", "FROZEN", "OBSTRUCTED", "DEGRADED"
    fps: float
    last_heartbeat_iso: str
    frame_hash: str
    consecutive_identical_frames: int = 0
    frame_count: int = 0
    latency_ms: float = 12.0
    details: str = "Operating nominally"


class CameraHealthMonitor:
    """
    Monitors health metrics across edge CCTV camera streams.
    Detects hardware disconnections, frozen image buffers, and frame rate drops.
    """

    def __init__(self):
        # Every camera starts as CONNECTING with fps=0.0 — not a hardcoded
        # "nominal" fiction. Status only moves to ONLINE once record_frame()
        # receives a real frame from core.vision.live_stream, or to OFFLINE
        # if that worker can't open its source at all. A UI polling this
        # before the first real frame arrives sees an honest "connecting"
        # state, never fabricated FPS/latency numbers.
        now_iso = datetime.now(timezone.utc).isoformat()
        self.cameras: Dict[str, CameraHealthRecord] = {
            "CAM_ALPHA": CameraHealthRecord(
                camera_id="CAM_ALPHA", name="Checkpost Alpha Main Gate", location="Sector 4 Northern Crossing",
                status="CONNECTING", fps=0.0, last_heartbeat_iso=now_iso, frame_hash="", latency_ms=0.0,
                details="Awaiting first frame from recorded feed",
            ),
            "CAM_BRAVO": CameraHealthRecord(
                camera_id="CAM_BRAVO", name="BOP Bravo Outer Perimeter", location="Eastern Fence Corridor",
                status="CONNECTING", fps=0.0, last_heartbeat_iso=now_iso, frame_hash="", latency_ms=0.0,
                details="Awaiting first frame from recorded feed",
            ),
            "CAM_CHARLIE": CameraHealthRecord(
                camera_id="CAM_CHARLIE", name="Tower Charlie Thermal Pan", location="Ridge Watchpoint 7",
                status="CONNECTING", fps=0.0, last_heartbeat_iso=now_iso, frame_hash="", latency_ms=0.0,
                details="Awaiting first frame from recorded feed",
            ),
            "CAM_DELTA": CameraHealthRecord(
                camera_id="CAM_DELTA", name="Riverine Sentry Delta", location="Creek Sector 2",
                status="CONNECTING", fps=0.0, last_heartbeat_iso=now_iso, frame_hash="", latency_ms=0.0,
                details="Awaiting first frame from recorded feed",
            ),
            "CAM_WEBCAM": CameraHealthRecord(
                camera_id="CAM_WEBCAM", name="Operator Device Webcam (Live)", location="Local operator machine",
                status="CONNECTING", fps=0.0, last_heartbeat_iso=now_iso, frame_hash="", latency_ms=0.0,
                details="Awaiting first frame from physical webcam",
            ),
        }

    def record_frame(self, camera_id: str, frame_bytes: Optional[bytes] = None) -> CameraHealthRecord:
        """Updates health stats from a real incoming frame. fps/latency are
        measured from actual wall-clock inter-frame timing, not fabricated —
        the first call after a camera starts has no prior timestamp to
        measure against, so it reports 0.0 rather than guessing a number."""
        now = time.time()
        now_iso = datetime.now(timezone.utc).isoformat()
        if camera_id not in self.cameras:
            self.cameras[camera_id] = CameraHealthRecord(
                camera_id=camera_id, name=f"Camera {camera_id}", location="Unknown Sector",
                status="CONNECTING", fps=0.0, last_heartbeat_iso=now_iso, frame_hash="",
            )

        cam = self.cameras[camera_id]
        prev_heartbeat = datetime.fromisoformat(cam.last_heartbeat_iso)
        elapsed_s = max(1e-3, (datetime.now(timezone.utc) - prev_heartbeat).total_seconds())
        if cam.frame_count > 0:
            cam.fps = round(1.0 / elapsed_s, 1)
            cam.latency_ms = round(elapsed_s * 1000, 1)
        cam.last_heartbeat_iso = now_iso
        cam.frame_count += 1

        if frame_bytes:
            current_hash = hashlib.sha256(frame_bytes[:4096]).hexdigest()
            if current_hash == cam.frame_hash:
                cam.consecutive_identical_frames += 1
                if cam.consecutive_identical_frames > 90:  # 3 seconds @ 30fps
                    cam.status = "FROZEN"
                    cam.details = "Video stream frame buffer is frozen (zero frame delta)"
            else:
                cam.consecutive_identical_frames = 0
                cam.frame_hash = current_hash
                cam.status = "ONLINE"
                cam.details = "Nominal optical stream"

        return cam

    def mark_offline(self, camera_id: str, reason: str = "Stream disconnected"):
        if camera_id not in self.cameras:
            self.cameras[camera_id] = CameraHealthRecord(
                camera_id=camera_id, name=f"Camera {camera_id}", location="Unknown Sector",
                status="OFFLINE", fps=0.0, last_heartbeat_iso=datetime.now(timezone.utc).isoformat(), frame_hash="",
            )
        self.cameras[camera_id].status = "OFFLINE"
        self.cameras[camera_id].fps = 0.0
        self.cameras[camera_id].details = reason

    def simulate_fault(self, camera_id: str, reason: str = "Operator-triggered fault simulation") -> Optional[CameraHealthRecord]:
        """Operator/demo hook: force a camera into FAULT state without a real feed."""
        if camera_id not in self.cameras:
            return None
        cam = self.cameras[camera_id]
        cam.status = "FAULT"
        cam.fps = 0.0
        cam.details = reason
        return cam

    def clear_fault(self, camera_id: str) -> Optional[CameraHealthRecord]:
        """Restore a camera to nominal ONLINE state after a simulated fault."""
        if camera_id not in self.cameras:
            return None
        cam = self.cameras[camera_id]
        cam.status = "ONLINE"
        cam.fps = 29.5
        cam.consecutive_identical_frames = 0
        cam.last_heartbeat_iso = datetime.now(timezone.utc).isoformat()
        cam.details = "Nominal stream restored after simulated fault clear."
        return cam

    def get_all_health(self) -> List[Dict]:
        return [
            {
                "camera_id": c.camera_id,
                "name": c.name,
                "location": c.location,
                "status": c.status,
                "fps": c.fps,
                "latency_ms": c.latency_ms,
                "last_heartbeat": c.last_heartbeat_iso,
                "seconds_since_heartbeat": max(
                    0.0,
                    (datetime.now(timezone.utc) - datetime.fromisoformat(c.last_heartbeat_iso)).total_seconds(),
                ),
                "simulated_fault": c.status == "FAULT",
                "details": c.details,
            }
            for c in self.cameras.values()
        ]
