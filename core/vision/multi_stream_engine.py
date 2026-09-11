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
from typing import Dict, List, Optional, Tuple, Union

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import cv2
import numpy as np

from core.database.event_db import EventDatabase
from core.database.incident_graph import correlate_border_event
from core.database.schema import AlertSeverity, AlertType, SecurityEvent
from core.rules.abandoned_object import AbandonedObjectDetector
from core.rules.predictive_handoff import PredictiveHandoffEngine
from core.rules.sound_alerts import play_alert
from core.rules.zones import Zone, ZoneManager, ZoneType
from core.vision.face_recognition import FaceRecognitionEngine
from core.vision.low_light import enhance_low_light, is_low_light
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


# Shared AI model singletons across camera streams
_shared_drone_model = None
_shared_anpr_engine = None


def get_drone_model():
    """Lazily loads and caches the YOLOv8 drone detection model."""
    global _shared_drone_model
    if _shared_drone_model is None:
        try:
            from huggingface_hub import hf_hub_download
            from ultralytics import YOLO

            ckpt_path = hf_hub_download(repo_id="Tuzelkhan/drone-yolov8", filename="best.pt")
            _shared_drone_model = YOLO(ckpt_path)
            print("[MultiStream] Drone detection model loaded.")
        except Exception as e:
            print(f"[MultiStream] Drone model unavailable: {e}")
    return _shared_drone_model


def get_anpr_engine():
    """Lazily loads and caches the ANPR (plate YOLO + EasyOCR) engine."""
    global _shared_anpr_engine
    if _shared_anpr_engine is None:
        try:
            from core.vision.anpr import ANPREngine

            engine = ANPREngine(read_every_n_frames=5)
            if engine.is_available:
                _shared_anpr_engine = engine
                print("[MultiStream] ANPR engine initialized successfully.")
        except Exception as e:
            print(f"[MultiStream] ANPR engine unavailable: {e}")
    return _shared_anpr_engine


class SmartStreamReader:
    """Bulletproof multi-protocol video capture engine:
    1. HTTP/HTTPS (IP Webcam, DroidCam): Direct MJPEG byte-stream parsing with /shot.jpg fallback.
       Bypasses OpenCV FFmpeg demuxer bugs ('overread 8', 'Stream ends prematurely') entirely.
    2. Local webcams (0, 1, 2): Direct cv2.VideoCapture with DirectShow on Windows.
    3. Video files: Standard cv2.VideoCapture with automatic looping.
    """

    def __init__(self, source: Union[str, int]):
        self.source = source
        self.is_http = isinstance(source, str) and (source.startswith("http://") or source.startswith("https://"))
        self.is_device = str(source).isdigit() or isinstance(source, int)
        self.running = True
        self.lock = threading.Lock()
        self.latest_frame: Optional[np.ndarray] = None
        self.last_frame_time = 0.0
        self.connected = False
        self.error_msg: Optional[str] = None
        self._thread: Optional[threading.Thread] = None
        self._cap: Optional[cv2.VideoCapture] = None

        if self.is_http:
            self._thread = threading.Thread(target=self._http_worker, daemon=True)
            self._thread.start()
        else:
            cap_arg = int(source) if self.is_device else source
            backend = cv2.CAP_DSHOW if (self.is_device and os.name == "nt") else cv2.CAP_ANY
            self._cap = cv2.VideoCapture(cap_arg, backend)
            if self.is_device:
                try:
                    self._cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                except Exception:
                    pass

    def is_opened(self) -> bool:
        if self.is_http:
            return self.connected or (time.time() - self.last_frame_time < 3.5)
        return self._cap is not None and self._cap.isOpened()

    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        if self.is_http:
            with self.lock:
                if self.latest_frame is not None and (time.time() - self.last_frame_time < 4.0):
                    return True, self.latest_frame.copy()
                return False, None
        else:
            if self._cap is None or not self._cap.isOpened():
                return False, None
            ret, frame = self._cap.read()
            if not ret and not self.is_device:
                self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = self._cap.read()
            return ret, frame

    def release(self):
        self.running = False
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    def _http_worker(self):
        import urllib.request

        url = str(self.source)
        base = url.rsplit("/", 1)[0] if "/video" in url else url
        shot_url = f"{base}/shot.jpg"

        while self.running:
            # 1. Primary: Direct raw HTTP stream boundary parsing
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "IBVAP-Sentinel/1.0"})
                with urllib.request.urlopen(req, timeout=3.5) as stream:
                    bytes_buf = bytearray()
                    while self.running:
                        chunk = stream.read(16384)
                        if not chunk:
                            break
                        bytes_buf.extend(chunk)
                        a = bytes_buf.find(b"\xff\xd8")
                        b = bytes_buf.find(b"\xff\xd9")
                        if a != -1 and b != -1 and b > a:
                            jpg = bytes_buf[a : b + 2]
                            bytes_buf = bytes_buf[b + 2 :]
                            if len(bytes_buf) > 1000000:
                                bytes_buf.clear()
                            frame = cv2.imdecode(np.frombuffer(jpg, dtype=np.uint8), cv2.IMREAD_COLOR)
                            if frame is not None:
                                with self.lock:
                                    self.latest_frame = frame
                                    self.connected = True
                                    self.last_frame_time = time.time()
                                    self.error_msg = None
            except Exception as e:
                self.error_msg = str(e)

            if not self.running:
                break

            # 2. Resilient Fallback: Rapid snapshot polling of /shot.jpg
            for _ in range(15):
                if not self.running:
                    break
                try:
                    req = urllib.request.Request(shot_url, headers={"User-Agent": "IBVAP-Sentinel/1.0"})
                    with urllib.request.urlopen(req, timeout=2.0) as resp:
                        jpg_data = resp.read()
                        if len(jpg_data) > 200:
                            frame = cv2.imdecode(np.frombuffer(jpg_data, dtype=np.uint8), cv2.IMREAD_COLOR)
                            if frame is not None:
                                with self.lock:
                                    self.latest_frame = frame
                                    self.connected = True
                                    self.last_frame_time = time.time()
                                    self.error_msg = None
                                time.sleep(0.04)
                except Exception:
                    time.sleep(0.4)
                    break

            with self.lock:
                if time.time() - self.last_frame_time >= 4.0:
                    self.connected = False
            time.sleep(1.0)


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
        face_engine: Optional[FaceRecognitionEngine] = None,
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
        self.tracker = tracker or BorderTracker(imgsz=640)
        self.feat_extractor = feat_extractor or FeatureExtractor()
        self.handoff_engine = handoff_engine or PredictiveHandoffEngine()
        self.db = db or EventDatabase("data/events.db")
        self.face_engine = face_engine or FaceRecognitionEngine(feat_extractor=self.feat_extractor)
        self.abandoned_detector = AbandonedObjectDetector()
        self._face_check_counter: Dict[int, int] = {}  # track_id -> frames since last face check

        self.zone_manager = ZoneManager()
        for z in self.zones:
            self.zone_manager.add_zone(self.camera_id, z)

        self.latest_raw_frame: Optional[np.ndarray] = None
        self.latest_annotated_frame: Optional[np.ndarray] = None
        self.fps: float = 0.0
        self.is_running: bool = False
        self.connected: bool = False
        self.last_error: Optional[str] = None
        self._thread: Optional[threading.Thread] = None
        self._reader: Optional[SmartStreamReader] = None
        self.lock = threading.Lock()

        self.active_tracks: List = []
        self.alert_status_text: str = "PERIMETER SECURE"
        self.alert_banner_timer: int = 0

    def start(self):
        if not self.is_running:
            self.is_running = True
            if self.source not in (None, "", "standby"):
                self._thread = threading.Thread(target=self._worker_loop, daemon=True)
                self._thread.start()
                print(f"[MultiStream] Started camera worker for {self.camera_id} ({self.source})")
            else:
                self.connected = False
                self.alert_status_text = "STANDBY"
                print(f"[MultiStream] Camera {self.camera_id} in STANDBY mode (ready for live camera / phone IP)")

    def stop(self):
        self.is_running = False
        self.connected = False
        if self._reader:
            self._reader.release()
            self._reader = None
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
        """Run low-light enhancement, tracking, zone/abandoned-object/face
        evaluation, and OSD annotation on one raw BGR frame, then publish
        it as the latest annotated frame. Shared by the cv2 capture loop
        and ingest_pushed_frame() so both paths get identical real
        detection behavior."""
        self._frame_idx += 1
        now = time.time()
        dt = now - self._t_prev
        self._t_prev = now
        self.fps = 1.0 / max(1e-4, dt)
        timestamp_ms = self._frame_idx * 33.3
        frame_idx = self._frame_idx

        # Real (image-based, not wall-clock) low-light detection — only dark
        # frames pay the enhancement cost, and both detection and the
        # displayed frame use the enhanced version so the effect is visible.
        dark = is_low_light(frame)
        detect_frame = enhance_low_light(frame) if dark else frame

        # Run Object Tracking
        tracks = self.tracker.track_frame(detect_frame, frame_idx=frame_idx, timestamp_ms=timestamp_ms)
        self.active_tracks = tracks

        # Draw Zones & Tracks
        annotated = self.zone_manager.draw_zones(detect_frame, camera_id=self.camera_id)
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
                        crop = detect_frame[max(0, y1):min(detect_frame.shape[0], y2), max(0, x1):min(detect_frame.shape[1], x2)]
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
                            is_night_time=dark,
                        )

        # Abandoned-object check: a bag/backpack/suitcase that's stayed put
        # for a while with no person track near it.
        for obj in self.abandoned_detector.update(tracks, timestamp_ms):
            self.alert_status_text = f"ABANDONED {obj['class_name'].upper()} #{obj['track_id']} — unattended {obj['stationary_sec']:.0f}s"
            self.alert_banner_timer = 45
            x1, y1, x2, y2 = [int(v) for v in obj["bbox"]]
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 0, 255), 3)
            cv2.putText(annotated, "ABANDONED", (x1, max(14, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 2, cv2.LINE_AA)

            crop = detect_frame[max(0, y1):min(detect_frame.shape[0], y2), max(0, x1):min(detect_frame.shape[1], x2)]
            thumb_path = os.path.join(ROOT_DIR, "data", "thumbnails", f"evt_live_{self.camera_id}_abandoned_{obj['track_id']}_{int(timestamp_ms)}.jpg")
            if crop.size > 0:
                cv2.imwrite(thumb_path, crop)
            correlate_border_event(
                camera_id=self.camera_id,
                global_target_id=f"TRG-{obj['track_id']:04d}",
                target_class=obj["class_name"],
                event_type="ABANDONED_OBJECT",
                rule_detail=f"{obj['class_name']} unattended for {obj['stationary_sec']:.0f}s at {self.camera_id}.",
                in_restricted_zone=False,
                tripwire_crossed=False,
                velocity_px_s=0.0,
                loitering_sec=obj["stationary_sec"],
                thumbnail_path=thumb_path if os.path.exists(thumb_path) else None,
                is_night_time=dark,
            )

        # Face recognition on person tracks — checked every ~10 frames per
        # track (Haar cascade + embedding on every single frame for every
        # person would burn CPU for no benefit; identity doesn't change
        # frame-to-frame).
        for t in tracks:
            if t.class_name != "person":
                continue
            self._face_check_counter[t.track_id] = self._face_check_counter.get(t.track_id, 0) + 1
            if self._face_check_counter[t.track_id] % 10 != 1:
                continue

            x1, y1, x2, y2 = [int(v) for v in t.bbox]
            crop = detect_frame[max(0, y1):min(detect_frame.shape[0], y2), max(0, x1):min(detect_frame.shape[1], x2)]
            match = self.face_engine.match_person_crop(crop)
            if not match:
                continue

            label = f"{match['name'].upper()} ({match['role']})"
            cv2.putText(annotated, label, (x1, min(annotated.shape[0] - 6, y2 + 18)), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                        (0, 0, 255) if match["role"] == "watchlist" else (0, 255, 120), 2, cv2.LINE_AA)

            if match["role"] == "watchlist":
                self.alert_status_text = f"FACE MATCH: {match['name'].upper()} ON WATCHLIST"
                self.alert_banner_timer = 45
                thumb_path = os.path.join(ROOT_DIR, "data", "thumbnails", f"evt_live_{self.camera_id}_face_{t.track_id}_{int(timestamp_ms)}.jpg")
                if crop.size > 0:
                    cv2.imwrite(thumb_path, crop)
                correlate_border_event(
                    camera_id=self.camera_id,
                    global_target_id=f"TRG-{t.track_id:04d}",
                    target_class="person",
                    event_type="FACE_WATCHLIST_MATCH",
                    rule_detail=f"Face match: {match['name']} (similarity {match['similarity']}) at {self.camera_id}.",
                    in_restricted_zone=False,
                    tripwire_crossed=False,
                    velocity_px_s=0.0,
                    loitering_sec=0.0,
                    thumbnail_path=thumb_path if os.path.exists(thumb_path) else None,
                    is_night_time=dark,
                )

        # Top CCTV Watermark OSD
        h, w = annotated.shape[:2]
        cv2.rectangle(annotated, (0, 0), (w, 36), (15, 23, 42), -1)
        cv2.putText(annotated, f"NODE: {self.camera_id} | {self.name} | FPS: {self.fps:.1f}", (12, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
        time_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        cv2.putText(annotated, time_str, (w - 240, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (148, 163, 184), 1, cv2.LINE_AA)
        if dark:
            cv2.putText(annotated, "LOW-LIGHT ENHANCEMENT: ON", (12, 52), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 220, 255), 1, cv2.LINE_AA)

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

        is_live_source = isinstance(src, str) and (src.startswith("http://") or src.startswith("https://") or src.startswith("rtsp://"))
        is_device_source = str(src).isdigit() or isinstance(src, int)
        is_external_live = is_live_source or is_device_source

        self._reader = SmartStreamReader(src)
        frame_idx = 0
        t_prev = time.time()
        consecutive_misses = 0

        # AI tracking / detection caches
        cached_tracks = []
        cached_plate_results = []
        cached_drone_boxes = []

        while self.is_running:
            ret, frame = self._reader.read()
            if not ret or frame is None:
                consecutive_misses += 1
                if consecutive_misses > 25:
                    self.connected = False
                    self.alert_banner_timer = 0
                    self.alert_status_text = "CONNECTING..."
                    self.last_error = self._reader.error_msg or f"Waiting for stream from {self.source}..."
                time.sleep(0.035)
                continue

            consecutive_misses = 0
            self.connected = True
            self.last_error = None
            frame_idx += 1
            now = time.time()
            dt = now - t_prev
            t_prev = now
            self.fps = 1.0 / max(1e-4, dt)
            timestamp_ms = frame_idx * 33.3

            # Publish raw frame immediately so preview appears without waiting for first AI inference pass
            if self.latest_annotated_frame is None:
                with self.lock:
                    self.latest_raw_frame = frame
                    self.latest_annotated_frame = frame.copy()

            h, w = frame.shape[:2]

            # ── 1. Person & Vehicle Tracking (alternate frames for CPU speed) ──
            run_tracking = (frame_idx % 2 == 0)
            if run_tracking:
                tracks = self.tracker.track_frame(frame, frame_idx=frame_idx, timestamp_ms=timestamp_ms)
                # Filter out low-confidence flicker
                tracks = [t for t in tracks if getattr(t, "confidence", 0.0) >= 0.52]
                self.active_tracks = tracks
                cached_tracks = tracks
            else:
                tracks = cached_tracks

            # Draw Base Zones & Tracks
            annotated = self.zone_manager.draw_zones(frame, camera_id=self.camera_id)
            annotated = self.tracker.draw_tracks(annotated, tracks, show_trail=True, show_fps=False)

            # ── 2. ANPR Number Plate Detection (Vehicles & Cutouts) ──
            anpr = get_anpr_engine()
            if anpr and (frame_idx % 6 == 0 or not cached_plate_results):
                try:
                    new_plates = anpr.process_frame(
                        frame=frame,
                        tracks=tracks,
                        frame_idx=frame_idx,
                        timestamp_ms=timestamp_ms,
                        camera_id=self.camera_id,
                    )
                    cached_plate_results = new_plates if new_plates else []
                except Exception:
                    pass

            if anpr and cached_plate_results:
                annotated = anpr.draw_plates(annotated, cached_plate_results)
                for pr in cached_plate_results:
                    if pr and pr.plate_text and len(pr.plate_text.strip()) >= 3:
                        is_hit = getattr(pr, "is_hotlist", False)
                        if is_hit:
                            self.alert_status_text = f"WATCHLIST HIT: {pr.plate_text} [{pr.hotlist_reason}]"
                        else:
                            self.alert_status_text = f"NUMBER PLATE DETECTED: {pr.plate_text}"
                        self.alert_banner_timer = 40
                        if frame_idx % 25 == 0:
                            play_alert("CRITICAL" if is_hit else "WARNING")
                            if is_hit:
                                trigger_physical_breach()
                            ev = SecurityEvent(
                                event_id=f"evt_anpr_{self.camera_id}_{int(timestamp_ms)}",
                                timestamp_iso=datetime.now(timezone.utc).isoformat(),
                                timestamp_ms=timestamp_ms,
                                camera_id=self.camera_id,
                                track_id=getattr(pr, "track_id", -1),
                                class_name="vehicle",
                                alert_type=AlertType.ANPR_HOTLIST_HIT,
                                severity=AlertSeverity.CRITICAL,
                                zone_id="CHECKPOINT_ANPR",
                                zone_name=f"{self.name} Ingress Lane",
                                details=f"Plate Optical Scan: {pr.plate_text} - HOTLIST MATCH: {pr.hotlist_reason}",
                                bbox=pr.plate_bbox or [0, 0, 0, 0],
                                centroid=[(pr.plate_bbox[0] + pr.plate_bbox[2]) / 2.0, (pr.plate_bbox[1] + pr.plate_bbox[3]) / 2.0] if pr.plate_bbox else [0, 0],
                                rule_name="ANPR Optical Enforcement",
                                confidence=pr.ocr_confidence,
                            )
                            self.db.insert_event(ev)

            # ── 3. Aerial Drone Detection (every 3rd frame, high confidence only) ──
            drone_model = get_drone_model()
            if drone_model is not None and frame_idx % 3 == 0:
                try:
                    d_results = drone_model(frame, conf=0.65, verbose=False)
                    new_drones = []
                    for r in d_results:
                        if r.boxes is not None:
                            for b in r.boxes:
                                dx1, dy1, dx2, dy2 = map(int, b.xyxy[0].cpu().numpy())
                                dconf = float(b.conf[0].cpu())
                                bw, bh = dx2 - dx1, dy2 - dy1
                                # Discard noise / room corners
                                if bw >= 30 and bh >= 30 and dconf >= 0.65:
                                    new_drones.append((dx1, dy1, dx2, dy2, dconf))
                    cached_drone_boxes = new_drones
                    if new_drones:
                        self.alert_status_text = f"CRITICAL: AERIAL DRONE INTRUSION ({new_drones[0][4]:.2f})"
                        self.alert_banner_timer = 40
                        if frame_idx % 20 == 0:
                            play_alert("CRITICAL")
                            trigger_physical_breach()
                            ev = SecurityEvent(
                                event_id=f"evt_drone_{self.camera_id}_{int(timestamp_ms)}",
                                timestamp_iso=datetime.now(timezone.utc).isoformat(),
                                timestamp_ms=timestamp_ms,
                                camera_id=self.camera_id,
                                track_id=-1,
                                class_name="drone",
                                alert_type=AlertType.AERIAL_INTRUSION,
                                severity=AlertSeverity.CRITICAL,
                                zone_id="AIRSPACE_RESTRICTED",
                                zone_name="Restricted Low-Altitude Corridor",
                                details=f"AERIAL THREAT: Hostile drone detected in restricted airspace (conf: {new_drones[0][4]:.2f})",
                                bbox=list(new_drones[0][:4]),
                                centroid=[(new_drones[0][0] + new_drones[0][2]) / 2.0, (new_drones[0][1] + new_drones[0][3]) / 2.0],
                                rule_name="Aerial Threat Intercept",
                                confidence=new_drones[0][4],
                            )
                            self.db.insert_event(ev)
                except Exception:
                    pass

            # Draw drone boxes & warning strobe
            for (dx1, dy1, dx2, dy2, dconf) in cached_drone_boxes:
                cv2.rectangle(annotated, (dx1, dy1), (dx2, dy2), (0, 0, 255), 3)
                dlabel = f"AERIAL DRONE {dconf:.2f}"
                (tw, th), _ = cv2.getTextSize(dlabel, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
                cv2.rectangle(annotated, (dx1, max(0, dy1 - th - 8)), (dx1 + tw + 6, dy1), (0, 0, 200), -1)
                cv2.putText(annotated, dlabel, (dx1 + 3, max(12, dy1 - 4)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)
                if (frame_idx // 4) % 2 == 0:
                    cv2.rectangle(annotated, (0, 0), (w - 1, h - 1), (0, 0, 255), 6)

            # ── 4. Evaluate Zone Incursions & Person Threat Triggers ──
            has_breach = False
            for t in tracks:
                # Require genuine persistent track (not 1-frame jitter)
                if getattr(t, "confidence", 0.0) < 0.52 or len(getattr(t, "trajectory", [])) < 2:
                    continue

                in_breach = False
                matched_zone_name = "Perimeter"
                if is_external_live and t.class_name in ("person", "car", "truck", "motorcycle"):
                    in_breach = True
                    matched_zone_name = "Live Corridor"
                else:
                    for z in self.zone_manager.get_zones(self.camera_id):
                        if z.contains_point(t.centroid):
                            in_breach = True
                            matched_zone_name = z.name
                            break

                if in_breach:
                    has_breach = True
                    self.alert_status_text = f"BREACH: {t.class_name.upper()} #{t.track_id} IN {matched_zone_name}"
                    self.alert_banner_timer = 35

                    # Rate-limit incident creation per track ID (once every 30 frames)
                    if frame_idx % 30 == 0:
                        play_alert("CRITICAL")
                        trigger_physical_breach()
                        x1, y1, x2, y2 = [int(v) for v in t.bbox]
                        crop = frame[max(0, y1):min(frame.shape[0], y2), max(0, x1):min(frame.shape[1], x2)]
                        thumb_path = os.path.join(ROOT_DIR, "data", "thumbnails", f"evt_live_{self.camera_id}_{t.track_id}_{int(timestamp_ms)}.jpg")
                        if crop.size > 0:
                            cv2.imwrite(thumb_path, crop)

                        ev = SecurityEvent(
                            event_id=f"evt_live_{self.camera_id}_{t.track_id}_{int(timestamp_ms)}",
                            timestamp_iso=datetime.now(timezone.utc).isoformat(),
                            timestamp_ms=timestamp_ms,
                            camera_id=self.camera_id,
                            track_id=t.track_id,
                            class_name=t.class_name,
                            alert_type=AlertType.ZONE_INTRUSION,
                            severity=AlertSeverity.CRITICAL,
                            zone_id="LIVE_INGRESS_ZONE",
                            zone_name=matched_zone_name,
                            details=f"Live Camera Threat: {t.class_name.upper()} #{t.track_id} detected in {matched_zone_name}",
                            bbox=t.bbox,
                            centroid=t.centroid,
                            rule_name="Live Optical Spatial Containment",
                            confidence=t.confidence,
                        )
                        self.db.insert_event(ev)

                        correlate_border_event(
                            camera_id=self.camera_id,
                            global_target_id=f"TRG-{t.track_id:04d}",
                            target_class=t.class_name,
                            event_type="ZONE_INTRUSION",
                            rule_detail=f"Breach inside {matched_zone_name} at {self.camera_id}.",
                            in_restricted_zone=True,
                            tripwire_crossed=True,
                            velocity_px_s=75.0,
                            loitering_sec=2.5,
                            thumbnail_path=thumb_path if os.path.exists(thumb_path) else None,
                        )

            # If nothing is in breach, no drones, and no plates: reset status immediately
            has_plate = any(bool(p and p.plate_text and len(p.plate_text.strip()) >= 3) for p in cached_plate_results)
            if not has_breach and not cached_drone_boxes and not has_plate:
                self.alert_banner_timer = 0
                self.alert_status_text = "PERIMETER SECURE"

            # ── 5. Top CCTV Watermark OSD ──
            drone_tag = f" | DRONE: {len(cached_drone_boxes)}" if cached_drone_boxes else ""
            plate_tag = f" | PLATES: {len(cached_plate_results)}" if cached_plate_results else ""
            cv2.rectangle(annotated, (0, 0), (w, 36), (15, 23, 42), -1)
            cv2.putText(annotated, f"NODE: {self.camera_id} | {self.name} | FPS: {self.fps:.1f} | TRK: {len(tracks)}{plate_tag}{drone_tag}",
                        (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255, 255, 255), 1, cv2.LINE_AA)
            time_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            cv2.putText(annotated, time_str, (max(10, w - 240), 24), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (148, 163, 184), 1, cv2.LINE_AA)

            # ── 6. Alert Banner ──
            if self.alert_banner_timer > 0:
                self.alert_banner_timer -= 1
                cv2.rectangle(annotated, (0, h - 38), (w, h), (0, 0, 220), -1)
                cv2.putText(annotated, f"🚨 {self.alert_status_text}", (15, h - 12),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)

            with self.lock:
                self.latest_raw_frame = frame
                self.latest_annotated_frame = annotated

            # Regulate frame rate
            time.sleep(0.015)

        if self._reader:
            self._reader.release()
            self._reader = None

    def get_jpeg_frame(self) -> Optional[bytes]:
        with self.lock:
            if self.source in (None, "", "standby") or self.latest_annotated_frame is None:
                placeholder = np.zeros((480, 854, 3), dtype=np.uint8)
                # Draw dark sleek grid background
                for y in range(0, 480, 40):
                    cv2.line(placeholder, (0, y), (854, y), (18, 24, 34), 1)
                for x in range(0, 854, 40):
                    cv2.line(placeholder, (x, 0), (x, 480), (18, 24, 34), 1)

                # Outer border & reticle
                cv2.rectangle(placeholder, (15, 15), (839, 465), (35, 50, 75), 1)
                cv2.circle(placeholder, (427, 240), 90, (35, 50, 75), 1)
                cv2.circle(placeholder, (427, 240), 4, (0, 220, 255), -1)
                cv2.line(placeholder, (387, 240), (467, 240), (45, 65, 95), 1)
                cv2.line(placeholder, (427, 200), (427, 280), (45, 65, 95), 1)

                # Top tactical banner
                cv2.rectangle(placeholder, (0, 0), (854, 38), (12, 18, 30), -1)
                cv2.putText(placeholder, f"IBVAP SENTINEL CCTV NODE // {self.camera_id} [{self.name.upper()}]", (20, 25),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 220, 255), 2, cv2.LINE_AA)
                time_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                cv2.putText(placeholder, time_str, (620, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (148, 163, 184), 1, cv2.LINE_AA)

                if self.source in (None, "", "standby"):
                    cv2.putText(placeholder, "STATUS: STANDBY // NO ACTIVE CAM FEED", (50, 100),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (148, 163, 184), 2, cv2.LINE_AA)
                    cv2.putText(placeholder, "HOW TO CONNECT YOUR PHONE CAMERA:", (50, 160),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)
                    cv2.putText(placeholder, "1. Open 'IP Webcam' on your phone and tap 'Start server' at the bottom", (60, 205),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (250, 204, 21), 1, cv2.LINE_AA)
                    cv2.putText(placeholder, "2. Note the IP shown (e.g. 192.168.1.4:8080)", (60, 245),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1, cv2.LINE_AA)
                    cv2.putText(placeholder, "3. Type your IP in the box above and click Connect", (60, 285),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (74, 222, 128), 2, cv2.LINE_AA)
                    cv2.putText(placeholder, "[OR select Device '0' to connect your laptop's built-in webcam]", (50, 350),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 220, 255), 1, cv2.LINE_AA)
                else:
                    err_text = self.last_error or "Connecting to camera stream..."
                    cv2.putText(placeholder, f"TARGET: {self.source}", (50, 95),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.52, (200, 200, 200), 1, cv2.LINE_AA)
                    cv2.putText(placeholder, f"STATUS: {err_text}", (50, 135),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 165, 255), 2, cv2.LINE_AA)
                    cv2.putText(placeholder, "Connecting to stream...", (50, 190),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (250, 204, 21), 2, cv2.LINE_AA)
                    cv2.putText(placeholder, "- Verify phone and laptop are on the same Wi-Fi network", (60, 230),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (180, 180, 180), 1, cv2.LINE_AA)
                    cv2.putText(placeholder, "- Make sure you tapped 'Start server' in IP Webcam on your phone", (60, 265),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (250, 204, 21), 1, cv2.LINE_AA)
                    cv2.putText(placeholder, "- Stream will start automatically once connection is established", (60, 300),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (74, 222, 128), 1, cv2.LINE_AA)

                ret, buf = cv2.imencode(".jpg", placeholder, [cv2.IMWRITE_JPEG_QUALITY, 85])
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
# GET /cameras/{id}/source) rather than eagerly at boot
LAZY_DEMO_SOURCES: Dict[str, Tuple[str, str]] = {
    "CAM_CHARLIE": ("frontend/public/data/threat_vehicle_rush_web.mp4", "East Ridge Overwatch"),
    "CAM_DELTA": ("frontend/public/data/scenario_checkpoint_breach_web.mp4", "Valley Approach"),
    "CAM_ECHO": ("frontend/public/data/people_surveillance_web.mp4", "South Corridor"),
}

DEMO_FALLBACK_SOURCES: Dict[str, str] = {
    "CAM_ALPHA": "frontend/public/data/threat_night_crawl_web.mp4",
    "CAM_BRAVO": "frontend/public/data/threat_group_breach_web.mp4",
    "CAM_CHARLIE": "frontend/public/data/threat_vehicle_rush_web.mp4",
    "CAM_DELTA": "frontend/public/data/scenario_checkpoint_breach_web.mp4",
    "CAM_ECHO": "frontend/public/data/people_surveillance_web.mp4",
}


class MultiCameraEcosystemManager:
    """Singleton manager controlling all live camera streams."""

    def __init__(self):
        self.cameras: Dict[str, CameraStreamProcessor] = {}
        self.default_sources: Dict[str, str] = {}
        self.camera_meta: Dict[str, Tuple[str, List[Zone]]] = {}  # camera_id -> (name, zones)
        self.handoff_engine = PredictiveHandoffEngine()
        self.feat_extractor = FeatureExtractor()
        self.face_engine = FaceRecognitionEngine(feat_extractor=self.feat_extractor)
        self.db = EventDatabase("data/events.db")
        self._init_default_streams()

    def _init_default_streams(self):
        # By default, start CAM_ALPHA and CAM_BRAVO in STANDBY mode ready for
        # real phone IP Webcam or local webcam. NO canned demo videos and NO false breach alarms!
        cam1_zones = [
            Zone(
                zone_id="alpha_gate_red",
                name="Checkpost Alpha Red Zone",
                zone_type=ZoneType.RESTRICTED_POLYGON,
                points=[(40, 40), (814, 40), (814, 440), (40, 440)],
                severity="CRITICAL",
            ),
        ]
        self.add_camera("CAM_ALPHA", "standby", "Checkpost Alpha Gate", cam1_zones)

        cam2_zones = [
            Zone(
                zone_id="bravo_perimeter_red",
                name="BOP Bravo Fence Zone",
                zone_type=ZoneType.RESTRICTED_POLYGON,
                points=[(40, 40), (814, 40), (814, 440), (40, 440)],
                severity="CRITICAL",
            )
        ]
        self.add_camera("CAM_BRAVO", "standby", "BOP Bravo Perimeter", cam2_zones)

    def add_camera(self, camera_id: str, source: str, name: str, zones: Optional[List[Zone]] = None):
        if camera_id in self.cameras:
            self.cameras[camera_id].stop()

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
            face_engine=self.face_engine,
        )
        self.cameras[camera_id] = proc
        proc.start()

    def set_source(self, camera_id: str, source: str) -> Optional[CameraStreamProcessor]:
        """Point an existing (or new) camera at a new source — e.g. a phone's
        IP-Webcam URL — without restarting the whole process. Pass source
        "demo" to revert a camera back to demo-file feed."""
        if source == "demo":
            source = DEMO_FALLBACK_SOURCES.get(camera_id, "frontend/public/data/threat_night_crawl_web.mp4")
        elif source in ("", None, "standby"):
            source = "standby"
        else:
            source = normalize_camera_source(source)
            # If another camera is already bound to this exact live stream, switch that one to standby
            for other_id, other_proc in list(self.cameras.items()):
                if other_id != camera_id and getattr(other_proc, "source", None) == source:
                    other_name, other_zones = self.camera_meta.get(other_id, (other_id, []))
                    self.add_camera(other_id, "standby", other_name, other_zones)
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
