"""
IBVAP Sentinel — demos/scenario_3_camera_failure.py

Scenario 3 (Requirement W): Camera Health Failure, Stream Degradation & Operator Failover.
Demonstrates:
  1. Live camera heartbeat monitoring.
  2. Frame-freeze detection (zero pixel delta across 90 frames).
  3. Camera status transition: ONLINE -> FROZEN -> OFFLINE.
  4. Automatic failover notification and degraded mode routing.
"""

import os
import sys
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from core.vision.camera_health import CameraHealthMonitor


def run_camera_failure_demo():
    print("=" * 70)
    print(" [SCENARIO 3] CAMERA HEALTH FAILURE & DEGRADED FAILOVER SIMULATION")
    print("=" * 70)

    monitor = CameraHealthMonitor()

    # Step 1: Normal operations
    print("\n[STEP 1] Camera CAM_CHARLIE operating nominally...")
    for i in range(5):
        frame_data = f"live_frame_payload_timestamp_{time.time()}_{i}".encode("utf-8")
        rec = monitor.record_frame("CAM_CHARLIE", frame_data)
        print(f"  Frame {i+1}: Status={rec.status}, FPS={rec.fps}, Latency={rec.latency_ms}ms")
        time.sleep(0.1)

    # Step 2: Stream freeze (video encoder freeze / replay attack)
    print("\n[STEP 2] Video stream buffer freezes (identical pixel buffer)...")
    stuck_frame = b"frozen_frame_buffer_hardware_lockup"
    for i in range(100):
        rec = monitor.record_frame("CAM_CHARLIE", stuck_frame)

    print(f"  Alert Triggered: Camera CAM_CHARLIE Status={rec.status}!")
    print(f"  Diagnostic: {rec.details}")
    print(f"  Consecutive Identical Frames: {rec.consecutive_identical_frames}")

    # Step 3: Hardware disconnect / network cut
    print("\n[STEP 3] Sentry Line Cut -> RTSP stream drops...")
    monitor.mark_offline("CAM_CHARLIE", "RTSP TCP socket timed out after 3000ms")
    offline_rec = monitor.cameras["CAM_CHARLIE"]
    print(f"  Status: {offline_rec.status}")
    print(f"  FPS: {offline_rec.fps}")
    print(f"  Diagnostic: {offline_rec.details}")

    # Step 4: System summary
    print("\n" + "=" * 70)
    print(" [SUMMARY] Active Camera Health Matrix:")
    for c in monitor.get_all_health():
        status_tag = f"[{c['status']}]"
        print(f"  * {c['camera_id']:<12} {c['name']:<30} {status_tag:<12} {c['details']}")
    print("=" * 70)


if __name__ == "__main__":
    run_camera_failure_demo()
