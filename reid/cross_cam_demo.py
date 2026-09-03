"""
IBVAP - Intelligent Border Video Analytics Platform
Module: reid/cross_cam_demo.py
Description: Explainable Dual-Camera Cross-ReID Demonstration Pipeline.
             Simulates Camera 1 (Check Post Alpha) and Camera 2 (Border Out Post Bravo),
             extracts appearance embeddings, scores candidate similarities transparently,
             and stitches target trajectories across border nodes.
"""

import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import sys
import time
from typing import Optional

# Ensure project root in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import cv2
import numpy as np

from alerts.events import AlertEngine, EventDatabase
from alerts.schema import AlertSeverity, AlertType, SecurityEvent
from alerts.sound_alerts import play_alert
from alerts.zones import Zone, ZoneManager, ZoneType
from detection_tracking.track import BorderTracker
from reid.embed import FeatureExtractor
from reid.match import CrossCameraReID


def run_dual_camera_reid_demo(
    cam1_source: str,
    cam2_source: str,
    output_path: Optional[str] = "data/cross_cam_real_demo.mp4",
    model_path: str = "yolov8n.pt",
    device: Optional[str] = None,
    similarity_thresh: float = 0.70,
    show: bool = True,
):
    """
    Executes explainable cross-camera Re-ID tracking across two camera feeds.
    Outputs a side-by-side synchronized view with candidate similarity scores.
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
    print(f" [IBVAP] EXPLAINABLE DUAL-CAMERA CROSS-REID PIPELINE")
    print(f" Camera 1: {cam1_source} (Check Post Alpha)")
    print(f" Camera 2: {cam2_source} (BOP Bravo Perimeter)")
    print(f" Similarity Threshold (tau): {similarity_thresh:.2f}")
    print(f"=======================================================\n")

    # Initialize Modules
    tracker1 = BorderTracker(model_path=model_path, device=device)
    tracker2 = BorderTracker(model_path=model_path, device=device)
    reid_engine = CrossCameraReID(similarity_threshold=similarity_thresh, device=device)
    db = EventDatabase()

    writer = None
    if output_path:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(output_path, fourcc, fps, (w * 2, h))

    frame_idx = 0
    t_start = time.time()

    # Track match scores per local ID for HUD rendering
    match_score_display = {}
    active_alert_text = None
    alert_banner_timer = 0

    try:
        while True:
            ret1, frame1 = cap1.read()
            ret2, frame2 = cap2.read()

            if not ret1 and not ret2:
                break

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

            # 1. Track Camera 1 (Check Post Alpha)
            tracks_cam1 = tracker1.track_frame(frame1, frame_idx=frame_idx, timestamp_ms=timestamp_ms)
            for t1 in tracks_cam1:
                crop = FeatureExtractor.crop_from_bbox(frame1, t1.bbox)
                if crop is not None:
                    gid, is_match, score, _ = reid_engine.process_observation(
                        camera_id="CAM_ALPHA",
                        local_track_id=t1.track_id,
                        class_name=t1.class_name,
                        crop_bgr=crop,
                        centroid=t1.centroid,
                        bbox=t1.bbox,
                        timestamp_ms=timestamp_ms,
                        frame_idx=frame_idx,
                    )
                    match_score_display[("CAM_ALPHA", t1.track_id)] = (gid, 1.0, False)

            # 2. Track Camera 2 (BOP Bravo) & Check Re-ID Matches
            tracks_cam2 = tracker2.track_frame(frame2, frame_idx=frame_idx, timestamp_ms=timestamp_ms)
            for t2 in tracks_cam2:
                crop = FeatureExtractor.crop_from_bbox(frame2, t2.bbox)
                if crop is not None:
                    gid, is_match, score, candidates = reid_engine.process_observation(
                        camera_id="CAM_BRAVO",
                        local_track_id=t2.track_id,
                        class_name=t2.class_name,
                        crop_bgr=crop,
                        centroid=t2.centroid,
                        bbox=t2.bbox,
                        timestamp_ms=timestamp_ms,
                        frame_idx=frame_idx,
                    )
                    match_score_display[("CAM_BRAVO", t2.track_id)] = (gid, score, is_match)

                    if is_match:
                        print(
                            f"🎯 [RE-ID EXPLAINABLE MATCH] Global ID: {gid} | Score: {score:.3f} >= {similarity_thresh:.2f} | "
                            f"Matched between CAM_ALPHA and CAM_BRAVO"
                        )
                        play_alert("CRITICAL")
                        active_alert_text = f"🎯 [RE-ID MATCH] TARGET {gid} MATCHED ON CAM_BRAVO! (Sim: {score*100:.1f}% >= {similarity_thresh*100:.0f}%)"
                        alert_banner_timer = 50  # Display banner for ~50 frames

                        ev = SecurityEvent(
                            event_id=f"evt_reid_{gid}_{int(timestamp_ms)}",
                            timestamp_iso=datetime.now(timezone.utc).isoformat(),
                            timestamp_ms=timestamp_ms,
                            camera_id="CAM_BRAVO",
                            track_id=t2.track_id,
                            class_name=t2.class_name,
                            alert_type=AlertType.CROSS_CAMERA_MATCH,
                            severity=AlertSeverity.CRITICAL,
                            zone_id="cross_cam_link",
                            zone_name="Cross-Node Movement Trail",
                            details=(
                                f"Target {gid} ({t2.class_name}) re-identified on CAM_BRAVO. "
                                f"Appearance match score: {score*100:.1f}% (Threshold: {similarity_thresh*100:.0f}%)."
                            ),
                            bbox=t2.bbox,
                            centroid=t2.centroid,
                            rule_name="Appearance Embedding Cosine Similarity",
                            rule_metrics={
                                "cosine_similarity": round(score, 4),
                                "threshold": round(similarity_thresh, 4),
                                "origin_camera": "CAM_ALPHA",
                                "destination_camera": "CAM_BRAVO",
                            },
                            confidence=score,
                        )
                        db.insert_event(ev)

            # 3. Annotate frames with Global IDs and Similarity Scores
            def draw_global_labels(frame, tracks, cam_name):
                ann = frame.copy()
                for t in tracks:
                    key = (cam_name, t.track_id)
                    gid, score, is_m = match_score_display.get(key, (f"LOC-{t.track_id}", 0.0, False))
                    x1, y1, x2, y2 = [int(c) for c in t.bbox]
                    
                    # Highlight color: Gold/Red if matched across cameras, Green if normal
                    box_color = (0, 165, 255) if (cam_name == "CAM_BRAVO" and score >= similarity_thresh) else (0, 255, 0)
                    thickness = 3 if (cam_name == "CAM_BRAVO" and score >= similarity_thresh) else 2
                    cv2.rectangle(ann, (x1, y1), (x2, y2), box_color, thickness)
                    
                    if cam_name == "CAM_BRAVO" and score >= similarity_thresh:
                        badge = f"MATCH: {gid} ({score*100:.0f}%)"
                        cv2.rectangle(ann, (x1, max(0, y1 - 22)), (x1 + 175, y1), (0, 0, 200), -1)
                        cv2.putText(ann, badge, (x1 + 4, max(16, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (255, 255, 255), 2)
                    elif cam_name == "CAM_BRAVO" and score > 0.0:
                        badge = f"{gid} (Sim: {score:.2f})"
                        cv2.putText(ann, badge, (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
                    else:
                        badge = f"{gid}"
                        cv2.putText(ann, badge, (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)

                cv2.putText(ann, f"NODE: {cam_name}", (15, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
                return ann

            ann1 = draw_global_labels(frame1, tracks_cam1, "CAM_ALPHA")
            ann2 = draw_global_labels(frame2, tracks_cam2, "CAM_BRAVO")

            # Stitch Side-by-Side
            side_by_side = np.hstack((ann1, ann2))

            # Header divider and stats bar
            cv2.line(side_by_side, (w, 0), (w, h), (0, 0, 255), 2)
            cv2.rectangle(side_by_side, (0, h - 30), (w * 2, h), (15, 15, 15), -1)
            hud = f"IBVAP RE-ID PIPELINE | Global Targets: {len(reid_engine.global_tracks)} | Threshold: {similarity_thresh:.2f} | Frame: {frame_idx}"
            cv2.putText(side_by_side, hud, (15, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 200), 1)

            # Prominent Top Alert Banner if match active
            if alert_banner_timer > 0 and active_alert_text:
                alert_banner_timer -= 1
                overlay = side_by_side.copy()
                cv2.rectangle(overlay, (0, 0), (w * 2, 45), (0, 0, 220), -1)
                cv2.addWeighted(overlay, 0.85, side_by_side, 0.15, 0, side_by_side)
                cv2.putText(side_by_side, active_alert_text, (25, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)
                # Outer flashing border
                cv2.rectangle(side_by_side, (0, 0), (w * 2 - 1, h - 1), (0, 0, 255), 4)

            if writer:
                writer.write(side_by_side)

            if show:
                cv2.imshow("IBVAP - Dual-Camera Cross-ReID Live Feed", side_by_side)
                key = cv2.waitKey(1) & 0xFF
                if key == 27 or key == ord("q"):
                    print("[IBVAP Re-ID] User closed preview window.")
                    break

            if frame_idx % 30 == 0:
                print(f"[Dual-Cam Demo] Frame {frame_idx} | Total Global Targets: {len(reid_engine.global_tracks)}")

    finally:
        cap1.release()
        cap2.release()
        if writer:
            writer.release()
            print(f"[IBVAP] Dual camera Re-ID output saved to: {output_path}")
        if show:
            cv2.destroyAllWindows()

        reid_engine.export_summary("data/cross_camera_ledger.json")


def main():
    parser = argparse.ArgumentParser(description="IBVAP - Explainable Dual-Camera Cross-ReID Demo")
    parser.add_argument("--cam1", type=str, default="data/sample_border.mp4", help="Camera 1 video source")
    parser.add_argument("--cam2", type=str, default="data/sample_border.mp4", help="Camera 2 video source")
    parser.add_argument("--output", type=str, default="data/cross_cam_real_demo.mp4", help="Output side-by-side video")
    parser.add_argument("--device", type=str, default=None, help="'cpu', 'cuda', etc.")
    parser.add_argument("--thresh", type=float, default=0.70, help="Re-ID Cosine Similarity threshold (default: 0.70)")
    parser.add_argument("--no-show", action="store_true", help="Disable live GUI window")
    args = parser.parse_args()

    run_dual_camera_reid_demo(
        cam1_source=args.cam1,
        cam2_source=args.cam2,
        output_path=args.output,
        device=args.device,
        similarity_thresh=args.thresh,
        show=not args.no_show,
    )


if __name__ == "__main__":
    main()
