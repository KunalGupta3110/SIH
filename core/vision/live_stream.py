"""
IBVAP Sentinel — core/vision/live_stream.py

Real live-camera + recorded-feed worker backing the /stream/{camera_id}
MJPEG endpoint.

This replaces core/vision/multi_stream_engine.py, which is no longer
imported anywhere in the live gateway. That module ran its own detector
(core/vision/tracker.py) and wrote events through a second, uncoordinated
database module (core/database/event_db.py + core/database/incident_graph.py)
directly into security_events/incidents — completely bypassing this
project's actual threat-scoring, correlation, and SHA-256 hash-chain
sealing in core.backend_service. It was reachable (services/api_gateway
lazily imported it on first /stream/{camera_id} hit) but never exercised by
any test or frontend call. Left in place on disk only because
demos/*.py still import it directly as a standalone script; not used here.

Two kinds of source, both real, never faked:
  - A recorded video file (CAM_ALPHA/BRAVO/CHARLIE/DELTA) — real YOLOv8n +
    ByteTrack inference on actual footage (detection_tracking.track),
    looped for a continuous demo. Clearly overlaid "RECORDED FEED (LOOPED)"
    — never presented as live.
  - The host machine's physical webcam (CAM_WEBCAM, device index 0 by
    default) — the one genuinely live feed. If no webcam is attached (true
    in most dev/CI sandboxes), this reports OFFLINE and serves an explicit
    "NO SIGNAL" frame — never a frozen frame pretending to be live.

Every frame updates core.vision.camera_health.CameraHealthMonitor with the
real capture state (so /cameras/health is never hardcoded fiction), and
every few seconds a detected track is promoted to a real SecurityEvent via
core.backend_service.get_backend().ingest_event() — the same scoring/
correlation/hash-chain path the AI pipeline (core/vision/pipeline.py) uses.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import logging
import threading
import time
from pathlib import Path
from typing import Dict, Optional

import cv2
import numpy as np

from core.backend_service import get_backend
from core.vision.camera_health import CameraHealthMonitor
from detection_tracking.track import BorderTracker

logger = logging.getLogger("ibvap.vision.live_stream")
ROOT_DIR = Path(__file__).resolve().parent.parent.parent

EVENT_EMIT_INTERVAL_S = 3.0
RECONNECT_RETRY_INTERVAL_S = 4.0
# A genuinely dead/stub capture device (confirmed present in some sandboxed
# environments: cv2.VideoCapture(0) via the MSMF backend reports
# isOpened()=True and ret=True while returning a perfectly flat frame —
# std()==0.0 — with no physical camera attached). OpenCV's own status flags
# cannot be trusted alone; every frame's actual pixel variance is checked
# before it's treated as real signal.
DEAD_FRAME_STD_THRESHOLD = 2.0


@dataclass
class CameraConfig:
    camera_id: str
    source: str | int
    name: str
    is_webcam: bool = False


DEFAULT_CAMERA_CONFIGS = [
    CameraConfig("CAM_ALPHA", "data/sample_border_web.mp4", "Checkpost Alpha Main Gate"),
    CameraConfig("CAM_BRAVO", "data/threat_vehicle_rush_web.mp4", "BOP Bravo Outer Perimeter"),
    CameraConfig("CAM_CHARLIE", "data/people_surveillance.mp4", "Tower Charlie Thermal Pan"),
    CameraConfig("CAM_DELTA", "data/threat_group_breach_web.mp4", "Riverine Sentry Delta"),
    # The one genuinely live source: the demo machine's own webcam. Distinct
    # from the CAM_ALPHA..DELTA border-camera topology (those are recorded
    # field footage) — this is explicitly the operator's local device feed.
    CameraConfig("CAM_WEBCAM", 0, "Operator Device Webcam (Live)", is_webcam=True),
]


def _no_signal_frame(camera_id: str, reason: str) -> np.ndarray:
    """A genuine, honest placeholder — never a frozen real frame pretending
    to be live. Flat gray with a clear diagonal hatch so it can never be
    mistaken for a paused video at a glance."""
    frame = np.full((360, 640, 3), 24, dtype=np.uint8)
    for offset in range(-640, 640, 28):
        cv2.line(frame, (offset, 0), (offset + 360, 360), (40, 40, 40), 1)
    cv2.putText(frame, "NO SIGNAL", (185, 165), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (90, 90, 90), 2, cv2.LINE_AA)
    cv2.putText(frame, camera_id, (185, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (120, 120, 120), 1, cv2.LINE_AA)
    cv2.putText(frame, reason, (30, 330), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (100, 100, 100), 1, cv2.LINE_AA)
    return frame


class LiveCameraWorker:
    """One background thread per camera: opens its source, runs real
    detection+tracking, and exposes the latest annotated JPEG frame."""

    def __init__(self, config: CameraConfig, health_monitor: CameraHealthMonitor, tracker: Optional[BorderTracker] = None):
        self.config = config
        self.health_monitor = health_monitor
        self.tracker = tracker or BorderTracker()
        self._lock = threading.Lock()
        self._latest_jpeg: Optional[bytes] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._last_event_emit = 0.0

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name=f"livecam-{self.config.camera_id}")
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=1.0)

    def _resolve_source(self):
        src = self.config.source
        if isinstance(src, int):
            return src
        path = Path(src)
        if not path.is_absolute():
            path = ROOT_DIR / path
        return str(path) if path.exists() else None

    def _run(self) -> None:
        cap = None
        frame_idx = 0
        self.tracker.reset()

        while self._running:
            if cap is None:
                resolved = self._resolve_source()
                if resolved is None:
                    reason = "No physical webcam detected" if self.config.is_webcam else f"Video file not found: {self.config.source}"
                    self.health_monitor.mark_offline(self.config.camera_id, reason)
                    with self._lock:
                        self._latest_jpeg = self._encode(_no_signal_frame(self.config.camera_id, reason))
                    time.sleep(RECONNECT_RETRY_INTERVAL_S)
                    continue

                cap = cv2.VideoCapture(resolved)
                if not cap.isOpened():
                    reason = "Webcam device busy or unavailable" if self.config.is_webcam else "Unable to decode video source"
                    self.health_monitor.mark_offline(self.config.camera_id, reason)
                    with self._lock:
                        self._latest_jpeg = self._encode(_no_signal_frame(self.config.camera_id, reason))
                    cap = None
                    time.sleep(RECONNECT_RETRY_INTERVAL_S)
                    continue

            ret, frame = cap.read()
            is_dead_frame = ret and frame is not None and float(frame.std()) < DEAD_FRAME_STD_THRESHOLD
            if not ret or is_dead_frame:
                if self.config.is_webcam:
                    reason = (
                        "Webcam device reports connected but returns no real image data "
                        "(no physical camera attached - this is a stub/virtual capture device)"
                        if is_dead_frame
                        else "Webcam feed ended unexpectedly"
                    )
                    self.health_monitor.mark_offline(self.config.camera_id, reason)
                    with self._lock:
                        self._latest_jpeg = self._encode(_no_signal_frame(self.config.camera_id, reason))
                    cap.release()
                    cap = None
                    time.sleep(RECONNECT_RETRY_INTERVAL_S)
                    continue
                # Recorded file finished — loop it. This is a demo convenience
                # for footage, not a live source, and is labeled as such below.
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue

            frame_idx += 1
            timestamp_ms = frame_idx * 33.3
            tracked_objects = self.tracker.track_frame(frame, frame_idx=frame_idx, timestamp_ms=timestamp_ms)
            annotated = self.tracker.draw_tracks(frame, tracked_objects, show_trail=True, show_fps=False)

            self._draw_source_label(annotated)

            jpeg_bytes = self._encode(annotated)
            self.health_monitor.record_frame(self.config.camera_id, jpeg_bytes)
            with self._lock:
                self._latest_jpeg = jpeg_bytes

            self._maybe_emit_event(tracked_objects)
            time.sleep(0.01)

        if cap is not None:
            cap.release()

    def _draw_source_label(self, frame: np.ndarray) -> None:
        h, w = frame.shape[:2]
        cv2.rectangle(frame, (0, 0), (w, 26), (12, 12, 12), -1)
        if self.config.is_webcam:
            label, color = "LIVE - OPERATOR WEBCAM", (80, 220, 120)
        else:
            label, color = "RECORDED FEED (LOOPED DEMO FOOTAGE)", (60, 170, 230)
        cv2.putText(frame, f"{self.config.camera_id} | {label}", (8, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)

    def _maybe_emit_event(self, tracked_objects) -> None:
        now = time.time()
        if not tracked_objects or (now - self._last_event_emit) < EVENT_EMIT_INTERVAL_S:
            return
        self._last_event_emit = now
        target = tracked_objects[0]
        try:
            get_backend().ingest_event({
                "event_id": f"LIVE-{self.config.camera_id}-{target.track_id}-{int(now * 1000)}",
                "timestamp_iso": datetime.now(timezone.utc).isoformat(),
                "camera_id": self.config.camera_id,
                "track_id": target.track_id,
                "class_name": target.class_name,
                "alert_type": "ZONE_INTRUSION",
                "details": f"Live stream detection: {target.class_name} (conf={target.confidence:.2f}) on {self.config.camera_id}.",
                "confidence": round(float(target.confidence), 3),
                "in_restricted_zone": False,
                "bbox": [round(v, 2) for v in target.bbox],
                "centroid": [round(v, 2) for v in target.centroid],
            })
        except Exception:
            logger.exception("Failed to ingest live-stream event for %s", self.config.camera_id)

    @staticmethod
    def _encode(frame: np.ndarray) -> bytes:
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return buf.tobytes() if ok else b""

    def get_jpeg_frame(self) -> Optional[bytes]:
        with self._lock:
            return self._latest_jpeg


class LiveStreamManager:
    """One worker per configured camera. Lazily started on first access so
    importing this module never spins up threads/opens hardware by itself."""

    def __init__(self, configs=None, health_monitor: Optional[CameraHealthMonitor] = None):
        self.health_monitor = health_monitor or CameraHealthMonitor()
        self._shared_tracker_pool: Dict[str, BorderTracker] = {}
        self.workers: Dict[str, LiveCameraWorker] = {
            cfg.camera_id: LiveCameraWorker(cfg, self.health_monitor) for cfg in (configs or DEFAULT_CAMERA_CONFIGS)
        }

    def get_worker(self, camera_id: str) -> Optional[LiveCameraWorker]:
        worker = self.workers.get(camera_id)
        if worker is not None:
            worker.start()
        return worker


_manager: Optional[LiveStreamManager] = None


def get_live_stream_manager(health_monitor: Optional[CameraHealthMonitor] = None) -> LiveStreamManager:
    global _manager
    if _manager is None:
        _manager = LiveStreamManager(health_monitor=health_monitor)
    return _manager
