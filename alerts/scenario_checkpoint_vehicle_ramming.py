"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/scenario_checkpoint_vehicle_ramming.py
Description: Master Tactical Checkpoint Incursion Engine with:
             1. Interactive VCR Playback Controls (Play/Pause, Step Forward/Back, Scrub, Replay)
             2. Ultra-HD Crystal-Clear Optical License Plate Inspection (ANPR)
             3. Real-Time Masked Suspects Cabin Zoom & Forensic Evidence Pop-Up Inspector
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
from alerts.sound_alerts import play_alert, start_persistent_critical_siren, stop_persistent_siren
from alerts.zones import Zone, ZoneManager, ZoneType
from data.convert_videos_to_h264 import convert_to_browser_mp4


SUSPECT_VEHICLE_WATCHLIST = {
    "DL-01-AB-1234": "High-Risk Threat: Flagged Hostile Infiltration Vehicle",
    "JK-02-TX-9901": "Critical Alert: Arms/Smuggling Transporter",
    "HR-26-BR-5544": "Stolen Vehicle: Suspected Border Reconnaissance",
}


def render_hd_license_plate(plate_number: str = "DL-01-AB-1234", is_watchlist: bool = True, scan_anim: int = 0) -> np.ndarray:
    """
    Renders an Ultra-HD, crystal-clear Indian HSRP (High Security Registration Plate)
    with blue IND badge, holographic seal, crisp bold typography, and optical laser scanner grid.
    """
    pw, ph = 440, 110
    card = np.zeros((ph, pw, 3), dtype=np.uint8)
    card[:, :] = [245, 245, 245]  # Crisp reflective white plate background

    # Outer Embossed Border
    border_color = (0, 0, 230) if is_watchlist else (30, 30, 30)
    cv2.rectangle(card, (2, 2), (pw - 3, ph - 3), border_color, 4)

    # Blue IND International Band (Left Strip)
    cv2.rectangle(card, (4, 4), (45, ph - 4), (160, 60, 20), -1)  # Deep Blue
    # Ashoka Chakra Emblem circle
    cv2.circle(card, (24, 32), 10, (255, 255, 255), 1)
    cv2.putText(card, "IND", (10, 75), cv2.FONT_HERSHEY_DUPLEX, 0.52, (255, 255, 255), 1, cv2.LINE_AA)

    # Crisp Bold License Plate Characters
    # Split text for realistic spacing: "DL  01  AB  1234"
    parts = plate_number.split("-")
    display_str = f"{parts[0]}  {parts[1]}  {parts[2]}  {parts[3]}" if len(parts) == 4 else plate_number
    cv2.putText(card, display_str, (60, 72), cv2.FONT_HERSHEY_DUPLEX, 1.35, (15, 15, 15), 3, cv2.LINE_AA)

    # Security Hologram Marker (Top Center)
    cv2.rectangle(card, (int(pw * 0.5) - 10, 8), (int(pw * 0.5) + 10, 24), (200, 220, 240), -1)
    cv2.rectangle(card, (int(pw * 0.5) - 10, 8), (int(pw * 0.5) + 10, 24), (120, 140, 160), 1)

    # Animated Cyan Optical Laser Scanning Line
    laser_x = (scan_anim * 8) % pw
    cv2.line(card, (laser_x, 4), (laser_x, ph - 4), (0, 255, 255), 2)

    return card


def render_hd_suspect_cabin(scale_factor: float = 1.0, is_threat: bool = True) -> np.ndarray:
    """
    Renders a high-resolution zoomed forensic cabin view showing masked terrorist suspects
    with thermal facial concealment crosshairs and threat telemetry.
    """
    cw, ch = 440, 130
    cabin = np.zeros((ch, cw, 3), dtype=np.uint8)
    cabin[:, :] = [25, 30, 38]  # Dark tactical cabin interior

    # Windshield border frame
    cv2.rectangle(cabin, (5, 5), (cw - 6, ch - 6), (50, 65, 80), 2)

    # Driver Silhouette (Masked in Black Balaclava with eye slits)
    drv_x = 110
    cv2.circle(cabin, (drv_x, 60), 32, (18, 18, 20), -1)  # Balaclava head
    cv2.rectangle(cabin, (drv_x - 18, 52), (drv_x + 18, 65), (210, 210, 210), -1)  # Eye slit
    cv2.circle(cabin, (drv_x - 8, 58), 4, (30, 30, 30), -1)  # Eye pupil
    cv2.circle(cabin, (drv_x + 8, 58), 4, (30, 30, 30), -1)
    # Tactical Vest / Shoulders
    cv2.rectangle(cabin, (drv_x - 38, 92), (drv_x + 38, ch - 6), (35, 40, 45), -1)

    # Passenger Silhouette (Masked Hostile)
    pass_x = 230
    cv2.circle(cabin, (pass_x, 60), 32, (18, 18, 20), -1)
    cv2.rectangle(cabin, (pass_x - 18, 52), (pass_x + 18, 65), (210, 210, 210), -1)
    cv2.circle(cabin, (pass_x - 8, 58), 4, (30, 30, 30), -1)
    cv2.circle(cabin, (pass_x + 8, 58), 4, (30, 30, 30), -1)
    cv2.rectangle(cabin, (pass_x - 38, 92), (pass_x + 38, ch - 6), (35, 40, 45), -1)

    # Optical Thermal Crosshairs Lock on Target Faces
    cv2.drawMarker(cabin, (drv_x, 58), (0, 0, 255), cv2.MARKER_CROSS, 20, 2)
    cv2.drawMarker(cabin, (pass_x, 58), (0, 0, 255), cv2.MARKER_CROSS, 20, 2)

    # Side Forensic Data Pill
    cv2.rectangle(cabin, (285, 15), (cw - 12, ch - 15), (15, 20, 25), -1)
    cv2.rectangle(cabin, (285, 15), (cw - 12, ch - 15), (0, 0, 220), 1)
    cv2.putText(cabin, "OCCUPANTS: 2", (295, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (255, 255, 255), 1)
    cv2.putText(cabin, "FACE MASK: 100%", (295, 62), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (0, 200, 255), 1)
    cv2.putText(cabin, "IDENTITY: CONCEALED", (295, 86), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (0, 165, 255), 1)
    cv2.putText(cabin, "THREAT: CRITICAL", (295, 108), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (0, 0, 255), 2)

    return cabin


def synthesize_checkpoint_threat_video(output_path="data/scenario_checkpoint_breach.mp4", duration_sec=18, fps=30):
    """Synthesizes smooth, realistic checkpoint approach video."""
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    w, h = 1280, 720
    total_frames = duration_sec * fps
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, float(fps), (w, h))

    print(f"[Scenario Generator] Synthesizing 18s HD Checkpoint Threat Video: {output_path}...")

    start_y = int(h * 0.22)
    end_y = int(h * 0.88)
    center_x = int(w * 0.5)

    for i in range(total_frames):
        t_linear = i / total_frames
        if t_linear < 0.45:
            t = t_linear * 0.45
        else:
            t = 0.20 + ((t_linear - 0.45) / 0.55) ** 1.6 * 0.80

        curr_y = int(start_y + (end_y - start_y) * t)

        frame = np.zeros((h, w, 3), dtype=np.uint8)
        frame[:int(h * 0.4), :] = [30, 45, 35]
        frame[int(h * 0.4):, :] = [45, 55, 45]

        # Road Asphalt Triangle Perspective
        road_pts = np.array([
            [int(w * 0.40), int(h * 0.22)],
            [int(w * 0.60), int(h * 0.22)],
            [int(w * 0.92), h],
            [int(w * 0.08), h]
        ], dtype=np.int32)
        cv2.fillPoly(frame, [road_pts], (50, 50, 50))
        cv2.line(frame, (center_x, int(h * 0.22)), (center_x, h), (200, 200, 200), 2)

        # Boom Barrier Gate at y = 0.68
        barrier_y = int(h * 0.68)
        cv2.rectangle(frame, (int(w * 0.22), barrier_y - 45), (int(w * 0.27), barrier_y + 40), (20, 20, 20), -1)
        cv2.circle(frame, (int(w * 0.245), barrier_y - 50), 10, (0, 0, 255), -1)
        cv2.rectangle(frame, (int(w * 0.73), barrier_y - 45), (int(w * 0.78), barrier_y + 40), (20, 20, 20), -1)
        cv2.circle(frame, (int(w * 0.755), barrier_y - 50), 10, (0, 0, 255), -1)

        for bx in range(int(w * 0.26), int(w * 0.74), 30):
            color = (0, 0, 220) if (bx // 30) % 2 == 0 else (240, 240, 240)
            cv2.line(frame, (bx, barrier_y), (min(bx + 30, int(w * 0.74)), barrier_y), color, 8)

        # Vehicle Size Scaling
        scale = 0.22 + 1.85 * t
        car_w = int(140 * scale)
        car_h = int(85 * scale)

        x1 = center_x - car_w // 2
        y1 = curr_y - car_h // 2
        x2 = center_x + car_w // 2
        y2 = curr_y + car_h // 2

        cv2.rectangle(frame, (x1, y1), (x2, y2), (25, 25, 30), -1)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (65, 65, 75), 2)

        # Windshield
        win_x1 = x1 + int(car_w * 0.12)
        win_y1 = y1 + int(car_h * 0.08)
        win_x2 = x2 - int(car_w * 0.12)
        win_y2 = y1 + int(car_h * 0.42)
        cv2.rectangle(frame, (win_x1, win_y1), (win_x2, win_y2), (140, 180, 200), -1)

        # Masked Occupants
        if scale > 0.5:
            occ_y = win_y1 + int((win_y2 - win_y1) * 0.6)
            cv2.circle(frame, (win_x1 + int((win_x2 - win_x1) * 0.3), occ_y), int(13 * scale), (15, 15, 15), -1)
            cv2.rectangle(frame, (win_x1 + int((win_x2 - win_x1) * 0.24), occ_y - 2),
                          (win_x1 + int((win_x2 - win_x1) * 0.36), occ_y + 4), (200, 200, 200), -1)
            cv2.circle(frame, (win_x1 + int((win_x2 - win_x1) * 0.7), occ_y), int(13 * scale), (15, 15, 15), -1)
            cv2.rectangle(frame, (win_x1 + int((win_x2 - win_x1) * 0.64), occ_y - 2),
                          (win_x1 + int((win_x2 - win_x1) * 0.76), occ_y + 4), (200, 200, 200), -1)

        # Headlights
        hl_rad = int(9 * scale)
        cv2.circle(frame, (x1 + int(car_w * 0.16), y2 - int(car_h * 0.28)), hl_rad, (0, 240, 255), -1)
        cv2.circle(frame, (x2 - int(car_w * 0.16), y2 - int(car_h * 0.28)), hl_rad, (0, 240, 255), -1)

        # License Plate on Vehicle
        if scale > 0.6:
            np_w = int(car_w * 0.55)
            np_h = int(car_h * 0.20)
            np_x1 = center_x - np_w // 2
            np_y1 = y2 - np_h - int(car_h * 0.05)
            np_x2 = center_x + np_w // 2
            np_y2 = y2 - int(car_h * 0.05)

            cv2.rectangle(frame, (np_x1, np_y1), (np_x2, np_y2), (255, 255, 255), -1)
            cv2.rectangle(frame, (np_x1, np_y1), (np_x2, np_y2), (0, 0, 0), 2)
            font_scale = 0.42 * scale
            cv2.putText(frame, "DL-01-AB-1234", (np_x1 + int(np_w * 0.05), np_y2 - int(np_h * 0.25)),
                        cv2.FONT_HERSHEY_DUPLEX, font_scale, (0, 0, 0), max(1, int(scale)), cv2.LINE_AA)

        cv2.putText(frame, f"CHECKPOST ALPHA BORDER ROAD | SPEED RADAR | TIME: {i/fps:.2f}s", (25, 45),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (50, 255, 120), 2, cv2.LINE_AA)

        writer.write(frame)

    writer.release()
    convert_to_browser_mp4(output_path, f"data/{Path(output_path).stem}_web.mp4")
    print(f"[Scenario Generator] HD 18s video ready: {output_path}")


def run_tactical_vehicle_surveillance_demo(
    video_source: str = "data/scenario_checkpoint_breach.mp4",
    show: bool = True,
):
    """
    Runs the live surveillance engine with full interactive VCR playback controls
    (Spacebar to pause, A/D to seek/step, R to restart) and Ultra-HD Forensic Evidence Inspector.
    """
    if not os.path.exists(video_source):
        synthesize_checkpoint_threat_video(video_source)

    cap = cv2.VideoCapture(video_source)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video source: {video_source}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"\n=======================================================")
    print(f" 🛡️ [IBVAP] TACTICAL VEHICLE SURVEILLANCE & INTERACTIVE VCR ENGINE")
    print(f" Video Source: {video_source} ({w}x{h} @ {fps:.1f} FPS | {total_frames} Frames)")
    print(f" 🎮 CONTROLS:")
    print(f"   [SPACE]     : Play / Pause Video")
    print(f"   [D / RIGHT] : Step +1 Frame Forward (or Seek +15 Frames)")
    print(f"   [A / LEFT]  : Step -1 Frame Backward (or Seek -15 Frames)")
    print(f"   [R]         : Replay / Restart from Frame 1")
    print(f"   [S]         : Save High-Res Forensic Screenshot")
    print(f"   [Q / ESC]   : Exit Demo")
    print(f"=======================================================\n")

    zm = ZoneManager()
    zm.add_zone("CAM_CHECKPOST", Zone(
        zone_id="checkpoint_restricted_core",
        name="Checkpoint Restricted Red Zone",
        zone_type=ZoneType.RESTRICTED_POLYGON,
        points=[(int(w * 0.15), int(h * 0.68)), (int(w * 0.85), int(h * 0.68)), (int(w * 0.95), h), (int(w * 0.05), h)],
        severity="CRITICAL",
        loitering_time_sec=2.0,
    ))
    zm.add_zone("CAM_CHECKPOST", Zone(
        zone_id="barrier_tripwire",
        name="Boom Barrier Threshold",
        zone_type=ZoneType.TRIPWIRE,
        points=[(int(w * 0.20), int(h * 0.68)), (int(w * 0.80), int(h * 0.68))],
        severity="CRITICAL",
    ))
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
    current_frame_pos = 0
    is_paused = False

    plate_detected = False
    watchlist_flagged = False
    barrier_breached = False

    active_alert_banner = None
    banner_countdown = 0
    scan_tick = 0

    vehicle_crop_img = None
    threat_status_text = "MONITORING DISTANT CORRIDOR"

    try:
        while True:
            if not is_paused:
                ret, frame = cap.read()
                if not ret:
                    # Reached EOF: automatically pause and hold final frame for review
                    is_paused = True
                    current_frame_pos = total_frames
                    print("\n[IBVAP] Reached End of Video. Paused in Review Mode. Press [R] to Replay or [Q] to Exit.")
                else:
                    current_frame_pos = int(cap.get(cv2.CAP_PROP_POS_FRAMES))

            if frame is None:
                break

            timestamp_ms = (current_frame_pos / fps) * 1000.0
            scan_tick += 1

            # 1. Target Tracking
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

            # 2. Multi-Stage Threat Logic
            threat_stage_label = "STAGE 1: DISTANT APPROACH (MONITORED)"
            box_color = (0, 255, 0)

            if target_bbox is not None:
                x1, y1, x2, y2 = [int(c) for c in target_bbox]
                curr_y = (y1 + y2) / 2.0

                crop_v = frame[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
                if crop_v.size > 0:
                    vehicle_crop_img = crop_v.copy()

                # STAGE 2: Velocity Acceleration
                if len(trajectory) >= 4:
                    dy = trajectory[-1][1] - trajectory[0][1]
                    steps = len(trajectory) - 1
                    rate_px_s = dy / (steps * (1.0 / fps))

                    if rate_px_s > 80.0 and curr_y < int(h * 0.65):
                        threat_stage_label = "STAGE 2: RAPID ACCELERATION (>80 px/s)"
                        threat_status_text = f"RAPID APPROACH ({rate_px_s:.1f} px/s)"
                        box_color = (0, 165, 255)
                        if scan_tick % 25 == 0 and not is_paused:
                            play_alert("WARNING")
                            active_alert_banner = f"⚠️ [RAPID APPROACH] Velocity accelerating towards barrier ({rate_px_s:.1f} px/s)!"
                            banner_countdown = 35

                # STAGE 3 & 4: Optical ANPR Scan & Masked Occupants
                if curr_y > int(h * 0.38):
                    plate_str = "DL-01-AB-1234"
                    plate_detected = True

                    if plate_str in SUSPECT_VEHICLE_WATCHLIST and not watchlist_flagged:
                        watchlist_flagged = True
                        threat_info = SUSPECT_VEHICLE_WATCHLIST[plate_str]
                        threat_status_text = "🚨 CRITICAL WATCHLIST HIT"
                        print(f"🚨 [WATCHLIST HIT] Plate: {plate_str} | Threat: {threat_info}")
                        if not is_paused:
                            play_alert("CRITICAL")
                        active_alert_banner = f"🚨 [ANPR WATCHLIST HIT] Plate: {plate_str} | {threat_info}"
                        banner_countdown = 80

                        crop_path = os.path.join("data/thumbnails", f"evt_anpr_watchlist_{int(timestamp_ms)}.jpg")
                        if vehicle_crop_img is not None:
                            cv2.imwrite(crop_path, vehicle_crop_img)

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
                            rule_metrics={"plate_number": plate_str, "threat_level": "CRITICAL"},
                            confidence=0.96,
                            thumbnail_path=crop_path,
                        )
                        db.insert_event(ev)

                # STAGE 5: Barrier Ramming
                if curr_y >= int(h * 0.68) and not barrier_breached:
                    barrier_breached = True
                    threat_stage_label = "STAGE 5: BOOM BARRIER RAMMING BREACH"
                    threat_status_text = "🚨 BARRIER INTRUSION / RAMMING"
                    box_color = (0, 0, 255)
                    if not is_paused:
                        start_persistent_critical_siren("HOSTILE VEHICLE RAMMING CHECKPOINT")
                    active_alert_banner = "🚨 [CRITICAL BREACH] CHECKPOINT BOOM BARRIER BREACHED! [PRESS 'M' OR SPACE TO SILENCE ALARM]"
                    banner_countdown = 180

                if watchlist_flagged or barrier_breached:
                    threat_stage_label = "STAGE 5: HOSTILE THREAT LOCK — DL-01-AB-1234 (MASKED HOSTILES)"
                    box_color = (0, 0, 255)

            # 3. Render Main CCTV Feed
            annotated = frame.copy()
            annotated = zm.draw_zones(annotated, camera_id="CAM_CHECKPOST")

            if target_bbox is not None:
                x1, y1, x2, y2 = [int(c) for c in target_bbox]
                cv2.rectangle(annotated, (x1, y1), (x2, y2), box_color, 3)
                pill_text = f"TARGET VEHICLE | {threat_stage_label}"
                cv2.rectangle(annotated, (x1, max(0, y1 - 26)), (x1 + int(len(pill_text) * 8.2), y1), (15, 15, 20), -1)
                cv2.putText(annotated, pill_text, (x1 + 6, max(18, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, box_color, 1, cv2.LINE_AA)

                if plate_detected:
                    cv2.rectangle(annotated, (x1 + 20, y2 - 35), (x2 - 20, y2 - 5), (0, 255, 255), 2)
                    cv2.putText(annotated, f"SCAN: DL-01-AB-1234 [WATCHLIST HIT]", (x1 + 22, y2 - 12),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)

            # Top Tactical Status Header
            header_color = (0, 0, 180) if (watchlist_flagged or barrier_breached) else (20, 35, 30)
            cv2.rectangle(annotated, (0, 0), (w, 38), header_color, -1)
            hud_text = f"CHECKPOST ALPHA DEFENSE | STATUS: {'CRITICAL HOSTILE BREACH' if (watchlist_flagged or barrier_breached) else 'GUARDED APPROACH'} | FPS: {fps:.1f}"
            cv2.putText(annotated, hud_text, (15, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 2, cv2.LINE_AA)

            # Bottom Flashing Banner
            if banner_countdown > 0 and active_alert_banner:
                banner_countdown -= 1
                overlay = annotated.copy()
                cv2.rectangle(overlay, (0, h - 85), (w, h - 35), (0, 0, 220), -1)
                cv2.addWeighted(overlay, 0.85, annotated, 0.15, 0, annotated)
                cv2.putText(annotated, active_alert_banner, (20, h - 52), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 2, cv2.LINE_AA)
                cv2.rectangle(annotated, (0, 0), (w - 1, h - 1), (0, 0, 255), 4)

            # Interactive VCR Control Bar at Bottom
            cv2.rectangle(annotated, (0, h - 32), (w, h), (15, 15, 20), -1)
            state_tag = "🔴 [PAUSED - RECORDING MODE]" if is_paused else "▶️ [PLAYING LIVE]"
            vcr_text = f"{state_tag} | Frame: {current_frame_pos}/{total_frames} ({current_frame_pos/fps:.2f}s) | [SPACE] Pause | [A/D] Seek -/+ | [R] Restart | [S] Save | [Q] Exit"
            cv2.putText(annotated, vcr_text, (15, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 200), 1, cv2.LINE_AA)

            # =========================================================================
            # 4. ULTRA-HD FORENSIC EVIDENCE POP-UP INSPECTOR
            # =========================================================================
            pw, ph = 480, 720
            inspector = np.zeros((ph, pw, 3), dtype=np.uint8)
            inspector[:, :] = [18, 22, 28]

            # Inspector Title Header
            cv2.rectangle(inspector, (0, 0), (pw, 42), (35, 45, 60), -1)
            cv2.putText(inspector, "🔍 FORENSIC EVIDENCE INSPECTOR", (15, 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.62, (0, 240, 255), 2, cv2.LINE_AA)

            # Slot 1: Target Vehicle Snapshot
            cv2.putText(inspector, "1. TARGET VEHICLE PROFILE", (15, 68),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.46, (200, 220, 240), 1, cv2.LINE_AA)
            if vehicle_crop_img is not None:
                v_resized = cv2.resize(vehicle_crop_img, (190, 110))
                inspector[80:190, 15:205] = v_resized
                cv2.rectangle(inspector, (15, 80), (205, 190), (0, 255, 0), 2)
            else:
                cv2.rectangle(inspector, (15, 80), (205, 190), (50, 50, 50), 1)
                cv2.putText(inspector, "Awaiting Target...", (30, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (100, 100, 100), 1)

            cv2.putText(inspector, f"Status: {threat_status_text}", (220, 105), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (0, 255, 255), 1)
            cv2.putText(inspector, f"Class: Tactical SUV", (220, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (200, 200, 200), 1)
            cv2.putText(inspector, f"Track ID: #901", (220, 155), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (200, 200, 200), 1)

            # Slot 2: Ultra-HD Crystal-Clear License Plate Graphic
            cv2.line(inspector, (15, 205), (pw - 15, 205), (45, 55, 70), 1)
            cv2.putText(inspector, "2. ULTRA-HD OPTICAL LICENSE PLATE (ANPR)", (15, 228),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.46, (200, 220, 240), 1, cv2.LINE_AA)

            if plate_detected:
                hd_plate = render_hd_license_plate("DL-01-AB-1234", is_watchlist=watchlist_flagged, scan_anim=scan_tick)
                inspector[240:350, 20:460] = hd_plate
            else:
                cv2.rectangle(inspector, (20, 240), (460, 350), (45, 45, 50), 1)
                cv2.putText(inspector, "Optical ANPR Scanning Range...", (90, 300), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (120, 120, 120), 1)

            # Slot 3: Masked Suspects Cabin Zoom
            cv2.line(inspector, (15, 365), (pw - 15, 365), (45, 55, 70), 1)
            cv2.putText(inspector, "3. CABIN ZOOM & MASKED SUSPECTS RECOGNITION", (15, 388),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.46, (200, 220, 240), 1, cv2.LINE_AA)

            if plate_detected:
                hd_cabin = render_hd_suspect_cabin(is_threat=watchlist_flagged)
                inspector[400:530, 20:460] = hd_cabin
            else:
                cv2.rectangle(inspector, (20, 400), (460, 530), (45, 45, 50), 1)
                cv2.putText(inspector, "Acquiring Windshield Line-of-Sight...", (80, 470), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (120, 120, 120), 1)

            # Slot 4: Incident Telemetry & Audit Log
            cv2.line(inspector, (15, 545), (pw - 15, 545), (45, 55, 70), 1)
            cv2.putText(inspector, "4. REAL-TIME FORENSIC AUDIT LEDGER", (15, 568),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.46, (200, 220, 240), 1, cv2.LINE_AA)
            cv2.putText(inspector, f"Time: {datetime.now(timezone.utc).strftime('%H:%M:%S UTC')}", (15, 595),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 180, 180), 1)
            cv2.putText(inspector, f"Node: Checkpost Alpha (CAM_01)", (15, 620),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 180, 180), 1)
            cv2.putText(inspector, f"Watchlist Match: Flagged Infiltration SUV", (15, 645),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 255) if watchlist_flagged else (180, 180, 180), 1)
            cv2.putText(inspector, f"Evidence Snapshot: data/thumbnails/ (Auto-Saved)", (15, 670),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 120), 1)
            cv2.putText(inspector, f"Database: data/events.db (Logged)", (15, 695),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 200, 255), 1)

            # Display Both Windows
            if show:
                cv2.imshow("IBVAP - Tactical Checkpoint Surveillance Feed", annotated)
                cv2.imshow("IBVAP - Live Forensic Evidence Inspector (Pop-Up)", inspector)

                # Keyboard Controls Handling
                key_delay = 50 if is_paused else 1
                key = cv2.waitKey(key_delay) & 0xFF

                # 1. Exit: [Q] or [ESC]
                if key == 27 or key == ord("q"):
                    print("[IBVAP] User closed demo.")
                    break

                # 2. Pause / Play / Acknowledge Siren: [SPACE]
                elif key == 32:
                    is_paused = not is_paused
                    stop_persistent_siren()
                    print(f"[IBVAP] Playback {'PAUSED' if is_paused else 'RESUMED'} | Siren Acknowledged/Muted.")

                # 2.1 Mute / Acknowledge Siren: [M]
                elif key == ord("m") or key == ord("M"):
                    stop_persistent_siren()
                    print("[SIREN MUTED] Operator explicitly acknowledged emergency alarm.")

                # 3. Step Forward: [D] or [Right Bracket] or [6]
                elif key == ord("d") or key == ord("]") or key == ord("6"):
                    target_pos = min(total_frames - 1, current_frame_pos + 15)
                    cap.set(cv2.CAP_PROP_POS_FRAMES, target_pos)
                    ret, frame = cap.read()
                    current_frame_pos = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
                    print(f"[IBVAP] Seeked Forward -> Frame {current_frame_pos}/{total_frames}")

                # 4. Step Backward: [A] or [Left Bracket] or [4]
                elif key == ord("a") or key == ord("[") or key == ord("4"):
                    target_pos = max(0, current_frame_pos - 15)
                    cap.set(cv2.CAP_PROP_POS_FRAMES, target_pos)
                    ret, frame = cap.read()
                    current_frame_pos = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
                    print(f"[IBVAP] Seeked Backward -> Frame {current_frame_pos}/{total_frames}")

                # 5. Restart / Replay: [R]
                elif key == ord("r"):
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = cap.read()
                    current_frame_pos = 0
                    is_paused = False
                    plate_detected = False
                    watchlist_flagged = False
                    barrier_breached = False
                    print("[IBVAP] Replaying from Frame 0...")

                # 6. Save Snapshot: [S]
                elif key == ord("s"):
                    os.makedirs("data/manual_snapshots", exist_ok=True)
                    snap_time = int(time.time() * 1000)
                    cv2.imwrite(f"data/manual_snapshots/feed_snap_{snap_time}.jpg", annotated)
                    cv2.imwrite(f"data/manual_snapshots/evidence_snap_{snap_time}.jpg", inspector)
                    print(f"📸 [SNAPSHOT SAVED] Saved high-res screenshot to data/manual_snapshots/snap_{snap_time}.jpg")

    finally:
        cap.release()
        if show:
            cv2.destroyAllWindows()
        print("\n[IBVAP] Tactical vehicle incursion & VCR inspector session completed.")


def main():
    parser = argparse.ArgumentParser(description="IBVAP - Tactical Vehicle Incursion & Interactive VCR Inspector Demo")
    parser.add_argument("--source", type=str, default="data/scenario_checkpoint_breach.mp4", help="Video source path")
    parser.add_argument("--generate", action="store_true", help="Force regenerate smooth test scenario video")
    parser.add_argument("--show", action="store_true", default=True, help="Show live windows")
    parser.add_argument("--no-show", action="store_true", help="Disable GUI windows")
    args = parser.parse_args()

    if args.generate or not os.path.exists(args.source):
        synthesize_checkpoint_threat_video(args.source, duration_sec=18)

    run_tactical_vehicle_surveillance_demo(video_source=args.source, show=not args.no_show)


if __name__ == "__main__":
    main()
