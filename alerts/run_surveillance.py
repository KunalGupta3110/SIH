"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/run_surveillance.py
Description: End-to-end surveillance pipeline combining YOLOv8 + ByteTrack + AlertEngine.
             Detects humans & vehicles, tracks persistent IDs, checks restricted polygon zones
             and virtual tripwires, logs events to SQLite, saves thumbnails, and renders an HUD.
"""

import argparse
import os
from pathlib import Path
import sys
import time
from typing import Optional, Union

# Ensure project root is in sys.path when script is executed directly
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import cv2

from alerts.events import AlertEngine, EventDatabase
from alerts.zones import Zone, ZoneManager, ZoneType
from detection_tracking.track import BorderTracker


def create_default_zones(camera_id: str = "cam_01", frame_w: int = 1280, frame_h: int = 720) -> ZoneManager:
    """Creates realistic default border surveillance zones scaled to frame dimensions."""
    zm = ZoneManager()

    # 1. Virtual Tripwire across middle
    tw_p1 = (int(frame_w * 0.1), int(frame_h * 0.55))
    tw_p2 = (int(frame_w * 0.9), int(frame_h * 0.55))
    tripwire = Zone(
        zone_id="tw_fence_line",
        name="Border Outer Perimeter Fence Line",
        zone_type=ZoneType.TRIPWIRE,
        points=[tw_p1, tw_p2],
        severity="CRITICAL",
        allowed_direction=None,
    )
    zm.add_zone(camera_id, tripwire)

    # 2. Restricted Polygon Zone (top border area)
    poly_pts = [
        (int(frame_w * 0.2), int(frame_h * 0.1)),
        (int(frame_w * 0.8), int(frame_h * 0.1)),
        (int(frame_w * 0.75), int(frame_h * 0.45)),
        (int(frame_w * 0.25), int(frame_h * 0.45)),
    ]
    restricted_zone = Zone(
        zone_id="zone_no_go_red",
        name="Red Zone (Strictly Prohibited)",
        zone_type=ZoneType.RESTRICTED_POLYGON,
        points=poly_pts,
        severity="CRITICAL",
        loitering_time_sec=3.0,
    )
    zm.add_zone(camera_id, restricted_zone)

    # 3. Caution Zone (Buffer Zone)
    caution_pts = [
        (int(frame_w * 0.05), int(frame_h * 0.60)),
        (int(frame_w * 0.95), int(frame_h * 0.60)),
        (int(frame_w * 0.90), int(frame_h * 0.90)),
        (int(frame_w * 0.10), int(frame_h * 0.90)),
    ]
    caution_zone = Zone(
        zone_id="zone_buffer_caution",
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
    zones_config: Optional[str] = None,
    db_path: str = "data/events.db",
    device: Optional[str] = None,
    show: bool = False,
):
    """
    Executes the end-to-end intelligent border surveillance pipeline.
    """
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video source: {source}")

    fps_in = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"\n=======================================================")
    print(f" [IBVAP SURVEILLANCE NODE] Active for Camera: {camera_id}")
    print(f" Source: {source} | Res: {width}x{height} @ {fps_in:.1f} FPS")
    print(f"=======================================================\n")

    # Load or generate zones
    if zones_config and os.path.exists(zones_config):
        zone_manager = ZoneManager(zones_config)
    else:
        zone_manager = create_default_zones(camera_id=camera_id, frame_w=width, frame_h=height)
        if zones_config:
            zone_manager.save_to_json(zones_config)

    # Initialize Tracker & Alert Engine
    tracker = BorderTracker(model_path=model_path, device=device)
    db = EventDatabase(db_path=db_path)
    alert_engine = AlertEngine(zone_manager=zone_manager, db=db, thumbnail_dir="data/thumbnails")

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

            # 1. Multi-Object Tracking
            raw_frame = frame.copy()
            tracked_objects = tracker.track_frame(frame, frame_idx=frame_idx, timestamp_ms=timestamp_ms)

            # 2. Rule-Based Alert Evaluation
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
                    print(f"🚨 [{ev.severity.value}] {ev.alert_type.value} on {camera_id}: {ev.details}")

            # 3. Visualization Pipeline
            # Layer A: Draw Zones
            annotated = zone_manager.draw_zones(frame, camera_id=camera_id)
            # Layer B: Draw Tracks & Trajectories
            annotated = tracker.draw_tracks(annotated, tracked_objects, show_trail=True, show_fps=True, fps=fps_current)
            # Layer C: Draw Alerts HUD Bar
            annotated = alert_engine.draw_alerts_hud(annotated)

            if writer:
                writer.write(annotated)

            if show:
                cv2.imshow(f"IBVAP Intelligent Surveillance - {camera_id}", annotated)
                key = cv2.waitKey(1) & 0xFF
                if key == 27 or key == ord("q"):
                    print("[IBVAP] Interrupted by user.")
                    break

            if frame_idx % 30 == 0 or frame_idx == total_frames:
                print(f"[Surveillance {camera_id}] Frame {frame_idx}/{total_frames} | Active Tracks: {len(tracked_objects)} | Alerts Total: {total_events_triggered}")

    finally:
        cap.release()
        if writer:
            writer.release()
            print(f"[IBVAP] Output video saved to: {output_path}")
        if show:
            cv2.destroyAllWindows()

        recent = db.get_recent_events(limit=5, camera_id=camera_id)
        print(f"\n[IBVAP] Processing complete. Total events logged: {total_events_triggered}")
        print(f"[IBVAP] Recent database events: {len(recent)}")


def main():
    parser = argparse.ArgumentParser(description="IBVAP - Live Intelligent Border Surveillance Engine")
    parser.add_argument("--source", type=str, default="0", help="Video file path or webcam index (default: 0)")
    parser.add_argument("--camera-id", type=str, default="cam_01", help="Identifier for this camera feed (default: cam_01)")
    parser.add_argument("--model", type=str, default="yolov8n.pt", help="Path to YOLOv8 weights (default: yolov8n.pt)")
    parser.add_argument("--output", type=str, default=None, help="Path to save annotated output video (.mp4)")
    parser.add_argument("--zones", type=str, default="data/zones_config.json", help="Path to zones configuration JSON")
    parser.add_argument("--db", type=str, default="data/events.db", help="Path to SQLite events database")
    parser.add_argument("--device", type=str, default=None, help="'cpu', 'cuda', etc.")
    parser.add_argument("--show", action="store_true", help="Show real-time preview window")
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
        show=args.show,
    )


if __name__ == "__main__":
    main()
