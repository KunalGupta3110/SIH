"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/draw_zones_gui.py
Description: Interactive Mouse-Click Zone & Tripwire Calibration Tool.
             Allows team members to click on any camera video/image to visually
             draw restricted polygon zones and tripwires, and saves them to JSON.

Controls:
  - Left Click: Add polygon vertex / tripwire point
  - 't': Switch to Virtual Tripwire mode (2 points)
  - 'r': Switch to Restricted Red Polygon mode (3+ points)
  - 'c': Switch to Caution Yellow Polygon mode (3+ points)
  - 's': Save all drawn zones to data/zones_config.json
  - 'x': Clear current drawing points
  - 'q' or ESC: Exit calibration tool
"""

import argparse
import json
import os
from pathlib import Path
import sys
from typing import List, Tuple

# Ensure project root in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import cv2
import numpy as np

from alerts.zones import Zone, ZoneManager, ZoneType

current_points: List[Tuple[int, int]] = []
drawn_zones: List[dict] = []
current_mode = "RESTRICTED_POLYGON"  # or TRIPWIRE, CAUTION_ZONE
zone_counter = 1


def mouse_callback(event, x, y, flags, param):
    global current_points, drawn_zones, current_mode, zone_counter
    if event == cv2.EVENT_LBUTTONDOWN:
        current_points.append((x, y))
        print(f"[Zone Editor] Point added: ({x}, {y})")


def run_zone_calibration_gui(
    source: str = "data/sample_border.mp4",
    camera_id: str = "cam_01",
    output_config: str = "data/zones_config.json",
):
    global current_points, drawn_zones, current_mode, zone_counter

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video/image source: {source}")

    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        raise RuntimeError("Failed to read reference frame from source.")

    h, w = frame.shape[:2]
    window_name = f"IBVAP Zone Editor - {camera_id} (Click to Draw Points)"
    cv2.namedWindow(window_name)
    cv2.setMouseCallback(window_name, mouse_callback)

    print("\n=======================================================")
    print(f" [IBVAP ZONE CALIBRATION TOOL] Active for {camera_id}")
    print(" Left Click : Add point")
    print(" [ENTER]    : Complete and add current zone")
    print(" 't'        : Switch to TRIPWIRE mode (2 points)")
    print(" 'r'        : Switch to RESTRICTED RED POLYGON mode")
    print(" 'c'        : Switch to CAUTION YELLOW POLYGON mode")
    print(" 's'        : Save all zones to data/zones_config.json")
    print(" 'x'        : Reset current drawing points")
    print(" 'q' / ESC  : Exit")
    print("=======================================================\n")

    # Load existing zones if present
    if os.path.exists(output_config):
        try:
            with open(output_config, "r") as f:
                data = json.load(f)
                drawn_zones = data.get(camera_id, [])
        except Exception:
            drawn_zones = []

    while True:
        display = frame.copy()
        overlay = display.copy()

        # 1. Draw already completed zones
        for z in drawn_zones:
            pts = np.array(z["points"], dtype=np.int32).reshape((-1, 1, 2))
            ztype = z.get("zone_type")
            if ztype == "restricted_polygon":
                cv2.fillPoly(overlay, [pts], (0, 0, 200))
                cv2.polylines(display, [pts], True, (0, 0, 255), 2)
            elif ztype == "caution_zone":
                cv2.fillPoly(overlay, [pts], (0, 200, 255))
                cv2.polylines(display, [pts], True, (0, 220, 255), 2)
            elif ztype == "tripwire":
                p1, p2 = tuple(z["points"][0]), tuple(z["points"][1])
                cv2.line(display, p1, p2, (255, 255, 0), 2)
                cv2.circle(display, p1, 5, (0, 255, 255), -1)
                cv2.circle(display, p2, 5, (0, 255, 255), -1)

            p0 = tuple(z["points"][0])
            cv2.putText(display, z["name"], (p0[0], max(20, p0[1] - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        cv2.addWeighted(overlay, 0.3, display, 0.7, 0, display)

        # 2. Draw currently active points
        for i, pt in enumerate(current_points):
            cv2.circle(display, pt, 6, (0, 255, 0), -1)
            cv2.putText(display, str(i + 1), (pt[0] + 8, pt[1] - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        if len(current_points) > 1:
            if current_mode == "TRIPWIRE":
                cv2.line(display, current_points[0], current_points[1], (255, 255, 0), 2)
            else:
                pts = np.array(current_points, dtype=np.int32).reshape((-1, 1, 2))
                cv2.polylines(display, [pts], False, (0, 255, 0), 2)

        # 3. Top HUD Banner
        cv2.rectangle(display, (0, 0), (w, 35), (20, 20, 20), -1)
        hud_text = f"MODE: {current_mode} | Points: {len(current_points)} | Total Saved: {len(drawn_zones)} | [ENTER] Finish Zone, [S] Save, [Q] Quit"
        cv2.putText(display, hud_text, (15, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 200), 1, cv2.LINE_AA)

        cv2.imshow(window_name, display)
        key = cv2.waitKey(20) & 0xFF

        if key == ord('q') or key == 27:
            break
        elif key == ord('t'):
            current_mode = "TRIPWIRE"
            current_points.clear()
            print("[Zone Editor] Switched to TRIPWIRE mode (Pick 2 points).")
        elif key == ord('r'):
            current_mode = "RESTRICTED_POLYGON"
            current_points.clear()
            print("[Zone Editor] Switched to RESTRICTED RED POLYGON mode.")
        elif key == ord('c'):
            current_mode = "CAUTION_ZONE"
            current_points.clear()
            print("[Zone Editor] Switched to CAUTION YELLOW POLYGON mode.")
        elif key == ord('x'):
            current_points.clear()
            print("[Zone Editor] Cleared current points.")
        elif key == 13:  # ENTER key
            if current_mode == "TRIPWIRE" and len(current_points) >= 2:
                new_zone = {
                    "zone_id": f"tw_{camera_id}_{zone_counter}",
                    "name": f"Tripwire Perimeter {zone_counter}",
                    "zone_type": "tripwire",
                    "points": current_points[:2],
                    "severity": "CRITICAL",
                    "allowed_direction": None,
                }
                drawn_zones.append(new_zone)
                zone_counter += 1
                current_points.clear()
                print(f"[Zone Editor] Added Tripwire: {new_zone['name']}")
            elif current_mode in ("RESTRICTED_POLYGON", "CAUTION_ZONE") and len(current_points) >= 3:
                z_type_val = "restricted_polygon" if current_mode == "RESTRICTED_POLYGON" else "caution_zone"
                sev = "CRITICAL" if current_mode == "RESTRICTED_POLYGON" else "WARNING"
                new_zone = {
                    "zone_id": f"zone_{camera_id}_{zone_counter}",
                    "name": f"Zone {zone_counter} ({current_mode})",
                    "zone_type": z_type_val,
                    "points": list(current_points),
                    "severity": sev,
                    "loitering_time_sec": 4.0,
                }
                drawn_zones.append(new_zone)
                zone_counter += 1
                current_points.clear()
                print(f"[Zone Editor] Added Polygon Zone: {new_zone['name']}")
        elif key == ord('s'):
            # Save configuration
            os.makedirs(os.path.dirname(output_config) or ".", exist_ok=True)
            existing_data = {}
            if os.path.exists(output_config):
                try:
                    with open(output_config, "r") as f:
                        existing_data = json.load(f)
                except Exception:
                    existing_data = {}

            existing_data[camera_id] = drawn_zones
            with open(output_config, "w") as f:
                json.dump(existing_data, f, indent=2)
            print(f"💾 [Zone Editor] Successfully saved {len(drawn_zones)} zones for '{camera_id}' to: {output_config}")

    cv2.destroyAllWindows()


def main():
    parser = argparse.ArgumentParser(description="IBVAP - Interactive Visual Zone Editor")
    parser.add_argument("--source", type=str, default="data/sample_border.mp4", help="Video or image path to draw over")
    parser.add_argument("--camera-id", type=str, default="cam_01", help="Camera ID to calibrate (default: cam_01)")
    parser.add_argument("--config", type=str, default="data/zones_config.json", help="Path to output zones config JSON")
    args = parser.parse_args()

    run_zone_calibration_gui(source=args.source, camera_id=args.camera_id, output_config=args.config)


if __name__ == "__main__":
    main()
