"""
IBVAP - Intelligent Border Video Analytics Platform
Module: detection_tracking/track.py
Description: Multi-Object Tracking pipeline using YOLOv8n + ByteTrack.
             Maintains persistent track IDs, centroid trajectories, and outputs
             structured track records designed for alerts/zones and cross-camera Re-ID.
"""

import argparse
from collections import defaultdict, deque
from dataclasses import asdict, dataclass
import json
import os
import time
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
import torch
from ultralytics import YOLO

# Default classes for border surveillance (COCO: person, bicycle, car, motorcycle, bus, truck)
DEFAULT_SURVEILLANCE_CLASSES = [0, 1, 2, 3, 5, 7]


def get_color_for_id(track_id: int) -> Tuple[int, int, int]:
    """Generates a consistent, distinct BGR color for a given track ID."""
    np.random.seed(int(track_id) * 31 + 17)
    color = np.random.randint(50, 255, size=3).tolist()
    return (int(color[0]), int(color[1]), int(color[2]))


@dataclass
class TrackedObject:
    """Structured data container representing a tracked target in a single frame."""
    track_id: int
    class_id: int
    class_name: str
    confidence: float
    bbox: List[float]               # [x1, y1, x2, y2]
    centroid: Tuple[float, float]    # (cx, cy)
    frame_index: int
    timestamp_ms: float
    trajectory: List[Tuple[float, float]]  # Recent (cx, cy) history

    def to_dict(self) -> Dict[str, Any]:
        return {
            "track_id": self.track_id,
            "class_id": self.class_id,
            "class_name": self.class_name,
            "confidence": round(self.confidence, 4),
            "bbox": [round(c, 2) for c in self.bbox],
            "centroid": (round(self.centroid[0], 2), round(self.centroid[1], 2)),
            "frame_index": self.frame_index,
            "timestamp_ms": round(self.timestamp_ms, 2),
            "trajectory": [(round(pt[0], 2), round(pt[1], 2)) for pt in self.trajectory[-20:]],
        }


class BorderTracker:
    """
    Multi-Object Tracker combining YOLOv8n with ByteTrack.
    Provides persistent IDs, trajectory history, and structured outputs for downstream modules.
    """

    def __init__(
        self,
        model_path: str = "yolov8n.pt",
        tracker_config: str = "bytetrack.yaml",
        conf_threshold: float = 0.20,
        iou_threshold: float = 0.45,
        target_classes: Optional[List[int]] = None,
        max_trajectory_len: int = 30,
        device: Optional[str] = None,
    ):
        """
        Initialize the tracker.
        """
        if device is None:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device

        print(f"[IBVAP Tracker] Initializing YOLOv8 + ByteTrack on device: {self.device}...")
        self.model = YOLO(model_path)
        self.tracker_config = tracker_config
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.target_classes = target_classes if target_classes is not None else DEFAULT_SURVEILLANCE_CLASSES
        self.max_trajectory_len = max_trajectory_len
        self.class_names = self.model.names

        # Trajectory cache: track_id -> deque of (cx, cy)
        self.trajectories: Dict[int, deque] = defaultdict(lambda: deque(maxlen=self.max_trajectory_len))
        
        # MOG2 Background Motion Subtractor Fallback (for thermal / night IR / non-COCO targets)
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=300, varThreshold=25, detectShadows=False)
        self._next_motion_id = 901

    def reset(self):
        """Reset internal trajectory and tracker state."""
        self.trajectories.clear()
        self._next_motion_id = 901
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=300, varThreshold=25, detectShadows=False)

    def track_frame(
        self,
        frame: np.ndarray,
        frame_idx: int = 0,
        timestamp_ms: float = 0.0,
    ) -> List[TrackedObject]:
        """
        Track objects in a single frame with YOLOv8+ByteTrack and MOG2 thermal fallback.
        """
        results = self.model.track(
            source=frame,
            persist=True,
            tracker=self.tracker_config,
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            classes=self.target_classes,
            device=self.device,
            verbose=False,
        )

        tracked_objects: List[TrackedObject] = []

        if results and len(results) > 0 and results[0].boxes is not None and len(results[0].boxes) > 0:
            boxes = results[0].boxes
            for i, box in enumerate(boxes):
                if box.id is not None:
                    track_id = int(box.id[0].item())
                else:
                    track_id = i + 1

                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                xyxy = box.xyxy[0].tolist()
                x1, y1, x2, y2 = xyxy

                cx = float((x1 + x2) / 2.0)
                cy = float((y1 + y2) / 2.0)

                self.trajectories[track_id].append((cx, cy))
                traj_list = list(self.trajectories[track_id])

                tracked_obj = TrackedObject(
                    track_id=track_id,
                    class_id=cls_id,
                    class_name=self.class_names.get(cls_id, str(cls_id)),
                    confidence=conf,
                    bbox=xyxy,
                    centroid=(cx, cy),
                    frame_index=frame_idx,
                    timestamp_ms=timestamp_ms,
                    trajectory=traj_list,
                )
                tracked_objects.append(tracked_obj)

        # Fallback for thermal / infrared / synthetic scenarios if YOLO finds 0 boxes
        if not tracked_objects:
            fg_mask = self.bg_subtractor.apply(frame)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
            contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            m_idx = 1
            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area > 400:  # Valid moving target
                    x, y, w, h = cv2.boundingRect(cnt)
                    x1, y1, x2, y2 = float(x), float(y), float(x + w), float(y + h)
                    cx, cy = float(x + w / 2.0), float(y + h / 2.0)
                    
                    tid = self._next_motion_id + m_idx
                    self.trajectories[tid].append((cx, cy))
                    
                    # Heuristic: if w/h > 1.2 or moving horizontally -> crawling person or vehicle
                    cls_name = "car" if (w * h > 15000) else "person"
                    cls_id = 2 if cls_name == "car" else 0
                    
                    tracked_obj = TrackedObject(
                        track_id=tid,
                        class_id=cls_id,
                        class_name=cls_name,
                        confidence=0.85,
                        bbox=[x1, y1, x2, y2],
                        centroid=(cx, cy),
                        frame_index=frame_idx,
                        timestamp_ms=timestamp_ms,
                        trajectory=list(self.trajectories[tid]),
                    )
                    tracked_objects.append(tracked_obj)
                    m_idx += 1

        return tracked_objects

    def draw_tracks(
        self,
        frame: np.ndarray,
        tracked_objects: List[TrackedObject],
        show_trail: bool = True,
        show_fps: bool = True,
        fps: float = 0.0,
    ) -> np.ndarray:
        """
        Render tracking visualization overlays on the frame:
        - Consistent color per Track ID
        - Centroid point and trailing motion breadcrumbs
        - Label header: [ID: #] CLASS CONF

        Args:
            frame: OpenCV BGR image.
            tracked_objects: List of TrackedObject from track_frame.
            show_trail: Whether to draw motion breadcrumb trail.
            show_fps: Whether to render the header HUD overlay.
            fps: Current FPS value.

        Returns:
            Annotated frame.
        """
        annotated = frame.copy()

        for obj in tracked_objects:
            color = get_color_for_id(obj.track_id)
            x1, y1, x2, y2 = [int(v) for v in obj.bbox]
            cx, cy = [int(v) for v in obj.centroid]

            # Bounding box
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

            # Motion breadcrumbs / trajectory
            if show_trail and len(obj.trajectory) > 1:
                pts = np.array([[int(p[0]), int(p[1])] for p in obj.trajectory], dtype=np.int32)
                pts = pts.reshape((-1, 1, 2))
                cv2.polylines(annotated, [pts], isClosed=False, color=color, thickness=2, lineType=cv2.LINE_AA)

            # Centroid point
            cv2.circle(annotated, (cx, cy), 5, color, -1)
            cv2.circle(annotated, (cx, cy), 6, (0, 0, 0), 1)

            # ID + Class label badge
            label = f"ID:{obj.track_id} {obj.class_name.upper()} {obj.confidence:.2f}"
            (text_w, text_h), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            badge_top = max(0, y1 - text_h - baseline - 4)
            cv2.rectangle(
                annotated,
                (x1, badge_top),
                (x1 + text_w + 6, max(0, y1)),
                color,
                -1,
            )
            cv2.putText(
                annotated,
                label,
                (x1 + 3, max(text_h + 2, y1 - 3)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (0, 0, 0),
                1,
                cv2.LINE_AA,
            )

        # Top status bar HUD
        if show_fps:
            status_text = f"IBVAP TRACKER (ByteTrack) | Active Tracks: {len(tracked_objects)} | FPS: {fps:.1f} | Device: {self.device.upper()}"
            # Translucent background bar
            overlay = annotated.copy()
            cv2.rectangle(overlay, (0, 0), (annotated.shape[1], 35), (20, 20, 20), -1)
            cv2.addWeighted(overlay, 0.6, annotated, 0.4, 0, annotated)
            cv2.putText(
                annotated,
                status_text,
                (12, 24),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (0, 255, 200),
                1,
                cv2.LINE_AA,
            )

        return annotated

    def process_video(
        self,
        source: Union[str, int],
        output_path: Optional[str] = None,
        show: bool = False,
        save_json: Optional[str] = None,
    ):
        """
        Process a video input source frame-by-frame with persistent tracking.

        Args:
            source: Video file path, RTSP stream URL, or webcam device index.
            output_path: File path to save annotated output video.
            show: If True, renders live preview window.
            save_json: File path to export structured per-frame tracking records.
        """
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open video source: {source}")

        fps_in = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        print(f"[IBVAP Tracker] Tracking source: {source} ({width}x{height} @ {fps_in:.1f} FPS, {total_frames} frames)")

        writer = None
        if output_path:
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(output_path, fourcc, fps_in, (width, height))

        json_records = []
        frame_idx = 0
        t_prev = time.time()
        self.reset()

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                frame_idx += 1
                t_now = time.time()
                current_fps = 1.0 / max(1e-5, (t_now - t_prev))
                t_prev = t_now
                timestamp_ms = (frame_idx / fps_in) * 1000.0

                # Track
                tracked_objects = self.track_frame(frame, frame_idx=frame_idx, timestamp_ms=timestamp_ms)

                # Store records
                if save_json:
                    json_records.append({
                        "frame_index": frame_idx,
                        "timestamp_ms": round(timestamp_ms, 2),
                        "active_track_count": len(tracked_objects),
                        "tracks": [obj.to_dict() for obj in tracked_objects],
                    })

                # Annotate
                annotated = self.draw_tracks(
                    frame,
                    tracked_objects,
                    show_trail=True,
                    show_fps=True,
                    fps=current_fps,
                )

                if writer:
                    writer.write(annotated)

                if show:
                    cv2.imshow("IBVAP - Multi-Object Tracking (ByteTrack)", annotated)
                    key = cv2.waitKey(1) & 0xFF
                    if key == 27 or key == ord("q"):
                        print("[IBVAP Tracker] User interrupted tracking.")
                        break

                if frame_idx % 30 == 0 or frame_idx == total_frames:
                    print(
                        f"[IBVAP Tracker] Frame {frame_idx}/{total_frames} "
                        f"({frame_idx/max(1, total_frames)*100:.1f}%) | "
                        f"Active IDs: {[t.track_id for t in tracked_objects]} | "
                        f"FPS: {current_fps:.1f}"
                    )

        finally:
            cap.release()
            if writer:
                writer.release()
                print(f"[IBVAP Tracker] Saved tracked video to: {output_path}")
            if show:
                cv2.destroyAllWindows()

            if save_json:
                os.makedirs(os.path.dirname(save_json) or ".", exist_ok=True)
                with open(save_json, "w") as f:
                    json.dump({
                        "source": str(source),
                        "total_frames": frame_idx,
                        "fps": round(fps_in, 2),
                        "frames": json_records,
                    }, f, indent=2)
                print(f"[IBVAP Tracker] Saved tracking JSON records to: {save_json}")


def main():
    parser = argparse.ArgumentParser(description="IBVAP - Multi-Object Tracker (YOLOv8 + ByteTrack)")
    parser.add_argument("--source", type=str, default="0", help="Video file path, RTSP link, or webcam index (default: 0)")
    parser.add_argument("--model", type=str, default="yolov8n.pt", help="YOLO model weights (default: yolov8n.pt)")
    parser.add_argument("--tracker", type=str, default="bytetrack.yaml", help="Tracker config (default: bytetrack.yaml)")
    parser.add_argument("--conf", type=float, default=0.35, help="Detection confidence threshold (default: 0.35)")
    parser.add_argument("--output", type=str, default=None, help="Output annotated video path (.mp4)")
    parser.add_argument("--save-json", type=str, default=None, help="Output tracking JSON log path")
    parser.add_argument("--device", type=str, default=None, help="'cpu', 'cuda', etc. (auto-detects)")
    parser.add_argument("--show", action="store_true", help="Display live OpenCV GUI window")
    args = parser.parse_args()

    source = int(args.source) if args.source.isdigit() else args.source

    tracker = BorderTracker(
        model_path=args.model,
        tracker_config=args.tracker,
        conf_threshold=args.conf,
        device=args.device,
    )

    tracker.process_video(
        source=source,
        output_path=args.output,
        show=args.show,
        save_json=args.save_json,
    )


if __name__ == "__main__":
    main()
