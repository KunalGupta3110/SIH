"""
IBVAP - Tactical Border Threat Video Generator
Synthesizes 3 high-realism security incident video scenarios:
1. scenario_night_crawl.mp4  -> Night-vision infrared crawl incursion (Crawling posture + Tripwire cut)
2. scenario_vehicle_rush.mp4 -> High-speed vehicle rushing/ramming toward border checkpost barrier
3. scenario_group_breach.mp4 -> Coordinated multi-target group assembling & storming border zone
"""

import os
from pathlib import Path
import sys
import cv2
import numpy as np

# Ensure project root in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

try:
    from data.convert_videos_to_h264 import convert_to_browser_mp4
except Exception:
    convert_to_browser_mp4 = lambda x: None


def generate_night_crawl_threat(output_path="data/threat_night_crawl.mp4", duration_sec=10, fps=30):
    """
    Scenario 1: Night-Vision Infrared Stealth Crawl
    A suspect in low prone/crawling posture creeps across the ground at night,
    cutting under the border perimeter fence line into the red restricted zone.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    w, h = 1280, 720
    total_frames = duration_sec * fps
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, float(fps), (w, h))

    print(f"[Threat Generator] Generating Scenario 1: Night-Vision Stealth Crawl ({output_path})...")

    start_x, start_y = 150, 520
    end_x, end_y = 950, 240

    for i in range(total_frames):
        t = i / total_frames
        # Night-vision green-tinted infrared surveillance background
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        frame[:int(h * 0.45), :] = [15, 35, 20]  # Dark night terrain / sky
        frame[int(h * 0.45):, :] = [25, 55, 30]  # Border grass / soil

        # Barbed wire fence posts
        for post_x in range(100, w, 160):
            cv2.line(frame, (post_x, int(h * 0.35)), (post_x, int(h * 0.65)), (50, 90, 60), 3)
        # 3 horizontal barbed wire strands
        for strand_y in [int(h * 0.40), int(h * 0.50), int(h * 0.60)]:
            cv2.line(frame, (0, strand_y), (w, strand_y), (40, 80, 50), 2)

        # Infiltrator position (moves horizontally along the ground in prone crawl)
        curr_x = int(start_x + (end_x - start_x) * t)
        curr_y = int(start_y + (end_y - start_y) * t)

        # Prone / Crawling Humanoid Silhouette (Wide horizontal aspect ratio: width=75, height=28)
        crawl_w = 75
        crawl_h = 28
        # Head (low to ground)
        cv2.ellipse(frame, (curr_x + 32, curr_y - 2), (12, 8), 0, 0, 360, (140, 220, 160), -1)
        # Torso (flat horizontal)
        cv2.rectangle(frame, (curr_x - 30, curr_y - 12), (curr_x + 22, curr_y + 10), (120, 200, 140), -1)
        # Arms & Legs crawling forward
        leg_crawl = int(np.sin(i * 0.4) * 10)
        cv2.line(frame, (curr_x - 30, curr_y), (curr_x - 50 + leg_crawl, curr_y + 8), (90, 170, 110), 6)
        cv2.line(frame, (curr_x + 10, curr_y + 4), (curr_x + 28 - leg_crawl, curr_y + 12), (90, 170, 110), 5)

        # Thermal noise / grain simulation
        noise = np.random.randint(-10, 10, (h, w, 3), dtype=np.int16)
        frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)

        # Thermal camera HUD
        cv2.putText(frame, f"IR-THERMAL BOP-BRAVO | FPS: 30.0 | TIME: {i/fps:.2f}s", (25, 45),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (50, 255, 120), 2, cv2.LINE_AA)

        writer.write(frame)

    writer.release()
    convert_to_browser_mp4(output_path, f"data/{Path(output_path).stem}_web.mp4")
    print(f"[Threat Generator] Scenario 1 ready: {output_path}")


def generate_vehicle_rush_threat(output_path="data/threat_vehicle_rush.mp4", duration_sec=8, fps=30):
    """
    Scenario 2: High-Speed Vehicle Rush / Barrier Ramming
    A vehicle speeds aggressively toward a security checkpoint barrier.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    w, h = 1280, 720
    total_frames = duration_sec * fps
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, float(fps), (w, h))

    print(f"[Threat Generator] Generating Scenario 2: High-Speed Vehicle Rush ({output_path})...")

    # Road perspective
    start_x, start_y = int(w * 0.5), int(h * 0.2)
    end_x, end_y = int(w * 0.5), int(h * 0.85)

    for i in range(total_frames):
        t = (i / total_frames) ** 1.6  # Accelerating exponential velocity

        frame = np.zeros((h, w, 3), dtype=np.uint8)
        # Background environment
        frame[:, :] = [35, 45, 40]
        # Road asphalt triangle perspective
        road_pts = np.array([
            [int(w * 0.38), int(h * 0.2)],
            [int(w * 0.62), int(h * 0.2)],
            [int(w * 0.9), h],
            [int(w * 0.1), h]
        ], dtype=np.int32)
        cv2.fillPoly(frame, [road_pts], (60, 60, 60))
        # Center line
        cv2.line(frame, (int(w * 0.5), int(h * 0.2)), (int(w * 0.5), h), (200, 200, 200), 3)

        # Checkpoint boom barrier (red & white stripes)
        cv2.line(frame, (int(w * 0.25), int(h * 0.7)), (int(w * 0.75), int(h * 0.7)), (0, 0, 240), 8)

        # Vehicle size scales as it approaches camera at high speed
        curr_y = int(start_y + (end_y - start_y) * t)
        curr_x = int(w * 0.5)
        scale = 0.3 + 1.8 * t
        car_w = int(120 * scale)
        car_h = int(70 * scale)

        # Car body
        x1, y1 = curr_x - car_w // 2, curr_y - car_h // 2
        x2, y2 = curr_x + car_w // 2, curr_y + car_h // 2

        cv2.rectangle(frame, (x1, y1), (x2, y2), (20, 20, 180), -1)
        # Windshield
        cv2.rectangle(frame, (x1 + int(car_w * 0.15), y1 + int(car_h * 0.1)),
                      (x2 - int(car_w * 0.15), y1 + int(car_h * 0.45)), (180, 220, 240), -1)
        # Headlights
        cv2.circle(frame, (x1 + int(car_w * 0.15), y2 - int(car_h * 0.2)), int(8 * scale), (0, 240, 255), -1)
        cv2.circle(frame, (x2 - int(car_w * 0.15), y2 - int(car_h * 0.2)), int(8 * scale), (0, 240, 255), -1)

        # HUD
        speed_kmh = int(40 + t * 95)
        cv2.putText(frame, f"CHECKPOST ALPHA SPEED RADAR | VEHICLE SPEED: {speed_kmh} KM/H", (25, 45),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 165, 255), 2, cv2.LINE_AA)

        writer.write(frame)

    writer.release()
    convert_to_browser_mp4(output_path, f"data/{Path(output_path).stem}_web.mp4")
    print(f"[Threat Generator] Scenario 2 ready: {output_path}")


def generate_group_breach_threat(output_path="data/threat_group_breach.mp4", duration_sec=10, fps=30):
    """
    Scenario 3: Coordinated Group Mob / Infiltration Assembly
    4 suspects gather and move together into a restricted zone.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    w, h = 1280, 720
    total_frames = duration_sec * fps
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, float(fps), (w, h))

    print(f"[Threat Generator] Generating Scenario 3: Group Mob Infiltration ({output_path})...")

    # 4 targets starting dispersed, assembling into tight formation, and rushing top restricted area
    offsets = [(-80, 0), (-30, 40), (30, 35), (80, -10)]
    start_y = 620
    end_y = 210

    for i in range(total_frames):
        t = i / total_frames
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        frame[:int(h * 0.45), :] = [45, 40, 35]
        frame[int(h * 0.45):, :] = [55, 65, 50]

        curr_center_y = int(start_y + (end_y - start_y) * t)
        curr_center_x = int(w * 0.5 + np.sin(i * 0.05) * 40)

        # Draw 4 coordinated figures
        for idx, (ox, oy) in enumerate(offsets):
            px = curr_center_x + ox
            py = curr_center_y + oy

            # Head
            cv2.circle(frame, (px, py - 38), 11, (170, 170, 170), -1)
            # Body
            cv2.rectangle(frame, (px - 12, py - 27), (px + 12, py + 8), (40, 40, 40), -1)
            # Legs
            leg_anim = int(np.sin(i * 0.4 + idx) * 8)
            cv2.line(frame, (px - 6, py + 8), (px - 10 + leg_anim, py + 38), (20, 20, 20), 5)
            cv2.line(frame, (px + 6, py + 8), (px + 10 - leg_anim, py + 38), (20, 20, 20), 5)

        cv2.putText(frame, f"BOP CHARLIE | SECTOR PERIMETER | TARGETS: 4 | TIME: {i/fps:.2f}s", (25, 45),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (200, 220, 240), 2, cv2.LINE_AA)

        writer.write(frame)

    writer.release()
    convert_to_browser_mp4(output_path, f"data/{Path(output_path).stem}_web.mp4")
    print(f"[Threat Generator] Scenario 3 ready: {output_path}")


def generate_all_threat_scenarios():
    print("=======================================================")
    print(" [IBVAP] Generating High-Realism Border Threat Scenarios")
    print("=======================================================\n")
    generate_night_crawl_threat()
    generate_vehicle_rush_threat()
    generate_group_breach_threat()
    print("\n[IBVAP] All 3 tactical threat videos generated and converted to web MP4!\n")


if __name__ == "__main__":
    generate_all_threat_scenarios()
