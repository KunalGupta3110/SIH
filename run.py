"""
IBVAP Sentinel — Master CLI Launcher
Usage:
  python run.py --all           # Starts FastAPI Gateway (:8000) + Streamlit dashboard (:8501)
  python run.py --api           # Starts FastAPI REST Gateway only
  python run.py --dashboard     # Starts the Streamlit analyst dashboard
  python run.py --demo 1        # Runs Scenario 1 (Geofence Perimeter Breach)
  python run.py --demo 2        # Runs Scenario 2 (Cross-Camera Re-ID)
  python run.py --demo 3        # Runs Scenario 3 (Vehicle Ramming & Ultra-HD ANPR)
  python run.py --demo 4        # Runs Scenario 4 (Live Webcam & Hardware Barrier)

The operator command console is the React app in frontend/ (deployed at
ibvap-sentinel.vercel.app) — run it with `cd frontend && npm run dev`.
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
          🛡️  IBVAP SENTINEL — MASTER ECOSYSTEM LAUNCHER  🛡️
    Ministry of Home Affairs | SSB | SIH 2026 Problem Statement 26187
======================================================================
    """)


def main():
    parser = argparse.ArgumentParser(description="IBVAP Sentinel - Master Launcher")
    parser.add_argument("--live", "--webcam", action="store_true", dest="live",
                        help="Launch Live Surveillance Pipeline (Person + ANPR Number Plates + Drones)")
    parser.add_argument("--source", default="0",
                        help="Camera source for live mode: 0 for laptop webcam, 1 for USB, or an IP camera URL")
    parser.add_argument("--all", action="store_true", help="Launch Backend API Gateway + Streamlit dashboard")
    parser.add_argument("--api", action="store_true", help="Launch FastAPI REST Gateway on port 8000")
    parser.add_argument("--dashboard", action="store_true", help="Launch the Streamlit analyst dashboard on port 8501")
    parser.add_argument("--demo", type=int, choices=[1, 2, 3, 4, 5, 6],
                        help="Run Demo Scenario (1: Breach, 2: Re-ID, 3: Vehicle, 4: Tabletop Webcam, 5: Incident Recon, 6: Live Multi-Cam)")
    args = parser.parse_args()

    print_banner()

    # Direct flag launches
    if args.live:
        src = args.source
        print(f"[Starting] Live Surveillance Pipeline on source {src} (Persons + ANPR + Drones)...")
        subprocess.run([sys.executable, "-m", "core.vision.live_pipeline", "--source", str(src)], cwd=ROOT_DIR)
        return

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
    elif args.demo == 6:
        subprocess.run([sys.executable, "demos/live_real_world_tester.py"], cwd=ROOT_DIR)
        return

    # Subsystem specific
    if args.api:
        print("[Starting] FastAPI REST Gateway on http://localhost:8000...")
        subprocess.run([sys.executable, "-m", "uvicorn", "services.api_gateway.server:app", "--host", "0.0.0.0", "--port", "8000", "--reload"], cwd=ROOT_DIR)
        return

    if args.dashboard:
        print("[Starting] Streamlit analyst dashboard on http://localhost:8501...")
        subprocess.run(["streamlit", "run", "dashboard/app.py"], cwd=ROOT_DIR)
        return

    if args.all:
        print("[Starting] FastAPI REST + WebSocket Gateway on http://localhost:8000...")
        import webbrowser
        webbrowser.open("http://localhost:8000/docs")
        try:
            subprocess.run([sys.executable, "-m", "uvicorn", "services.api_gateway.server:app", "--host", "0.0.0.0", "--port", "8000"], cwd=ROOT_DIR)
        except KeyboardInterrupt:
            print("\nServer terminated.")
        return

    # If no arguments provided, show an intuitive interactive menu
    print(" Select an option to start (Press Enter for Live Webcam):")
    print("  [1] 📹 Live Webcam Surveillance (Person + ANPR Number Plates + Drones) [DEFAULT]")
    print("  [2] 🎯 Scenario 4 — Tabletop Checkpoint & Hardware Barrier")
    print("  [3] 🌐 FastAPI REST Backend Gateway (:8000)")
    print("  [4] 📊 Streamlit Analyst Dashboard (:8501)")
    print("  [5] 🚀 Launch Ecosystem (API Gateway + Browser Docs)")
    print("  [6] 🔍 Scenario 2 — Cross-Camera Re-ID")
    print("  [7] 🚗 Scenario 3 — Vehicle Ramming & ANPR")
    print("  [8] 📹 Scenario 6 — Multi-Camera Live Real Tester")
    print("  [0] Exit")
    print("-" * 70)

    try:
        choice = input(" Enter choice [1]: ").strip()
    except (EOFError, KeyboardInterrupt):
        choice = "1"

    if choice in ("", "1"):
        print("\n[Starting] Live Surveillance Pipeline on camera 0 (Persons + ANPR + Drones)...")
        subprocess.run([sys.executable, "-m", "core.vision.live_pipeline", "--source", "0"], cwd=ROOT_DIR)
    elif choice == "2":
        subprocess.run([sys.executable, "demos/scenario_4_tabletop_webcam.py"], cwd=ROOT_DIR)
    elif choice == "3":
        subprocess.run([sys.executable, "-m", "uvicorn", "services.api_gateway.server:app", "--host", "0.0.0.0", "--port", "8000", "--reload"], cwd=ROOT_DIR)
    elif choice == "4":
        subprocess.run(["streamlit", "run", "dashboard/app.py"], cwd=ROOT_DIR)
    elif choice == "5":
        import webbrowser
        webbrowser.open("http://localhost:8000/docs")
        subprocess.run([sys.executable, "-m", "uvicorn", "services.api_gateway.server:app", "--host", "0.0.0.0", "--port", "8000"], cwd=ROOT_DIR)
    elif choice == "6":
        subprocess.run([sys.executable, "demos/scenario_2_cross_cam_reid.py"], cwd=ROOT_DIR)
    elif choice == "7":
        subprocess.run([sys.executable, "demos/scenario_3_vehicle_ramming.py"], cwd=ROOT_DIR)
    elif choice == "8":
        subprocess.run([sys.executable, "demos/live_real_world_tester.py"], cwd=ROOT_DIR)
    elif choice == "0":
        print("Exiting.")
        return
    else:
        print(f"Unknown choice: {choice}")


if __name__ == "__main__":
    main()
