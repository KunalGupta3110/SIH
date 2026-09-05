"""
Cyber Camera Surveillance Platform
Demo: demos/scenario_3_vehicle_ramming.py
Description: Scenario 3 — Tactical Vehicle Ramming, Ultra-HD ANPR & Masked Hostiles Inspector.
"""

import argparse
import os
from pathlib import Path
import sys
import time

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Import the existing tactical scenario generator
from alerts.scenario_checkpoint_vehicle_ramming import run_tactical_vehicle_surveillance_demo, synthesize_checkpoint_threat_video

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="data/scenario_checkpoint_breach.mp4")
    parser.add_argument("--generate", action="store_true")
    parser.add_argument("--no-show", action="store_true")
    args = parser.parse_args()

    video_path = os.path.join(ROOT_DIR, args.source) if not os.path.isabs(args.source) else args.source
    if args.generate or not os.path.exists(video_path):
        synthesize_checkpoint_threat_video(video_path, duration_sec=18)

    run_tactical_vehicle_surveillance_demo(video_source=video_path, show=not args.no_show)


if __name__ == "__main__":
    main()
