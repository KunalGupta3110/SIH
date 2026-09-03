"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/run_surveillance.py
Description: Master Unified Real-Time Border CCTV Surveillance Engine.
             Simultaneously executes all border defense scenarios in real time:
             1. Multi-Object Tracking (Humans & Vehicles with persistent IDs)
             2. Restricted Red Polygon Geofencing (Point-in-polygon containment)
             3. Directional Virtual Tripwires (2D vector crossing)
             4. Loitering Detection (Temporal dwell-time thresholding)
             5. Rapid Vehicle Approach Flags (Relative displacement vector)
             6. Group Density Gathering (Euclidean spatial clustering)
             7. Auto-Cropped Snapshot Generation & SQLite Event Logging
             8. Explainable Tactical HUD & Multi-Frequency Audio Sirens
"""

import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import sys
import time
from typing import Optional, Union

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


def create_calibrated_zones(camera_id: str, frame_w: int, frame_h: int) -> ZoneManager:
    """Creates realistic default border surveillance zones scaled to frame dimensions."""
    zm = ZoneManager()

    # 1. Red Zone (Strictly Prohibited Border Perimeter)
    poly_pts = [
        (int(frame_w * 0.15), int(frame_h * 0.08)),
        (int(frame_w * 0.85), int(frame_h * 0.08)),
        (int(frame_w * 0.80), int(frame_h * 0.45)),
        (int(frame_w * 0.20), int(frame_h * 0.45)),
    ]
    restricted_zone = Zone(
        zone_id=f"{camera_id}_red_zone",
        name="Border Restricted Red Zone",
        zone_type=ZoneType.RESTRICTED_POLYGON,
        points=poly_pts,
        severity="CRITICAL",
        loitering_time_sec=2.5,
    )
    zm.add_zone(camera_id, restricted_zone)

    # 2. Virtual Tripwire across border threshold
    tw_p1 = (int(frame_w * 0.08), int(frame_h * 0.52))
    tw_p2 = (int(frame_w * 0.92), int(frame_h * 0.52))
    tripwire = Zone(
        zone_id=f"{camera_id}_tripwire",
        name="Border Outer Perimeter Tripwire",
        zone_type=ZoneType.TRIPWIRE,
        points=[tw_p1, tw_p2],
        severity="CRITICAL",
    )
    zm.add_zone(camera_id, tripwire)

    # 3. Caution Buffer Zone (Approach Corridor)
    caution_pts = [
        (int(frame_w * 0.05), int(frame_h * 0.55)),
        (int(frame_w * 0.95), int(frame_h * 0.55)),
        (int(frame_w * 0.90), int(frame_h * 0.92)),
        (int(frame_w * 0.10), int(frame_h * 0.92)),
    ]
    caution_zone = Zone(
        zone_id=f"{camera_id}_caution_buffer",
        name="Buffer Approach Zone",
        zone_type=ZoneType.CAUTION_ZONE,
        points=caution_pts,
        severity="WARNING",
        loitering_time_sec=4.0,
    )
    zm.add_zone(camera_id, caution_zone)

    return zm


def run_surveillance_pipeline(
    source: Union[str, int],
    camera_id: str = "cam_01",
    model_path: str = "yolov8n.pt",
    output_path: Optional[str] = None,
    zones_config: Optional[str] = "data/zones_config.json",
    db_path: str = "data/events.db",
    device: Optional[str] = None,
    show: bool = True,
):
    """
    Executes the Master Unified Border Surveillance Engine across all threat scenarios.
    """
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video source: {source}")

    fps_in = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"\n=======================================================")
    print(f" 🛡️ [IBVAP MASTER SURVEILLANCE ENGINE] ONLINE")
    print(f" Camera Node: {camera_id}")
    print(f" Video Source: {source} ({width}x{height} @ {fps_in:.1f} FPS)")
    print(f" All Scenarios Active: Geofence | Tripwire | Loiter | Rush | Mob")
    print(f"=======================================================\n")

    # Load custom zones if available, or generate calibrated zones
    if zones_config and os.path.exists(zones_config):
        zone_manager = ZoneManager(zones_config)
        # If camera has no zones in config, auto-generate for it
        if not zone_manager.get_zones(camera_id):
            temp_zm = create_calibrated_zones(camera_id=camera_id, frame_w=width, frame_h=height)
            for z in temp_zm.get_zones(camera_id):
                zone_manager.add_zone(camera_id, z)
    else:
        zone_manager = create_calibrated_zones(camera_id=camera_id, frame_w=width, frame_h=height)
        if zones_config:
            zone_manager.save_to_json(zones_config)

    # Initialize Tracker, DB, and Alert Engine
    tracker = BorderTracker(model_path=model_path, device=device)
    db = EventDatabase(db_path=db_path)
    alert_engine = AlertEngine(zone_manager=zone_manager, db=db, thumbnail_dir="data/thumbnails", alert_cooldown_sec=2.0)

    writer = None
    if output_path:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(output_path, fourcc, fps_in, (width, height))

    frame_idx = 0
    t_prev = time.time()
    total_events_triggered = 0

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1
            t_now = time.time()
            fps_current = 1.0 / max(1e-5, (t_now - t_prev))
            t_prev = t_now
            timestamp_ms = (frame_idx / fps_in) * 1000.0

            # 1. Multi-Object Detection & ByteTrack Tracking
            raw_frame = frame.copy()
            tracked_objects = tracker.track_frame(frame, frame_idx=frame_idx, timestamp_ms=timestamp_ms)

            # 2. Simultaneous Multi-Scenario Threat Evaluation
            events = alert_engine.evaluate_frame(
                camera_id=camera_id,
                frame_idx=frame_idx,
                timestamp_ms=timestamp_ms,
                tracks=tracked_objects,
                raw_frame=raw_frame,
            )

            if events:
                total_events_triggered += len(events)
                for ev in events:
                    print(f"🚨 [{ev.severity.value}] {ev.alert_type.value} on {camera_id}: {ev.details} (Rule: {ev.rule_name})")

            # 3. Multi-Layer Tactical Visualization
            # Layer A: Draw Spatial Zones & Tripwires
            annotated = zone_manager.draw_zones(frame, camera_id=camera_id)
            
            # Layer B: Draw Target Tracks, Trajectory Breadcrumbs, & IDs
            annotated = tracker.draw_tracks(annotated, tracked_objects, show_trail=True, show_fps=False)
            
            # Layer C: Draw Tactical HUD Bar & Alert Ticker
            annotated = alert_engine.draw_alerts_hud(annotated)

            # Layer D: Top Border Defense Status Header
            header_color = (0, 0, 180) if alert_engine.recent_alerts and alert_engine.recent_alerts[-1].severity == AlertSeverity.CRITICAL else (20, 30, 40)
            cv2.rectangle(annotated, (0, 0), (width, 36), header_color, -1)
            threat_status = "CRITICAL BREACH" if (alert_engine.recent_alerts and alert_engine.recent_alerts[-1].severity == AlertSeverity.CRITICAL) else "GUARDED / ACTIVE"
            header_text = f"IBVAP CCTV NODE: {camera_id.upper()} | FPS: {fps_current:.1f} | TARGETS: {len(tracked_objects)} | STATUS: {threat_status}"
            cv2.putText(annotated, header_text, (15, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)

            if writer:
                writer.write(annotated)

            if show:
                cv2.imshow(f"IBVAP Master Border Surveillance - [{camera_id}]", annotated)
                key = cv2.waitKey(1) & 0xFF
                if key == 27 or key == ord("q"):
                    print("[IBVAP] User closed surveillance preview.")
                    break

            if frame_idx % 60 == 0:
                print(f"[{camera_id}] Frame {frame_idx}/{total_frames} | Active: {len(tracked_objects)} | Total Events: {total_events_triggered}")

    finally:
        cap.release()
        if writer:
            writer.release()
            print(f"[IBVAP] Output video saved to: {output_path}")
        if show:
            cv2.destroyAllWindows()

        recent = db.get_recent_events(limit=5, camera_id=camera_id)
        print(f"\n[IBVAP] Surveillance node session complete. Total alerts logged: {total_events_triggered}")
        print(f"[IBVAP] Recent audit entries in SQLite: {len(recent)}")


def main():
    parser = argparse.ArgumentParser(description="IBVAP - Master Unified Border CCTV Surveillance Engine")
    parser.add_argument("--source", type=str, default="0", help="Video file path, RTSP stream URL, or webcam index (default: 0)")
    parser.add_argument("--camera-id", type=str, default="cam_01", help="Camera node identifier (default: cam_01)")
    parser.add_argument("--model", type=str, default="yolov8n.pt", help="Path to YOLOv8 weights (default: yolov8n.pt)")
    parser.add_argument("--output", type=str, default=None, help="Path to save annotated output video (.mp4)")
    parser.add_argument("--zones", type=str, default="data/zones_config.json", help="Path to zones configuration JSON")
    parser.add_argument("--db", type=str, default="data/events.db", help="Path to SQLite events database")
    parser.add_argument("--device", type=str, default=None, help="'cpu', 'cuda', etc.")
    parser.add_argument("--no-show", action="store_true", help="Disable live GUI window")
    args = parser.parse_args()

    source = int(args.source) if args.source.isdigit() else args.source

    run_surveillance_pipeline(
        source=source,
        camera_id=args.camera_id,
        model_path=args.model,
        output_path=args.output,
        zones_config=args.zones,
        db_path=args.db,
        device=args.device,
        show=not args.no_show,
    )


if __name__ == "__main__":
    main()
