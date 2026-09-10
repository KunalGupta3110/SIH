"""
IBVAP Sentinel
Demo: demos/scenario_4_tabletop_webcam.py
Description: Scenario 4 — Live Tabletop Webcam Surveillance & Physical Hardware Boom Barrier Trigger.
             Detects: Persons/Vehicles (YOLOv8), Drones (Tuzelkhan/drone-yolov8), Number Plates (ANPR+OCR).
             Sends Telegram alerts and triggers physical hardware on any threat.
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
from core.vision.tracker import BorderTracker
from services.notifications.telegram_bot import send_mobile_alert
from services.hardware_bridge.serial_controller import trigger_physical_breach

# Performance: only run full YOLO inference every N frames
INFER_EVERY_N_FRAMES = 4
DRONE_INFER_EVERY_N = 3       # Drone model runs every 3 frames
DRONE_CONF_THRESHOLD = 0.40   # Confidence threshold for drone detection

# Drone model
DRONE_MODEL_REPO = "Tuzelkhan/drone-yolov8"
DRONE_MODEL_FILENAME = "best.pt"


def _load_drone_model():
    """Download (once, cached) and load the pretrained drone YOLO model."""
    try:
        from huggingface_hub import hf_hub_download
        from ultralytics import YOLO
        ckpt = hf_hub_download(repo_id=DRONE_MODEL_REPO, filename=DRONE_MODEL_FILENAME)
        model = YOLO(ckpt)
        print("[DRONE] Drone detection model loaded successfully.")
        return model
    except Exception as e:
        print(f"[DRONE] Could not load drone model: {e}")
        return None


def run_tabletop_demo(camera_index=0, show=True, enable_anpr=True, enable_drone=True, source=None, conf=0.45):
    # Support IP camera URL or webcam index
    cam_source = source if source else camera_index
    cap = cv2.VideoCapture(cam_source)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera source: {cam_source!r}. Check camera permissions or IP URL.")

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    print(f"\n=======================================================")
    print(f" [SCENARIO 4] LIVE TABLETOP WEBCAM & HARDWARE TRIGGER")
    print(f" Source: {cam_source} ({w}x{h} @ {fps:.1f} FPS)")
    print(f" Physical Barrier Interlock: ACTIVE")
    print(f" ANPR (Number Plate Detection): {'ENABLED' if enable_anpr else 'DISABLED'}")
    print(f" Drone Detection:              {'ENABLED' if enable_drone else 'DISABLED'}")
    print(f" YOLO Confidence Threshold:    {conf:.2f}")
    print(f"=======================================================\n")

    camera_id = "CAM_TABLETOP_01"
    zm = ZoneManager()
    zm.add_zone(camera_id, Zone(
        zone_id="tabletop_checkpoint_gate",
        name="Tabletop Checkpoint Red Zone",
        zone_type=ZoneType.RESTRICTED_POLYGON,
        points=[(int(w * 0.25), int(h * 0.2)), (int(w * 0.75), int(h * 0.2)), (int(w * 0.85), int(h * 0.85)), (int(w * 0.15), int(h * 0.85))],
        severity="CRITICAL",
    ))

    tracker = BorderTracker(imgsz=640, conf_threshold=conf)
    db = EventDatabase("data/events.db")
    frame_idx = 0

    # --- Initialize ANPR ---
    anpr_engine = None
    if enable_anpr:
        try:
            from core.vision.anpr import ANPREngine
            anpr_engine = ANPREngine(read_every_n_frames=5)
            if not anpr_engine.is_available:
                print("[ANPR] Warning: OCR not available. Install easyocr: pip install easyocr")
                anpr_engine = None
            else:
                print("[ANPR] Number plate detection engine initialized.")
        except Exception as e:
            print(f"[ANPR] Could not initialize: {e}")
            anpr_engine = None

    # --- Initialize Drone model ---
    drone_model = _load_drone_model() if enable_drone else None

    # Frame skipping caches
    cached_tracks = []
    cached_plate_results = []
    cached_drone_boxes = []   # [(x1,y1,x2,y2,conf), ...]

    # FPS counter
    fps_counter = 0
    fps_timer = time.time()
    display_fps = 0.0

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1
            timestamp_ms = frame_idx * (1000.0 / fps)

            # FPS tracking
            fps_counter += 1
            elapsed = time.time() - fps_timer
            if elapsed >= 1.0:
                display_fps = fps_counter / elapsed
                fps_counter = 0
                fps_timer = time.time()

            run_inference = (frame_idx % INFER_EVERY_N_FRAMES == 0)
            run_drone = (frame_idx % DRONE_INFER_EVERY_N == 0)

            # ── Person / Vehicle Tracking ───────────────────────────────
            if run_inference:
                tracks = tracker.track_frame(frame, frame_idx=frame_idx, timestamp_ms=timestamp_ms)
                cached_tracks = tracks

                # Zone intrusion checks
                for t in tracks:
                    for z in zm.get_zones(camera_id):
                        if z.contains_point(t.centroid):
                            if frame_idx % 25 == 0:
                                play_alert("CRITICAL")
                                trigger_physical_breach()
                                ev = SecurityEvent(
                                    event_id=f"evt_live_{t.track_id}_{int(timestamp_ms)}",
                                    timestamp_iso=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                                    timestamp_ms=timestamp_ms,
                                    camera_id=camera_id,
                                    track_id=t.track_id,
                                    class_name=t.class_name,
                                    alert_type=AlertType.ZONE_INTRUSION,
                                    severity=AlertSeverity.CRITICAL,
                                    zone_id=z.zone_id,
                                    zone_name=z.name,
                                    details=f"Physical Tabletop Breach: {t.class_name.upper()} entered {z.name}.",
                                    bbox=t.bbox,
                                    centroid=t.centroid,
                                    rule_name="Live Optical Spatial Containment",
                                    confidence=t.confidence,
                                )
                                db.insert_event(ev)
                                send_mobile_alert(ev)

                # ANPR on vehicle tracks / full-frame
                plate_results = []
                if anpr_engine:
                    plate_results = anpr_engine.process_frame(
                        frame=frame,
                        tracks=tracks,
                        frame_idx=frame_idx,
                        timestamp_ms=timestamp_ms,
                        camera_id=camera_id,
                    )
                    for plate_result in plate_results:
                        if plate_result and plate_result.plate_text:
                            if plate_result.is_hotlist and frame_idx % 15 == 0:
                                play_alert("CRITICAL")
                                trigger_physical_breach()
                                ev = SecurityEvent(
                                    event_id=f"evt_anpr_hot_{plate_result.track_id}_{int(timestamp_ms)}",
                                    timestamp_iso=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                                    timestamp_ms=timestamp_ms,
                                    camera_id=camera_id,
                                    track_id=plate_result.track_id,
                                    class_name=plate_result.class_name,
                                    alert_type=AlertType.ANPR_HOTLIST_HIT,
                                    severity=AlertSeverity.CRITICAL,
                                    zone_id="CHECKPOINT_NORTH",
                                    zone_name="Checkpoint Inspection Lane",
                                    details=f"Watchlist Hit: Flagged vehicle {plate_result.plate_text} ({plate_result.hotlist_reason})",
                                    bbox=plate_result.plate_bbox,
                                    centroid=[(plate_result.plate_bbox[0] + plate_result.plate_bbox[2]) / 2.0,
                                              (plate_result.plate_bbox[1] + plate_result.plate_bbox[3]) / 2.0] if plate_result.plate_bbox else [0, 0],
                                    rule_name="ANPR Watchlist Enforcement",
                                    confidence=plate_result.ocr_confidence,
                                    plate_text=plate_result.plate_text,
                                    plate_confidence=plate_result.plate_confidence,
                                    is_hotlist=True,
                                    hotlist_reason=plate_result.hotlist_reason,
                                )
                                db.insert_event(ev)
                                send_mobile_alert(ev)
                cached_plate_results = plate_results

            else:
                tracks = cached_tracks

            # ── Drone Detection ─────────────────────────────────────────
            if run_drone and drone_model is not None:
                drone_results = drone_model(frame, conf=DRONE_CONF_THRESHOLD, verbose=False)
                new_drone_boxes = []
                for r in drone_results:
                    if r.boxes is not None:
                        for box in r.boxes:
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                            drone_conf = float(box.conf[0].cpu())
                            new_drone_boxes.append((int(x1), int(y1), int(x2), int(y2), drone_conf))

                if new_drone_boxes:
                    cached_drone_boxes = new_drone_boxes
                    # Fire alert for each drone detected (throttled to every 20 frames)
                    if frame_idx % 20 == 0:
                        play_alert("CRITICAL")
                        trigger_physical_breach()
                        ev = SecurityEvent(
                            event_id=f"evt_drone_{frame_idx}",
                            timestamp_iso=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                            timestamp_ms=timestamp_ms,
                            camera_id=camera_id,
                            track_id=-1,
                            class_name="drone",
                            alert_type=AlertType.AERIAL_INTRUSION,
                            severity=AlertSeverity.CRITICAL,
                            zone_id="AIRSPACE_RESTRICTED",
                            zone_name="Restricted Airspace",
                            details=f"AERIAL THREAT: {len(new_drone_boxes)} drone(s) detected in restricted airspace! Confidence: {new_drone_boxes[0][4]:.2f}",
                            bbox=list(new_drone_boxes[0][:4]),
                            centroid=[(new_drone_boxes[0][0] + new_drone_boxes[0][2]) / 2.0,
                                      (new_drone_boxes[0][1] + new_drone_boxes[0][3]) / 2.0],
                            rule_name="Aerial Intrusion Detection",
                            confidence=new_drone_boxes[0][4],
                        )
                        db.insert_event(ev)
                        send_mobile_alert(ev)
                else:
                    # Fade out old boxes after 10 frames
                    if frame_idx % 10 == 0:
                        cached_drone_boxes = []

            # ── Draw Overlays ───────────────────────────────────────────
            annotated = zm.draw_zones(frame, camera_id=camera_id)
            annotated = tracker.draw_tracks(annotated, tracks, show_trail=True)

            # Draw ANPR plate overlays
            if anpr_engine:
                for t in tracks:
                    cached_plate = anpr_engine.get_cached_plate(t.track_id)
                    if cached_plate:
                        is_flagged, _ = anpr_engine.check_hotlist(cached_plate)
                        x1, y1, x2, y2 = [int(v) for v in t.bbox]
                        plate_label = f"HOTLIST: {cached_plate}" if is_flagged else f"PLATE: {cached_plate}"
                        (tw, th), _ = cv2.getTextSize(plate_label, cv2.FONT_HERSHEY_SIMPLEX, 0.50, 2)
                        bg_c = (0, 0, 180) if is_flagged else (0, 0, 0)
                        txt_c = (255, 255, 255) if is_flagged else (0, 255, 255)
                        cv2.rectangle(annotated, (x1, y2 + 2), (x1 + tw + 8, y2 + th + 10), bg_c, -1)
                        cv2.putText(annotated, plate_label, (x1 + 4, y2 + th + 6),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.50, txt_c, 2, cv2.LINE_AA)
                if cached_plate_results:
                    annotated = anpr_engine.draw_plates(annotated, cached_plate_results)

            # Draw drone boxes
            for (dx1, dy1, dx2, dy2, dconf) in cached_drone_boxes:
                cv2.rectangle(annotated, (dx1, dy1), (dx2, dy2), (0, 0, 255), 3)
                drone_label = f"AERIAL DRONE {dconf:.2f}"
                (tw, th), _ = cv2.getTextSize(drone_label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                cv2.rectangle(annotated, (dx1, dy1 - th - 10), (dx1 + tw + 8, dy1), (0, 0, 200), -1)
                cv2.putText(annotated, drone_label, (dx1 + 4, dy1 - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
                # Flashing red border for aerial threat
                if (frame_idx // 5) % 2 == 0:
                    cv2.rectangle(annotated, (0, 0), (w - 1, h - 1), (0, 0, 255), 6)

            # HUD header
            drone_status = f"DRONE: ON ({len(cached_drone_boxes)})" if enable_drone else "DRONE: OFF"
            cv2.rectangle(annotated, (0, 0), (w, 32), (20, 30, 40), -1)
            hud_text = (
                f"IBVAP SENTINEL [{camera_id}] | FPS: {display_fps:.1f} | "
                f"Tracks: {len(tracks)} | Plates: {len(cached_plate_results)} | {drone_status}"
            )
            cv2.putText(annotated, hud_text, (10, 22),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

            if show:
                try:
                    cv2.imshow("IBVAP Sentinel - Scenario 4 (Person + ANPR + Drone)", annotated)
                    key = cv2.waitKey(1) & 0xFF
                    if key == 27 or key == ord("q"):
                        break
                except cv2.error:
                    if frame_idx % 30 == 0:
                        cv2.imwrite("data/live_tabletop_frame.jpg", annotated)
                        print(f" [RUNNING - FRAME {frame_idx}] {hud_text}")
    finally:
        cap.release()
        if show:
            try:
                cv2.destroyAllWindows()
            except cv2.error:
                pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cam", type=int, default=0, help="Webcam index (default: 0)")
    parser.add_argument("--source", type=str, default=None, help="IP camera URL, e.g. http://192.168.1.4:8080/video")
    parser.add_argument("--no-show", action="store_true")
    parser.add_argument("--no-anpr", action="store_true", help="Disable ANPR")
    parser.add_argument("--no-drone", action="store_true", help="Disable drone detection")
    parser.add_argument("--conf", type=float, default=0.45, help="YOLO confidence threshold (default: 0.45)")
    args = parser.parse_args()
    run_tabletop_demo(
        camera_index=args.cam,
        show=not args.no_show,
        enable_anpr=not args.no_anpr,
        enable_drone=not args.no_drone,
        source=args.source,
        conf=args.conf,
    )
