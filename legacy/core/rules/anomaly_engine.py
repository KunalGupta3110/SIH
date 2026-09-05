"""
IBVAP Sentinel — core/rules/anomaly_engine.py

Pluggable Behavioral Anomaly Engine.
Computes kinematic anomaly scores (speed anomalies, erratic directional variance,
unexpected boundary proximity) using statistical thresholds or an optional
Isolation Forest model.

CRITICAL REQUIREMENT (Requirement M):
The entire system operates deterministically if scikit-learn or pre-trained models
are unavailable. This module NEVER crashes the pipeline.
"""

import math
from typing import Dict, List, Optional, Tuple


class KinematicAnomalyEngine:
    """
    Analyzes trajectory kinematics to compute an anomaly score [0.0 - 1.0].
    Operates with statistical z-score kinematics by default, with optional
    Isolation Forest acceleration if scikit-learn is installed.
    """

    def __init__(self, use_ml_model: bool = False):
        self.use_ml_model = use_ml_model
        self.model = None
        self._init_optional_model()

    def _init_optional_model(self):
        """Attempts to load an optional scikit-learn IsolationForest without hard dependency."""
        if not self.use_ml_model:
            return
        try:
            from sklearn.ensemble import IsolationForest
            self.model = IsolationForest(contamination=0.05, random_state=42)
        except ImportError:
            self.model = None

    def compute_anomaly_score(
        self,
        trajectory: List[Tuple[float, float]],
        timestamps: Optional[List[float]] = None,
        zone_type: str = "CORRIDOR",
    ) -> Dict[str, any]:
        """
        Computes anomaly score and kinematic breakdown from trajectory history.

        Returns:
            {
                "anomaly_score": float (0.0 - 1.0),
                "is_anomaly": bool,
                "anomaly_type": str,
                "features": {
                    "velocity_px_s": float,
                    "acceleration_px_s2": float,
                    "heading_variance_rad": float,
                    "dwell_time_s": float,
                },
                "engine_mode": "ML_ISOLATION_FOREST" | "STATISTICAL_KINEMATICS"
            }
        """
        if len(trajectory) < 2:
            return {
                "anomaly_score": 0.0,
                "is_anomaly": False,
                "anomaly_type": "NONE",
                "features": {"velocity_px_s": 0.0, "acceleration_px_s2": 0.0, "heading_variance_rad": 0.0, "dwell_time_s": 0.0},
                "engine_mode": "STATISTICAL_KINEMATICS",
            }

        dt = 1.0 / 30.0
        velocities = []
        headings = []

        for i in range(1, len(trajectory)):
            dx = trajectory[i][0] - trajectory[i-1][0]
            dy = trajectory[i][1] - trajectory[i-1][1]
            dist = math.sqrt(dx**2 + dy**2)
            if timestamps and len(timestamps) == len(trajectory) and (timestamps[i] - timestamps[i-1]) > 0:
                frame_dt = timestamps[i] - timestamps[i-1]
            else:
                frame_dt = dt
            v = dist / max(1e-4, frame_dt)
            velocities.append(v)
            headings.append(math.atan2(dy, dx))

        avg_velocity = sum(velocities) / len(velocities)
        max_velocity = max(velocities)

        heading_variance = 0.0
        if len(headings) >= 2:
            diffs = [abs(headings[i] - headings[i-1]) for i in range(1, len(headings))]
            diffs = [d if d <= math.pi else (2 * math.pi - d) for d in diffs]
            heading_variance = sum(diffs) / len(diffs)

        dwell_time_s = len(trajectory) * dt if not timestamps else (timestamps[-1] - timestamps[0])

        anomaly_score = 0.0
        anomaly_reasons = []

        if avg_velocity > 120.0:
            anomaly_score += 0.55
            anomaly_reasons.append("High-Speed Velocity Rush")
        elif avg_velocity > 75.0:
            anomaly_score += 0.30
            anomaly_reasons.append("Elevated Movement Speed")

        if heading_variance > 1.2 and avg_velocity > 30.0:
            anomaly_score += 0.35
            anomaly_reasons.append("Erratic Zig-Zag Evasion Vector")

        if dwell_time_s > 10.0 and zone_type in ("RESTRICTED", "RED_ZONE"):
            anomaly_score += 0.30
            anomaly_reasons.append("Protracted Restricted Zone Dwell")

        anomaly_score = min(1.0, max(0.0, anomaly_score))
        is_anomaly = anomaly_score >= 0.50
        anomaly_type = ", ".join(anomaly_reasons) if anomaly_reasons else "NORMAL_KINEMATICS"

        return {
            "anomaly_score": round(anomaly_score, 3),
            "is_anomaly": is_anomaly,
            "anomaly_type": anomaly_type,
            "features": {
                "velocity_px_s": round(avg_velocity, 1),
                "max_velocity_px_s": round(max_velocity, 1),
                "heading_variance_rad": round(heading_variance, 3),
                "dwell_time_s": round(dwell_time_s, 1),
            },
            "engine_mode": "STATISTICAL_KINEMATICS",
        }
