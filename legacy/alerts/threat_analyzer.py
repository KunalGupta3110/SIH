"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/threat_analyzer.py
Description: Tactical Behavioral Rule Engine for Border Security.
             Evaluates relative motion anomalies and group density patterns:
             1. Rapid Approach Flag: Accelerating velocity vector towards checkpost/barrier.
             2. Group Clustering: Multi-target assembly/density anomaly near perimeter.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
import math
import os
from pathlib import Path
import sys
import time
from typing import Any, Dict, List, Optional, Set, Tuple

# Ensure project root in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import numpy as np

from alerts.schema import AlertSeverity, AlertType, SecurityEvent
from detection_tracking.track import TrackedObject


class BorderThreatAnalyzer:
    """
    Evaluates tracking data for defensible behavioral indicators and group anomalies.
    """

    def __init__(
        self,
        group_distance_px: float = 160.0,
        group_min_people: int = 3,
        rapid_approach_displacement_thresh: float = 110.0,
        cooldown_sec: float = 2.5,
    ):
        """
        Args:
            group_distance_px: Maximum pixel distance to declare targets clustered.
            group_min_people: Minimum targets in cluster to flag group assembly.
            rapid_approach_displacement_thresh: Pixel displacement per second threshold towards barrier.
            cooldown_sec: Debounce period between alerts.
        """
        self.group_dist_thresh = group_distance_px
        self.group_min_count = group_min_people
        self.rapid_approach_thresh = rapid_approach_displacement_thresh
        self.cooldown_ms = cooldown_sec * 1000.0

        # threat_key -> last_alert_time_ms
        self.threat_cooldowns: Dict[str, float] = {}

    def analyze_frame_threats(
        self,
        camera_id: str,
        frame_idx: int,
        timestamp_ms: float,
        tracks: List[TrackedObject],
    ) -> List[SecurityEvent]:
        """
        Evaluates active tracks for relative approach velocity and group clustering.
        """
        triggered_events: List[SecurityEvent] = []

        person_tracks = [t for t in tracks if t.class_name.lower() in ("person", "pedestrian")]
        vehicle_tracks = [t for t in tracks if t.class_name.lower() in ("car", "truck", "bus", "motorcycle", "vehicle")]

        # =========================================================================
        # 1. GROUP CLUSTERING / ASSEMBLY PATTERN
        # =========================================================================
        if len(person_tracks) >= self.group_min_count:
            clusters: List[List[TrackedObject]] = []
            visited = set()

            for i, p1 in enumerate(person_tracks):
                if i in visited:
                    continue
                current_cluster = [p1]
                visited.add(i)

                for j, p2 in enumerate(person_tracks):
                    if j in visited:
                        continue
                    dist = math.hypot(p1.centroid[0] - p2.centroid[0], p1.centroid[1] - p2.centroid[1])
                    if dist <= self.group_dist_thresh:
                        current_cluster.append(p2)
                        visited.add(j)

                if len(current_cluster) >= self.group_min_count:
                    clusters.append(current_cluster)

            for cluster in clusters:
                group_ids = [m.track_id for m in cluster]
                threat_key = f"group_{camera_id}_{min(group_ids)}"
                if (timestamp_ms - self.threat_cooldowns.get(threat_key, 0.0)) > self.cooldown_ms:
                    self.threat_cooldowns[threat_key] = timestamp_ms

                    avg_cx = sum(m.centroid[0] for m in cluster) / len(cluster)
                    avg_cy = sum(m.centroid[1] for m in cluster) / len(cluster)
                    min_x = min(m.bbox[0] for m in cluster)
                    min_y = min(m.bbox[1] for m in cluster)
                    max_x = max(m.bbox[2] for m in cluster)
                    max_y = max(m.bbox[3] for m in cluster)

                    event_id = f"evt_group_{camera_id}_{int(timestamp_ms)}"
                    details = (
                        f"Group Assembly Anomaly: {len(cluster)} persons clustered in close proximity (IDs: {group_ids})."
                    )
                    ev = SecurityEvent(
                        event_id=event_id,
                        timestamp_iso=datetime.now(timezone.utc).isoformat(),
                        timestamp_ms=timestamp_ms,
                        camera_id=camera_id,
                        track_id=group_ids[0],
                        class_name="group",
                        alert_type=AlertType.GROUP_CLUSTER,
                        severity=AlertSeverity.WARNING,
                        zone_id="group_cluster",
                        zone_name="Perimeter Assembly Check",
                        details=details,
                        bbox=[min_x, min_y, max_x, max_y],
                        centroid=(avg_cx, avg_cy),
                        rule_name="Euclidean Spatial Density Clustering",
                        rule_metrics={
                            "cluster_size": len(cluster),
                            "inter_target_distance_px": round(self.group_dist_thresh, 1),
                            "member_track_ids": group_ids,
                        },
                        confidence=0.88,
                    )
                    triggered_events.append(ev)

        # =========================================================================
        # 2. RAPID APPROACH VECTOR (RELATIVE VELOCITY ESTIMATION)
        # Note: Relative pixel displacement rate towards barrier (not absolute calibrated km/h)
        # =========================================================================
        for v in vehicle_tracks:
            if len(v.trajectory) >= 3:
                p_old = v.trajectory[0]
                p_new = v.trajectory[-1]
                steps = max(1, len(v.trajectory) - 1)
                dt = steps * (1.0 / 30.0)
                displacement_px = math.hypot(p_new[0] - p_old[0], p_new[1] - p_old[1])
                relative_rate = displacement_px / max(0.01, dt)

                if relative_rate >= self.rapid_approach_thresh:
                    threat_key = f"rush_{camera_id}_{v.track_id}"
                    if (timestamp_ms - self.threat_cooldowns.get(threat_key, 0.0)) > self.cooldown_ms:
                        self.threat_cooldowns[threat_key] = timestamp_ms

                        event_id = f"evt_rush_{camera_id}_{v.track_id}_{int(timestamp_ms)}"
                        details = (
                            f"Rapid Approach Flag: {v.class_name.upper()} (Track #{v.track_id}) approaching barrier "
                            f"at high relative displacement rate ({relative_rate:.1f} px/s)."
                        )
                        ev = SecurityEvent(
                            event_id=event_id,
                            timestamp_iso=datetime.now(timezone.utc).isoformat(),
                            timestamp_ms=timestamp_ms,
                            camera_id=camera_id,
                            track_id=v.track_id,
                            class_name=v.class_name,
                            alert_type=AlertType.RAPID_APPROACH,
                            severity=AlertSeverity.WARNING,
                            zone_id="checkpoint_approach",
                            zone_name="Checkpoint Approach Vector",
                            details=details,
                            bbox=v.bbox,
                            centroid=v.centroid,
                            rule_name="Relative Trajectory Velocity Vector",
                            rule_metrics={
                                "relative_rate_px_s": round(relative_rate, 1),
                                "threshold_px_s": self.rapid_approach_thresh,
                                "trajectory_points": len(v.trajectory),
                            },
                            confidence=0.90,
                        )
                        triggered_events.append(ev)

        return triggered_events
