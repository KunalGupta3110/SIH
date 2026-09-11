"""
IBVAP Sentinel
Module: core/vision/tracker.py
Description: YOLOv8 multi-object detector and ByteTrack persistent object tracker with motion fallback.
"""

from dataclasses import dataclass
import os
from pathlib import Path
import sys
import time
from typing import Dict, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import cv2
import numpy as np

# Classes tracked for border surveillance. 24/26/28 (backpack/handbag/
# suitcase) feed core/rules/abandoned_object.py's stationary-object check.
TARGET_CLASSES = {
    0: "person", 1: "bicycle", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck",
    24: "backpack", 26: "handbag", 28: "suitcase",
}


@dataclass
class TrackedObject:
    track_id: int
    class_id: int
    class_name: str
    confidence: float
    bbox: List[float]  # [x1, y1, x2, y2]
    centroid: Tuple[float, float]
    frame_idx: int
    timestamp_ms: float
    trajectory: List[Tuple[float, float]]

    @property
    def width(self) -> float:
        return self.bbox[2] - self.bbox[0]

    @property
    def height(self) -> float:
        return self.bbox[3] - self.bbox[1]


class BorderTracker:
    def __init__(
        self,
        model_path: str = "yolov8n.pt",
        conf_threshold: float = 0.45,
        iou_threshold: float = 0.45,
        device: Optional[str] = None,
        imgsz: int = 640,
    ):
        self.model_path = model_path
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.device = device
        self.imgsz = imgsz

        self.model = None
        self.use_fallback = False
        self.history: Dict[int, List[Tuple[float, float]]] = {}

        self._load_model()

    def _load_model(self):
        try:
            from ultralytics import YOLO
            print(f"[IBVAP Vision] Loading YOLOv8 weights from: {self.model_path}...")
            self.model = YOLO(self.model_path)
            print("[IBVAP Vision] YOLOv8 initialized successfully.")
        except Exception as e:
            print(f"[IBVAP Vision] YOLOv8 unavailable ({e}). Using Background Motion Subtractor Fallback.")
            self.use_fallback = True
            self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=300, varThreshold=25, detectShadows=False)
            self._fallback_id_counter = 1

    def track_frame(
        self,
        frame: np.ndarray,
        frame_idx: int = 0,
        timestamp_ms: float = 0.0,
    ) -> List[TrackedObject]:
        if not self.use_fallback and self.model is not None:
            return self._track_yolo(frame, frame_idx, timestamp_ms)
        return self._track_fallback(frame, frame_idx, timestamp_ms)

    def _track_yolo(self, frame: np.ndarray, frame_idx: int, timestamp_ms: float) -> List[TrackedObject]:
        results = self.model.track(
            source=frame,
            persist=True,
            tracker="bytetrack.yaml",
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            classes=list(TARGET_CLASSES.keys()),
            verbose=False,
            device=self.device,
            imgsz=self.imgsz,
            stream=True,
        )

        tracked_objects: List[TrackedObject] = []

        # stream=True returns a generator; consume the single result for this frame
        result = None
        for r in results:
            result = r
            break

        if result is None or result.boxes is None or result.boxes.id is None:
            return tracked_objects

        boxes = result.boxes
        ids = boxes.id.cpu().numpy().astype(int)
        coords = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy()
        classes = boxes.cls.cpu().numpy().astype(int)

        for track_id, bbox, conf, cls_id in zip(ids, coords, confs, classes):
            x1, y1, x2, y2 = bbox
            cx = float((x1 + x2) / 2.0)
            cy = float((y1 + y2) / 2.0)

            if track_id not in self.history:
                self.history[track_id] = []
            self.history[track_id].append((cx, cy))
            if len(self.history[track_id]) > 30:
                self.history[track_id].pop(0)

            tracked_objects.append(TrackedObject(
                track_id=int(track_id),
                class_id=int(cls_id),
                class_name=TARGET_CLASSES.get(int(cls_id), "target"),
                confidence=float(conf),
                bbox=[float(x1), float(y1), float(x2), float(y2)],
                centroid=(cx, cy),
                frame_idx=frame_idx,
                timestamp_ms=timestamp_ms,
                trajectory=list(self.history[track_id]),
            ))

        return tracked_objects

    def _track_fallback(self, frame: np.ndarray, frame_idx: int, timestamp_ms: float) -> List[TrackedObject]:
        fg = self.bg_subtractor.apply(frame)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, kernel)
        contours, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        tracked = []
        for i, cnt in enumerate(contours):
            area = cv2.contourArea(cnt)
            if area > 900:
                x, y, w, h = cv2.boundingRect(cnt)
                tid = (i % 5) + 1
                cx, cy = float(x + w / 2.0), float(y + h / 2.0)
                if tid not in self.history:
                    self.history[tid] = []
                self.history[tid].append((cx, cy))
                if len(self.history[tid]) > 30:
                    self.history[tid].pop(0)

                tracked.append(TrackedObject(
                    track_id=tid,
                    class_id=0 if h > w else 2,
                    class_name="person" if h > w else "car",
                    confidence=0.88,
                    bbox=[float(x), float(y), float(x + w), float(y + h)],
                    centroid=(cx, cy),
                    frame_idx=frame_idx,
                    timestamp_ms=timestamp_ms,
                    trajectory=list(self.history[tid]),
                ))
        return tracked

    def draw_tracks(self, frame: np.ndarray, tracks: List[TrackedObject], show_trail: bool = True, show_fps: bool = False, fps: float = 0.0) -> np.ndarray:
        annotated = frame.copy()
        for t in tracks:
            x1, y1, x2, y2 = [int(v) for v in t.bbox]
            if t.class_name == "person":
                color = (0, 255, 120)
            elif t.class_name in ("backpack", "handbag", "suitcase"):
                color = (255, 255, 0)
            else:
                color = (255, 200, 0)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

            label = f"{t.class_name.upper()} #{t.track_id} ({t.confidence:.2f})"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            cv2.rectangle(annotated, (x1, max(0, y1 - 20)), (x1 + tw + 6, y1), (20, 25, 30), -1)
            cv2.putText(annotated, label, (x1 + 3, max(14, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

            if show_trail and len(t.trajectory) > 1:
                pts = np.array(t.trajectory, dtype=np.int32).reshape((-1, 1, 2))
                cv2.polylines(annotated, [pts], isClosed=False, color=(0, 255, 255), thickness=2)

        if show_fps and fps > 0:
            cv2.putText(annotated, f"FPS: {fps:.1f}", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        return annotated
