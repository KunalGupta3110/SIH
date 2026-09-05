"""
IBVAP Sentinel — backend/generate_bytetrack_demo.py
Module: Genuine ByteTrack Multi-Object Tracking Pipeline

Runs YOLOv8n + ByteTrack on real CCTV footage, ensures persistent object identities
across consecutive frames (e.g. 'car #1' staying '#1'), draws tracking bounding boxes,
and exports an auditable per-frame tracking log and annotated video.
"""

from pathlib import Path
import json
import shutil
import sys
import time
import cv2
import numpy as np

ROOT_DIR = Path(__file__).resolve().parent.parent
INPUT_VIDEO = ROOT_DIR / "data" / "demo_footage" / "ibvap_real_yolo_demo.mp4"
OUTPUT_VIDEO = ROOT_DIR / "data" / "demo_footage" / "ibvap_real_bytetrack_demo.mp4"
OUTPUT_TRACKS_JSON = ROOT_DIR / "data" / "demo_footage" / "ibvap_real_bytetrack_tracks.json"
FRONTEND_PUBLIC_DATA = ROOT_DIR / "frontend" / "public" / "data"

# Restricted intrusion boundary coordinates in 1280x720 space
RESTRICTED_X_MAX = 450.0  # corresponds to 1350 in 4K
RESTRICTED_Y_MIN = 280.0
RESTRICTED_Y_MAX = 420.0


def is_in_restricted_zone(cx: float, cy: float) -> bool:
    return cx <= RESTRICTED_X_MAX and (RESTRICTED_Y_MIN <= cy <= RESTRICTED_Y_MAX)


def run_bytetrack_pipeline():
    from ultralytics import YOLO

    print(f"[ByteTrack] Loading YOLOv8n model...")
    model = YOLO("yolov8n.pt")

    cap = cv2.VideoCapture(str(INPUT_VIDEO))
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open input video: {INPUT_VIDEO}")

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"[ByteTrack] Input: {width}x{height} @ {fps:.1f} fps ({total_frames} frames)")

    # Color palette for distinct track IDs
    np.random.seed(42)
    track_colors = {}

    def get_color(track_id: int):
        if track_id not in track_colors:
            hue = (track_id * 67) % 180
            col = cv2.cvtColor(np.uint8([[[hue, 220, 240]]]), cv2.COLOR_HSV2BGR)[0][0]
            track_colors[track_id] = (int(col[0]), int(col[1]), int(col[2]))
        return track_colors[track_id]

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(OUTPUT_VIDEO), fourcc, fps, (width, height))

    all_tracks_log = []
    frame_idx = 0
    t0 = time.time()

    # Track trajectories for visualization (trailing motion path)
    track_history = {}

    print("[ByteTrack] Processing frames with ByteTrack...")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Run ByteTrack tracking with frame persistence
        results = model.track(frame, tracker="bytetrack.yaml", persist=True, verbose=False)[0]

        frame_detections = []

        # Draw semi-transparent alert line / restricted zone polygon
        overlay = frame.copy()
        cv2.rectangle(
            overlay,
            (0, int(RESTRICTED_Y_MIN)),
            (int(RESTRICTED_X_MAX), int(RESTRICTED_Y_MAX)),
            (0, 0, 180),
            -1,
        )
        cv2.line(
            overlay,
            (int(RESTRICTED_X_MAX), int(RESTRICTED_Y_MIN) - 40),
            (int(RESTRICTED_X_MAX), int(RESTRICTED_Y_MAX) + 40),
            (0, 0, 255),
            2,
        )
        cv2.addWeighted(overlay, 0.25, frame, 0.75, 0, frame)

        cv2.putText(
            frame,
            "ALERT LINE [RESTRICTED ZONE]",
            (10, int(RESTRICTED_Y_MIN) - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 100, 255),
            1,
            cv2.LINE_AA,
        )

        if results.boxes is not None and len(results.boxes) > 0:
            boxes = results.boxes.xyxy.cpu().numpy()
            confs = results.boxes.conf.cpu().numpy()
            clss = results.boxes.cls.cpu().numpy()
            track_ids = (
                results.boxes.id.int().cpu().numpy()
                if results.boxes.id is not None
                else [None] * len(boxes)
            )

            for box, conf, cls_id, track_id in zip(boxes, confs, clss, track_ids):
                x1, y1, x2, y2 = box
                cls_name = model.names[int(cls_id)]
                tid = int(track_id) if track_id is not None else -1
                cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0

                in_breach = is_in_restricted_zone(cx, cy) and cls_name in {"car", "truck", "motorcycle"}

                color = (0, 0, 255) if in_breach else get_color(tid)

                # Record trajectory point
                if tid != -1:
                    if tid not in track_history:
                        track_history[tid] = []
                    track_history[tid].append((int(cx), int(cy)))
                    if len(track_history[tid]) > 35:
                        track_history[tid].pop(0)

                    # Draw motion trajectory trail
                    pts = track_history[tid]
                    for i in range(1, len(pts)):
                        alpha = i / len(pts)
                        thickness = max(1, int(2 * alpha))
                        cv2.line(frame, pts[i - 1], pts[i], color, thickness)

                # Draw bounding box
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)

                # Label badge
                if tid != -1:
                    label = f"{cls_name.upper()} #{tid} {conf*100:.1f}%"
                else:
                    label = f"{cls_name.upper()} {conf*100:.1f}%"

                if in_breach:
                    label += " [BREACH]"

                (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                cv2.rectangle(
                    frame,
                    (int(x1), max(0, int(y1) - lh - 8)),
                    (int(x1) + lw + 6, max(0, int(y1))),
                    color,
                    -1,
                )
                cv2.putText(
                    frame,
                    label,
                    (int(x1) + 3, max(0, int(y1) - 4)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (255, 255, 255),
                    1,
                    cv2.LINE_AA,
                )

                # Append to JSON log (with 4K-normalized coordinates for consistent viewer overlay)
                frame_detections.append({
                    "frame": frame_idx,
                    "timestamp_sec": round(frame_idx / fps, 3),
                    "track_id": tid,
                    "class": cls_name,
                    "conf": round(float(conf), 3),
                    "box": [round(float(c), 1) for c in box],
                    "box_4k": [
                        round(float(x1 * 3.0), 1),
                        round(float(y1 * 3.0), 1),
                        round(float(x2 * 3.0), 1),
                        round(float(y2 * 3.0), 1),
                    ],
                    "centroid": [round(float(cx), 1), round(float(cy))],
                    "in_restricted_zone": bool(in_breach),
                })

        # Draw top telemetry HUD on frame
        cv2.rectangle(frame, (0, 0), (width, 32), (10, 15, 25), -1)
        hud_text = f"CAM_ALPHA · YOLOv8n + ByteTrack · Frame {frame_idx:03d}/{total_frames} · Active Tracks: {len(track_history)}"
        cv2.putText(frame, hud_text, (14, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (56, 189, 248), 1, cv2.LINE_AA)

        out.write(frame)
        all_tracks_log.extend(frame_detections)
        frame_idx += 1

    cap.release()
    out.release()
    elapsed = time.time() - t0

    print(f"[ByteTrack] Finished in {elapsed:.1f}s ({frame_idx / elapsed:.1f} fps)")
    print(f"[ByteTrack] Total tracked detection entries: {len(all_tracks_log)}")

    # Save tracking log JSON
    with open(OUTPUT_TRACKS_JSON, "w", encoding="utf-8") as f:
        json.dump(all_tracks_log, f, indent=2)
    print(f"[ByteTrack] Saved tracking log to: {OUTPUT_TRACKS_JSON}")

    # Copy to frontend public data folder for immediate UI streaming
    if FRONTEND_PUBLIC_DATA.exists():
        shutil.copy2(OUTPUT_VIDEO, FRONTEND_PUBLIC_DATA / "ibvap_real_bytetrack_demo.mp4")
        shutil.copy2(OUTPUT_TRACKS_JSON, FRONTEND_PUBLIC_DATA / "ibvap_real_bytetrack_tracks.json")
        print(f"[ByteTrack] Synchronized assets to frontend public folder.")

    return {
        "total_frames": frame_idx,
        "total_tracks_logged": len(all_tracks_log),
        "unique_track_ids": sorted(list(track_history.keys())),
        "output_video": str(OUTPUT_VIDEO),
        "output_json": str(OUTPUT_TRACKS_JSON),
    }


if __name__ == "__main__":
    summary = run_bytetrack_pipeline()
    print("[ByteTrack] Pipeline Complete Summary:", json.dumps(summary, indent=2))
