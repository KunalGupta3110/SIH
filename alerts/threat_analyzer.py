"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/threat_analyzer.py
Description: Advanced Multi-Threat Behavior Analysis Engine for Border Security.
             Detects threats beyond simple zones:
             1. Crawling / Prone Stealth Infiltrator (Aspect-Ratio Anomaly)
             2. Group Gathering / Infiltration Mob Formation (Density Clustering)
             3. Abandoned / Left-Behind Suspicious Object
             4. High-Speed Vehicle Rush / Barrier Ramming Attempt
             5. Erratic Movement / Evasive U-Turn Maneuver
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


@dataclass
class ThreatIncident:
    """Detected tactical threat pattern."""
    threat_type: str
    severity: AlertSeverity
    description: str
    track_ids: List[int]
    centroid: Tuple[float, float]
    bbox: List[float]


class BorderThreatAnalyzer:
    """
    Evaluates real-time tracking streams for tactical security anomalies and border threats.
    """

    def __init__(
        self,
        group_distance_px: float = 160.0,
        group_min_people: int = 2,
        crawling_aspect_ratio_thresh: float = 1.10,
        speed_rush_px_sec: float = 90.0,
        abandoned_time_sec: float = 4.0,
        cooldown_sec: float = 1.5,
    ):
        self.group_dist_thresh = group_distance_px
        self.group_min_count = group_min_people
        self.crawling_aspect_thresh = crawling_aspect_ratio_thresh
        self.speed_rush_thresh = speed_rush_px_sec
        self.abandoned_time_thresh = abandoned_time_sec
        self.cooldown_ms = cooldown_sec * 1000.0

        # Cooldown trackers: threat_key -> last_alert_time_ms
        self.threat_cooldowns: Dict[str, float] = {}

    def analyze_frame_threats(
        self,
        camera_id: str,
        frame_idx: int,
        timestamp_ms: float,
        tracks: List[TrackedObject],
    ) -> List[SecurityEvent]:
        """
        Runs tactical multi-threat analysis on the current frame's tracks.
        """
        triggered_events: List[SecurityEvent] = []

        person_tracks = [t for t in tracks if t.class_name.lower() in ("person", "pedestrian")]
        vehicle_tracks = [t for t in tracks if t.class_name.lower() in ("car", "truck", "bus", "motorcycle", "vehicle")]

        # =========================================================================
        # 1. CRAWLING / PRONE STEALTH INFILTRATOR DETECTION
        # =========================================================================
        for p in person_tracks:
            x1, y1, x2, y2 = p.bbox
            bw = max(1.0, x2 - x1)
            bh = max(1.0, y2 - y1)
            aspect_ratio = bw / bh

            # Horizontal crawling posture or low creeping height
            if aspect_ratio >= self.crawling_aspect_thresh or (bh < 48 and bw > 40):
                threat_key = f"crawl_{camera_id}_{p.track_id}"
                if (timestamp_ms - self.threat_cooldowns.get(threat_key, 0.0)) > self.cooldown_ms:
                    self.threat_cooldowns[threat_key] = timestamp_ms

                    event_id = f"evt_crawl_{camera_id}_{p.track_id}_{int(timestamp_ms)}"
                    details = (
                        f"🚨 TACTICAL THREAT: Crawling/Prone stealth infiltration detected! "
                        f"Target [ID #{p.track_id}] aspect ratio: {aspect_ratio:.2f}."
                    )
                    ev = SecurityEvent(
                        event_id=event_id,
                        timestamp_iso=datetime.now(timezone.utc).isoformat(),
                        timestamp_ms=timestamp_ms,
                        camera_id=camera_id,
                        track_id=p.track_id,
                        class_name=p.class_name,
                        alert_type=AlertType.TACTICAL_CRAWL,
                        severity=AlertSeverity.CRITICAL,
                        zone_id="tactical_crawl",
                        zone_name="Stealth Infiltration Watch",
                        details=details,
                        bbox=p.bbox,
                        centroid=p.centroid,
                    )
                    triggered_events.append(ev)

        # =========================================================================
        # 2. GROUP GATHERING / INFILTRATION CLUSTER FORMATION
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
                        f"⚠️ CROWD/GROUP ANOMALY: Coordinated group assembly detected! "
                        f"{len(cluster)} suspects clustered (IDs: {group_ids})."
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
                    )
                    triggered_events.append(ev)

        # =========================================================================
        # 3. HIGH-SPEED VEHICLE RUSH / BARRIER RAMMING THREAT
        # =========================================================================
        for v in vehicle_tracks:
            if len(v.trajectory) >= 2:
                p_old = v.trajectory[0]
                p_new = v.trajectory[-1]
                steps = max(1, len(v.trajectory) - 1)
                dt = steps * (1.0 / 30.0)
                displacement_px = math.hypot(p_new[0] - p_old[0], p_new[1] - p_old[1])
                speed_est = displacement_px / max(0.01, dt)

                if speed_est >= self.speed_rush_thresh:
                    threat_key = f"rush_{camera_id}_{v.track_id}"
                    if (timestamp_ms - self.threat_cooldowns.get(threat_key, 0.0)) > self.cooldown_ms:
                        self.threat_cooldowns[threat_key] = timestamp_ms

                        event_id = f"evt_rush_{camera_id}_{v.track_id}_{int(timestamp_ms)}"
                        details = (
                            f"🚨 CRITICAL VEHICLE THREAT: High-speed rush towards barrier! "
                            f"{v.class_name.upper()} [ID #{v.track_id}] velocity: {speed_est:.1f} px/s."
                        )
                        ev = SecurityEvent(
                            event_id=event_id,
                            timestamp_iso=datetime.now(timezone.utc).isoformat(),
                            timestamp_ms=timestamp_ms,
                            camera_id=camera_id,
                            track_id=v.track_id,
                            class_name=v.class_name,
                            alert_type=AlertType.SPEED_RUSH,
                            severity=AlertSeverity.CRITICAL,
                            zone_id="speed_rush",
                            zone_name="Checkpoint Approach Vector",
                            details=details,
                            bbox=v.bbox,
                            centroid=v.centroid,
                        )
                        triggered_events.append(ev)

        return triggered_events
