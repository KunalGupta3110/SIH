"""
Cyber Camera Surveillance Platform
Module: core/rules/explainable_scoring.py
Description: NOVELTY 3 — Explainable Threat Scoring Matrix.
             Computes transparent mathematical threat scores [0-100] with factorized evidence breakdowns.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class ThreatFactor:
    factor_name: str
    weight_points: int
    evidence: str
    triggered: bool


class ExplainableThreatScorer:
    """
    Computes a transparent, defensible threat score between 0 and 100 based on weighted kinematic
    and spatial rules, completely eliminating opaque black-box AI decisions.
    """

    def calculate_score(
        self,
        in_restricted_zone: bool = False,
        tripwire_crossed: bool = False,
        velocity_px_s: float = 0.0,
        loitering_sec: float = 0.0,
        predictive_handoff_confirmed: bool = False,
        is_night_time: bool = False,
        reid_similarity: float = 0.0,
        target_class: str = "person",
    ) -> Dict[str, Any]:
        factors: List[ThreatFactor] = []
        score = 0

        # Factor 1: Restricted Red Zone Containment (+30 pts)
        if in_restricted_zone:
            score += 30
            factors.append(ThreatFactor("Restricted Red Zone Penetration", 30, "Target centroid within polygon geofence barrier.", True))
        else:
            factors.append(ThreatFactor("Restricted Red Zone Penetration", 30, "None", False))

        # Factor 2: Virtual Directional Tripwire (+25 pts)
        if tripwire_crossed:
            score += 25
            factors.append(ThreatFactor("Perimeter Tripwire Incursion", 25, "Target crossed 2D perimeter vector from outer buffer.", True))
        else:
            factors.append(ThreatFactor("Perimeter Tripwire Incursion", 25, "None", False))

        # Factor 3: Rapid Velocity Approach (+20 pts)
        if velocity_px_s >= 90.0:
            score += 20
            factors.append(ThreatFactor("Rapid Approach Vector", 20, f"Kinematic velocity {velocity_px_s:.1f} px/s exceeds perimeter threshold (90 px/s).", True))
        elif velocity_px_s >= 50.0:
            score += 10
            factors.append(ThreatFactor("Moderate Approach Vector", 10, f"Kinematic velocity {velocity_px_s:.1f} px/s.", True))
        else:
            factors.append(ThreatFactor("Rapid Approach Vector", 20, "Normal pedestrian speed", False))

        # Factor 4: Loitering Dwell Time (+15 pts)
        if loitering_sec >= 3.0:
            score += 15
            factors.append(ThreatFactor("Static Loitering Dwell Time", 15, f"Target stationary in caution corridor for {loitering_sec:.1f}s (threshold 3.0s).", True))
        else:
            factors.append(ThreatFactor("Static Loitering Dwell Time", 15, "No loitering detected", False))

        # Factor 5: Predictive Multi-Camera Handoff (+12 pts)
        if predictive_handoff_confirmed:
            score += 12
            factors.append(ThreatFactor("Predictive Multi-Camera Continuity", 12, "Target successfully linked across nodes via spatio-temporal transit prediction.", True))
        else:
            factors.append(ThreatFactor("Predictive Multi-Camera Continuity", 12, "Single camera observation", False))

        # Factor 6: Unusual Night Hours (+10 pts)
        if is_night_time:
            score += 10
            factors.append(ThreatFactor("Unusual Off-Hour Activity", 10, "Breach detected during high-risk night curfew window.", True))

        # Cap total score at 100
        final_score = min(100, max(15, score))

        # Severity classification
        if final_score >= 70:
            severity = "CRITICAL"
        elif final_score >= 40:
            severity = "WARNING"
        else:
            severity = "INFO"

        confidence_pct = min(98.0, 75.0 + (final_score * 0.22))

        return {
            "threat_score": final_score,
            "max_score": 100,
            "severity": severity,
            "confidence_pct": round(confidence_pct, 1),
            "triggered_factors": [
                {"factor": f.factor_name, "points": f.weight_points, "evidence": f.evidence}
                for f in factors if f.triggered
            ],
            "full_matrix": [
                {"factor": f.factor_name, "points": f.weight_points, "triggered": f.triggered, "evidence": f.evidence}
                for f in factors
            ],
        }
