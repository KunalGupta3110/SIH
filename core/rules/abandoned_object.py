"""
IBVAP Sentinel
Module: core/rules/abandoned_object.py
Description: Flags a bag/object that stays stationary in-frame while no
             person track remains near it — a behavior detector (position
             over time + proximity), not just "a backpack is visible".
"""

from typing import Dict, List

OBJECT_CLASSES = {"backpack", "handbag", "suitcase"}

STATIONARY_RADIUS_PX = 35.0  # centroid drift under this still counts as "hasn't moved"
STATIONARY_SECONDS = 6.0  # how long it must stay put before counting as abandoned
OWNER_PROXIMITY_PX = 160.0  # a person within this distance counts as still attending it


class AbandonedObjectDetector:
    """Per-camera stateful detector — call update() once per processed frame
    with that frame's tracks. Fires once per track the moment it crosses
    into "abandoned", not on every frame it stays that way."""

    def __init__(self):
        # track_id -> {"anchor": (x, y), "since_ms": float, "alerted": bool}
        self._state: Dict[int, dict] = {}

    def update(self, tracks: List, timestamp_ms: float) -> List[dict]:
        persons = [t for t in tracks if t.class_name == "person"]
        newly_abandoned: List[dict] = []
        seen_ids = set()

        for t in tracks:
            if t.class_name not in OBJECT_CLASSES:
                continue
            seen_ids.add(t.track_id)
            st = self._state.get(t.track_id)
            if st is None:
                self._state[t.track_id] = {"anchor": t.centroid, "since_ms": timestamp_ms, "alerted": False}
                continue

            dx = t.centroid[0] - st["anchor"][0]
            dy = t.centroid[1] - st["anchor"][1]
            if (dx * dx + dy * dy) ** 0.5 > STATIONARY_RADIUS_PX:
                # moved enough to reset the stationary clock
                st["anchor"] = t.centroid
                st["since_ms"] = timestamp_ms
                st["alerted"] = False
                continue

            stationary_sec = (timestamp_ms - st["since_ms"]) / 1000.0
            if stationary_sec < STATIONARY_SECONDS or st["alerted"]:
                continue

            has_owner_nearby = any(
                ((p.centroid[0] - t.centroid[0]) ** 2 + (p.centroid[1] - t.centroid[1]) ** 2) ** 0.5 < OWNER_PROXIMITY_PX
                for p in persons
            )
            if not has_owner_nearby:
                st["alerted"] = True
                newly_abandoned.append({
                    "track_id": t.track_id,
                    "class_name": t.class_name,
                    "bbox": t.bbox,
                    "centroid": t.centroid,
                    "stationary_sec": round(stationary_sec, 1),
                })

        # drop state for objects no longer tracked (left frame / occluded away)
        for tid in list(self._state.keys()):
            if tid not in seen_ids:
                del self._state[tid]

        return newly_abandoned
