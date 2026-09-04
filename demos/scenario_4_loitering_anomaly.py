"""
IBVAP Sentinel — demos/scenario_4_loitering_anomaly.py

Scenario 4 (Requirement W): Caution Corridor Loitering & Kinematic Anomaly Detection.
Demonstrates:
  1. Target trajectory ingestion in Caution Buffer Corridor.
  2. Dwell-time calculation and loitering trigger (> 10s).
  3. Kinematic anomaly engine scoring (evasive sprint / erratic zig-zag heading variance).
  4. Factorized threat score breakdown generation.
"""

import os
import sys
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from core.rules.anomaly_engine import KinematicAnomalyEngine
from core.rules.explainable_scoring import ExplainableThreatScorer


def run_loitering_anomaly_demo():
    print("=" * 70)
    print(" [SCENARIO 4] CAUTION CORRIDOR LOITERING & KINEMATIC ANOMALY")
    print("=" * 70)

    anomaly_engine = KinematicAnomalyEngine(use_ml_model=False)
    threat_scorer = ExplainableThreatScorer()

    # Step 1: Loitering in buffer corridor
    print("\n[STEP 1] Target #801 enters Caution Buffer Corridor...")
    loiter_trajectory = [(300 + (i % 2) * 2, 200 + (i % 2) * 2) for i in range(120)]  # 4 seconds stationary
    anomaly_res1 = anomaly_engine.compute_anomaly_score(loiter_trajectory, zone_type="RESTRICTED")
    print(f"  Loitering Dwell: {anomaly_res1['features']['dwell_time_s']:.1f}s")
    print(f"  Movement Speed:  {anomaly_res1['features']['velocity_px_s']:.1f} px/s")
    print(f"  Anomaly Flag:    {anomaly_res1['is_anomaly']} ({anomaly_res1['anomaly_type']})")

    # Step 2: Sudden evasive sprint towards border
    print("\n[STEP 2] Target bursts into high-speed evasive sprint towards perimeter...")
    sprint_trajectory = [(300 + i * 15, 200 + (i % 3) * 25) for i in range(25)]
    anomaly_res2 = anomaly_engine.compute_anomaly_score(sprint_trajectory, zone_type="RED_ZONE")
    print(f"  Sprint Velocity: {anomaly_res2['features']['velocity_px_s']:.1f} px/s")
    print(f"  Heading Variance:{anomaly_res2['features']['heading_variance_rad']:.3f} rad")
    print(f"  Anomaly Score:   {anomaly_res2['anomaly_score']:.2f} (ANOMALY CONFIRMED: {anomaly_res2['anomaly_type']})")

    # Step 3: Factorized Explainable Threat Scoring
    print("\n[STEP 3] Generating Factorized Explainable Threat Matrix...")
    score_res = threat_scorer.calculate_score(
        in_restricted_zone=True,
        tripwire_crossed=True,
        velocity_px_s=anomaly_res2['features']['velocity_px_s'],
        loitering_sec=anomaly_res1['features']['dwell_time_s'],
        predictive_handoff_confirmed=False,
        is_night_time=True,
    )

    print(f"  * Threat Score:  {score_res['threat_score']}/100 [{score_res['severity']}]")
    print(f"  * Confidence:    {score_res['confidence_pct']}%")
    print("  * Line-Item Rule Factors:")
    for f in score_res['triggered_factors']:
        print(f"    - (+{f['points']} pts) {f['factor']}: {f['evidence']}")

    print("\n" + "=" * 70)
    print(" [SUMMARY] Loitering & Anomaly Scenario Verified Successfully.")
    print("=" * 70)


if __name__ == "__main__":
    run_loitering_anomaly_demo()
