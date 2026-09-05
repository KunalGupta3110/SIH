"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/zones.py
Description: Polygon restricted zones and virtual tripwire definitions,
             intersection checks, direction vector calculations, and rendering.
"""

from enum import Enum
import json
import os
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np


class ZoneType(str, Enum):
    RESTRICTED_POLYGON = "restricted_polygon"
    TRIPWIRE = "tripwire"
    CAUTION_ZONE = "caution_zone"


def line_intersection(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    p3: Tuple[float, float],
    p4: Tuple[float, float],
) -> Tuple[bool, Optional[Tuple[float, float]]]:
    """
    Checks if line segment (p1->p2) intersects with line segment (p3->p4).
    Uses 2D cross-product orientation test.

    Returns:
        (is_intersecting, intersection_point)
    """
    def ccw(a, b, c):
        return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0])

    # Segments intersect iff endpoints of one segment lie on opposite sides of the other
    intersects = (ccw(p1, p3, p4) != ccw(p2, p3, p4)) and (ccw(p1, p2, p3) != ccw(p1, p2, p4))
    if not intersects:
        return False, None

    # Line equations in standard form: A1*x + B1*y = C1
    a1 = p2[1] - p1[1]
    b1 = p1[0] - p2[0]
    c1 = a1 * p1[0] + b1 * p1[1]

    a2 = p4[1] - p3[1]
    b2 = p3[0] - p4[0]
    c2 = a2 * p3[0] + b2 * p3[1]

    det = a1 * b2 - a2 * b1
    if abs(det) < 1e-6:
        return False, None

    ix = (b2 * c1 - b1 * c2) / det
    iy = (a1 * c2 - a2 * c1) / det
    return True, (ix, iy)


def compute_crossing_direction(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    tripwire_p1: Tuple[float, float],
    tripwire_p2: Tuple[float, float],
) -> str:
    """
    Determines the crossing direction (e.g. 'A_to_B' vs 'B_to_A') relative to the tripwire normal.
    Positive 2D cross product indicates crossing from right-to-left of tripwire vector.
    """
    tw_vec = (tripwire_p2[0] - tripwire_p1[0], tripwire_p2[1] - tripwire_p1[1])
    motion_vec = (p2[0] - p1[0], p2[1] - p1[1])
    # 2D cross product: tw_x * mot_y - tw_y * mot_x
    cross = tw_vec[0] * motion_vec[1] - tw_vec[1] * motion_vec[0]
    return "INBOUND_BORDER" if cross > 0 else "OUTBOUND_BORDER"


class Zone:
    """Represents a virtual tripwire or restricted polygon zone in a camera's field of view."""

    def __init__(
        self,
        zone_id: str,
        name: str,
        zone_type: Union[ZoneType, str],
        points: List[Tuple[float, float]],
        restricted_classes: Optional[List[str]] = None,
        severity: str = "CRITICAL",
        loitering_time_sec: float = 5.0,
        allowed_direction: Optional[str] = None,
    ):
        """
        Args:
            zone_id: Unique zone identifier (e.g., 'zone_north_fence_01').
            name: Human-friendly name (e.g., 'North Border Perimeter Fence').
            zone_type: ZoneType.RESTRICTED_POLYGON, TRIPWIRE, or CAUTION_ZONE.
            points: List of (x, y) coordinates defining polygon or tripwire line segment.
            restricted_classes: Specific classes restricted in this zone (e.g. ['person', 'car']). None = all.
            severity: 'INFO', 'WARNING', or 'CRITICAL'.
            loitering_time_sec: Threshold in seconds to trigger a loitering alert.
            allowed_direction: If set for tripwire ('INBOUND_BORDER' / 'OUTBOUND_BORDER'), alerts on violation.
        """
        self.zone_id = zone_id
        self.name = name
        self.zone_type = ZoneType(zone_type)
        self.points = points
        self.restricted_classes = [c.lower() for c in restricted_classes] if restricted_classes else []
        self.severity = severity
        self.loitering_time_sec = loitering_time_sec
        self.allowed_direction = allowed_direction

        # Polygon contour for OpenCV pointPolygonTest
        self.np_points = np.array(points, dtype=np.int32).reshape((-1, 1, 2))

    def contains_point(self, point: Tuple[float, float]) -> bool:
        """Returns True if (cx, cy) is inside the polygon zone (for polygon/caution types)."""
        if self.zone_type == ZoneType.TRIPWIRE:
            return False
        dist = cv2.pointPolygonTest(self.np_points, (float(point[0]), float(point[1])), False)
        return dist >= 0

    def check_tripwire_crossing(
        self,
        prev_point: Tuple[float, float],
        curr_point: Tuple[float, float],
    ) -> Tuple[bool, Optional[str]]:
        """
        Checks if the trajectory segment (prev_point -> curr_point) crosses this tripwire.
        Returns: (crossed: bool, direction: str)
        """
        if self.zone_type != ZoneType.TRIPWIRE or len(self.points) < 2:
            return False, None

        tw_p1 = self.points[0]
        tw_p2 = self.points[1]

        crossed, _ = line_intersection(prev_point, curr_point, tw_p1, tw_p2)
        if not crossed:
            return False, None

        direction = compute_crossing_direction(prev_point, curr_point, tw_p1, tw_p2)
        return True, direction

    def is_class_restricted(self, class_name: str) -> bool:
        """Returns True if the target class is restricted in this zone."""
        if not self.restricted_classes:
            return True  # All classes restricted by default
        return class_name.lower() in self.restricted_classes

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
    """Manages virtual zones and tripwires for one or multiple cameras."""

    def __init__(self, config_path: Optional[str] = None):
        # camera_id -> Dict[zone_id, Zone]
        self.camera_zones: Dict[str, Dict[str, Zone]] = {}
        if config_path and os.path.exists(config_path):
            self.load_from_json(config_path)

    def add_zone(self, arg1: Any, arg2: Optional[Any] = None, camera_id: Optional[str] = None):
        """
        Adds a zone to the manager. Supports both add_zone(camera_id, zone) and add_zone(zone, camera_id=...).
        """
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
        """
        Renders zones and tripwires onto the frame with translucent fills and labels.
        """
        zones = self.get_zones(camera_id)
        if not zones:
            return frame

        overlay = frame.copy()
        annotated = frame.copy()

        for zone in zones:
            if zone.zone_type == ZoneType.RESTRICTED_POLYGON:
                color = (0, 0, 220)  # Solid red
                cv2.fillPoly(overlay, [zone.np_points], color)
                cv2.polylines(annotated, [zone.np_points], isClosed=True, color=(0, 0, 255), thickness=2)
                # Label at first point
                lx, ly = int(zone.points[0][0]), int(zone.points[0][1])
                cv2.putText(annotated, f"RESTRICTED: {zone.name}", (lx, max(20, ly - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2, cv2.LINE_AA)

            elif zone.zone_type == ZoneType.CAUTION_ZONE:
                color = (0, 200, 255)  # Amber / Yellow
                cv2.fillPoly(overlay, [zone.np_points], color)
                cv2.polylines(annotated, [zone.np_points], isClosed=True, color=(0, 220, 255), thickness=2)
                lx, ly = int(zone.points[0][0]), int(zone.points[0][1])
                cv2.putText(annotated, f"CAUTION: {zone.name}", (lx, max(20, ly - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 220, 255), 2, cv2.LINE_AA)

            elif zone.zone_type == ZoneType.TRIPWIRE:
                p1 = (int(zone.points[0][0]), int(zone.points[0][1]))
                p2 = (int(zone.points[1][0]), int(zone.points[1][1]))
                # Glowing cyan tripwire line with marker endpoints
                cv2.line(annotated, p1, p2, (255, 255, 0), 2, cv2.LINE_AA)
                cv2.circle(annotated, p1, 5, (0, 255, 255), -1)
                cv2.circle(annotated, p2, 5, (0, 255, 255), -1)
                # Midpoint label
                mx = int((p1[0] + p2[0]) / 2)
                my = int((p1[1] + p2[1]) / 2)
                cv2.putText(annotated, f"TRIPWIRE: {zone.name}", (mx, max(20, my - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 0), 1, cv2.LINE_AA)

        # Blend translucent fills
        cv2.addWeighted(overlay, 0.25, annotated, 0.75, 0, annotated)
        return annotated

    def save_to_json(self, file_path: str):
        data = {}
        for cam_id, zones in self.camera_zones.items():
            data[cam_id] = [z.to_dict() for z in zones.values()]
        os.makedirs(os.path.dirname(file_path) or ".", exist_ok=True)
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
        print(f"[IBVAP ZoneManager] Saved zones configuration to: {file_path}")

    def load_from_json(self, file_path: str):
        with open(file_path, "r") as f:
            data = json.load(f)
        self.camera_zones.clear()
        for cam_id, zone_list in data.items():
            self.camera_zones[cam_id] = {}
            for z_dict in zone_list:
                zone = Zone.from_dict(z_dict)
                self.camera_zones[cam_id][zone.zone_id] = zone
        print(f"[IBVAP ZoneManager] Loaded zones configuration from: {file_path}")
