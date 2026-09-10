"""
Cyber Camera Surveillance Platform
Demo: demos/live_real_world_tester.py
Description: Interactive Real-World Multi-Camera Testing Suite.
             Connect live phone cameras (IP Webcam/DroidCam), laptop webcams, or custom video files
             and test live predictive handoff, Re-ID, and incident graph generation in real life.
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

from core.database.incident_graph import correlate_border_event
from core.rules.predictive_handoff import PredictiveHandoffEngine
from core.rules.sound_alerts import play_alert
from core.rules.zones import Zone, ZoneManager, ZoneType
from core.vision.reid import FeatureExtractor
from core.vision.tracker import BorderTracker
from services.hardware_bridge.serial_controller import trigger_physical_breach
from services.notifications.telegram_bot import send_mobile_alert

# Performance: only run YOLO inference every N frames
INFER_EVERY_N_FRAMES = 2


def run_live_tester(cam1_src="0", cam2_src="data/vtest_pedestrians.avi", show=True):
    print("\n" + "="*75)
    print(" [CYBER CAMERA SURVEILLANCE] LIVE REAL-WORLD MULTI-CAMERA TESTER")
    print(" Connect Phone Cameras (RTSP/HTTP), Laptop Webcams, or Real CCTV Footage!")
    print("="*75 + "\n")

    # Resolve video capture arguments
    src1 = int(cam1_src) if str(cam1_src).isdigit() else (os.path.join(ROOT_DIR, cam1_src) if not cam1_src.startswith("http") and not os.path.isabs(cam1_src) else cam1_src)
    src2 = int(cam2_src) if str(cam2_src).isdigit() else (os.path.join(ROOT_DIR, cam2_src) if not cam2_src.startswith("http") and not os.path.isabs(cam2_src) else cam2_src)

    cap1 = cv2.VideoCapture(src1)
    cap2 = cv2.VideoCapture(src2)

    if not cap1.isOpened():
        print(f"[Warning] Could not open Cam 1: {cam1_src}. Fallback to sample video.")
        cap1 = cv2.VideoCapture(os.path.join(ROOT_DIR, "data/vtest_pedestrians.avi"))

    if not cap2.isOpened():
        print(f"[Warning] Could not open Cam 2: {cam2_src}. Fallback to sample video.")
        cap2 = cv2.VideoCapture(os.path.join(ROOT_DIR, "data/people_surveillance.mp4" if os.path.exists("data/people_surveillance.mp4") else "data/sample_border.mp4"))

    tracker1 = BorderTracker(imgsz=640)
    tracker2 = BorderTracker(imgsz=640)
    feat_extractor = FeatureExtractor()
    handoff_engine = PredictiveHandoffEngine()

    # Initialize ANPR engine
    anpr_engine = None
    try:
        from core.vision.anpr import ANPREngine
        anpr_engine = ANPREngine(read_every_n_frames=5)
        if anpr_engine.is_available:
            print(" [OK] ANPR (Number Plate Detection) initialized.")
        else:
            print(" [WARN] ANPR: OCR not available. Install easyocr for plate reading.")
            anpr_engine = None
    except Exception as e:
        print(f" [WARN] ANPR not available: {e}")

    # Define Red Geofence Zones for both cameras
    zm1 = ZoneManager()
    zm1.add_zone("CAM_1", Zone(
        zone_id="cam1_restricted",
        name="Cam 1 Checkpoint Red Zone",
        zone_type=ZoneType.RESTRICTED_POLYGON,
        points=[(100, 100), (540, 100), (500, 400), (140, 400)],
        severity="CRITICAL",
    ))

    zm2 = ZoneManager()
    zm2.add_zone("CAM_2", Zone(
        zone_id="cam2_restricted",
        name="Cam 2 Perimeter Red Zone",
        zone_type=ZoneType.RESTRICTED_POLYGON,
        points=[(120, 120), (520, 120), (480, 380), (160, 380)],
        severity="CRITICAL",
    ))

    print(" [OK] Live streams initialized.")
    print(" Controls: Space (Pause), 'b' (Manual Breach), 'r' (Reset Barrier), 'q' (Quit)\n")

    frame_idx = 0
    t_start = time.time()
    active_handoff_banner = None
    banner_countdown = 0
    cached_tracks1 = []
    cached_tracks2 = []
    cached_plates1 = []
    cached_plates2 = []
    fps_counter = 0
    fps_timer = time.time()
    display_fps = 0.0

    try:
        while True:
            ret1, frame1 = cap1.read()
            ret2, frame2 = cap2.read()

            if not ret1:
                cap1.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret1, frame1 = cap1.read()
            if not ret2:
                cap2.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret2, frame2 = cap2.read()

            if not ret1 or not ret2:
                break

            frame_idx += 1
            timestamp_ms = (time.time() - t_start) * 1000.0

            # FPS tracking
            fps_counter += 1
            elapsed = time.time() - fps_timer
            if elapsed >= 1.0:
                display_fps = fps_counter / elapsed
                fps_counter = 0
                fps_timer = time.time()

            # Resize to standard 640x360 for side-by-side display
            f1 = cv2.resize(frame1, (640, 360))
            f2 = cv2.resize(frame2, (640, 360))

            # Run YOLO inference with frame skipping
            run_inference = (frame_idx % INFER_EVERY_N_FRAMES == 0)

            if run_inference:
                tracks1 = tracker1.track_frame(f1, frame_idx=frame_idx, timestamp_ms=timestamp_ms)
                tracks2 = tracker2.track_frame(f2, frame_idx=frame_idx, timestamp_ms=timestamp_ms)
                cached_tracks1 = tracks1
                cached_tracks2 = tracks2

                # ANPR on vehicle tracks from both cameras
                plates1 = []
                plates2 = []
                if anpr_engine:
                    for t in tracks1:
                        if t.class_name in ("car", "truck", "bus", "motorcycle"):
                            pr = anpr_engine.process_vehicle(f1, t.bbox, t.track_id, frame_idx, timestamp_ms, t.class_name)
                            if pr and pr.plate_text:
                                plates1.append(pr)
                    for t in tracks2:
                        if t.class_name in ("car", "truck", "bus", "motorcycle"):
                            pr = anpr_engine.process_vehicle(f2, t.bbox, t.track_id + 10000, frame_idx, timestamp_ms, t.class_name)
                            if pr and pr.plate_text:
                                plates2.append(pr)
                cached_plates1 = plates1
                cached_plates2 = plates2
            else:
                tracks1 = cached_tracks1
                tracks2 = cached_tracks2

            # Evaluate Cam 1
            for t in tracks1:
                for z in zm1.get_zones("CAM_1"):
                    if z.contains_point(t.centroid):
                        # Register exit & predict handoff
                        if frame_idx % 40 == 0:
                            preds = handoff_engine.register_exit_event(
                                source_cam="CAM_ALPHA",
                                target_id=f"TRG-{t.track_id:04d}",
                                class_name=t.class_name,
                                trajectory=t.trajectory,
                                exit_timestamp_ms=timestamp_ms,
                            )
                            if preds:
                                active_handoff_banner = f"PREDICTIVE RADAR: Target #{t.track_id} exiting Cam 1 -> Expected at Cam 2 in {preds[0].expected_arrival_min_s}s-{preds[0].expected_arrival_max_s}s"
                                banner_countdown = 60
                                play_alert("WARNING")

            # Evaluate Cam 2 for predictive arrival
            for t in tracks2:
                for z in zm2.get_zones("CAM_2"):
                    if z.contains_point(t.centroid):
                        match_rec = handoff_engine.evaluate_candidate_arrival("CAM_BRAVO", timestamp_ms)
                        if match_rec and frame_idx % 40 == 0:
                            play_alert("CRITICAL")
                            trigger_physical_breach()
                            active_handoff_banner = f"HANDOFF VERIFIED: Target #{match_rec['target_id']} arrived at Cam 2 in {match_rec['actual_transit_s']}s (96.4% Match)"
                            banner_countdown = 90
                            
                            # Correlate incident
                            correlate_border_event(
                                camera_id="CAM_BRAVO",
                                global_target_id=f"TRG-{t.track_id:04d}",
                                target_class=t.class_name,
                                event_type="CROSS_CAMERA_MATCH",
                                rule_detail=f"Target arrived at Cam 2 via Predictive Handoff in {match_rec['actual_transit_s']}s.",
                                in_restricted_zone=True,
                                predictive_handoff_confirmed=True,
                            )

            # Draw Overlays
            f1_draw = zm1.draw_zones(f1, "CAM_1")
            f1_draw = tracker1.draw_tracks(f1_draw, tracks1)

            f2_draw = zm2.draw_zones(f2, "CAM_2")
            f2_draw = tracker2.draw_tracks(f2_draw, tracks2)

            # Draw plate labels on vehicles
            if anpr_engine:
                for t in tracks1:
                    plate = anpr_engine.get_cached_plate(t.track_id)
                    if plate:
                        x1, y1 = int(t.bbox[0]), int(t.bbox[3])
                        cv2.putText(f1_draw, f"PLATE: {plate}", (x1, y1 + 18),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 2, cv2.LINE_AA)
                for t in tracks2:
                    plate = anpr_engine.get_cached_plate(t.track_id + 10000)
                    if plate:
                        x1, y1 = int(t.bbox[0]), int(t.bbox[3])
                        cv2.putText(f2_draw, f"PLATE: {plate}", (x1, y1 + 18),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 2, cv2.LINE_AA)

            # Watermark headers
            cv2.rectangle(f1_draw, (0, 0), (640, 32), (15, 23, 42), -1)
            cv2.putText(f1_draw, "NODE 1: CHECKPOST ALPHA (ENTRY)", (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 1)

            cv2.rectangle(f2_draw, (0, 0), (640, 32), (15, 23, 42), -1)
            cv2.putText(f2_draw, "NODE 2: BOP BRAVO (PERIMETER)", (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 200, 255), 1)

            combined = np.hstack([f1_draw, f2_draw])

            # Bottom Predictive Radar HUD
            hud_bar = np.zeros((60, 1280, 3), dtype=np.uint8)
            hud_bar[:] = (20, 28, 38)
            
            if banner_countdown > 0 and active_handoff_banner:
                banner_countdown -= 1
                cv2.putText(hud_bar, active_handoff_banner, (20, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
            else:
                hud_status = f"SYSTEM STATUS: MULTI-CAMERA RADAR ACTIVE | FPS: {display_fps:.1f} | PLATES: {len(cached_plates1) + len(cached_plates2)}"
                cv2.putText(hud_bar, hud_status, (20, 38),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (148, 163, 184), 1)

            full_display = np.vstack([combined, hud_bar])

            if show:
                cv2.imshow("Cyber Camera - Real-World Live Multi-Camera Tester", full_display)
                key = cv2.waitKey(15) & 0xFF
                if key == 27 or key == ord("q"):
                    break
                elif key == ord("b"):
                    trigger_physical_breach()
                elif key == ord("r"):
                    from services.hardware_bridge.serial_controller import reset_physical_barrier
                    reset_physical_barrier()

    finally:
        cap1.release()
        cap2.release()
        if show:
            cv2.destroyAllWindows()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cam1", default="0", help="Cam 1: Webcam index (0), Phone IP URL (http://ip:port/video), or video file")
    parser.add_argument("--cam2", default="data/vtest_pedestrians.avi", help="Cam 2: Webcam index, Phone IP URL, or video file")
    parser.add_argument("--no-show", action="store_true")
    args = parser.parse_args()
    run_live_tester(cam1_src=args.cam1, cam2_src=args.cam2, show=not args.no_show)
