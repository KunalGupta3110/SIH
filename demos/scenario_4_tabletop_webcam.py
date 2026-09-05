"""
Cyber Camera Surveillance Platform
Demo: demos/scenario_4_tabletop_webcam.py
Description: Scenario 4 — Live Tabletop Webcam Surveillance & Physical Hardware Boom Barrier Trigger.
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
from core.database.event_db import EventDatabase
from core.database.schema import AlertSeverity, AlertType, SecurityEvent
from core.rules.sound_alerts import play_alert
from core.rules.zones import Zone, ZoneManager, ZoneType
from core.vision.tracker import BorderTracker
from services.notifications.telegram_bot import send_mobile_alert
from services.hardware_bridge.serial_controller import trigger_physical_breach


def run_tabletop_demo(camera_index=0, show=True):
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

    tracker = BorderTracker()
    db = EventDatabase("data/events.db")
    frame_idx = 0

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1
            timestamp_ms = frame_idx * (1000.0 / fps)
            tracks = tracker.track_frame(frame, frame_idx=frame_idx, timestamp_ms=timestamp_ms)

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

            annotated = zm.draw_zones(frame, camera_id=camera_id)
            annotated = tracker.draw_tracks(annotated, tracks, show_trail=True)

            cv2.rectangle(annotated, (0, 0), (w, 32), (20, 30, 40), -1)
            cv2.putText(annotated, f"LIVE WEBCAM NODE: {camera_id} | TARGETS: {len(tracks)}", (10, 22),
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
    args = parser.parse_args()
    run_tabletop_demo(camera_index=args.cam, show=not args.no_show)
