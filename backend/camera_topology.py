"""
IBVAP Sentinel — backend/camera_topology.py

Camera Node Graph Topology & Spatio-Temporal Transit Engine (Ported from legacy).
Defines real inter-camera edge distances, directions, and velocity-scaled transit ETA windows.
"""

from dataclasses import dataclass
import math
from typing import Dict, List, Optional, Tuple


@dataclass
class CameraNodeTopology:
    camera_id: str
    name: str
    location_desc: str
    # neighbor_cam_id -> {"min_transit_s": float, "max_transit_s": float, "distance_m": float, "exit_heading": str}
    neighbors: Dict[str, Dict[str, any]]


DEFAULT_TOPOLOGY: Dict[str, CameraNodeTopology] = {
    "CAM_ALPHA": CameraNodeTopology(
        camera_id="CAM_ALPHA",
        name="Checkpost Alpha Main Gate",
        location_desc="Northern Border Crossing Sector (Optical PTZ 4K)",
        neighbors={
            "CAM_BRAVO": {"min_transit_s": 6.0, "max_transit_s": 14.0, "distance_m": 26.3, "exit_heading": "EAST"},
            "CAM_DELTA": {"min_transit_s": 8.0, "max_transit_s": 18.0, "distance_m": 35.0, "exit_heading": "SOUTH"},
        },
    ),
    "CAM_BRAVO": CameraNodeTopology(
        camera_id="CAM_BRAVO",
        name="BOP Bravo Outer Perimeter",
        location_desc="Eastern Fenced Corridor (FLIR Thermal LWIR)",
        neighbors={
            "CAM_ALPHA": {"min_transit_s": 6.0, "max_transit_s": 14.0, "distance_m": 26.3, "exit_heading": "WEST"},
            "CAM_CHARLIE": {"min_transit_s": 10.0, "max_transit_s": 22.0, "distance_m": 48.0, "exit_heading": "EAST"},
        },
    ),
    "CAM_CHARLIE": CameraNodeTopology(
        camera_id="CAM_CHARLIE",
        name="Tower Charlie Thermal Pan",
        location_desc="Ridge Watchpoint 7 (Thermal IR)",
        neighbors={
            "CAM_BRAVO": {"min_transit_s": 10.0, "max_transit_s": 22.0, "distance_m": 48.0, "exit_heading": "WEST"},
        },
    ),
    "CAM_DELTA": CameraNodeTopology(
        camera_id="CAM_DELTA",
        name="Riverine Sentry Delta",
        location_desc="Creek Sector 2 (Day/Night Optical)",
        neighbors={
            "CAM_ALPHA": {"min_transit_s": 8.0, "max_transit_s": 18.0, "distance_m": 35.0, "exit_heading": "NORTH"},
        },
    ),
}


def get_transit_window(
    source_cam: str,
    target_cam: str,
    velocity_px_s: float = 60.0,
    topology: Optional[Dict[str, CameraNodeTopology]] = None,
) -> Optional[Tuple[float, float, Dict]]:
    """
    Returns (min_transit_s, max_transit_s, neighbor_metadata) for a pair of connected cameras,
    dynamically scaled by the target's kinematic velocity.
    """
    topo = topology or DEFAULT_TOPOLOGY
    source_node = topo.get(source_cam)
    if not source_node or target_cam not in source_node.neighbors:
        return None

    params = source_node.neighbors[target_cam]
    # Speed scaling factor (e.g. 60 px/s is standard walk = 1.0x factor)
    speed_factor = max(0.5, min(2.5, velocity_px_s / 60.0))
    min_transit = round(params["min_transit_s"] / speed_factor, 1)
    max_transit = round(params["max_transit_s"] / speed_factor, 1)

    return (min_transit, max_transit, params)
