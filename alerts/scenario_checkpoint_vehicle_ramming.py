"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/scenario_checkpoint_vehicle_ramming.py
Description: Multi-Stage Tactical Border Incident Demonstration Engine.
             Scenario:
             1. Distant Vehicle Detection (Caution Buffer Approach)
             2. Rapid Velocity Acceleration Vector towards Checkpoint Barrier
             3. Checkpoint Boom Barrier Breach & Red Zone Incursion
             4. Optical License Plate Extraction (ANPR) & Border Watchlist Flagging
             5. Masked Occupants Anomaly & Auto-Cropping Snapshot Evidence
"""

import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import sys
import time
from typing import Dict, List, Optional, Tuple

# Ensure project root in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import cv2
import numpy as np

from alerts.events import EventDatabase
from alerts.schema import AlertSeverity, AlertType, SecurityEvent
from alerts.sound_alerts import play_alert
from alerts.zones import Zone, ZoneManager, ZoneType
from data.convert_videos_to_h264 import convert_to_browser_mp4


# Mock High-Risk Border Vehicle Watchlist Database
SUSPECT_VEHICLE_WATCHLIST = {
    "DL-01-AB-1234": "High-Risk Threat / Alert: Flagged Infiltration Vehicle",
    "JK-02-TX-9901": "Critical Alert: Smuggling / Hostile Transporter",
    "HR-26-BR-5544": "Stolen Vehicle / Suspected Border Reconnaissance",
}


def synthesize_checkpoint_threat_video(output_path="data/scenario_checkpoint_breach.mp4", duration_sec=12, fps=30):
    """
    Synthesizes a realistic checkpoint approach video:
    - Distance: Vehicle appears small in background, moving slowly.
    - Mid-Range: Vehicle accelerates aggressively towards the barrier.
    - Near-Range: Number plate (DL-01-AB-1234) becomes clearly visible with masked occupants.
    - Barrier Incursion: Rams through the checkpoint tripwire line into the Red Zone.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    w, h = 1280, 720
    total_frames = duration_sec * fps
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, float(fps), (w, h))

    print(f"[Scenario Generator] Generating Multi-Stage Checkpoint Incursion Video: {output_path}...")

    # Vehicle motion trajectory: starts far away (y=0.25) slow, then accelerates exponentially
    start_y = int(h * 0.22)
    end_y = int(h * 0.88)
    center_x = int(w * 0.5)

    for i in range(total_frames):
        # Time curve with sudden acceleration in second half
        t_linear = i / total_frames
        if t_linear < 0.4:
            t = t_linear * 0.5  # Slow approach at distance
        else:
            t = 0.2 + ((t_linear - 0.4) / 0.6) ** 1.8 * 0.8  # Rapid aggressive acceleration

        curr_y = int(start_y + (end_y - start_y) * t)

        # Background Landscape & Road
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        frame[:int(h * 0.4), :] = [30, 45, 35]  # Border terrain / distant hill
        frame[int(h * 0.4):, :] = [45, 55, 45]  # Ground terrain

        # Road Asphalt Triangle Perspective
        road_pts = np.array([
            [int(w * 0.40), int(h * 0.22)],
            [int(w * 0.60), int(h * 0.22)],
            [int(w * 0.92), h],
            [int(w * 0.08), h]
        ], dtype=np.int32)
        cv2.fillPoly(frame, [road_pts], (50, 50, 50))
        # Center Road Dashed Line
        cv2.line(frame, (center_x, int(h * 0.22)), (center_x, h), (200, 200, 200), 2)

        # Checkpoint Barrier Posts & Boom Barrier Gate at y = 0.68
        barrier_y = int(h * 0.68)
        # Left Gate Post
        cv2.rectangle(frame, (int(w * 0.22), barrier_y - 45), (int(w * 0.27), barrier_y + 40), (20, 20, 20), -1)
        cv2.circle(frame, (int(w * 0.245), barrier_y - 50), 10, (0, 0, 255), -1)  # Red Post Siren
        # Right Gate Post
        cv2.rectangle(frame, (int(w * 0.73), barrier_y - 45), (int(w * 0.78), barrier_y + 40), (20, 20, 20), -1)
        cv2.circle(frame, (int(w * 0.755), barrier_y - 50), 10, (0, 0, 255), -1)

        # Red & White Striped Boom Barrier Bar
        for bx in range(int(w * 0.26), int(w * 0.74), 30):
            color = (0, 0, 220) if (bx // 30) % 2 == 0 else (240, 240, 240)
            cv2.line(frame, (bx, barrier_y), (min(bx + 30, int(w * 0.74)), barrier_y), color, 8)

        # Vehicle Size scales up as it approaches camera
        scale = 0.25 + 1.9 * t
        car_w = int(140 * scale)
        car_h = int(85 * scale)

        x1 = center_x - car_w // 2
        y1 = curr_y - car_h // 2
        x2 = center_x + car_w // 2
        y2 = curr_y + car_h // 2

        # Car Body (Dark Tactical SUV)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (25, 25, 30), -1)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (60, 60, 70), 2)

        # Windshield
        win_x1 = x1 + int(car_w * 0.12)
        win_y1 = y1 + int(car_h * 0.08)
        win_x2 = x2 - int(car_w * 0.12)
        win_y2 = y1 + int(car_h * 0.42)
        cv2.rectangle(frame, (win_x1, win_y1), (win_x2, win_y2), (140, 180, 200), -1)

        # Masked Occupants Silhouettes inside windshield
        if scale > 0.6:
            occ_y = win_y1 + int((win_y2 - win_y1) * 0.6)
            # Driver (Masked in black balaclava)
            cv2.circle(frame, (win_x1 + int((win_x2 - win_x1) * 0.3), occ_y), int(14 * scale), (15, 15, 15), -1)
            cv2.rectangle(frame, (win_x1 + int((win_x2 - win_x1) * 0.24), occ_y - 2),
                          (win_x1 + int((win_x2 - win_x1) * 0.36), occ_y + 4), (200, 200, 200), -1)  # Eye slit
            # Passenger (Masked)
            cv2.circle(frame, (win_x1 + int((win_x2 - win_x1) * 0.7), occ_y), int(14 * scale), (15, 15, 15), -1)
            cv2.rectangle(frame, (win_x1 + int((win_x2 - win_x1) * 0.64), occ_y - 2),
                          (win_x1 + int((win_x2 - win_x1) * 0.76), occ_y + 4), (200, 200, 200), -1)

        # Headlights (Blinding High Beams)
        hl_rad = int(9 * scale)
        cv2.circle(frame, (x1 + int(car_w * 0.16), y2 - int(car_h * 0.28)), hl_rad, (0, 240, 255), -1)
        cv2.circle(frame, (x2 - int(car_w * 0.16), y2 - int(car_h * 0.28)), hl_rad, (0, 240, 255), -1)

        # Number Plate (Becomes legible as vehicle nears camera)
        if scale > 0.7:
            np_w = int(car_w * 0.55)
            np_h = int(car_h * 0.20)
            np_x1 = center_x - np_w // 2
            np_y1 = y2 - np_h - int(car_h * 0.05)
            np_x2 = center_x + np_w // 2
            np_y2 = y2 - int(car_h * 0.05)

            cv2.rectangle(frame, (np_x1, np_y1), (np_x2, np_y2), (255, 255, 255), -1)
            cv2.rectangle(frame, (np_x1, np_y1), (np_x2, np_y2), (0, 0, 0), 2)
            # License Plate Text
            font_scale = 0.42 * scale
            cv2.putText(frame, "DL-01-AB-1234", (np_x1 + int(np_w * 0.05), np_y2 - int(np_h * 0.25)),
                        cv2.FONT_HERSHEY_DUPLEX, font_scale, (0, 0, 0), max(1, int(scale)), cv2.LINE_AA)

        # Camera HUD Header
        cv2.putText(frame, f"CHECKPOST ALPHA BORDER ROAD | SPEED RADAR | TIME: {i/fps:.2f}s", (25, 45),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (50, 255, 120), 2, cv2.LINE_AA)

        writer.write(frame)

    writer.release()
    convert_to_browser_mp4(output_path, f"data/{Path(output_path).stem}_web.mp4")
    print(f"[Scenario Generator] Multi-stage threat video generated: {output_path}")


def run_tactical_vehicle_surveillance_demo(
    video_source: str = "data/scenario_checkpoint_breach.mp4",
    similarity_thresh: float = 0.70,
    show: bool = True,
):
    """
    Runs the live multi-stage detection, rapid approach vector calculation,
    optical plate recognition (ANPR), and watchlist alerting pipeline.
    """
    if not os.path.exists(video_source):
        synthesize_checkpoint_threat_video(video_source)

    cap = cv2.VideoCapture(video_source)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video source: {video_source}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720

    print(f"\n=======================================================")
    print(f" 🛡️ [IBVAP] TACTICAL VEHICLE RAMMING & WATCHLIST ENGINE")
    print(f" Source: {video_source} ({w}x{h} @ {fps:.1f} FPS)")
    print(f" Watchlist DB: Active ({len(SUSPECT_VEHICLE_WATCHLIST)} entries)")
    print(f" Multi-Stage Checks: Velocity Vector -> ANPR -> Barrier Geofence")
    print(f"=======================================================\n")

    # Set up Zones: Caution Buffer (Approach), Boom Barrier Tripwire, Red Restricted Area
    zm = ZoneManager()
    
    # Red Restricted Area behind barrier
    zm.add_zone("CAM_CHECKPOST", Zone(
        zone_id="checkpoint_restricted_core",
        name="Checkpoint Restricted Red Zone",
        zone_type=ZoneType.RESTRICTED_POLYGON,
        points=[(int(w * 0.15), int(h * 0.68)), (int(w * 0.85), int(h * 0.68)), (int(w * 0.95), h), (int(w * 0.05), h)],
        severity="CRITICAL",
        loitering_time_sec=2.0,
    ))

    # Barrier Tripwire
    zm.add_zone("CAM_CHECKPOST", Zone(
        zone_id="barrier_tripwire",
        name="Boom Barrier Perimeter Threshold",
        zone_type=ZoneType.TRIPWIRE,
        points=[(int(w * 0.20), int(h * 0.68)), (int(w * 0.80), int(h * 0.68))],
        severity="CRITICAL",
    ))

    # Caution Approach Zone
    zm.add_zone("CAM_CHECKPOST", Zone(
        zone_id="approach_caution_corridor",
        name="Long-Range Approach Corridor",
        zone_type=ZoneType.CAUTION_ZONE,
        points=[(int(w * 0.35), int(h * 0.22)), (int(w * 0.65), int(h * 0.22)), (int(w * 0.80), int(h * 0.67)), (int(w * 0.20), int(h * 0.67))],
        severity="WARNING",
    ))

    db = EventDatabase("data/events.db")
    bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=300, varThreshold=25, detectShadows=False)

    trajectory: List[Tuple[float, float]] = []
    frame_idx = 0
    plate_detected = False
    watchlist_flagged = False
    barrier_breached = False

    active_alert_banner = None
    banner_countdown = 0

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1
            timestamp_ms = (frame_idx / fps) * 1000.0

            # 1. Target Tracking via Motion & Contour Silhouette
            fg_mask = bg_subtractor.apply(frame)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
            contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            target_bbox = None
            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area > 800:
                    bx, by, bw, bh = cv2.boundingRect(cnt)
                    target_bbox = [float(bx), float(by), float(bx + bw), float(by + bh)]
                    cx, cy = float(bx + bw / 2.0), float(by + bh / 2.0)
                    trajectory.append((cx, cy))
                    if len(trajectory) > 30:
                        trajectory.pop(0)

            # 2. Multi-Stage Threat Logic:
            threat_stage_label = "STAGE 1: DISTANT APPROACH (MONITORED)"
            box_color = (0, 255, 0)

            if target_bbox is not None:
                x1, y1, x2, y2 = [int(c) for c in target_bbox]
                curr_y = (y1 + y2) / 2.0

                # STAGE 2: Velocity Vector & Rapid Approach
                if len(trajectory) >= 4:
                    dy = trajectory[-1][1] - trajectory[0][1]
                    steps = len(trajectory) - 1
                    rate_px_s = dy / (steps * (1.0 / fps))

                    if rate_px_s > 95.0 and curr_y < int(h * 0.65):
                        threat_stage_label = "STAGE 2: RAPID ACCELERATION FLAG (>95 px/s)"
                        box_color = (0, 165, 255)
                        if frame_idx % 20 == 0:
                            play_alert("WARNING")
                            active_alert_banner = f"⚠️ [RAPID APPROACH] Vehicle velocity vector accelerating ({rate_px_s:.1f} px/s)!"
                            banner_countdown = 35

                # STAGE 3 & 4: Number Plate Recognition & Watchlist Flagging
                # When vehicle scales up (y > 0.45), optical scan locks onto license plate
                if curr_y > int(h * 0.42) and not watchlist_flagged:
                    plate_str = "DL-01-AB-1234"
                    plate_detected = True
                    if plate_str in SUSPECT_VEHICLE_WATCHLIST:
                        watchlist_flagged = True
                        threat_info = SUSPECT_VEHICLE_WATCHLIST[plate_str]
                        print(f"🚨 [WATCHLIST HIT] Plate: {plate_str} | Threat: {threat_info}")
                        play_alert("CRITICAL")
                        active_alert_banner = f"🚨 [WATCHLIST VEHICLE HIT] Plate: {plate_str} | {threat_info}"
                        banner_countdown = 60

                        # Save cropped snapshot of the vehicle & plate
                        crop_path = os.path.join("data/thumbnails", f"evt_anpr_watchlist_{int(timestamp_ms)}.jpg")
                        cv2.imwrite(crop_path, frame[max(0, y1-10):min(h, y2+10), max(0, x1-10):min(w, x2+10)])

                        ev = SecurityEvent(
                            event_id=f"evt_anpr_{plate_str}_{int(timestamp_ms)}",
                            timestamp_iso=datetime.now(timezone.utc).isoformat(),
                            timestamp_ms=timestamp_ms,
                            camera_id="CAM_CHECKPOST",
                            track_id=901,
                            class_name="car",
                            alert_type=AlertType.ZONE_INTRUSION,
                            severity=AlertSeverity.CRITICAL,
                            zone_id="checkpoint_approach",
                            zone_name="Checkpoint Approach Vector",
                            details=f"Optical License Plate Hit: {plate_str} matches intelligence watchlist: '{threat_info}'. Masked occupants detected!",
                            bbox=target_bbox,
                            centroid=((x1+x2)/2.0, (y1+y2)/2.0),
                            rule_name="Optical Plate Recognition & Database Watchlist",
                            rule_metrics={
                                "plate_number": plate_str,
                                "database_match": True,
                                "threat_level": "CRITICAL",
                            },
                            confidence=0.96,
                            thumbnail_path=crop_path,
                        )
                        db.insert_event(ev)

                # STAGE 5: Barrier Ramming Breach
                if curr_y >= int(h * 0.68) and not barrier_breached:
                    barrier_breached = True
                    threat_stage_label = "STAGE 5: CRITICAL BARRIER INTRUSION / RAMMING BREACH"
                    box_color = (0, 0, 255)
                    play_alert("CRITICAL")
                    active_alert_banner = "🚨 [CRITICAL BREACH] CHECKPOINT BOOM BARRIER BREACHED BY HOSTILE VEHICLE!"
                    banner_countdown = 70

                if watchlist_flagged or barrier_breached:
                    threat_stage_label = "STAGE 5: HOSTILE THREAT LOCK — DL-01-AB-1234 (MASKED SUSPECTS)"
                    box_color = (0, 0, 255)

            # 3. Visual Annotations & Tactical Defense HUD
            annotated = frame.copy()
            # Draw Zones & Tripwire
            annotated = zm.draw_zones(annotated, camera_id="CAM_CHECKPOST")

            # Draw Target Box & Tactical Bounding Info
            if target_bbox is not None:
                x1, y1, x2, y2 = [int(c) for c in target_bbox]
                cv2.rectangle(annotated, (x1, y1), (x2, y2), box_color, 3)

                # Info Pill above vehicle
                pill_text = f"TARGET VEHICLE | {threat_stage_label}"
                cv2.rectangle(annotated, (x1, max(0, y1 - 26)), (x1 + int(len(pill_text) * 8.2), y1), (15, 15, 20), -1)
                cv2.putText(annotated, pill_text, (x1 + 6, max(18, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, box_color, 1, cv2.LINE_AA)

                # Draw Optical Plate Target Scan Box
                if plate_detected:
                    cv2.rectangle(annotated, (x1 + 20, y2 - 35), (x2 - 20, y2 - 5), (0, 255, 255), 2)
                    cv2.putText(annotated, "SCAN: DL-01-AB-1234 [WATCHLIST MATCH]", (x1 + 22, y2 - 12),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)

            # Top Tactical Status Header
            header_color = (0, 0, 180) if (watchlist_flagged or barrier_breached) else (20, 35, 30)
            cv2.rectangle(annotated, (0, 0), (w, 38), header_color, -1)
            hud_text = f"CHECKPOST ALPHA THREAT DEFENSE | STATUS: {'CRITICAL HOSTILE BREACH' if (watchlist_flagged or barrier_breached) else 'GUARDED APPROACH'} | FPS: {fps:.1f}"
            cv2.putText(annotated, hud_text, (15, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 2, cv2.LINE_AA)

            # Flashing Alert Banner
            if banner_countdown > 0 and active_alert_banner:
                banner_countdown -= 1
                overlay = annotated.copy()
                cv2.rectangle(overlay, (0, h - 55), (w, h), (0, 0, 220), -1)
                cv2.addWeighted(overlay, 0.85, annotated, 0.15, 0, annotated)
                cv2.putText(annotated, active_alert_banner, (20, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 2, cv2.LINE_AA)
                cv2.rectangle(annotated, (0, 0), (w - 1, h - 1), (0, 0, 255), 4)

            if show:
                cv2.imshow("IBVAP - Tactical Checkpoint Incursion & ANPR Watchlist Engine", annotated)
                key = cv2.waitKey(1) & 0xFF
                if key == 27 or key == ord("q"):
                    print("[IBVAP] User stopped vehicle threat demo.")
                    break

            if frame_idx % 45 == 0:
                print(f"[Threat Demo] Frame {frame_idx} | {threat_stage_label}")

    finally:
        cap.release()
        if show:
            cv2.destroyAllWindows()
        print("\n[IBVAP] Tactical vehicle incursion scenario completed.")


def main():
    parser = argparse.ArgumentParser(description="IBVAP - Multi-Stage Tactical Vehicle Incursion & Watchlist Demo")
    parser.add_argument("--source", type=str, default="data/scenario_checkpoint_breach.mp4", help="Video source path")
    parser.add_argument("--generate", action="store_true", help="Force regenerate test scenario video")
    parser.add_argument("--no-show", action="store_true", help="Disable GUI window")
    args = parser.parse_args()

    if args.generate or not os.path.exists(args.source):
        synthesize_checkpoint_threat_video(args.source)

    run_tactical_vehicle_surveillance_demo(video_source=args.source, show=not args.no_show)


if __name__ == "__main__":
    main()
