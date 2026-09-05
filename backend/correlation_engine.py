"""
IBVAP Sentinel — backend/correlation_engine.py

ONE job: decide whether a new event belongs to an incident that's already
being tracked, or whether it starts a brand-new one.

Integrates real Camera Topology (backend/camera_topology.py) to look up
per-camera-pair transit windows (scaled by target kinematic velocity) and
produces descriptive predicted-then-confirmed arrival narratives.
"""

from datetime import datetime
from typing import Optional, Tuple

from backend import database
from backend.camera_topology import DEFAULT_TOPOLOGY, get_transit_window

LOOKBACK_EVENT_LIMIT = 200


def _parse_time(timestamp_iso: str) -> datetime:
    return datetime.fromisoformat(timestamp_iso.replace("Z", "+00:00"))


def seconds_between(event_a: dict, event_b: dict) -> float:
    """Absolute time gap between two events, in seconds."""
    time_a = _parse_time(event_a["timestamp_iso"])
    time_b = _parse_time(event_b["timestamp_iso"])
    return abs((time_b - time_a).total_seconds())


def is_handoff_pair(event_a: dict, event_b: dict) -> Tuple[bool, Optional[Tuple[float, float, float]]]:
    """
    Checks if two events form a topologically valid cross-camera handoff.
    Returns (is_pair, (min_window_s, max_window_s, actual_transit_s)).
    """
    cam_a = event_a.get("camera_id")
    cam_b = event_b.get("camera_id")
    if not cam_a or not cam_b or cam_a == cam_b:
        return False, None

    # Derive velocity from event rule metrics or kinematics if available
    vel = 60.0
    metrics_a = event_a.get("rule_metrics") or {}
    if isinstance(metrics_a, dict) and "velocity_px_s" in metrics_a:
        vel = float(metrics_a["velocity_px_s"])

    transit_info = get_transit_window(cam_a, cam_b, velocity_px_s=vel)
    if not transit_info:
        # Check reverse direction
        transit_info = get_transit_window(cam_b, cam_a, velocity_px_s=vel)
        if not transit_info:
            return False, None

    min_s, max_s, _ = transit_info
    gap = seconds_between(event_a, event_b)

    # Allow 2s tolerance around the kinematic window
    if (min_s - 2.0) <= gap <= (max_s + 4.0):
        return True, (min_s, max_s, round(gap, 1))

    return False, None


def find_track_or_handoff_partner(new_event: dict) -> Tuple[Optional[dict], Optional[Tuple[float, float, float]]]:
    """
    Look through recently-stored events for:
      1. Same track on same camera within 15s (temporal debouncing / continuation).
      2. Cross-camera handoff partner via topology graph.
    """
    recent_events = database.get_recent_events(limit=LOOKBACK_EVENT_LIMIT)
    for candidate in recent_events:
        if candidate["event_id"] == new_event["event_id"]:
            continue

        # Case 1: Same camera, same track ID within 15s
        if (candidate["camera_id"] == new_event["camera_id"] and
            candidate.get("track_id") is not None and
            candidate.get("track_id") == new_event.get("track_id")):
            gap = seconds_between(candidate, new_event)
            if gap <= 15.0:
                return candidate, None

        # Case 2: Cross-camera handoff
        is_pair, window_tuple = is_handoff_pair(candidate, new_event)
        if is_pair:
            return candidate, window_tuple

    return None, None


def correlate_event(new_event: dict) -> Tuple[str, Optional[Tuple[float, float, float]]]:
    """
    Attach new_event to an incident and return (incident_id, handoff_window_info).
    """
    partner, window_info = find_track_or_handoff_partner(new_event)

    incident_id = None
    if partner is not None:
        incident_id = database.get_incident_id_for_event(partner["event_id"])

    if incident_id is None:
        # No related incident found — this event starts a new one.
        incident_id = database.next_incident_id()
        database.insert_incident({
            "incident_id": incident_id,
            "primary_object_id": str(new_event.get("track_id") or new_event["event_id"]),
            "target_class": new_event.get("class_name", "person"),
            "cameras": [new_event["camera_id"]],
        })

    database.link_event_to_incident(incident_id, new_event["event_id"])
    return incident_id, window_info


def build_story_summary(incident_id: str) -> str:
    """
    A descriptive, human-readable narrative of the incident, including the
    topological predicted arrival window and confirmed transit time.
    e.g. "Target tracked CAM_ALPHA -> CAM_BRAVO (expected CAM_BRAVO arrival in 6.0–14.0s, confirmed at 8.0s)."
    """
    events = database.get_events_for_incident(incident_id)
    if not events:
        return ""
    if len(events) == 1:
        return f"Target detected on {events[0]['camera_id']}."

    cameras_in_order = [events[0]["camera_id"]]
    transit_narratives = []

    for i in range(1, len(events)):
        prev_evt = events[i - 1]
        curr_evt = events[i]
        curr_cam = curr_evt["camera_id"]

        if curr_cam != cameras_in_order[-1]:
            cameras_in_order.append(curr_cam)
            is_pair, window_info = is_handoff_pair(prev_evt, curr_evt)
            if is_pair and window_info:
                min_w, max_w, actual_s = window_info
                transit_narratives.append(
                    f"expected {curr_cam} arrival in {min_w:.1f}–{max_w:.1f}s, confirmed at {actual_s:.1f}s"
                )
            else:
                gap_s = seconds_between(prev_evt, curr_evt)
                transit_narratives.append(f"transit to {curr_cam} in {gap_s:.1f}s")

    path = " -> ".join(cameras_in_order)
    if transit_narratives:
        details = "; ".join(transit_narratives)
        return f"Target tracked {path} ({details})."
    else:
        gap_seconds = int(seconds_between(events[0], events[-1]))
        return f"Target tracked {path} over {gap_seconds}s (predictive handoff confirmed)."
