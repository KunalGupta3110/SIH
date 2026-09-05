"""
Cyber Camera Surveillance Platform
Module: core/rules/zones.py
Description: Polygon restricted geofencing, directional virtual tripwires, and caution corridors.
"""

from enum import Enum
import json
import os
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np


class ZoneType(Enum):
    RESTRICTED_POLYGON = "RESTRICTED_POLYGON"
    TRIPWIRE = "TRIPWIRE"
    CAUTION_ZONE = "CAUTION_ZONE"


class Zone:
    def __init__(
        self,
        zone_id: str,
        name: str,
        zone_type: ZoneType,
        points: List[Tuple[float, float]],
        restricted_classes: Optional[List[str]] = None,
        severity: str = "CRITICAL",
        loitering_time_sec: float = 5.0,
        allowed_direction: Optional[str] = None,
    ):
        self.zone_id = zone_id
        self.name = name
        self.zone_type = zone_type if isinstance(zone_type, ZoneType) else ZoneType(zone_type)
        self.points = points
        self.restricted_classes = restricted_classes or ["person", "car", "truck", "motorcycle"]
        self.severity = severity
        self.loitering_time_sec = loitering_time_sec
        self.allowed_direction = allowed_direction
        self.np_points = np.array(points, dtype=np.int32)

    def contains_point(self, point: Tuple[float, float]) -> bool:
        if self.zone_type in (ZoneType.RESTRICTED_POLYGON, ZoneType.CAUTION_ZONE):
            res = cv2.pointPolygonTest(self.np_points, (float(point[0]), float(point[1])), False)
            return res >= 0
        return False

    def is_tripwire_crossed(self, p_prev: Tuple[float, float], p_curr: Tuple[float, float]) -> bool:
        if self.zone_type != ZoneType.TRIPWIRE or len(self.points) < 2:
            return False

        def ccw(A, B, C):
            return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])

        A = self.points[0]
        B = self.points[1]
        C = p_prev
        D = p_curr
        return ccw(A, C, D) != ccw(B, C, D) and ccw(A, B, C) != ccw(A, B, D)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "zone_id": self.zone_id,
            "name": self.name,
            "zone_type": self.zone_type.value,
            "points": self.points,
            "restricted_classes": self.restricted_classes,
            "severity": self.severity,
            "loitering_time_sec": self.loitering_time_sec,
            "allowed_direction": self.allowed_direction,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Zone":
        return cls(
            zone_id=data["zone_id"],
            name=data["name"],
            zone_type=data["zone_type"],
            points=[(float(p[0]), float(p[1])) for p in data["points"]],
            restricted_classes=data.get("restricted_classes"),
            severity=data.get("severity", "CRITICAL"),
            loitering_time_sec=data.get("loitering_time_sec", 5.0),
            allowed_direction=data.get("allowed_direction"),
        )


class ZoneManager:
    def __init__(self, config_path: Optional[str] = None):
        self.camera_zones: Dict[str, Dict[str, Zone]] = {}
        if config_path and os.path.exists(config_path):
            self.load_from_json(config_path)

    def add_zone(self, arg1: Any, arg2: Optional[Any] = None, camera_id: Optional[str] = None):
        if isinstance(arg1, Zone):
            zone = arg1
            cid = camera_id or arg2 or "default"
        elif isinstance(arg2, Zone):
            zone = arg2
            cid = arg1
        else:
            cid = camera_id or "default"
            zone = arg1

        if cid not in self.camera_zones:
            self.camera_zones[cid] = {}
        self.camera_zones[cid][zone.zone_id] = zone

    def get_zones(self, camera_id: str) -> List[Zone]:
        return list(self.camera_zones.get(camera_id, {}).values())

    def draw_zones(self, frame: np.ndarray, camera_id: str) -> np.ndarray:
        zones = self.get_zones(camera_id)
        if not zones:
            return frame

        overlay = frame.copy()
        annotated = frame.copy()

        for zone in zones:
            if zone.zone_type == ZoneType.RESTRICTED_POLYGON:
                color = (0, 0, 220)
                cv2.fillPoly(overlay, [zone.np_points], color)
                cv2.polylines(annotated, [zone.np_points], isClosed=True, color=(0, 0, 255), thickness=2)
                lx, ly = int(zone.points[0][0]), int(zone.points[0][1])
                cv2.putText(annotated, f"RESTRICTED: {zone.name}", (lx, max(20, ly - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2, cv2.LINE_AA)

            elif zone.zone_type == ZoneType.CAUTION_ZONE:
                color = (0, 200, 255)
                cv2.fillPoly(overlay, [zone.np_points], color)
                cv2.polylines(annotated, [zone.np_points], isClosed=True, color=(0, 220, 255), thickness=2)
                lx, ly = int(zone.points[0][0]), int(zone.points[0][1])
                cv2.putText(annotated, f"CAUTION: {zone.name}", (lx, max(20, ly - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 220, 255), 2, cv2.LINE_AA)

            elif zone.zone_type == ZoneType.TRIPWIRE:
                p1 = (int(zone.points[0][0]), int(zone.points[0][1]))
                p2 = (int(zone.points[1][0]), int(zone.points[1][1]))
                cv2.line(annotated, p1, p2, (255, 255, 0), 2, cv2.LINE_AA)
                cv2.circle(annotated, p1, 5, (0, 255, 255), -1)
                cv2.circle(annotated, p2, 5, (0, 255, 255), -1)
                mx, my = int((p1[0] + p2[0]) / 2), int((p1[1] + p2[1]) / 2)
                cv2.putText(annotated, f"TRIPWIRE: {zone.name}", (mx, max(20, my - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 0), 1, cv2.LINE_AA)

        cv2.addWeighted(overlay, 0.25, annotated, 0.75, 0, annotated)
        return annotated

    def save_to_json(self, file_path: str):
        data = {cid: [z.to_dict() for z in z_dict.values()] for cid, z_dict in self.camera_zones.items()}
        os.makedirs(os.path.dirname(file_path) or ".", exist_ok=True)
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)

    def load_from_json(self, file_path: str):
        with open(file_path, "r") as f:
            data = json.load(f)
        self.camera_zones.clear()
        for cam_id, zone_list in data.items():
            self.camera_zones[cam_id] = {z["zone_id"]: Zone.from_dict(z) for z in zone_list}
