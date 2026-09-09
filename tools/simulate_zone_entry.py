"""
IBVAP Sentinel — tools/simulate_zone_entry.py

End-to-end smoke test for restricted-zone detection + real-time dashboard push.

Sends one (or a short sequence of) synthetic "restricted zone entry" event(s) to
the FastAPI gateway exactly as alerts/gateway_forwarder.py would from the live CV
pipeline. Use this to verify, without a camera or the YOLO stack running:

    1. the event reaches POST /events
    2. it produces / updates a correlated incident with a non-zero threat score
    3. every browser on /ws/incidents receives an {"type":"incident_update"} frame
       and the dashboard camera marker flips to ALERT with no refresh

Usage:
    python tools/simulate_zone_entry.py                       # 1 event, CAM_BRAVO
    python tools/simulate_zone_entry.py --camera CAM_DELTA
    python tools/simulate_zone_entry.py --handoff             # 2-camera walk-through
    python tools/simulate_zone_entry.py --gateway http://127.0.0.1:8000
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import sys
import time

import requests


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_zone_entry_event(camera_id: str, track_id: int, tag: str) -> dict:
    ts = _now_iso()
    return {
        "event_id": f"evt_sim_zone_{camera_id}_{track_id}_{int(time.time() * 1000)}",
        "timestamp_iso": ts,
        "camera_id": camera_id,
        "track_id": track_id,
        "class_name": "person",
        "alert_type": "ZONE_INTRUSION",
        "severity": "CRITICAL",
        "zone_id": "zone_no_go_red",
        "zone_name": "Red Zone (Strictly Prohibited)",
        "details": (
            f"[SIM {tag}] PERSON (Track #{track_id}) entered restricted polygon "
            f"'Red Zone' on {camera_id}."
        ),
        "bbox": [812.0, 366.0, 902.0, 620.0],
        "centroid": [857.0, 493.0],
        "rule_name": "Point-in-Polygon Boundary Containment",
        "confidence": 0.93,
        "in_restricted_zone": True,
        "movement_toward_border": True,
        "loitering_seconds": 0.0,
        "cross_camera_reid_match": False,
    }


def post_event(gateway: str, event: dict, timeout: float = 5.0) -> dict:
    resp = requests.post(f"{gateway.rstrip('/')}/events", json=event, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _print_result(event: dict, data: dict) -> None:
    incident = (data or {}).get("incident") or {}
    print(f"  -> POST /events  event_id={event['event_id']}")
    print(f"     camera={event['camera_id']}  duplicate={data.get('duplicate')}")
    print(
        f"     incident={incident.get('incident_id', '?')}  "
        f"threat_score={incident.get('threat_score', '?')}  "
        f"severity={incident.get('severity', '?')}"
    )
    breakdown = incident.get("score_breakdown") or []
    for factor in breakdown:
        print(f"       + {factor.get('points', '?'):>3}  {factor.get('factor', '')}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Simulate a restricted-zone entry event")
    parser.add_argument("--gateway", default="http://127.0.0.1:8000", help="Gateway base URL")
    parser.add_argument("--camera", default="CAM_BRAVO", help="Camera id for the intrusion")
    parser.add_argument("--track-id", type=int, default=407, help="Synthetic track id")
    parser.add_argument(
        "--handoff",
        action="store_true",
        help="Send a 2-camera sequence (CAM_ALPHA then --camera ~9s later) to also "
        "exercise cross-camera Re-ID correlation",
    )
    args = parser.parse_args()

    try:
        if args.handoff:
            print("[sim] 2-camera restricted-zone walk-through")
            first = build_zone_entry_event("CAM_ALPHA", args.track_id, "handoff 1/2")
            _print_result(first, post_event(args.gateway, first))
            print("[sim] waiting 9s (inside the 6-14s handoff window)...")
            time.sleep(9)
            second = build_zone_entry_event(args.camera, args.track_id, "handoff 2/2")
            second["alert_type"] = "CROSS_CAMERA_MATCH"
            second["cross_camera_reid_match"] = True
            _print_result(second, post_event(args.gateway, second))
        else:
            print("[sim] single restricted-zone entry")
            event = build_zone_entry_event(args.camera, args.track_id, "single")
            _print_result(event, post_event(args.gateway, event))
    except requests.exceptions.ConnectionError:
        print(
            f"[sim] ERROR: could not reach the gateway at {args.gateway}\n"
            f"       start it first:  python -m uvicorn services.api_gateway.server:app --port 8000",
            file=sys.stderr,
        )
        return 1
    except requests.exceptions.HTTPError as exc:
        print(f"[sim] ERROR: gateway rejected the event: {exc}\n{exc.response.text}", file=sys.stderr)
        return 1

    print("\n[sim] done. Any dashboard connected to /ws/incidents should now show the alert.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
