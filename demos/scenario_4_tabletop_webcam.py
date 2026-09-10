"""
Cyber Camera Surveillance Platform
Demo: demos/scenario_4_tabletop_webcam.py
Description: Scenario 4 — Live Tabletop Webcam Surveillance & Physical Hardware Boom Barrier Trigger.
             Now with ANPR (Number Plate Detection) and performance optimizations.
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
INFER_EVERY_N_FRAMES = 2


def run_tabletop_demo(camera_index=0, show=True, enable_anpr=True):
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open webcam index {camera_index}. Check camera permissions.")

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    print(f"\n=======================================================")
    print(f" 🛡️ [SCENARIO 4] LIVE TABLETOP WEBCAM & HARDWARE TRIGGER")
    print(f" Webcam Index: {camera_index} ({w}x{h} @ {fps:.1f} FPS)")
    print(f" Physical Barrier Interlock: ACTIVE")
    print(f" ANPR (Number Plate Detection): {'ENABLED' if enable_anpr else 'DISABLED'}")
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

    tracker = BorderTracker(imgsz=640)
    db = EventDatabase("data/events.db")
    frame_idx = 0

    # Initialize ANPR engine
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

    # Frame skipping cache
    cached_tracks = []
    cached_plate_results = []

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

            # Run YOLO inference on cadence frames only
            run_inference = (frame_idx % INFER_EVERY_N_FRAMES == 0)

            if run_inference:
                tracks = tracker.track_frame(frame, frame_idx=frame_idx, timestamp_ms=timestamp_ms)
                cached_tracks = tracks

                # Zone intrusion checks (throttled)
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

                # ANPR on vehicle tracks
                plate_results = []
                if anpr_engine:
                    for t in tracks:
                        if t.class_name in ("car", "truck", "bus", "motorcycle"):
                            plate_result = anpr_engine.process_vehicle(
                                frame=frame,
                                vehicle_bbox=t.bbox,
                                track_id=t.track_id,
                                frame_idx=frame_idx,
                                timestamp_ms=timestamp_ms,
                                class_name=t.class_name,
                                camera_id=camera_id,
                            )
                            if plate_result and plate_result.plate_text:
                                plate_results.append(plate_result)
                                if plate_result.is_hotlist and frame_idx % 15 == 0:
                                    play_alert("CRITICAL")
                                    trigger_physical_breach()
                                    ev = SecurityEvent(
                                        event_id=f"evt_anpr_hot_{t.track_id}_{int(timestamp_ms)}",
                                        timestamp_iso=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                                        timestamp_ms=timestamp_ms,
                                        camera_id=camera_id,
                                        track_id=t.track_id,
                                        class_name=t.class_name,
                                        alert_type=AlertType.ANPR_HOTLIST_HIT,
                                        severity=AlertSeverity.CRITICAL,
                                        zone_id="CHECKPOINT_NORTH",
                                        zone_name="Checkpoint Inspection Lane",
                                        details=f"Watchlist Hit: Flagged vehicle {plate_result.plate_text} ({plate_result.hotlist_reason})",
                                        bbox=t.bbox,
                                        centroid=t.centroid,
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
                # Skipped frame: reuse cached results
                tracks = cached_tracks

            # Draw overlays
            annotated = zm.draw_zones(frame, camera_id=camera_id)
            annotated = tracker.draw_tracks(annotated, tracks, show_trail=True)

            # Draw plate overlays
            if anpr_engine:
                # Draw plate labels on tracked vehicles
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

                # Draw plate bounding boxes
                if cached_plate_results:
                    annotated = anpr_engine.draw_plates(annotated, cached_plate_results)

            # HUD header
            cv2.rectangle(annotated, (0, 0), (w, 32), (20, 30, 40), -1)
            hud_text = (
                f"LIVE WEBCAM: {camera_id} | TARGETS: {len(tracks)} | "
                f"PLATES: {len(cached_plate_results)} | FPS: {display_fps:.1f}"
            )
            cv2.putText(annotated, hud_text, (10, 22),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

            if show:
                cv2.imshow("Scenario 4 - Live Tabletop & Hardware Barrier", annotated)
                key = cv2.waitKey(1) & 0xFF
                if key == 27 or key == ord("q"):
                    break
    finally:
        cap.release()
        if show:
            cv2.destroyAllWindows()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cam", type=int, default=0)
    parser.add_argument("--no-show", action="store_true")
    parser.add_argument("--no-anpr", action="store_true", help="Disable ANPR (number plate detection)")
    args = parser.parse_args()
    run_tabletop_demo(camera_index=args.cam, show=not args.no_show, enable_anpr=not args.no_anpr)
