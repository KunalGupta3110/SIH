"""
IBVAP Sentinel — Master Ecosystem Launcher
Launches all subsystems of the unified AI Edge Security & Mobile Admin Platform.
"""

import argparse
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT_DIR = Path(__file__).resolve().parent

def main():
    parser = argparse.ArgumentParser(description="IBVAP Sentinel Master Launcher")
    parser.add_argument("--api-only", action="store_true", help="Launch FastAPI REST Gateway only")
    parser.add_argument("--dashboard-only", action="store_true", help="Launch Streamlit Dashboard only")
    parser.add_argument("--threat-demo", action="store_true", help="Run Checkpoint Incursion & ANPR Vision Demo")
    args = parser.parse_args()

    print("\n=======================================================")
    print(" 🛡️ [IBVAP SENTINEL ECOSYSTEM] MASTER LAUNCHER")
    print(" 1. Edge AI Vision Engine (YOLOv8 + Re-ID + ANPR)")
    print(" 2. FastAPI REST Gateway (Port 8000)")
    print(" 3. Streamlit Command Center (Port 8501)")
    print(" 4. Sentinel Flutter Mobile/Desktop Admin App")
    print("=======================================================\n")

    if args.api_only:
        subprocess.run([sys.executable, "-m", "uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8000", "--reload"], cwd=ROOT_DIR)
        return

    if args.dashboard_only:
        subprocess.run(["streamlit", "run", "dashboard/app.py"], cwd=ROOT_DIR)
        return

    if args.threat_demo:
        subprocess.run([sys.executable, "alerts/scenario_checkpoint_vehicle_ramming.py"], cwd=ROOT_DIR)
        return

    # Launch Unified Services
    print("[1/3] Starting FastAPI REST Gateway on http://localhost:8000...")
    api_proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8000"], cwd=ROOT_DIR)
    time.sleep(1.5)

    print("[2/3] Starting Streamlit Command Center on http://localhost:8501...")
    dash_proc = subprocess.Popen(["streamlit", "run", "dashboard/app.py", "--server.port", "8501", "--server.headless", "true"], cwd=ROOT_DIR)
    time.sleep(1.5)

    print("\n✅ All Backend & Dashboard Services are LIVE!")
    print(" 🌐 REST API Docs:    http://localhost:8000/docs")
    print(" 📊 Web Dashboard:    http://localhost:8501")
    print(" 📱 Flutter App Dir:  cd sentinel_admin_app && flutter run")
    print("\nPress Ctrl+C to stop all services.")

    try:
        api_proc.wait()
    except KeyboardInterrupt:
        print("\nStopping all services...")
        api_proc.terminate()
        dash_proc.terminate()

if __name__ == "__main__":
    main()
