"""
IBVAP Sentinel — core/vision/live_pipeline.py
Module: Live Camera YOLO Pipeline (Webcam / Phone IP Camera)

WHY THIS FILE EXISTS
---------------------
core/vision/pipeline.py (SurveillancePipeline) is the project's REAL YOLO
engine — YOLOv8n + ByteTrack for person/vehicle tracking, wired into the
threat-scoring engine, the SQLite database, and the evidence blockchain
ledger. It already works. It just only reads pre-recorded demo .mp4 files.

This file does NOT reinvent that. It subclasses SurveillancePipeline and
adds exactly two things:
  1. A way to point the SAME tracker at a LIVE source (webcam index 0,
     or a phone's IP Webcam URL) instead of only a saved video file.
  2. A SECOND YOLO model (drone detector) running on every frame
     alongside the existing person/vehicle tracker, feeding into the
     same incident pipeline as an ENVIRONMENTAL/AERIAL_INTRUSION event.

Performance optimizations for live use:
  - Frame skipping: Only runs YOLO inference every N frames (default: 2),
    reuses previous detections on skipped frames for smooth display.
  - Re-ID throttling: Only extracts Re-ID features every 10 frames per track.
  - DB write throttling: Only writes to DB every EVENT_EMIT_EVERY_N_FRAMES.
  - Drone detection disabled by default (heavy second model).
  - ANPR (number plate detection + OCR) integrated on vehicle tracks.

Run it directly for a live demo:
    python -m core.vision.live_pipeline --source 0 --camera-id CAM_ALPHA
    python -m core.vision.live_pipeline --source "http://192.168.1.5:8080/video" --camera-id CAM_ALPHA
"""

from __future__ import annotations

import argparse
import logging
import time
from pathlib import Path
from typing import List, Optional, Union

import cv2
import numpy as np

from core.vision.pipeline import SurveillancePipeline, EVENT_EMIT_EVERY_N_FRAMES
from core.vision.reid import FeatureExtractor  # noqa: F401  (kept for parity with pipeline.py imports)
from reid.embed import FeatureExtractor as ReidFeatureExtractor

logger = logging.getLogger("ibvap.vision.live_pipeline")

# ---------------------------------------------------------------------------
# Drone model config
# ---------------------------------------------------------------------------
# Pretrained drone-detection YOLOv8 weights (downloaded once, cached locally
# by huggingface_hub). This is a SEPARATE model from the person/vehicle
# tracker — plain yolov8n.pt was never trained to recognize drones, so we
# run a second, purpose-trained model on the same frame instead of trying
# to fine-tune anything ourselves.
DRONE_MODEL_REPO = "Tuzelkhan/drone-yolov8"
DRONE_MODEL_FILENAME = "best.pt"
DRONE_CONF_THRESHOLD = 0.40

# ---------------------------------------------------------------------------
# Performance tuning for live feeds
# ---------------------------------------------------------------------------
INFER_EVERY_N_FRAMES = 2     # Run YOLO every N frames (1 = every frame, 2 = skip alternate)
REID_EVERY_N_FRAMES = 10     # Run Re-ID feature extraction every N frames per track
ANPR_EVERY_N_FRAMES = 5      # Run ANPR per vehicle track every N frames


def _load_drone_model():
    """Downloads (once, cached) and loads the pretrained drone YOLO model."""
    from huggingface_hub import hf_hub_download
    from ultralytics import YOLO

    ckpt_path = hf_hub_download(repo_id=DRONE_MODEL_REPO, filename=DRONE_MODEL_FILENAME)
    logger.info("Loaded drone-detection model from %s", ckpt_path)
    return YOLO(ckpt_path)


class LiveSurveillancePipeline(SurveillancePipeline):
    """
    Same tracker, same Re-ID, same threat scoring, same evidence ledger as
    SurveillancePipeline — just able to read from a LIVE source, with
    performance optimizations for real-time use, ANPR (number plate detection),
    and an optional drone detection model.
    """

    def __init__(
        self,
        *args,
        enable_drone_detection: bool = False,
        enable_anpr: bool = True,
        infer_every_n: int = INFER_EVERY_N_FRAMES,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)
        self.enable_drone_detection = enable_drone_detection
        self.enable_anpr = enable_anpr
        self.infer_every_n = max(1, infer_every_n)
        self.drone_model = _load_drone_model() if enable_drone_detection else None

        # Initialize ANPR engine
        self.anpr_engine = None
        if enable_anpr:
            try:
                from core.vision.anpr import ANPREngine
                self.anpr_engine = ANPREngine(
                    read_every_n_frames=ANPR_EVERY_N_FRAMES,
                    device=self.device,
                )
                if self.anpr_engine.is_available:
                    logger.info("ANPR engine initialized successfully.")
                else:
                    logger.warning("ANPR engine loaded but OCR is not available (install easyocr).")
                    self.anpr_engine = None
            except Exception as e:
                logger.warning("Could not initialize ANPR engine: %s", e)
                self.anpr_engine = None

    def process_live_source(
        self,
        camera_id: str,
        source: Union[int, str],
        max_frames: Optional[int] = None,
        show_window: bool = True,
    ):
        """
        Runs the full pipeline (person/vehicle tracking + Re-ID + threat
        scoring + evidence ledger + ANPR + optional drone detection) on a LIVE source.

        Performance optimizations:
          - YOLO inference runs every `infer_every_n` frames; skipped frames reuse
            the previous detections for display continuity.
          - Re-ID features extracted every REID_EVERY_N_FRAMES per track.
          - ANPR runs on its own cadence per vehicle track.

        source:
            0                                   -> laptop's built-in webcam
            1                                   -> a USB webcam (try if 0 is wrong device)
            "http://192.168.1.5:8080/video"      -> phone running IP Webcam app
        """
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            raise RuntimeError(
                f"Could not open live source: {source!r}. "
                f"If using a phone, confirm the IP Webcam URL works in a browser first."
            )

        fps_in = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
        self.tracker.reset()

        t_start = time.time()
        frame_idx = 0
        detections_written = 0
        events_ingested = 0
        cross_cam_matches = 0
        drone_alerts = 0
        plates_detected = 0

        # Cache for frame skipping: reuse previous tracked objects on skipped frames
        cached_tracked_objects = []
        cached_plate_results = []

        # FPS calculation
        fps_counter = 0
        fps_timer = time.time()
        display_fps = 0.0

        logger.info("Live pipeline started on %s (camera_id=%s). Press 'q' to stop.", source, camera_id)
        logger.info(
            "Performance: infer_every=%d, reid_every=%d, anpr=%s, drone=%s",
            self.infer_every_n, REID_EVERY_N_FRAMES,
            "ON" if self.anpr_engine else "OFF",
            "ON" if self.enable_drone_detection else "OFF",
        )

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    logger.warning("Frame read failed - source disconnected.")
                    break
                frame_idx += 1
                if max_frames and frame_idx > max_frames:
                    break

                timestamp_ms = (frame_idx / fps_in) * 1000.0

                # FPS tracking
                fps_counter += 1
                elapsed = time.time() - fps_timer
                if elapsed >= 1.0:
                    display_fps = fps_counter / elapsed
                    fps_counter = 0
                    fps_timer = time.time()

                # ---- YOLO inference (with frame skipping) ----
                run_inference = (frame_idx % self.infer_every_n == 0)

                if run_inference:
                    tracked_objects = self.tracker.track_frame(
                        frame, frame_idx=frame_idx, timestamp_ms=timestamp_ms
                    )
                    cached_tracked_objects = tracked_objects

                    # ---- Re-ID + DB writes (throttled) ----
                    for obj in tracked_objects:
                        # Re-ID: only every REID_EVERY_N_FRAMES
                        if frame_idx % REID_EVERY_N_FRAMES == 0:
                            crop = ReidFeatureExtractor.crop_from_bbox(frame, obj.bbox)
                            global_id, is_cross_cam, reid_score, _candidates = self.reid.process_observation(
                                camera_id=camera_id,
                                local_track_id=obj.track_id,
                                class_name=obj.class_name,
                                crop_bgr=crop if crop is not None else np.zeros((10, 10, 3), dtype=np.uint8),
                                centroid=obj.centroid,
                                bbox=obj.bbox,
                                timestamp_ms=timestamp_ms,
                                frame_idx=frame_idx,
                            )
                            if is_cross_cam:
                                cross_cam_matches += 1
                        else:
                            global_id = f"TGT-{camera_id}-{obj.track_id}"
                            is_cross_cam = False
                            reid_score = 0.0

                        # DB writes: throttled to every EVENT_EMIT_EVERY_N_FRAMES
                        if frame_idx % EVENT_EMIT_EVERY_N_FRAMES == 0:
                            self._write_detection(camera_id, obj, global_id)
                            detections_written += 1
                            self._update_tracked_target(camera_id, global_id, obj, timestamp_ms)
                            self._maybe_ingest_event(
                                camera_id, obj, global_id, is_cross_cam,
                                reid_score, frame_width, timestamp_ms,
                            )
                            events_ingested += 1

                    # ---- ANPR on vehicle tracks ----
                    plate_results = []
                    if self.anpr_engine:
                        for obj in tracked_objects:
                            if obj.class_name in ("car", "truck", "bus", "motorcycle"):
                                plate_result = self.anpr_engine.process_vehicle(
                                    frame=frame,
                                    vehicle_bbox=obj.bbox,
                                    track_id=obj.track_id,
                                    frame_idx=frame_idx,
                                    timestamp_ms=timestamp_ms,
                                    class_name=obj.class_name,
                                    camera_id=camera_id,
                                )
                                if plate_result and plate_result.plate_text:
                                    plate_results.append(plate_result)
                                    plates_detected += 1
                                    if plate_result.is_hotlist or (frame_idx % EVENT_EMIT_EVERY_N_FRAMES == 0):
                                        self._ingest_anpr_event(camera_id, plate_result, timestamp_ms)
                    cached_plate_results = plate_results

                    # ---- Drone detection (optional, throttled) ----
                    if self.enable_drone_detection and frame_idx % 3 == 0:
                        drone_results = self.drone_model(frame, conf=DRONE_CONF_THRESHOLD, verbose=False)[0]
                        for box in drone_results.boxes:
                            x1, y1, x2, y2 = map(int, box.xyxy[0])
                            conf = float(box.conf[0])
                            drone_alerts += 1
                            self._ingest_drone_event(camera_id, (x1, y1, x2, y2), conf, timestamp_ms)
                            if show_window:
                                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                                cv2.putText(frame, f"DRONE {conf:.2f}", (x1, y1 - 8),
                                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 2)

                else:
                    # Skipped frame: reuse cached results
                    tracked_objects = cached_tracked_objects
                    plate_results = cached_plate_results

                # ---- Draw overlays ----
                if show_window:
                    for obj in tracked_objects:
                        x1, y1, x2, y2 = [int(v) for v in obj.bbox]
                        color = (0, 255, 0) if obj.class_name == "person" else (255, 200, 0)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

                        # Check if this vehicle has a plate
                        plate_text = ""
                        if self.anpr_engine:
                            cached_plate = self.anpr_engine.get_cached_plate(obj.track_id)
                            if cached_plate:
                                plate_text = f" | PLATE: {cached_plate}"

                        label = f"{obj.class_name} #{obj.track_id}{plate_text}"
                        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.50, 1)
                        cv2.rectangle(frame, (x1, max(0, y1 - 22)), (x1 + tw + 6, y1), (20, 25, 30), -1)
                        cv2.putText(frame, label, (x1 + 3, max(14, y1 - 5)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255, 255, 255), 1, cv2.LINE_AA)

                    # Draw plate bounding boxes
                    if self.anpr_engine and cached_plate_results:
                        frame = self.anpr_engine.draw_plates(frame, cached_plate_results)

                    # HUD overlay
                    h, w = frame.shape[:2]
                    cv2.rectangle(frame, (0, 0), (w, 35), (20, 20, 20), -1)
                    hud_text = (
                        f"IBVAP Sentinel LIVE | FPS: {display_fps:.1f} | "
                        f"Tracks: {len(tracked_objects)} | "
                        f"Plates: {len(cached_plate_results)}"
                    )
                    cv2.putText(frame, hud_text, (12, 24),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 200), 1, cv2.LINE_AA)

                    cv2.imshow("IBVAP Sentinel - Live Feed", frame)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
        finally:
            cap.release()
            if show_window:
                cv2.destroyAllWindows()

        logger.info(
            "Live session ended. frames=%d detections=%d events=%d cross_cam=%d plates=%d drone_alerts=%d duration=%.1fs",
            frame_idx, detections_written, events_ingested, cross_cam_matches, plates_detected, drone_alerts,
            time.time() - t_start,
        )

    def _ingest_drone_event(self, camera_id: str, bbox, confidence: float, timestamp_ms: float) -> None:
        """
        Feeds a drone detection into the SAME threat-scoring / incident /
        evidence-ledger backend used for person and vehicle events, via the
        real SentinelBackend.ingest_event(dict) method (core/backend_service.py)
        — an AERIAL_INTRUSION shows up in the dashboard exactly like any
        other scored incident, not as a separate bolt-on alert.
        """
        import uuid
        import json as _json

        x1, y1, x2, y2 = bbox
        centroid = [(x1 + x2) / 2.0, (y1 + y2) / 2.0]

        event = {
            "event_id": str(uuid.uuid4()),
            "timestamp_ms": timestamp_ms,
            "camera_id": camera_id,
            "track_id": None,
            "class_name": "drone",
            "alert_type": "AERIAL_INTRUSION",
            "severity": "CRITICAL",
            "details": f"Unauthorized drone detected (conf={confidence:.2f})",
            "bbox": list(bbox),
            "centroid": centroid,
            "rule_name": "AERIAL_INTRUSION",
            "confidence": confidence,
        }
        self.backend.ingest_event(event)

    def _ingest_anpr_event(self, camera_id: str, plate_result, timestamp_ms: float) -> None:
        """
        Feeds an ANPR plate read or watchlist hit into the unified threat-scoring
        and cryptographic evidence ledger.
        """
        import uuid
        is_hot = getattr(plate_result, "is_hotlist", False)
        hot_reason = getattr(plate_result, "hotlist_reason", None)
        plate_text = getattr(plate_result, "plate_text", "")
        p_conf = getattr(plate_result, "plate_confidence", 0.9)
        ocr_conf = getattr(plate_result, "ocr_confidence", 0.85)
        bbox = list(getattr(plate_result, "plate_bbox", [0, 0, 0, 0]))

        centroid = [(bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0] if len(bbox) == 4 else [0.0, 0.0]

        event = {
            "event_id": str(uuid.uuid4()),
            "timestamp_ms": timestamp_ms,
            "camera_id": camera_id,
            "track_id": getattr(plate_result, "track_id", None),
            "class_name": getattr(plate_result, "class_name", "vehicle"),
            "alert_type": "ANPR_HOTLIST_HIT" if is_hot else "ANPR_PLATE_READ",
            "severity": "CRITICAL" if is_hot else "INFO",
            "details": f"ANPR Watchlist Breach: Flagged vehicle {plate_text} ({hot_reason})" if is_hot else f"Vehicle plate read: {plate_text} (conf={ocr_conf:.2f})",
            "bbox": bbox,
            "centroid": centroid,
            "rule_name": "ANPR_WATCHLIST_MATCH" if is_hot else "ANPR_OPTICAL_SCAN",
            "confidence": ocr_conf,
            "plate_text": plate_text,
            "plate_confidence": p_conf,
            "is_hotlist": 1 if is_hot else 0,
            "hotlist_reason": hot_reason,
        }
        self.backend.ingest_event(event)

        if is_hot:
            try:
                from alerts.sound_alerts import play_alert
                from hardware.serial_trigger import trigger_physical_breach
                play_alert("CRITICAL")
                trigger_physical_breach()
            except Exception as e:
                logger.debug("Sound / hardware trigger exception: %s", e)


def main():
    parser = argparse.ArgumentParser(description="IBVAP Sentinel - Live Camera YOLO Pipeline")
    parser.add_argument("--source", default="0", help="0 for webcam, or an IP Webcam URL")
    parser.add_argument("--camera-id", default="CAM_ALPHA", help="Camera identifier used in the incident ledger")
    parser.add_argument("--drone", action="store_true", help="Enable the drone detection model (heavy, off by default)")
    parser.add_argument("--no-anpr", action="store_true", help="Disable ANPR (number plate detection)")
    parser.add_argument("--no-window", action="store_true", help="Run headless (no cv2 display window)")
    parser.add_argument("--skip-frames", type=int, default=INFER_EVERY_N_FRAMES,
                        help=f"Run YOLO inference every N frames (default: {INFER_EVERY_N_FRAMES})")
    args = parser.parse_args()

    # allow "0" / "1" to be treated as a webcam index, anything else as a URL/path
    source: Union[int, str] = int(args.source) if args.source.isdigit() else args.source

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    pipeline = LiveSurveillancePipeline(
        enable_drone_detection=args.drone,
        enable_anpr=not args.no_anpr,
        infer_every_n=args.skip_frames,
    )
    pipeline.process_live_source(
        camera_id=args.camera_id,
        source=source,
        show_window=not args.no_window,
    )


if __name__ == "__main__":
    main()
