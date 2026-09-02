"""
IBVAP - Intelligent Border Video Analytics Platform
Module: reid/cross_cam_demo.py
Description: Dual-Camera Re-ID Demonstration Pipeline.
             Simulates Camera 1 (Check Post Alpha) and Camera 2 (Border Out Post Bravo),
             tracks subjects on Camera 1, and matches them when they enter Camera 2.
"""

import argparse
import os
import time
from typing import Optional

import cv2
import numpy as np

from alerts.events import AlertEngine, AlertSeverity, AlertType, EventDatabase, SecurityEvent
from alerts.zones import Zone, ZoneManager, ZoneType
from datetime import datetime, timezone
from detection_tracking.track import BorderTracker
from reid.embed import FeatureExtractor
from reid.match import CrossCameraReID


def run_dual_camera_reid_demo(
    cam1_source: str,
    cam2_source: str,
    output_path: Optional[str] = "data/cross_cam_reid_demo.mp4",
    model_path: str = "yolov8n.pt",
    device: Optional[str] = None,
    similarity_thresh: float = 0.68,
):
    """
    Executes cross-camera Re-ID tracking across two simulated or real video feeds.
    Outputs a side-by-side synchronized view showing global target stitching.
    """
    cap1 = cv2.VideoCapture(cam1_source)
    cap2 = cv2.VideoCapture(cam2_source)

    if not cap1.isOpened():
        raise RuntimeError(f"Could not open Camera 1 source: {cam1_source}")
    if not cap2.isOpened():
        raise RuntimeError(f"Could not open Camera 2 source: {cam2_source}")

    fps = cap1.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap1.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    h = int(cap1.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 360

    print(f"\n=======================================================")
    print(f" [IBVAP] DUAL-CAMERA CROSS-REID PIPELINE ACTIVATED")
    print(f" Camera 1: {cam1_source} (Check Post Alpha)")
    print(f" Camera 2: {cam2_source} (BOP Bravo Perimeter)")
    print(f"=======================================================\n")

    # Initialize Modules
    tracker1 = BorderTracker(model_path=model_path, device=device)
    tracker2 = BorderTracker(model_path=model_path, device=device)
    reid_engine = CrossCameraReID(similarity_threshold=similarity_thresh, device=device)
    db = EventDatabase()

    writer = None
    if output_path:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        # Side-by-side video: (w * 2, h)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(output_path, fourcc, fps, (w * 2, h))

    frame_idx = 0
    t_start = time.time()

    try:
        while True:
            ret1, frame1 = cap1.read()
            ret2, frame2 = cap2.read()

            if not ret1 and not ret2:
                break

            # Fallback black frames if one video finishes before the other
            if not ret1:
                frame1 = np.zeros((h, w, 3), dtype=np.uint8)
            else:
                frame1 = cv2.resize(frame1, (w, h))

            if not ret2:
                frame2 = np.zeros((h, w, 3), dtype=np.uint8)
            else:
                frame2 = cv2.resize(frame2, (w, h))

            frame_idx += 1
            timestamp_ms = (frame_idx / fps) * 1000.0

            # 1. Track Camera 1
            tracks_cam1 = tracker1.track_frame(frame1, frame_idx=frame_idx, timestamp_ms=timestamp_ms)
            for t1 in tracks_cam1:
                crop = FeatureExtractor.crop_from_bbox(frame1, t1.bbox)
                if crop is not None:
                    gid, is_match, score = reid_engine.process_observation(
                        camera_id="CAM_ALPHA",
                        local_track_id=t1.track_id,
                        class_name=t1.class_name,
                        crop_bgr=crop,
                        centroid=t1.centroid,
                        bbox=t1.bbox,
                        timestamp_ms=timestamp_ms,
                        frame_idx=frame_idx,
                    )

            # 2. Track Camera 2 & Check Re-ID Matches
            tracks_cam2 = tracker2.track_frame(frame2, frame_idx=frame_idx, timestamp_ms=timestamp_ms)
            for t2 in tracks_cam2:
                crop = FeatureExtractor.crop_from_bbox(frame2, t2.bbox)
                if crop is not None:
                    gid, is_match, score = reid_engine.process_observation(
                        camera_id="CAM_BRAVO",
                        local_track_id=t2.track_id,
                        class_name=t2.class_name,
                        crop_bgr=crop,
                        centroid=t2.centroid,
                        bbox=t2.bbox,
                        timestamp_ms=timestamp_ms,
                        frame_idx=frame_idx,
                    )

                    if is_match:
                        print(f"🎯 [CROSS-CAMERA RE-ID] MATCH DETECTED! Global ID '{gid}' matched on CAM_BRAVO (Score: {score:.2f})")
                        ev = SecurityEvent(
                            event_id=f"evt_reid_{gid}_{int(timestamp_ms)}",
                            timestamp_iso=datetime.now(timezone.utc).isoformat(),
                            timestamp_ms=timestamp_ms,
                            camera_id="CAM_BRAVO",
                            track_id=t2.track_id,
                            class_name=t2.class_name,
                            alert_type=AlertType.CROSS_CAMERA_MATCH,
                            severity=AlertSeverity.CRITICAL,
                            zone_id="cross_cam_reid",
                            zone_name="Cross-Camera Re-ID Link",
                            details=f"Target {gid} ({t2.class_name}) re-identified on CAM_BRAVO after previous sighting on CAM_ALPHA (Similarity: {score*100:.1f}%).",
                            bbox=t2.bbox,
                            centroid=t2.centroid,
                        )
                        db.insert_event(ev)

            # 3. Annotate frames with Global IDs
            def draw_global_labels(frame, tracks, cam_name):
                ann = frame.copy()
                for t in tracks:
                    local_key = (cam_name, t.track_id)
                    gid = reid_engine.local_to_global.get(local_key, f"LOC-{t.track_id}")
                    x1, y1, x2, y2 = [int(c) for c in t.bbox]
                    cv2.rectangle(ann, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    badge = f"GLOBAL: {gid}"
                    cv2.putText(ann, badge, (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)
                cv2.putText(ann, f"NODE: {cam_name}", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                return ann

            ann1 = draw_global_labels(frame1, tracks_cam1, "CAM_ALPHA")
            ann2 = draw_global_labels(frame2, tracks_cam2, "CAM_BRAVO")

            # Stitch Side-by-Side
            side_by_side = np.hstack((ann1, ann2))

            # Header divider
            cv2.line(side_by_side, (w, 0), (w, h), (0, 0, 255), 3)

            if writer:
                writer.write(side_by_side)

            if frame_idx % 30 == 0:
                print(f"[Dual-Cam Demo] Frame {frame_idx} | Total Global Targets: {len(reid_engine.global_tracks)}")

    finally:
        cap1.release()
        cap2.release()
        if writer:
            writer.release()
            print(f"[IBVAP] Dual camera Re-ID output saved to: {output_path}")

        reid_engine.export_summary("data/cross_camera_ledger.json")


def main():
    parser = argparse.ArgumentParser(description="IBVAP - Dual-Camera Cross-ReID Demo")
    parser.add_argument("--cam1", type=str, default="data/sample_border.mp4", help="Camera 1 video source")
    parser.add_argument("--cam2", type=str, default="data/sample_border.mp4", help="Camera 2 video source")
    parser.add_argument("--output", type=str, default="data/cross_cam_reid_demo.mp4", help="Output side-by-side video")
    parser.add_argument("--device", type=str, default=None, help="'cpu', 'cuda', etc.")
    args = parser.parse_args()

    run_dual_camera_reid_demo(
        cam1_source=args.cam1,
        cam2_source=args.cam2,
        output_path=args.output,
        device=args.device,
    )


if __name__ == "__main__":
    main()
