"""
Cyber Camera Surveillance Platform
Demo: demos/scenario_1_perimeter_breach.py
Description: Scenario 1 — Live Border Surveillance & Multi-Threat Geofencing (Tripwires, Red Zones, Loitering).
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
from core.rules.threat_analyzer import BorderThreatAnalyzer
from core.rules.zones import Zone, ZoneManager, ZoneType
from core.vision.tracker import BorderTracker
from services.notifications.telegram_bot import send_mobile_alert
from services.hardware_bridge.serial_controller import trigger_physical_breach


def run_demo(source="data/vtest_pedestrians.avi", camera_id="CAM_ALPHA", show=True):
    video_path = os.path.join(ROOT_DIR, source) if not str(source).isdigit() and not os.path.isabs(source) else source
    cap = cv2.VideoCapture(int(video_path) if str(video_path).isdigit() else video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    print(f"\n=======================================================")
    print(f" 🛡️ [SCENARIO 1] BORDER GEOFENCE & TRIPWIRE SURVEILLANCE")
    print(f" Source: {source} ({w}x{h} @ {fps:.1f} FPS)")
    print(f"=======================================================\n")

    zm = ZoneManager()
    zm.add_zone(camera_id, Zone(
        zone_id="alpha_red_zone",
        name="Border Restricted Red Zone",
        zone_type=ZoneType.RESTRICTED_POLYGON,
        points=[(int(w * 0.15), int(h * 0.1)), (int(w * 0.85), int(h * 0.1)), (int(w * 0.80), int(h * 0.45)), (int(w * 0.20), int(h * 0.45))],
        severity="CRITICAL",
        loitering_time_sec=2.5,
    ))
    zm.add_zone(camera_id, Zone(
        zone_id="alpha_tripwire",
        name="Outer Perimeter Tripwire",
        zone_type=ZoneType.TRIPWIRE,
        points=[(int(w * 0.1), int(h * 0.52)), (int(w * 0.9), int(h * 0.52))],
        severity="CRITICAL",
    ))

    tracker = BorderTracker()
    db = EventDatabase("data/events.db")
    threat_analyzer = BorderThreatAnalyzer()

    frame_idx = 0
    annotated = None

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1
            timestamp_ms = (frame_idx / fps) * 1000.0

            raw_frame = frame.copy()
            tracks = tracker.track_frame(frame, frame_idx=frame_idx, timestamp_ms=timestamp_ms)

            # Evaluate zones
            for t in tracks:
                for z in zm.get_zones(camera_id):
                    if z.contains_point(t.centroid):
                        ev = SecurityEvent(
                            event_id=f"evt_int_{camera_id}_{t.track_id}_{int(timestamp_ms)}",
                            timestamp_iso=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                            timestamp_ms=timestamp_ms,
                            camera_id=camera_id,
                            track_id=t.track_id,
                            class_name=t.class_name,
                            alert_type=AlertType.ZONE_INTRUSION,
                            severity=AlertSeverity.CRITICAL,
                            zone_id=z.zone_id,
                            zone_name=z.name,
                            details=f"Restricted zone intrusion: {t.class_name.upper()} #{t.track_id} in {z.name}.",
                            bbox=t.bbox,
                            centroid=t.centroid,
                            rule_name="Point-in-Polygon Boundary Containment",
                            confidence=t.confidence,
                        )
                        db.insert_event(ev)
                        if frame_idx % 30 == 0:
                            play_alert("CRITICAL")
                            trigger_physical_breach()
                            send_mobile_alert(ev)

            annotated = zm.draw_zones(frame, camera_id=camera_id)
            annotated = tracker.draw_tracks(annotated, tracks, show_trail=True)

            cv2.rectangle(annotated, (0, 0), (w, 36), (20, 30, 40), -1)
            cv2.putText(annotated, f"CYBER CAMERA NODE: {camera_id} | TARGETS: {len(tracks)} | FPS: {fps:.1f}", (15, 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)

            if show:
                cv2.imshow("Scenario 1 - Border Geofencing & Tripwire Surveillance", annotated)
                key = cv2.waitKey(1) & 0xFF
                if key == 27 or key == ord("q"):
                    break

        if show and annotated is not None:
            print("\n[Scenario 1] Playback finished. Window held for review. Press 'q' or 'ESC' to exit.")
            while True:
                key = cv2.waitKey(50) & 0xFF
                if key == 27 or key == ord("q"):
                    break
    finally:
        cap.release()
        if show:
            cv2.destroyAllWindows()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="data/vtest_pedestrians.avi")
    parser.add_argument("--no-show", action="store_true")
    args = parser.parse_args()
    run_demo(source=args.source, show=not args.no_show)
