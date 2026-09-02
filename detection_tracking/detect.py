"""
IBVAP - Intelligent Border Video Analytics Platform
Module: detection_tracking/detect.py
Description: Standalone and reusable object detection module using YOLOv8n.
             Detects human & vehicle classes with CPU/GPU support and visual annotations.
"""

import argparse
import json
import os
import time
from typing import Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
import torch
from ultralytics import YOLO

# Standard target surveillance classes from COCO dataset
# 0: person, 1: bicycle, 2: car, 3: motorcycle, 5: bus, 7: truck
DEFAULT_SURVEILLANCE_CLASSES = [0, 1, 2, 3, 5, 7]

CLASS_COLOR_MAP = {
    0: (0, 255, 0),    # Person: Vibrant Green
    1: (255, 200, 0),  # Bicycle: Cyan/Yellow-ish
    2: (0, 165, 255),  # Car: Orange
    3: (255, 0, 255),  # Motorcycle: Magenta
    5: (0, 255, 255),  # Bus: Yellow
    7: (0, 0, 255),    # Truck: Red
}


class BorderObjectDetector:
    """
    YOLOv8-based object detector optimized for border security surveillance feeds.
    Detects humans and vehicles, formats bounding boxes, centroids, and metadata.
    """

    def __init__(
        self,
        model_path: str = "yolov8n.pt",
        conf_threshold: float = 0.35,
        iou_threshold: float = 0.45,
        target_classes: Optional[List[int]] = None,
        device: Optional[str] = None,
    ):
        """
        Initialize the detector.

        Args:
            model_path: Path or name of YOLO model (default: yolov8n.pt).
            conf_threshold: Minimum confidence score for detection.
            iou_threshold: NMS IoU threshold.
            target_classes: List of COCO class indices to filter (None = DEFAULT_SURVEILLANCE_CLASSES).
            device: 'cpu', 'cuda', '0', etc. If None, auto-selects cuda if available, else cpu.
        """
        if device is None:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device

        print(f"[IBVAP Detector] Loading model '{model_path}' on device: {self.device}...")
        self.model = YOLO(model_path)
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.target_classes = target_classes if target_classes is not None else DEFAULT_SURVEILLANCE_CLASSES
        self.class_names = self.model.names
        print(f"[IBVAP Detector] Filter classes: {[self.class_names[c] for c in self.target_classes if c in self.class_names]}")

    def detect_frame(self, frame: np.ndarray) -> List[Dict[str, Union[int, str, float, List[float], Tuple[float, float]]]]:
        """
        Run inference on a single frame.

        Args:
            frame: OpenCV BGR image (H, W, 3).

        Returns:
            List of detection dicts:
            [
                {
                    "class_id": int,
                    "class_name": str,
                    "conf": float,
                    "bbox": [x1, y1, x2, y2],
                    "centroid": (cx, cy)
                }, ...
            ]
        """
        results = self.model.predict(
            source=frame,
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            classes=self.target_classes,
            device=self.device,
            verbose=False,
        )

        detections = []
        if not results or len(results) == 0:
            return detections

        boxes = results[0].boxes
        if boxes is None or len(boxes) == 0:
            return detections

        for box in boxes:
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            xyxy = box.xyxy[0].tolist()
            x1, y1, x2, y2 = xyxy

            # Compute centroid
            cx = float((x1 + x2) / 2.0)
            cy = float((y1 + y2) / 2.0)

            detections.append({
                "class_id": cls_id,
                "class_name": self.class_names.get(cls_id, str(cls_id)),
                "conf": round(conf, 4),
                "bbox": [round(coord, 2) for coord in xyxy],
                "centroid": (round(cx, 2), round(cy, 2)),
            })

        return detections

    def draw_detections(
        self,
        frame: np.ndarray,
        detections: List[Dict],
        show_fps: bool = True,
        fps: float = 0.0,
    ) -> np.ndarray:
        """
        Draw bounding boxes, labels, and centroids on the frame.

        Args:
            frame: OpenCV BGR image.
            detections: List of detection dicts from detect_frame.
            show_fps: Whether to render FPS counter in top-left.
            fps: Current FPS value to render.

        Returns:
            Annotated frame.
        """
        annotated = frame.copy()

        for det in detections:
            cls_id = det["class_id"]
            cls_name = det["class_name"]
            conf = det["conf"]
            x1, y1, x2, y2 = [int(v) for v in det["bbox"]]
            cx, cy = [int(v) for v in det["centroid"]]

            color = CLASS_COLOR_MAP.get(cls_id, (255, 255, 255))

            # Bounding box
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

            # Centroid point
            cv2.circle(annotated, (cx, cy), 4, color, -1)

            # Label banner
            label = f"{cls_name.upper()} {conf:.2f}"
            (text_w, text_h), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(
                annotated,
                (x1, max(0, y1 - text_h - baseline - 4)),
                (x1 + text_w + 6, max(0, y1)),
                color,
                -1,
            )
            cv2.putText(
                annotated,
                label,
                (x1 + 3, max(text_h + 2, y1 - 3)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 0, 0),
                1,
                cv2.LINE_AA,
            )

        # Header overlay
        if show_fps:
            h, w = frame.shape[:2]
            header = f"IBVAP DETECTOR | FPS: {fps:.1f} | Detections: {len(detections)} | Device: {self.device.upper()}"
            cv2.putText(
                annotated,
                header,
                (15, 25),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 255),
                2,
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
        Process a video file, RTSP stream, or webcam feed frame-by-frame.

        Args:
            source: Path to video file, RTSP URL, or webcam index (0, 1).
            output_path: Path to save annotated video (.mp4/.avi).
            show: If True, renders a live OpenCV GUI window.
            save_json: Path to save frame-by-frame detection metadata JSON.
        """
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open video source: {source}")

        fps_in = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        print(f"[IBVAP Detector] Processing source: {source} ({width}x{height} @ {fps_in:.1f} FPS, {total_frames} frames)")

        writer = None
        if output_path:
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(output_path, fourcc, fps_in, (width, height))

        json_records = []
        frame_idx = 0
        t_prev = time.time()

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                frame_idx += 1
                t_now = time.time()
                current_fps = 1.0 / max(1e-5, (t_now - t_prev))
                t_prev = t_now

                # Inference
                detections = self.detect_frame(frame)

                # Collect metadata
                if save_json:
                    json_records.append({
                        "frame_index": frame_idx,
                        "timestamp_ms": round((frame_idx / fps_in) * 1000, 2),
                        "detections": detections,
                    })

                # Annotate
                annotated = self.draw_detections(frame, detections, show_fps=True, fps=current_fps)

                if writer:
                    writer.write(annotated)

                if show:
                    cv2.imshow("IBVAP - Live Detection Stream", annotated)
                    key = cv2.waitKey(1) & 0xFF
                    if key == 27 or key == ord("q"):  # ESC or q
                        print("[IBVAP Detector] User interrupted stream.")
                        break

                if frame_idx % 30 == 0 or frame_idx == total_frames:
                    print(f"[IBVAP Detector] Frame {frame_idx}/{total_frames} ({frame_idx/max(1, total_frames)*100:.1f}%) | Detections: {len(detections)} | FPS: {current_fps:.1f}")

        finally:
            cap.release()
            if writer:
                writer.release()
                print(f"[IBVAP Detector] Saved annotated video to: {output_path}")
            if show:
                cv2.destroyAllWindows()

            if save_json:
                os.makedirs(os.path.dirname(save_json) or ".", exist_ok=True)
                with open(save_json, "w") as f:
                    json.dump({"source": str(source), "total_frames": frame_idx, "frames": json_records}, f, indent=2)
                print(f"[IBVAP Detector] Saved detection JSON log to: {save_json}")


def main():
    parser = argparse.ArgumentParser(description="IBVAP - Standalone YOLOv8n Border Object Detector")
    parser.add_argument("--source", type=str, default="0", help="Video file path, RTSP link, or webcam index (default: 0)")
    parser.add_argument("--model", type=str, default="yolov8n.pt", help="Path to YOLO weights (default: yolov8n.pt)")
    parser.add_argument("--conf", type=float, default=0.35, help="Confidence threshold (default: 0.35)")
    parser.add_argument("--output", type=str, default=None, help="Path to save output video (optional)")
    parser.add_argument("--save-json", type=str, default=None, help="Path to save detections log JSON (optional)")
    parser.add_argument("--device", type=str, default=None, help="'cpu', 'cuda', or specific device ID")
    parser.add_argument("--show", action="store_true", help="Display real-time OpenCV window")
    args = parser.parse_args()

    # Handle numeric string for webcam
    source = int(args.source) if args.source.isdigit() else args.source

    detector = BorderObjectDetector(
        model_path=args.model,
        conf_threshold=args.conf,
        device=args.device,
    )

    detector.process_video(
        source=source,
        output_path=args.output,
        show=args.show,
        save_json=args.save_json,
    )


if __name__ == "__main__":
    main()
