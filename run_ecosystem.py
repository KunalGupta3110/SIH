"""
IBVAP Sentinel — Master Ecosystem Launcher
Launches FastAPI Gateway serving the Sentinel Watchfloor 3D Command Center on http://localhost:8000.
"""

import argparse
import os
from pathlib import Path
import subprocess
import sys
import time
import webbrowser

ROOT_DIR = Path(__file__).resolve().parent

def main():
    parser = argparse.ArgumentParser(description="IBVAP Sentinel Master Launcher")
    parser.add_argument("--threat-demo", action="store_true", help="Run Checkpoint Incursion & ANPR Vision Demo")
    args = parser.parse_args()

    print("\n=======================================================")
    print(" 🛡️ [CYBER CAMERA SURVEILLANCE ECOSYSTEM] MASTER LAUNCHER")
    print(" 1. Edge AI Vision Engine (YOLOv8 + Re-ID + ANPR)")
    print(" 2. Sentinel Watchfloor 3D Command Console (:8000)")
    print(" 3. FastAPI REST Gateway (:8000/docs)")
    print("=======================================================\n")

    if args.threat_demo:
        subprocess.run([sys.executable, "alerts/scenario_checkpoint_vehicle_ramming.py"], cwd=ROOT_DIR)
        return

    print("[Starting] FastAPI Gateway & Sentinel Watchfloor on http://localhost:8000...")
    webbrowser.open("http://localhost:8000")

    subprocess.run([sys.executable, "-m", "uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8000"], cwd=ROOT_DIR)


if __name__ == "__main__":
    main()
