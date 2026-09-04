"""
IBVAP Sentinel — backend/correlation_engine.py

ONE job: decide whether a new event belongs to an incident that's already
being tracked, or whether it starts a brand-new one.

The rule is simple and deterministic — no machine learning here, just a
timestamp check:

    Two events from DIFFERENT cameras that happen 6-14 seconds apart are
    treated as the same target moving between camera views. This is the
    "predictive handoff window" — a person can't be at CAM_ALPHA and
    CAM_BRAVO at the same instant, but if they show up at CAM_BRAVO a
    handful of seconds after leaving CAM_ALPHA, it's almost certainly
    the same target walking between the two.

This can absolutely be replaced later with something smarter (real Re-ID
embeddings, direction vectors, etc.) — the database and the rest of the
API don't need to change, only this one function.
"""

from datetime import datetime

from backend import database

HANDOFF_MIN_SECONDS = 6
HANDOFF_MAX_SECONDS = 14

# How far back to look for a possible handoff partner. Wider than the
# handoff window itself so we don't miss events sitting near the edges.
LOOKBACK_SECONDS = 30
LOOKBACK_EVENT_LIMIT = 200


def _parse_time(timestamp_iso: str) -> datetime:
    return datetime.fromisoformat(timestamp_iso.replace("Z", "+00:00"))


def seconds_between(event_a: dict, event_b: dict) -> float:
    """Absolute time gap between two events, in seconds."""
    time_a = _parse_time(event_a["timestamp_iso"])
    time_b = _parse_time(event_b["timestamp_iso"])
    return abs((time_b - time_a).total_seconds())


def is_handoff_pair(event_a: dict, event_b: dict) -> bool:
    """
    True if two events look like the same target crossing from one camera
    into another camera's view.
    """
    if event_a["camera_id"] == event_b["camera_id"]:
        return False  # same camera twice isn't a "handoff"
    gap = seconds_between(event_a, event_b)
    return HANDOFF_MIN_SECONDS <= gap <= HANDOFF_MAX_SECONDS


def find_track_or_handoff_partner(new_event: dict) -> dict | None:
    """
    Look through recently-stored events for:
      1. Same track on same camera within 15s (temporal debouncing / continuation).
      2. Cross-camera handoff partner (6-14s window).
    """
    recent_events = database.get_recent_events(limit=LOOKBACK_EVENT_LIMIT)
    for candidate in recent_events:
        if candidate["event_id"] == new_event["event_id"]:
            continue
        
        # Case 1: Same camera, same track ID within 15s (Debounce continuous presence)
        if (candidate["camera_id"] == new_event["camera_id"] and 
            candidate.get("track_id") is not None and 
            candidate.get("track_id") == new_event.get("track_id")):
            gap = seconds_between(candidate, new_event)
            if gap <= 15.0:
                return candidate

        # Case 2: Cross-camera handoff
        if is_handoff_pair(candidate, new_event):
            return candidate

    return None


def correlate_event(new_event: dict) -> str:
    """
    Attach new_event to an incident and return that incident's id.

    Step 1: if a track continuation or handoff partner exists and it's already
            part of an incident, join that same incident.
    Step 2: otherwise, start a brand-new incident containing just this event.

    The caller (backend/main.py) inserts new_event into security_events before
    calling this, so it shows up in lookback searches.
    """
    partner = find_track_or_handoff_partner(new_event)

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
    return incident_id


def build_story_summary(incident_id: str) -> str:
    """
    A one-sentence, human-readable description of an incident, built from
    the events that make it up — e.g.
    "Target seen on CAM_ALPHA, then CAM_BRAVO 9s later."
    """
    events = database.get_events_for_incident(incident_id)
    if not events:
        return ""
    if len(events) == 1:
        return f"Target detected on {events[0]['camera_id']}."

    cameras_in_order = [events[0]["camera_id"]]
    for event in events[1:]:
        if event["camera_id"] != cameras_in_order[-1]:
            cameras_in_order.append(event["camera_id"])

    gap_seconds = int(seconds_between(events[0], events[-1]))
    path = " -> ".join(cameras_in_order)
    return f"Target tracked {path} over {gap_seconds}s (predictive handoff confirmed)."
