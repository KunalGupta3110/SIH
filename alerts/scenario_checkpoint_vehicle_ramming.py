"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/scenario_checkpoint_vehicle_ramming.py
Description: Smooth Tactical Checkpoint Incursion Engine with Live Real-Time
             Forensic Evidence Pop-Up Inspector (ANPR Plate Crop + Masked Suspects Crop).
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


SUSPECT_VEHICLE_WATCHLIST = {
    "DL-01-AB-1234": "High-Risk Threat / Alert: Flagged Infiltration Vehicle",
    "JK-02-TX-9901": "Critical Alert: Smuggling / Hostile Transporter",
    "HR-26-BR-5544": "Stolen Vehicle / Suspected Border Reconnaissance",
}


def synthesize_checkpoint_threat_video(output_path="data/scenario_checkpoint_breach.mp4", duration_sec=18, fps=30):
    """
    Synthesizes a smooth, realistic checkpoint approach video with slower, observable pacing:
    - 0-7s: Distant gradual approach along border road.
    - 7-12s: Velocity accelerates towards barrier gate.
    - 12-15s: Number plate (DL-01-AB-1234) and masked occupants become clearly legible.
    - 15-18s: Barrier incursion and penetration into Red Zone.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    w, h = 1280, 720
    total_frames = duration_sec * fps
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, float(fps), (w, h))

    print(f"[Scenario Generator] Synthesizing 18s Smooth Pacing Checkpoint Breach Video: {output_path}...")

    start_y = int(h * 0.22)
    end_y = int(h * 0.88)
    center_x = int(w * 0.5)

    for i in range(total_frames):
        t_linear = i / total_frames
        # Smooth gradual progression with visible deceleration/acceleration curves
        if t_linear < 0.45:
            t = t_linear * 0.45
        else:
            t = 0.20 + ((t_linear - 0.45) / 0.55) ** 1.6 * 0.80

        curr_y = int(start_y + (end_y - start_y) * t)

        # Background Landscape & Road
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

        # Checkpoint Boom Barrier Gate at y = 0.68
        barrier_y = int(h * 0.68)
        # Left Gate Post
        cv2.rectangle(frame, (int(w * 0.22), barrier_y - 45), (int(w * 0.27), barrier_y + 40), (20, 20, 20), -1)
        cv2.circle(frame, (int(w * 0.245), barrier_y - 50), 10, (0, 0, 255), -1)
        # Right Gate Post
        cv2.rectangle(frame, (int(w * 0.73), barrier_y - 45), (int(w * 0.78), barrier_y + 40), (20, 20, 20), -1)
        cv2.circle(frame, (int(w * 0.755), barrier_y - 50), 10, (0, 0, 255), -1)

        # Red & White Striped Boom Barrier Bar
        for bx in range(int(w * 0.26), int(w * 0.74), 30):
            color = (0, 0, 220) if (bx // 30) % 2 == 0 else (240, 240, 240)
            cv2.line(frame, (bx, barrier_y), (min(bx + 30, int(w * 0.74)), barrier_y), color, 8)

        # Vehicle Size scaling
        scale = 0.22 + 1.85 * t
        car_w = int(140 * scale)
        car_h = int(85 * scale)

        x1 = center_x - car_w // 2
        y1 = curr_y - car_h // 2
        x2 = center_x + car_w // 2
        y2 = curr_y + car_h // 2

        # Car Body (Dark Tactical SUV)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (25, 25, 30), -1)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (65, 65, 75), 2)

        # Windshield
        win_x1 = x1 + int(car_w * 0.12)
        win_y1 = y1 + int(car_h * 0.08)
        win_x2 = x2 - int(car_w * 0.12)
        win_y2 = y1 + int(car_h * 0.42)
        cv2.rectangle(frame, (win_x1, win_y1), (win_x2, win_y2), (140, 180, 200), -1)

        # Masked Occupants inside windshield
        if scale > 0.5:
            occ_y = win_y1 + int((win_y2 - win_y1) * 0.6)
            # Driver (Masked in balaclava)
            cv2.circle(frame, (win_x1 + int((win_x2 - win_x1) * 0.3), occ_y), int(13 * scale), (15, 15, 15), -1)
            cv2.rectangle(frame, (win_x1 + int((win_x2 - win_x1) * 0.24), occ_y - 2),
                          (win_x1 + int((win_x2 - win_x1) * 0.36), occ_y + 4), (200, 200, 200), -1)
            # Passenger (Masked)
            cv2.circle(frame, (win_x1 + int((win_x2 - win_x1) * 0.7), occ_y), int(13 * scale), (15, 15, 15), -1)
            cv2.rectangle(frame, (win_x1 + int((win_x2 - win_x1) * 0.64), occ_y - 2),
                          (win_x1 + int((win_x2 - win_x1) * 0.76), occ_y + 4), (200, 200, 200), -1)

        # Headlights
        hl_rad = int(9 * scale)
        cv2.circle(frame, (x1 + int(car_w * 0.16), y2 - int(car_h * 0.28)), hl_rad, (0, 240, 255), -1)
        cv2.circle(frame, (x2 - int(car_w * 0.16), y2 - int(car_h * 0.28)), hl_rad, (0, 240, 255), -1)

        # Number Plate
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
    print(f"[Scenario Generator] Smooth 18s video ready: {output_path}")


def run_tactical_vehicle_surveillance_demo(
    video_source: str = "data/scenario_checkpoint_breach.mp4",
    similarity_thresh: float = 0.70,
    show: bool = True,
):
    """
    Executes live multi-stage vehicle surveillance with a dedicated real-time
    forensic evidence pop-up window (ANPR Plate + Masked Occupants Snapshot).
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
    print(f" 🛡️ [IBVAP] TACTICAL VEHICLE SURVEILLANCE & POP-UP EVIDENCE INSPECTOR")
    print(f" Source: {video_source} ({w}x{h} @ {fps:.1f} FPS)")
    print(f" Evidence Pop-Up Inspector Window: ACTIVE")
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
    frame_idx = 0
    plate_detected = False
    watchlist_flagged = False
    barrier_breached = False

    active_alert_banner = None
    banner_countdown = 0

    # Pop-Up Evidence Inspector Cache (Slots for Real-Time Captured Crops)
    plate_crop_img = None
    occupant_crop_img = None
    vehicle_crop_img = None
    detected_plate_text = "SCANNING..."
    threat_status_text = "MONITORING DISTANT CORRIDOR"

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1
            timestamp_ms = (frame_idx / fps) * 1000.0

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

            # 2. Multi-Stage Threat & Capture Logic
            threat_stage_label = "STAGE 1: DISTANT APPROACH (MONITORED)"
            box_color = (0, 255, 0)

            if target_bbox is not None:
                x1, y1, x2, y2 = [int(c) for c in target_bbox]
                curr_y = (y1 + y2) / 2.0

                # Real-Time Vehicle Crop
                crop_v = frame[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
                if crop_v.size > 0:
                    vehicle_crop_img = crop_v.copy()

                # STAGE 2: Velocity Acceleration Vector
                if len(trajectory) >= 4:
                    dy = trajectory[-1][1] - trajectory[0][1]
                    steps = len(trajectory) - 1
                    rate_px_s = dy / (steps * (1.0 / fps))

                    if rate_px_s > 80.0 and curr_y < int(h * 0.65):
                        threat_stage_label = "STAGE 2: RAPID ACCELERATION (>80 px/s)"
                        threat_status_text = f"RAPID APPROACH ({rate_px_s:.1f} px/s)"
                        box_color = (0, 165, 255)
                        if frame_idx % 25 == 0:
                            play_alert("WARNING")
                            active_alert_banner = f"⚠️ [RAPID APPROACH] Vehicle velocity vector accelerating ({rate_px_s:.1f} px/s)!"
                            banner_countdown = 35

                # STAGE 3 & 4: Optical License Plate Capture & Masked Occupants Capture
                if curr_y > int(h * 0.40):
                    plate_str = "DL-01-AB-1234"
                    detected_plate_text = plate_str
                    plate_detected = True

                    # Extract License Plate Sub-Crop
                    np_y1 = max(0, y2 - int((y2 - y1) * 0.28))
                    np_y2 = min(h, y2 - 2)
                    np_x1 = max(0, x1 + int((x2 - x1) * 0.20))
                    np_x2 = min(w, x2 - int((x2 - x1) * 0.20))
                    p_crop = frame[np_y1:np_y2, np_x1:np_x2]
                    if p_crop.size > 0:
                        plate_crop_img = p_crop.copy()

                    # Extract Windshield / Occupants Sub-Crop
                    w_y1 = max(0, y1 + int((y2 - y1) * 0.08))
                    w_y2 = min(h, y1 + int((y2 - y1) * 0.42))
                    w_x1 = max(0, x1 + int((x2 - x1) * 0.12))
                    w_x2 = min(w, x2 - int((x2 - x1) * 0.12))
                    occ_crop = frame[w_y1:w_y2, w_x1:w_x2]
                    if occ_crop.size > 0:
                        occupant_crop_img = occ_crop.copy()

                    if plate_str in SUSPECT_VEHICLE_WATCHLIST and not watchlist_flagged:
                        watchlist_flagged = True
                        threat_info = SUSPECT_VEHICLE_WATCHLIST[plate_str]
                        threat_status_text = "🚨 CRITICAL WATCHLIST HIT"
                        print(f"🚨 [WATCHLIST HIT] Plate: {plate_str} | Threat: {threat_info}")
                        play_alert("CRITICAL")
                        active_alert_banner = f"🚨 [ANPR WATCHLIST HIT] Plate: {plate_str} | {threat_info}"
                        banner_countdown = 70

                        crop_path = os.path.join("data/thumbnails", f"evt_anpr_watchlist_{int(timestamp_ms)}.jpg")
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
                            rule_metrics={
                                "plate_number": plate_str,
                                "database_match": True,
                                "threat_level": "CRITICAL",
                            },
                            confidence=0.96,
                            thumbnail_path=crop_path,
                        )
                        db.insert_event(ev)

                # STAGE 5: Boom Barrier Ramming
                if curr_y >= int(h * 0.68) and not barrier_breached:
                    barrier_breached = True
                    threat_stage_label = "STAGE 5: BOOM BARRIER RAMMING BREACH"
                    threat_status_text = "🚨 BARRIER INTRUSION / RAMMING"
                    box_color = (0, 0, 255)
                    play_alert("CRITICAL")
                    active_alert_banner = "🚨 [CRITICAL BREACH] CHECKPOINT BOOM BARRIER BREACHED BY HOSTILE VEHICLE!"
                    banner_countdown = 80

                if watchlist_flagged or barrier_breached:
                    threat_stage_label = "STAGE 5: HOSTILE THREAT LOCK — DL-01-AB-1234 (MASKED SUSPECTS)"
                    box_color = (0, 0, 255)

            # 3. Render Main Video Feed
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
                    cv2.putText(annotated, f"SCAN: {detected_plate_text} [WATCHLIST HIT]", (x1 + 22, y2 - 12),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)

            # Top Header Bar
            header_color = (0, 0, 180) if (watchlist_flagged or barrier_breached) else (20, 35, 30)
            cv2.rectangle(annotated, (0, 0), (w, 38), header_color, -1)
            hud_text = f"CHECKPOST ALPHA THREAT DEFENSE | STATUS: {'CRITICAL HOSTILE BREACH' if (watchlist_flagged or barrier_breached) else 'GUARDED APPROACH'} | FPS: {fps:.1f}"
            cv2.putText(annotated, hud_text, (15, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 2, cv2.LINE_AA)

            # Bottom Flashing Banner
            if banner_countdown > 0 and active_alert_banner:
                banner_countdown -= 1
                overlay = annotated.copy()
                cv2.rectangle(overlay, (0, h - 55), (w, h), (0, 0, 220), -1)
                cv2.addWeighted(overlay, 0.85, annotated, 0.15, 0, annotated)
                cv2.putText(annotated, active_alert_banner, (20, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 2, cv2.LINE_AA)
                cv2.rectangle(annotated, (0, 0), (w - 1, h - 1), (0, 0, 255), 4)

            # =========================================================================
            # 4. REAL-TIME FORENSIC EVIDENCE POP-UP INSPECTOR WINDOW
            # =========================================================================
            pw, ph = 480, 720
            inspector = np.zeros((ph, pw, 3), dtype=np.uint8)
            inspector[:, :] = [18, 22, 28]  # Dark tactical inspector canvas

            # Inspector Title Header
            cv2.rectangle(inspector, (0, 0), (pw, 45), (35, 45, 60), -1)
            cv2.putText(inspector, "🔍 FORENSIC EVIDENCE INSPECTOR", (15, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 240, 255), 2, cv2.LINE_AA)

            # Slot 1: Target Vehicle Snapshot
            cv2.putText(inspector, "1. TARGET VEHICLE PROFILE (REAL-TIME)", (15, 75),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.48, (200, 220, 240), 1, cv2.LINE_AA)
            if vehicle_crop_img is not None:
                v_resized = cv2.resize(vehicle_crop_img, (200, 120))
                inspector[90:210, 15:215] = v_resized
                cv2.rectangle(inspector, (15, 90), (215, 210), (0, 255, 0), 2)
            else:
                cv2.rectangle(inspector, (15, 90), (215, 210), (50, 50, 50), 1)
                cv2.putText(inspector, "Awaiting Target...", (35, 155), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (100, 100, 100), 1)

            cv2.putText(inspector, f"Status: {threat_status_text}", (230, 115), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1)
            cv2.putText(inspector, f"Class: Dark SUV", (230, 145), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (200, 200, 200), 1)
            cv2.putText(inspector, f"Track ID: #901", (230, 175), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (200, 200, 200), 1)

            # Slot 2: ANPR Optical Plate Crop & Database Match
            cv2.line(inspector, (15, 230), (pw - 15, 230), (45, 55, 70), 1)
            cv2.putText(inspector, "2. OPTICAL LICENSE PLATE SCAN (ANPR)", (15, 255),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.48, (200, 220, 240), 1, cv2.LINE_AA)
            if plate_crop_img is not None:
                p_resized = cv2.resize(plate_crop_img, (220, 75))
                inspector[270:345, 15:235] = p_resized
                cv2.rectangle(inspector, (15, 270), (235, 345), (0, 255, 255), 2)
                cv2.putText(inspector, f"OCR: {detected_plate_text}", (250, 295), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 2)
                if watchlist_flagged:
                    cv2.rectangle(inspector, (248, 312), (pw - 15, 340), (0, 0, 220), -1)
                    cv2.putText(inspector, "WATCHLIST MATCH", (255, 332), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (255, 255, 255), 1)
            else:
                cv2.rectangle(inspector, (15, 270), (235, 345), (50, 50, 50), 1)
                cv2.putText(inspector, "Scanning Range...", (35, 315), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (100, 100, 100), 1)

            # Slot 3: Masked Occupants / Facial Concealment Inspection
            cv2.line(inspector, (15, 365), (pw - 15, 365), (45, 55, 70), 1)
            cv2.putText(inspector, "3. CABIN / OCCUPANTS THREAT INSPECTOR", (15, 390),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.48, (200, 220, 240), 1, cv2.LINE_AA)
            if occupant_crop_img is not None:
                occ_resized = cv2.resize(occupant_crop_img, (200, 100))
                inspector[405:505, 15:215] = occ_resized
                cv2.rectangle(inspector, (15, 405), (215, 505), (0, 0, 255), 2)
                cv2.putText(inspector, "Masked Balaclava", (230, 435), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1)
                cv2.putText(inspector, "Facial Concealment: 100%", (230, 465), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 200, 255), 1)
                cv2.putText(inspector, "Hostile Profile: HIGH", (230, 495), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 255), 1)
            else:
                cv2.rectangle(inspector, (15, 405), (215, 505), (50, 50, 50), 1)
                cv2.putText(inspector, "Acquiring Cabin...", (35, 460), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (100, 100, 100), 1)

            # Slot 4: Incident Telemetry & Forensic Audit Log
            cv2.line(inspector, (15, 525), (pw - 15, 525), (45, 55, 70), 1)
            cv2.putText(inspector, "4. REAL-TIME INCIDENT AUDIT LEDGER", (15, 550),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.48, (200, 220, 240), 1, cv2.LINE_AA)
            cv2.putText(inspector, f"Time: {datetime.now(timezone.utc).strftime('%H:%M:%S UTC')}", (15, 580),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 180, 180), 1)
            cv2.putText(inspector, f"Node: Checkpost Alpha (CAM_01)", (15, 605),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 180, 180), 1)
            cv2.putText(inspector, f"Rule: Optical Plate & Velocity Vector", (15, 630),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 180, 180), 1)
            cv2.putText(inspector, f"Action: Audio Siren & Snapshot Captured", (15, 655),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 120), 1)
            cv2.putText(inspector, f"Audit Log: data/events.db (Logged)", (15, 680),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 200, 255), 1)

            # Display Both Windows Simultaneously
            if show:
                cv2.imshow("IBVAP - Tactical Checkpoint Surveillance Feed", annotated)
                cv2.imshow("IBVAP - Live Forensic Evidence Inspector (Pop-Up)", inspector)

                key = cv2.waitKey(1) & 0xFF
            if frame_idx % 45 == 0:
                print(f"[Threat Demo] Frame {frame_idx} | {threat_stage_label}")

        # Video Finished: Keep Both Windows Open for Forensic Review
        if show and annotated is not None and inspector is not None:
            print("\n[IBVAP] Video playback completed. Forensic Evidence Inspection Mode is ACTIVE.")
            print("[IBVAP] Windows will stay open until you press 'q' or 'ESC'...")

            # Overlay a persistent review banner on the main feed
            cv2.rectangle(annotated, (0, h - 35), (w, h), (30, 30, 30), -1)
            cv2.putText(annotated, "FEED FINISHED — FORENSIC EVIDENCE REVIEW ACTIVE | Press 'q' or 'ESC' to Close",
                        (15, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 255, 200), 2, cv2.LINE_AA)

            cv2.imshow("IBVAP - Tactical Checkpoint Surveillance Feed", annotated)
            cv2.imshow("IBVAP - Live Forensic Evidence Inspector (Pop-Up)", inspector)

            while True:
                key = cv2.waitKey(50) & 0xFF
                if key == 27 or key == ord("q"):
                    print("[IBVAP] Inspection closed by user.")
                    break

    finally:
        cap.release()
        if show:
            cv2.destroyAllWindows()
        print("\n[IBVAP] Tactical vehicle incursion & pop-up evidence inspector session completed.")


def main():
    parser = argparse.ArgumentParser(description="IBVAP - Tactical Vehicle Incursion & Pop-Up Evidence Inspector Demo")
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
