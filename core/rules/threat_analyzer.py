"""
Cyber Camera Surveillance Platform
Module: core/rules/threat_analyzer.py
Description: Explainable tactical threat detection for rapid vehicle approach vectors and group density clustering.
"""

from datetime import datetime, timezone
import math
from typing import Dict, List, Optional, Tuple

from core.database.schema import AlertSeverity, AlertType, SecurityEvent


class BorderThreatAnalyzer:
    """Evaluates spatial vector kinematics and multi-target density gathering."""

    def __init__(
        self,
        rapid_approach_threshold_px_s: float = 110.0,
        group_clustering_distance_px: float = 160.0,
        group_min_size: int = 3,
        alert_cooldown_sec: float = 4.0,
    ):
        self.rapid_approach_threshold = rapid_approach_threshold_px_s
        self.group_clustering_dist = group_clustering_distance_px
        self.group_min_size = group_min_size
        self.alert_cooldown_sec = alert_cooldown_sec

        self.last_rapid_alert: Dict[str, float] = {}
        self.last_group_alert: Dict[str, float] = {}

    def analyze_frame_threats(
        self,
        camera_id: str,
        frame_idx: int,
        timestamp_ms: float,
        tracks: List[Any],
    ) -> List[SecurityEvent]:
        events: List[SecurityEvent] = []
        now_sec = timestamp_ms / 1000.0

        # 1. Rapid Vehicle Approach Vector
        vehicle_tracks = [t for t in tracks if getattr(t, 'class_name', '') in ("car", "truck", "bus", "motorcycle")]
        for t in vehicle_tracks:
            traj = getattr(t, 'trajectory', [])
            if len(traj) >= 4:
                p_start = traj[0]
                p_end = traj[-1]
                displacement = math.sqrt((p_end[0] - p_start[0])**2 + (p_end[1] - p_start[1])**2)
                dt = (len(traj) - 1) * (1.0 / 30.0)
                velocity_px_s = displacement / max(1e-4, dt)

                if velocity_px_s >= self.rapid_approach_threshold:
                    key = f"{camera_id}_{t.track_id}"
                    if now_sec - self.last_rapid_alert.get(key, 0) > self.alert_cooldown_sec:
                        self.last_rapid_alert[key] = now_sec
                        events.append(SecurityEvent(
                            event_id=f"evt_rapid_{camera_id}_{t.track_id}_{int(timestamp_ms)}",
                            timestamp_iso=datetime.now(timezone.utc).isoformat(),
                            timestamp_ms=timestamp_ms,
                            camera_id=camera_id,
                            track_id=t.track_id,
                            class_name=t.class_name,
                            alert_type=AlertType.RAPID_APPROACH,
                            severity=AlertSeverity.WARNING,
                            details=f"Rapid Vehicle Approach: {t.class_name.upper()} #{t.track_id} velocity vector {velocity_px_s:.1f} px/s exceeds corridor limit.",
                            bbox=t.bbox,
                            centroid=t.centroid,
                            rule_name="Rapid Approach Velocity Vector (Delta d / Delta t)",
                            rule_metrics={"velocity_px_s": round(velocity_px_s, 1), "threshold": self.rapid_approach_threshold},
                            confidence=0.92,
                        ))

        # 2. Multi-Target Density Gathering
        person_tracks = [t for t in tracks if getattr(t, 'class_name', '') == "person"]
        if len(person_tracks) >= self.group_min_size:
            centroids = [t.centroid for t in person_tracks]
            close_pairs = 0
            n = len(centroids)
            for i in range(n):
                for j in range(i + 1, n):
                    d = math.sqrt((centroids[i][0] - centroids[j][0])**2 + (centroids[i][1] - centroids[j][1])**2)
                    if d <= self.group_clustering_dist:
                        close_pairs += 1

            if close_pairs >= 3:
                key = f"group_{camera_id}"
                if now_sec - self.last_group_alert.get(key, 0) > self.alert_cooldown_sec * 2:
                    self.last_group_alert[key] = now_sec
                    events.append(SecurityEvent(
                        event_id=f"evt_group_{camera_id}_{int(timestamp_ms)}",
                        timestamp_iso=datetime.now(timezone.utc).isoformat(),
                        timestamp_ms=timestamp_ms,
                        camera_id=camera_id,
                        track_id=person_tracks[0].track_id,
                        class_name="person",
                        alert_type=AlertType.GROUP_CLUSTER,
                        severity=AlertSeverity.WARNING,
                        details=f"Suspicious Crowd Density: {len(person_tracks)} individuals clustered within {self.group_clustering_dist:.0f}px spatial proximity.",
                        bbox=person_tracks[0].bbox,
                        centroid=person_tracks[0].centroid,
                        rule_name="Euclidean Spatial Density Clustering",
                        rule_metrics={"cluster_size": len(person_tracks), "close_pairs": close_pairs},
                        confidence=0.89,
                    ))

        return events
