"""
IBVAP Sentinel — Master Ecosystem Launcher
Launches the FastAPI REST + WebSocket gateway on http://localhost:8000.
The operator command console is the React app in frontend/ (run separately
with `cd frontend && npm run dev`, or use https://ibvap-sentinel.vercel.app).
"""

import argparse
import os
from pathlib import Path
import subprocess
import sys
import time
import webbrowser

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parent

def main():
    parser = argparse.ArgumentParser(description="IBVAP Sentinel Master Launcher")
    parser.add_argument("--threat-demo", action="store_true", help="Run Checkpoint Incursion & ANPR Vision Demo")
    args = parser.parse_args()

    print("\n=======================================================")
    print(" [+] IBVAP SENTINEL -- ECOSYSTEM LAUNCHER")
    print(" 1. Edge AI Vision Engine (YOLOv8 + Re-ID + ANPR)")
    print(" 2. FastAPI REST + WebSocket Gateway (:8000/docs)")
    print(" 3. React command console:  cd frontend && npm run dev  (:5173)")
    print("=======================================================\n")

    if args.threat_demo:
        subprocess.run([sys.executable, "alerts/scenario_checkpoint_vehicle_ramming.py"], cwd=ROOT_DIR)
        return

    print("[Starting] FastAPI Gateway on http://localhost:8000 ...")
    subprocess.run([sys.executable, "-m", "uvicorn", "services.api_gateway.server:app", "--host", "0.0.0.0", "--port", "8000"], cwd=ROOT_DIR)


if __name__ == "__main__":
    main()
