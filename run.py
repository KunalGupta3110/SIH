"""
Cyber Camera Surveillance Platform
Master CLI Launcher
Usage:
  python run.py                 # Starts the real backend + frontend (same as run_ecosystem.py)
  python run.py --demo 1        # Runs Scenario 1 (Geofence Perimeter Breach)
  python run.py --demo 2        # Runs Scenario 2 (Cross-Camera Re-ID)
  python run.py --demo 3        # Runs Scenario 3 (Vehicle Ramming & Ultra-HD ANPR)
  python run.py --demo 4        # Runs Scenario 4 (Live Webcam & Hardware Barrier)

Note: --all / --api / --dashboard used to launch an older FastAPI gateway
(services/api_gateway/server.py) and a Streamlit dashboard
(apps/web_command_center/app.py). Both were dead code — replaced by
backend/main.py and apps/web_command_center/static/command_center.html,
which run_ecosystem.py already starts together on one port. Those flags
were removed rather than left pointing at deleted files.
"""

import argparse
from pathlib import Path
import subprocess
import sys

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
    parser.add_argument("--demo", type=int, choices=[1, 2, 3, 4, 5, 6], help="Run Demo Scenario (1: Breach, 2: Re-ID, 3: Vehicle, 4: Webcam, 5: Incident Reconstruction, 6: Live Multi-Cam Real Tester)")
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
    elif args.demo == 6:
        subprocess.run([sys.executable, "demos/live_real_world_tester.py"], cwd=ROOT_DIR)
        return

    # Default: this used to fork off into --all / --api / --dashboard, each
    # starting a different (now-deleted) backend or a Streamlit dashboard.
    # There's one real backend now — just run it.
    print("[Starting] Handing off to run_ecosystem.py (backend.main:app on http://localhost:8000) ...")
    subprocess.run([sys.executable, "run_ecosystem.py"], cwd=ROOT_DIR)


if __name__ == "__main__":
    main()
