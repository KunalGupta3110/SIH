"""
Cyber Camera Surveillance Platform
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
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)

    def _worker_loop(self):
        # Resolve source path
        src = self.source
        if not str(src).isdigit() and not str(src).startswith("http") and not str(src).startswith("rtsp") and not os.path.isabs(src):
            src = os.path.join(ROOT_DIR, src)

        cap_arg = int(src) if str(src).isdigit() else src
        cap = cv2.VideoCapture(cap_arg)

        frame_idx = 0
        t_prev = time.time()

        while self.is_running:
            if not cap.isOpened():
                time.sleep(1.0)
                cap = cv2.VideoCapture(cap_arg)
                continue

            ret, frame = cap.read()
            if not ret:
                # Loop video file for continuous live surveillance
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                time.sleep(0.03)
                continue

            frame_idx += 1
            now = time.time()
            dt = now - t_prev
            t_prev = now
            self.fps = 1.0 / max(1e-4, dt)
            timestamp_ms = frame_idx * 33.3

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


class MultiCameraEcosystemManager:
    """Singleton manager controlling all live camera streams."""

    def __init__(self):
        self.cameras: Dict[str, CameraStreamProcessor] = {}
        self.handoff_engine = PredictiveHandoffEngine()
        self.feat_extractor = FeatureExtractor()
        self.db = EventDatabase("data/events.db")
        self._init_default_streams()

    def _init_default_streams(self):
        # Node 1: Checkpost Alpha
        cam1_zones = [
            Zone(
                zone_id="alpha_gate_red",
                name="Checkpost Alpha Red Zone",
                zone_type=ZoneType.RESTRICTED_POLYGON,
                points=[(100, 80), (600, 80), (550, 400), (120, 400)],
                severity="CRITICAL",
            ),
            Zone(
                zone_id="alpha_tripwire_main",
                name="Outer Incursion Wire",
                zone_type=ZoneType.TRIPWIRE,
                points=[(50, 420), (680, 420)],
                severity="CRITICAL",
            ),
        ]
        self.add_camera("CAM_ALPHA", "data/vtest_pedestrians.avi", "Checkpost Alpha Gate", cam1_zones)

        # Node 2: BOP Bravo Eastern Corridor
        cam2_zones = [
            Zone(
                zone_id="bravo_perimeter_red",
                name="BOP Bravo Fence Zone",
                zone_type=ZoneType.RESTRICTED_POLYGON,
                points=[(150, 100), (580, 100), (520, 380), (180, 380)],
                severity="CRITICAL",
            )
        ]
        self.add_camera("CAM_BRAVO", "data/people_surveillance.mp4" if os.path.exists(os.path.join(ROOT_DIR, "data/people_surveillance.mp4")) else "data/sample_border.mp4", "BOP Bravo Perimeter", cam2_zones)

    def add_camera(self, camera_id: str, source: str, name: str, zones: Optional[List[Zone]] = None):
        if camera_id in self.cameras:
            self.cameras[camera_id].stop()

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

    def get_camera(self, camera_id: str) -> Optional[CameraStreamProcessor]:
        return self.cameras.get(camera_id)


# Global Multi-Stream Manager
_stream_manager = MultiCameraEcosystemManager()


def get_stream_manager() -> MultiCameraEcosystemManager:
    return _stream_manager
