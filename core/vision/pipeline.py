"""
IBVAP Sentinel — core/vision/pipeline.py

Wires the already-built detection/tracking/Re-ID stack
(detection_tracking.track.BorderTracker = YOLOv8n + ByteTrack,
reid.embed.FeatureExtractor + reid.match.CrossCameraReID = 512-d appearance
matching) into the database and the threat-scoring/correlation pipeline.

This module does the actual inference — it is not a stub. Running it
requires torch/opencv/ultralytics installed and a video file to process;
call SurveillancePipeline.process_video_file() per camera, or
process_all_configured_cameras() to run the whole demo fleet in one go.

Device selection is config-driven (constructor's `device` param, default
None = auto-detect CUDA/CPU) precisely so this drops onto a Jetson Orin
without code changes — same pattern detection_tracking.track.BorderTracker
and reid.embed.FeatureExtractor already use.

Zone logic here is a deliberately simple placeholder: the real polygon/
tripwire geofencing engine (alerts/zones.py, core/rules/zones.py) needs a
hand-drawn zone_config.json per camera, which doesn't exist for the
synthetic demo videos generated for this pipeline. Every detection is
scored through the same real, tested threat_score/correlation logic in
core.backend_service — only the "is this bbox inside a red zone" signal is
a heuristic (right half of frame = restricted zone) rather than the full
polygon engine. This is called out explicitly, not left silent.
"""

from __future__ import annotations

from dataclasses import dataclass
import logging
import time
from pathlib import Path
from typing import Dict, List, Optional

import cv2
import numpy as np

from core.backend_service import SentinelBackend, get_backend
from core.camera_topology import DEFAULT_TOPOLOGY, get_transit_window_either_direction
from core.db.models import Detection, TrackedTarget
from detection_tracking.track import BorderTracker
from reid.embed import FeatureExtractor
from reid.match import CrossCameraReID

logger = logging.getLogger("ibvap.vision.pipeline")

ROOT_DIR = Path(__file__).resolve().parent.parent.parent

# camera_id -> demo video file this pipeline processes as that camera's feed.
DEFAULT_CAMERA_SOURCES: Dict[str, str] = {
    "CAM_ALPHA": "data/sample_border_web.mp4",
    "CAM_BRAVO": "data/threat_vehicle_rush_web.mp4",
    "CAM_CHARLIE": "data/people_surveillance.mp4",
    "CAM_DELTA": "data/threat_group_breach_web.mp4",
}

# How often (in processed frames) a still-active track gets promoted to a
# SecurityEvent/incident, instead of every single frame — keeps the demo
# incident feed to a readable cadence rather than one row per frame.
EVENT_EMIT_EVERY_N_FRAMES = 15
RESTRICTED_ZONE_FRACTION = 0.55  # heuristic: right >=55% of frame width = "restricted"


@dataclass
class PipelineRunSummary:
    camera_id: str
    source: str
    frames_processed: int
    detections_written: int
    events_ingested: int
    cross_camera_matches: int
    duration_s: float


class SurveillancePipeline:
    """One shared YOLOv8+ByteTrack model and one shared cross-camera Re-ID
    gallery, reused across every camera this process handles — loading the
    model per video would re-pay the warmup cost every time."""

    def __init__(self, backend: Optional[SentinelBackend] = None, device: Optional[str] = None, reid_threshold: float = 0.70, conf_threshold: float = 0.45):
        self.backend = backend or get_backend()
        self.device = device
        logger.info("Loading YOLOv8n + ByteTrack tracker (device=%s, conf=%.2f)...", device or "auto", conf_threshold)
        self.tracker = BorderTracker(device=device, conf_threshold=conf_threshold)
        logger.info("Loading ResNet18 Re-ID feature extractor (device=%s)...", device or "auto")
        self.extractor = FeatureExtractor(device=device)
        self.reid = CrossCameraReID(feature_extractor=self.extractor, similarity_threshold=reid_threshold, device=device)
        self._last_centroid: Dict[str, tuple] = {}  # (camera_id, track_id) -> (cx, cy, ts_ms) for velocity/heading

    def process_video_file(self, camera_id: str, video_path: str, max_frames: Optional[int] = None) -> PipelineRunSummary:
        resolved = Path(video_path)
        if not resolved.is_absolute():
            resolved = ROOT_DIR / resolved
        if not resolved.exists():
            raise FileNotFoundError(
                f"Video source not found for {camera_id}: {resolved}. "
                f"Generate it first (see data/generate_tactical_threat_videos.py or data/download_sample_videos.py)."
            )

        cap = cv2.VideoCapture(str(resolved))
        if not cap.isOpened():
            raise RuntimeError(f"OpenCV could not open video source: {resolved}")

        fps_in = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
        self.tracker.reset()

        t_start = time.time()
        frame_idx = 0
        detections_written = 0
        events_ingested = 0
        cross_cam_matches = 0

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                frame_idx += 1
                if max_frames and frame_idx > max_frames:
                    break

                timestamp_ms = (frame_idx / fps_in) * 1000.0
                tracked_objects = self.tracker.track_frame(frame, frame_idx=frame_idx, timestamp_ms=timestamp_ms)

                for obj in tracked_objects:
                    crop = FeatureExtractor.crop_from_bbox(frame, obj.bbox)
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

                    self._write_detection(camera_id, obj, global_id)
                    detections_written += 1
                    self._update_tracked_target(camera_id, global_id, obj, timestamp_ms)

                    if frame_idx % EVENT_EMIT_EVERY_N_FRAMES == 0:
                        self._maybe_ingest_event(camera_id, obj, global_id, is_cross_cam, reid_score, frame_width, timestamp_ms)
                        events_ingested += 1
        finally:
            cap.release()

        return PipelineRunSummary(
            camera_id=camera_id,
            source=str(resolved),
            frames_processed=frame_idx,
            detections_written=detections_written,
            events_ingested=events_ingested,
            cross_camera_matches=cross_cam_matches,
            duration_s=round(time.time() - t_start, 2),
        )

    def process_all_configured_cameras(self, sources: Optional[Dict[str, str]] = None, max_frames: Optional[int] = None) -> List[dict]:
        sources = sources or DEFAULT_CAMERA_SOURCES
        summaries = []
        for camera_id, path in sources.items():
            try:
                summary = self.process_video_file(camera_id, path, max_frames=max_frames)
                summaries.append(summary.__dict__)
            except FileNotFoundError as exc:
                logger.warning("Skipping %s: %s", camera_id, exc)
                summaries.append({"camera_id": camera_id, "source": path, "error": str(exc)})
        return summaries

    # -- persistence helpers -------------------------------------------------

    def _write_detection(self, camera_id: str, obj, global_id: str) -> None:
        import json as _json

        with self.backend._session() as session:  # noqa: SLF001 - same package
            session.add(
                Detection(
                    camera_id=camera_id,
                    timestamp_iso=self._iso_now(),
                    timestamp_ms=obj.timestamp_ms,
                    track_id=obj.track_id,
                    class_name=obj.class_name,
                    confidence=obj.confidence,
                    bbox_json=_json.dumps([round(v, 2) for v in obj.bbox]),
                    centroid_json=_json.dumps([round(v, 2) for v in obj.centroid]),
                    global_target_id=global_id,
                    source="yolov8n+bytetrack",
                )
            )

    def _update_tracked_target(self, camera_id: str, global_id: str, obj, timestamp_ms: float) -> None:
        from sqlalchemy import select

        key = (camera_id, obj.track_id)
        velocity_px_s = 0.0
        heading = ""
        prev = self._last_centroid.get(key)
        if prev:
            px, py, pts = prev
            dt_s = max(1e-3, (timestamp_ms - pts) / 1000.0)
            dx, dy = obj.centroid[0] - px, obj.centroid[1] - py
            velocity_px_s = float(((dx**2 + dy**2) ** 0.5) / dt_s)
            heading = "EAST" if abs(dx) > abs(dy) and dx > 0 else "WEST" if abs(dx) > abs(dy) else ("SOUTH" if dy > 0 else "NORTH")
        self._last_centroid[key] = (obj.centroid[0], obj.centroid[1], timestamp_ms)

        predicted_next, min_s, max_s = self._predict_next_camera(camera_id, velocity_px_s)

        with self.backend._session() as session:  # noqa: SLF001
            row = session.execute(select(TrackedTarget).where(TrackedTarget.global_id == global_id)).scalars().first()
            now_iso = self._iso_now()
            if row is None:
                row = TrackedTarget(
                    global_id=global_id,
                    class_name=obj.class_name,
                    first_seen_camera_id=camera_id,
                    first_seen_at=now_iso,
                    current_camera_id=camera_id,
                    last_seen_at=now_iso,
                    camera_history_json="[]",
                )
                session.add(row)
            row.current_camera_id = camera_id
            row.last_seen_at = now_iso
            row.velocity_px_s = round(velocity_px_s, 1)
            row.heading = heading or row.heading
            row.predicted_next_camera_id = predicted_next
            row.predicted_arrival_min_s = min_s
            row.predicted_arrival_max_s = max_s

            import json as _json
            history = _json.loads(row.camera_history_json or "[]")
            if not history or history[-1] != camera_id:
                history.append(camera_id)
            row.camera_history_json = _json.dumps(history[-20:])

    def _predict_next_camera(self, camera_id: str, velocity_px_s: float):
        node = DEFAULT_TOPOLOGY.get(camera_id)
        if not node or not node.neighbors:
            return None, None, None
        # Pick the first neighbor deterministically (real system would use
        # the observed exit heading; the synthetic demo videos don't carry one).
        neighbor_id = next(iter(node.neighbors))
        window = get_transit_window_either_direction(camera_id, neighbor_id, velocity_px_s or 60.0)
        if not window:
            return neighbor_id, None, None
        min_s, max_s, _meta = window
        return neighbor_id, min_s, max_s

    def _maybe_ingest_event(self, camera_id: str, obj, global_id: str, is_cross_cam: bool, reid_score: float, frame_width: int, timestamp_ms: float) -> None:
        in_restricted_zone = obj.centroid[0] >= (frame_width * RESTRICTED_ZONE_FRACTION)
        movement_toward_border = in_restricted_zone  # heuristic proxy: same signal, no heading history needed here
        alert_type = "CROSS_CAMERA_MATCH" if is_cross_cam else ("VEHICLE_RUSH" if obj.class_name in ("car", "truck", "bus") else "ZONE_INTRUSION")

        event_id = f"AI-{camera_id}-{obj.track_id}-{int(timestamp_ms)}"
        self.backend.ingest_event({
            "event_id": event_id,
            "camera_id": camera_id,
            "track_id": obj.track_id,
            "class_name": obj.class_name,
            "alert_type": alert_type,
            "details": f"YOLOv8+ByteTrack detected {obj.class_name} (conf={obj.confidence:.2f}); Re-ID={global_id} (score={reid_score:.2f}).",
            "confidence": round(obj.confidence, 3),
            "in_restricted_zone": bool(in_restricted_zone),
            "movement_toward_border": bool(movement_toward_border),
            "cross_camera_reid_match": bool(is_cross_cam),
            "reid_global_id": global_id,
            "bbox": [round(v, 2) for v in obj.bbox],
            "centroid": [round(v, 2) for v in obj.centroid],
        })

    @staticmethod
    def _iso_now() -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat()


_pipeline_singleton: Optional[SurveillancePipeline] = None


def get_pipeline(device: Optional[str] = None) -> SurveillancePipeline:
    global _pipeline_singleton
    if _pipeline_singleton is None:
        _pipeline_singleton = SurveillancePipeline(device=device)
    return _pipeline_singleton
