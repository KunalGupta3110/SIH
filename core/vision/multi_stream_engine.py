"""
IBVAP Sentinel
Module: core/vision/multi_stream_engine.py
Description: Multi-Threaded Real-Time CCTV Streaming & Incident Reconstruction Engine.
             Supports RTSP, IP Phone Webcams, Local Webcams, and MP4 Video Files.
"""

from datetime import datetime, timezone
import os
from pathlib import Path
import sys
import threading
import time
from typing import Dict, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import cv2
import numpy as np

from core.database.event_db import EventDatabase
from core.database.incident_graph import correlate_border_event
from core.database.schema import AlertSeverity, AlertType, SecurityEvent
from core.rules.predictive_handoff import PredictiveHandoffEngine
from core.rules.sound_alerts import play_alert
from core.rules.zones import Zone, ZoneManager, ZoneType
from core.vision.reid import FeatureExtractor
from core.vision.tracker import BorderTracker
from services.hardware_bridge.serial_controller import trigger_physical_breach
from services.notifications.telegram_bot import send_mobile_alert
import re
from urllib.parse import urlparse, urlunparse


def normalize_camera_source(source: str) -> str:
    """Normalizes camera sources: IP Webcam, DroidCam, RTSP, numeric indices, or file paths."""
    if source is None:
        return source
    src = str(source).strip()
    if src.isdigit() or src in ("demo", "", "browser"):
        return src

    # Auto-prefix http:// if bare IP:Port or IP is provided (e.g. 192.168.2.7:8080 or 192.168.2.7)
    if not src.startswith("http://") and not src.startswith("https://") and not src.startswith("rtsp://"):
        if re.match(r"^(\d{1,3}\.){3}\d{1,3}(:\d+)?(/.*)?$", src):
            src = f"http://{src}"

    # For HTTP/HTTPS streams (IP Webcam, DroidCam, etc.)
    if src.startswith("http://") or src.startswith("https://"):
        src = src.rstrip("/")
        try:
            parsed = urlparse(src)
            # If path is empty, append /video (standard MJPEG endpoint for IP Webcam / DroidCam)
            if not parsed.path or parsed.path == "":
                src = urlunparse((parsed.scheme, parsed.netloc, "/video", parsed.params, parsed.query, parsed.fragment))
        except Exception:
            if not src.endswith("/video") and not src.endswith("/videofeed") and not src.endswith("/mjpegfeed"):
                src = f"{src}/video"

    return src


class CameraStreamProcessor:
    """Processes a single camera video feed in a dedicated background worker thread."""

    def __init__(
        self,
        camera_id: str,
        source: str,
        name: str = "Border Node",
        zones: Optional[List[Zone]] = None,
        tracker: Optional[BorderTracker] = None,
        feat_extractor: Optional[FeatureExtractor] = None,
        handoff_engine: Optional[PredictiveHandoffEngine] = None,
        db: Optional[EventDatabase] = None,
    ):
        self.camera_id = camera_id
        self.source = source
        # "browser" is a literal marker (not a real cv2 source) meaning:
        # frames arrive via ingest_pushed_frame() from a browser's own
        # getUserMedia capture, pushed over HTTP — used when the viewer's
        # webcam isn't attached to the machine running this backend (e.g.
        # the deployed site), so cv2.VideoCapture on the server has nothing
        # to open.
        self.mode = "push" if source == "browser" else "capture"
        self.last_push_ts: float = 0.0
        self._frame_idx: int = 0
        self._t_prev: float = time.time()
        self.name = name
        self.zones = zones or []
        self.tracker = tracker or BorderTracker()
        self.feat_extractor = feat_extractor or FeatureExtractor()
        self.handoff_engine = handoff_engine or PredictiveHandoffEngine()
        self.db = db or EventDatabase("data/events.db")

        self.zone_manager = ZoneManager()
        for z in self.zones:
            self.zone_manager.add_zone(self.camera_id, z)

        self.latest_raw_frame: Optional[np.ndarray] = None
        self.latest_annotated_frame: Optional[np.ndarray] = None
        self.fps: float = 0.0
        self.is_running: bool = False
        self.connected: bool = False  # True once a real frame has been read from `source`
        self.last_error: Optional[str] = None
        self._thread: Optional[threading.Thread] = None
        self.lock = threading.Lock()

        self.active_tracks: List = []
        self.alert_status_text: str = "PERIMETER SECURE"
        self.alert_banner_timer: int = 0

    def start(self):
        if not self.is_running:
            self.is_running = True
            self._thread = threading.Thread(target=self._worker_loop, daemon=True)
            self._thread.start()
            print(f"[MultiStream] Started camera worker for {self.camera_id} ({self.source})")

    def stop(self):
        self.is_running = False
        self.connected = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)

    @property
    def is_connected(self) -> bool:
        """`connected` accounting for push-mode staleness: a browser tab that
        stopped pushing frames (closed, backgrounded, camera revoked) should
        read as disconnected within a few seconds, not stay "live" forever
        on the last frame it happened to push."""
        if self.mode == "push":
            return self.connected and (time.time() - self.last_push_ts) < 3.0
        return self.connected

    def ingest_pushed_frame(self, jpeg_bytes: bytes):
        """Feed one frame captured by a browser's own getUserMedia (posted
        to POST /cameras/{id}/push-frame) through the same detection +
        annotation pipeline as a cv2-read frame. Used for the "browser"
        source mode, where the webcam is attached to the VIEWER's machine,
        not this backend process — so cv2.VideoCapture has nothing to open
        locally and the browser must ship pixels instead."""
        arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        if arr.size == 0:
            return
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            return
        self.connected = True
        self.last_error = None
        self.last_push_ts = time.time()
        self._process_frame(frame)

    def _process_frame(self, frame):
        """Run tracking, zone-breach evaluation, and OSD annotation on one
        raw BGR frame, then publish it as the latest annotated frame. Shared
        by the cv2 capture loop and ingest_pushed_frame() so both paths get
        identical real detection behavior."""
        self._frame_idx += 1
        now = time.time()
        dt = now - self._t_prev
        self._t_prev = now
        self.fps = 1.0 / max(1e-4, dt)
        timestamp_ms = self._frame_idx * 33.3
        frame_idx = self._frame_idx

        # Run Object Tracking
        tracks = self.tracker.track_frame(frame, frame_idx=frame_idx, timestamp_ms=timestamp_ms)
        self.active_tracks = tracks

        # Draw Zones & Tracks
        annotated = self.zone_manager.draw_zones(frame, camera_id=self.camera_id)
        annotated = self.tracker.draw_tracks(annotated, tracks, show_trail=True, show_fps=False)

        # Evaluate Zone Incursions
        for t in tracks:
            for z in self.zone_manager.get_zones(self.camera_id):
                if z.contains_point(t.centroid):
                    self.alert_status_text = f"BREACH: {t.class_name.upper()} #{t.track_id} IN {z.name}"
                    self.alert_banner_timer = 30

                    # Rate-limit incident creation per track ID (once every 150 frames)
                    if frame_idx % 150 == 0:
                        x1, y1, x2, y2 = [int(v) for v in t.bbox]
                        crop = frame[max(0, y1):min(frame.shape[0], y2), max(0, x1):min(frame.shape[1], x2)]
                        thumb_path = os.path.join(ROOT_DIR, "data", "thumbnails", f"evt_live_{self.camera_id}_{t.track_id}_{int(timestamp_ms)}.jpg")
                        if crop.size > 0:
                            cv2.imwrite(thumb_path, crop)

                        correlate_border_event(
                            camera_id=self.camera_id,
                            global_target_id=f"TRG-{t.track_id:04d}",
                            target_class=t.class_name,
                            event_type="ZONE_INTRUSION",
                            rule_detail=f"Breach inside {z.name} at {self.camera_id}.",
                            in_restricted_zone=True,
                            tripwire_crossed=True,
                            velocity_px_s=75.0,
                            loitering_sec=2.5,
                            thumbnail_path=thumb_path if os.path.exists(thumb_path) else None,
                        )

        # Top CCTV Watermark OSD
        h, w = annotated.shape[:2]
        cv2.rectangle(annotated, (0, 0), (w, 36), (15, 23, 42), -1)
        cv2.putText(annotated, f"NODE: {self.camera_id} | {self.name} | FPS: {self.fps:.1f}", (12, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
        time_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        cv2.putText(annotated, time_str, (w - 240, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (148, 163, 184), 1, cv2.LINE_AA)

        # Alert Banner
        if self.alert_banner_timer > 0:
            self.alert_banner_timer -= 1
            cv2.rectangle(annotated, (0, h - 38), (w, h), (0, 0, 220), -1)
            cv2.putText(annotated, f"🚨 {self.alert_status_text}", (15, h - 12),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)

        with self.lock:
            self.latest_raw_frame = frame
            self.latest_annotated_frame = annotated

    def _worker_loop(self):
        if self.mode == "push":
            # Frames arrive out-of-band via ingest_pushed_frame() (the
            # browser's own webcam capture posted over HTTP) — there's no
            # local device for cv2 to open, so this thread has nothing to do.
            return

        # Resolve source path
        src = normalize_camera_source(self.source)
        if not str(src).isdigit() and not str(src).startswith("http") and not str(src).startswith("rtsp") and not os.path.isabs(src):
            src = os.path.join(ROOT_DIR, src)

        cap_arg = int(src) if str(src).isdigit() else src
        cap = cv2.VideoCapture(cap_arg)
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass
        is_live_source = isinstance(cap_arg, str) and (cap_arg.startswith("http") or cap_arg.startswith("rtsp"))

        self._frame_idx = 0
        self._t_prev = time.time()
        reconnect_attempts = 0

        while self.is_running:
            if not cap.isOpened():
                self.connected = False
                self.last_error = f"Could not open source: {self.source}"
                reconnect_attempts += 1
                time.sleep(1.0)
                cap = cv2.VideoCapture(cap_arg)
                continue

            ret, frame = cap.read()
            if not ret:
                self.connected = False
                if is_live_source:
                    # phone/IP camera dropped — back off and retry the connection
                    self.last_error = f"Lost connection to {self.source}"
                    cap.release()
                    time.sleep(1.0)
                    cap = cv2.VideoCapture(cap_arg)
                else:
                    # Loop video file for continuous live surveillance
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    time.sleep(0.03)
                continue

            self.connected = True
            self.last_error = None
            self._process_frame(frame)

            # Regulate frame rate to ~30 FPS
            time.sleep(0.015)

        cap.release()

    def get_jpeg_frame(self) -> Optional[bytes]:
        with self.lock:
            if self.latest_annotated_frame is None:
                # Return placeholder
                placeholder = np.zeros((360, 640, 3), dtype=np.uint8)
                cv2.putText(placeholder, f"CONNECTING TO {self.camera_id}...", (120, 180),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2)
                ret, buf = cv2.imencode(".jpg", placeholder)
                return buf.tobytes() if ret else None

            ret, buf = cv2.imencode(".jpg", self.latest_annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            return buf.tobytes() if ret else None


def _full_frame_zone(zone_id: str, name: str) -> List[Zone]:
    """A near-full-frame restricted polygon — reliably fires a breach on
    any detection regardless of where in the clip it happens, so demo
    footage doesn't need hand-calibrated zone coordinates."""
    return [
        Zone(
            zone_id=zone_id,
            name=name,
            zone_type=ZoneType.RESTRICTED_POLYGON,
            points=[(40, 40), (814, 40), (814, 440), (40, 440)],
            severity="CRITICAL",
        )
    ]


# Extra camera nodes started lazily on first request (GET /stream/{id} or
# GET /cameras/{id}/source) rather than eagerly at boot, so a demo sector
# with many camera tiles doesn't run N YOLO inference threads before anyone
# has actually tapped a tile to look at it.
LAZY_DEMO_SOURCES: Dict[str, Tuple[str, str]] = {
    "CAM_CHARLIE": ("frontend/public/data/threat_vehicle_rush_web.mp4", "East Ridge Overwatch"),
    "CAM_DELTA": ("frontend/public/data/scenario_checkpoint_breach_web.mp4", "Valley Approach"),
    "CAM_ECHO": ("frontend/public/data/people_surveillance_web.mp4", "South Corridor"),
}


class MultiCameraEcosystemManager:
    """Singleton manager controlling all live camera streams."""

    def __init__(self):
        self.cameras: Dict[str, CameraStreamProcessor] = {}
        self.default_sources: Dict[str, str] = {}
        self.camera_meta: Dict[str, Tuple[str, List[Zone]]] = {}  # camera_id -> (name, zones)
        self.handoff_engine = PredictiveHandoffEngine()
        self.feat_extractor = FeatureExtractor()
        self.db = EventDatabase("data/events.db")
        self._init_default_streams()

    def _init_default_streams(self):
        # Node 1: Checkpost Alpha — a night patrol/watcher clip; the zone
        # covers almost the whole 854x480 frame so the tracker reliably
        # fires a breach the moment anything is detected (a tight
        # hand-calibrated polygon from the old demo footage wouldn't line
        # up with different content).
        cam1_zones = [
            Zone(
                zone_id="alpha_gate_red",
                name="Checkpost Alpha Red Zone",
                zone_type=ZoneType.RESTRICTED_POLYGON,
                points=[(40, 40), (814, 40), (814, 440), (40, 440)],
                severity="CRITICAL",
            ),
        ]
        self.add_camera("CAM_ALPHA", "frontend/public/data/threat_night_crawl_web.mp4", "Checkpost Alpha Gate", cam1_zones)

        # Node 2: BOP Bravo Eastern Corridor — group-breach clip
        cam2_zones = [
            Zone(
                zone_id="bravo_perimeter_red",
                name="BOP Bravo Fence Zone",
                zone_type=ZoneType.RESTRICTED_POLYGON,
                points=[(40, 40), (814, 40), (814, 440), (40, 440)],
                severity="CRITICAL",
            )
        ]
        self.add_camera("CAM_BRAVO", "frontend/public/data/threat_group_breach_web.mp4", "BOP Bravo Perimeter", cam2_zones)

    def add_camera(self, camera_id: str, source: str, name: str, zones: Optional[List[Zone]] = None):
        if camera_id in self.cameras:
            self.cameras[camera_id].stop()

        # remember the original (demo-file) source + config so a phone/IP
        # camera attached later can be reverted cleanly
        if camera_id not in self.default_sources:
            self.default_sources[camera_id] = source
        if camera_id not in self.camera_meta:
            self.camera_meta[camera_id] = (name, zones or [])

        proc = CameraStreamProcessor(
            camera_id=camera_id,
            source=source,
            name=name,
            zones=zones,
            feat_extractor=self.feat_extractor,
            handoff_engine=self.handoff_engine,
            db=self.db,
        )
        self.cameras[camera_id] = proc
        proc.start()

    def set_source(self, camera_id: str, source: str) -> Optional[CameraStreamProcessor]:
        """Point an existing (or new) camera at a new source — e.g. a phone's
        IP-Webcam URL — without restarting the whole process. Pass source
        "demo" to revert a camera back to its original demo-file feed."""
        if source in ("demo", "", None):
            source = self.default_sources.get(camera_id, source)
        else:
            source = normalize_camera_source(source)
        name, zones = self.camera_meta.get(camera_id, (camera_id, []))
        self.add_camera(camera_id, source, name, zones)
        return self.get_camera(camera_id)

    def get_camera(self, camera_id: str) -> Optional[CameraStreamProcessor]:
        if camera_id not in self.cameras and camera_id in LAZY_DEMO_SOURCES:
            source, name = LAZY_DEMO_SOURCES[camera_id]
            self.add_camera(camera_id, source, name, _full_frame_zone(f"{camera_id.lower()}_zone", f"{name} Zone"))
        return self.cameras.get(camera_id)

    def list_camera_ids(self) -> List[str]:
        return list(self.cameras.keys())


# Global Multi-Stream Manager
_stream_manager = MultiCameraEcosystemManager()


def get_stream_manager() -> MultiCameraEcosystemManager:
    return _stream_manager
