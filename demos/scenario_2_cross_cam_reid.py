"""
Cyber Camera Surveillance Platform
Demo: demos/scenario_2_cross_cam_reid.py
Description: Scenario 2 — Cross-Camera Target Re-Identification with ResNet18 Embeddings and Cosine Similarity.
"""

import argparse
import os
from pathlib import Path
import sys
import time

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import cv2
import numpy as np

from core.database.event_db import EventDatabase
from core.database.schema import AlertSeverity, AlertType, SecurityEvent
from core.rules.sound_alerts import play_alert
from core.rules.zones import Zone, ZoneManager, ZoneType
from core.vision.reid import CrossCameraReIDEngine, FeatureExtractor
from core.vision.tracker import BorderTracker
from services.notifications.telegram_bot import send_mobile_alert


def run_reid_demo(cam1_src="data/sample_border.mp4", cam2_src="data/sample_border.mp4", similarity_thresh=0.70, show=True):
    p1 = os.path.join(ROOT_DIR, cam1_src) if not os.path.isabs(cam1_src) else cam1_src
    p2 = os.path.join(ROOT_DIR, cam2_src) if not os.path.isabs(cam2_src) else cam2_src

    cap1 = cv2.VideoCapture(p1)
    cap2 = cv2.VideoCapture(p2)
    if not cap1.isOpened() or not cap2.isOpened():
        raise RuntimeError(f"Cannot open video feeds: {cam1_src}, {cam2_src}")

    fps = cap1.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap1.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    h = int(cap1.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720

    print(f"\n=======================================================")
    print(f" 🎯 [SCENARIO 2] CROSS-CAMERA RE-ID TARGET TRACKING")
    print(f" Cam 1 (Alpha): {cam1_src} | Cam 2 (Bravo): {cam2_src}")
    print(f" Similarity Threshold (tau): {similarity_thresh*100:.0f}%")
    print(f"=======================================================\n")

    tracker1 = BorderTracker()
    tracker2 = BorderTracker()
    feat_extractor = FeatureExtractor()
    reid_engine = CrossCameraReIDEngine(similarity_threshold=similarity_thresh)
    db = EventDatabase("data/events.db")

    frame_idx = 0
    matched_banner = None
    banner_timer = 0
    combined = None

    try:
        while True:
            ret1, frame1 = cap1.read()
            ret2, frame2 = cap2.read()
            if not ret1 or not ret2:
                break

            frame_idx += 1
            timestamp_ms = (frame_idx / fps) * 1000.0

            tracks1 = tracker1.track_frame(frame1, frame_idx=frame_idx, timestamp_ms=timestamp_ms)
            tracks2 = tracker2.track_frame(frame2, frame_idx=frame_idx, timestamp_ms=timestamp_ms)

            # Process Cam 1
            for t in tracks1:
                x1, y1, x2, y2 = [int(v) for v in t.bbox]
                crop = frame1[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
                emb = feat_extractor.extract_embedding(crop)
                gid, _, _ = reid_engine.match_or_register("CAM_ALPHA", t.track_id, t.class_name, emb, timestamp_ms, t.centroid)
                t.track_id = int(gid.split("-")[-1])

            # Process Cam 2 & Evaluate Matches
            for t in tracks2:
                x1, y1, x2, y2 = [int(v) for v in t.bbox]
                crop = frame2[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
                emb = feat_extractor.extract_embedding(crop)
                gid, sim, matched = reid_engine.match_or_register("CAM_BRAVO", t.track_id, t.class_name, emb, timestamp_ms, t.centroid)
                t.track_id = int(gid.split("-")[-1])

                if matched and frame_idx > 30:
                    matched_banner = f"🎯 [CROSS-CAMERA RE-ID MATCH] TARGET {gid} MATCHED ON CAM_BRAVO ({sim*100:.1f}%)"
                    banner_timer = 45
                    if frame_idx % 40 == 0:
                        play_alert("CRITICAL")
                        ev = SecurityEvent(
                            event_id=f"evt_reid_{gid}_{int(timestamp_ms)}",
                            timestamp_iso=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                            timestamp_ms=timestamp_ms,
                            camera_id="CAM_BRAVO",
                            track_id=t.track_id,
                            class_name=t.class_name,
                            alert_type=AlertType.CROSS_CAMERA_MATCH,
                            severity=AlertSeverity.INFO,
                            details=f"Target {gid} re-identified across border nodes with {sim*100:.1f}% cosine confidence.",
                            bbox=t.bbox,
                            centroid=t.centroid,
                            rule_name="512-D L2 Normalized Cosine Appearance Similarity",
                            rule_metrics={"cosine_similarity": round(sim, 3), "threshold": similarity_thresh},
                            confidence=sim,
                        )
                        db.insert_event(ev)
                        send_mobile_alert(ev)

            # Draw Dual Feeds
            dw, dh = 640, 360
            f1_draw = tracker1.draw_tracks(cv2.resize(frame1, (dw, dh)), tracks1)
            f2_draw = tracker2.draw_tracks(cv2.resize(frame2, (dw, dh)), tracks2)

            cv2.putText(f1_draw, "NODE 1: CHECKPOST ALPHA", (15, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            cv2.putText(f2_draw, "NODE 2: BOP BRAVO PERIMETER", (15, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 200, 255), 2)

            combined = np.hstack([f1_draw, f2_draw])

            if banner_timer > 0 and matched_banner:
                banner_timer -= 1
                cv2.rectangle(combined, (0, 0), (dw * 2, 40), (0, 0, 200), -1)
                cv2.putText(combined, matched_banner, (20, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)

            if show:
                cv2.imshow("Scenario 2 - Multi-Node Cross-Camera Re-ID", combined)
                key = cv2.waitKey(1) & 0xFF
                if key == 27 or key == ord("q"):
                    break

        reid_engine.export_ledger(os.path.join(ROOT_DIR, "data", "cross_camera_ledger.json"))
        if show and combined is not None:
            print("\n[Scenario 2] Cross-camera evaluation complete. Press 'q' or 'ESC' to close.")
            while True:
                key = cv2.waitKey(50) & 0xFF
                if key == 27 or key == ord("q"):
                    break
    finally:
        cap1.release()
        cap2.release()
        if show:
            cv2.destroyAllWindows()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cam1", default="data/sample_border.mp4")
    parser.add_argument("--cam2", default="data/sample_border.mp4")
    parser.add_argument("--thresh", type=float, default=0.70)
    parser.add_argument("--no-show", action="store_true")
    args = parser.parse_args()
    run_reid_demo(cam1_src=args.cam1, cam2_src=args.cam2, similarity_thresh=args.thresh, show=not args.no_show)
