"""
Cyber Camera Surveillance Platform
Master CLI Launcher
Usage:
  python run.py --all           # Starts FastAPI Gateway (:8000) + Web Command Center (:8501)
  python run.py --api           # Starts FastAPI REST Gateway only
  python run.py --dashboard     # Starts Streamlit Web Command Station
  python run.py --demo 1        # Runs Scenario 1 (Geofence Perimeter Breach)
  python run.py --demo 2        # Runs Scenario 2 (Cross-Camera Re-ID)
  python run.py --demo 3        # Runs Scenario 3 (Vehicle Ramming & Ultra-HD ANPR)
  python run.py --demo 4        # Runs Scenario 4 (Live Webcam & Hardware Barrier)
"""

import argparse
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT_DIR = Path(__file__).resolve().parent


def print_banner():
    print("""
======================================================================
       🛡️  CYBER CAMERA SURVEILLANCE — MASTER ECOSYSTEM LAUNCHER  🛡️
    Ministry of Home Affairs | SSB | SIH 2026 Problem Statement 26187
======================================================================
    """)


def main():
    parser = argparse.ArgumentParser(description="Cyber Camera Surveillance - Master Launcher")
    parser.add_argument("--all", action="store_true", help="Launch Backend API Gateway + Web Command Center")
    parser.add_argument("--api", action="store_true", help="Launch FastAPI REST Gateway on port 8000")
    parser.add_argument("--dashboard", action="store_true", help="Launch Web Command Center on port 8501")
    parser.add_argument("--demo", type=int, choices=[1, 2, 3, 4, 5], help="Run Demo Scenario (1: Breach, 2: Re-ID, 3: Vehicle, 4: Webcam, 5: Incident Reconstruction)")
    args = parser.parse_args()

    print_banner()

    # Demos
    if args.demo == 1:
        subprocess.run([sys.executable, "demos/scenario_1_perimeter_breach.py"], cwd=ROOT_DIR)
        return
    elif args.demo == 2:
        subprocess.run([sys.executable, "demos/scenario_2_cross_cam_reid.py"], cwd=ROOT_DIR)
        return
    elif args.demo == 3:
        subprocess.run([sys.executable, "demos/scenario_3_vehicle_ramming.py"], cwd=ROOT_DIR)
        return
    elif args.demo == 4:
        subprocess.run([sys.executable, "demos/scenario_4_tabletop_webcam.py"], cwd=ROOT_DIR)
        return
    elif args.demo == 5:
        subprocess.run([sys.executable, "demos/scenario_reconstruct_incident.py"], cwd=ROOT_DIR)
        return

    # Subsystem specific
    if args.api:
        print("[Starting] FastAPI REST Gateway on http://localhost:8000...")
        subprocess.run([sys.executable, "-m", "uvicorn", "services.api_gateway.server:app", "--host", "0.0.0.0", "--port", "8000", "--reload"], cwd=ROOT_DIR)
        return

    if args.dashboard:
        print("[Starting] Web Command Station on http://localhost:8501...")
        subprocess.run(["streamlit", "run", "apps/web_command_center/app.py"], cwd=ROOT_DIR)
        return

    # Default / --all
    print("[1/2] Starting FastAPI Gateway (Port 8000)...")
    api_proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "services.api_gateway.server:app", "--host", "0.0.0.0", "--port", "8000"], cwd=ROOT_DIR)
    time.sleep(1.5)

    print("[2/2] Starting Web Command Center (Port 8501)...")
    dash_proc = subprocess.Popen(["streamlit", "run", "apps/web_command_center/app.py", "--server.port", "8501", "--server.headless", "true"], cwd=ROOT_DIR)
    time.sleep(1.5)

    print("\n" + "="*70)
    print(" ✅ ALL SERVICES ONLINE & OPERATIONAL!")
    print(" 🌐 REST API Docs:           http://localhost:8000/docs")
    print(" 📊 Web Command Center:       http://localhost:8501")
    print(" 📱 Mobile Admin App:         cd apps/mobile_admin && flutter run")
    print(" 🎮 Run Threat Scenario 3:    python run.py --demo 3")
    print("="*70)
    print("\nPress Ctrl+C to safely terminate all services.")

    try:
        api_proc.wait()
    except KeyboardInterrupt:
        print("\nTerminating all services...")
        api_proc.terminate()
        dash_proc.terminate()


if __name__ == "__main__":
    main()
