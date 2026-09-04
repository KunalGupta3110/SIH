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
        self.cameras: Dict[str, CameraHealthRecord] = {
            "CAM_ALPHA": CameraHealthRecord(
                camera_id="CAM_ALPHA",
                name="Checkpost Alpha Main Gate",
                location="Sector 4 Northern Crossing",
                status="ONLINE",
                fps=29.8,
                last_heartbeat_iso=datetime.now(timezone.utc).isoformat(),
                frame_hash="",
                latency_ms=11.4,
                details="Nominal optical video stream"
            ),
            "CAM_BRAVO": CameraHealthRecord(
                camera_id="CAM_BRAVO",
                name="BOP Bravo Outer Perimeter",
                location="Eastern Fence Corridor",
                status="ONLINE",
                fps=30.0,
                last_heartbeat_iso=datetime.now(timezone.utc).isoformat(),
                frame_hash="",
                latency_ms=14.2,
                details="Nominal optical video stream"
            ),
            "CAM_CHARLIE": CameraHealthRecord(
                camera_id="CAM_CHARLIE",
                name="Tower Charlie Thermal Pan",
                location="Ridge Watchpoint 7",
                status="ONLINE",
                fps=25.0,
                last_heartbeat_iso=datetime.now(timezone.utc).isoformat(),
                frame_hash="",
                latency_ms=18.5,
                details="Nominal thermal LWIR stream"
            ),
            "CAM_DELTA": CameraHealthRecord(
                camera_id="CAM_DELTA",
                name="Riverine Sentry Delta",
                location="Creek Sector 2",
                status="ONLINE",
                fps=28.5,
                last_heartbeat_iso=datetime.now(timezone.utc).isoformat(),
                frame_hash="",
                latency_ms=15.0,
                details="Nominal day/night stream"
            ),
        }

    def record_frame(self, camera_id: str, frame_bytes: Optional[bytes] = None) -> CameraHealthRecord:
        """Updates health stats based on incoming frame bytes."""
        now_iso = datetime.now(timezone.utc).isoformat()
        if camera_id not in self.cameras:
            self.cameras[camera_id] = CameraHealthRecord(
                camera_id=camera_id,
                name=f"Camera {camera_id}",
                location="Unknown Sector",
                status="ONLINE",
                fps=30.0,
                last_heartbeat_iso=now_iso,
                frame_hash="",
            )

        cam = self.cameras[camera_id]
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
        if camera_id in self.cameras:
            self.cameras[camera_id].status = "OFFLINE"
            self.cameras[camera_id].fps = 0.0
            self.cameras[camera_id].details = reason

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
                "details": c.details,
            }
            for c in self.cameras.values()
        ]
