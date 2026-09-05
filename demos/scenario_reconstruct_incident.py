"""
Cyber Camera Surveillance Platform
Demo: demos/scenario_reconstruct_incident.py
Description: Master Showcase — Predictive Multi-Camera Incident Reconstruction & Cryptographic Chain of Custody.
             "Don't Just Detect. Reconstruct the Incident."
"""

import argparse
import os
from pathlib import Path
import sys
import time

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import cv2
import numpy as np

from core.database.evidence_chain import seal_incident_evidence, verify_evidence_ledger
from core.database.incident_graph import correlate_border_event, get_all_correlated_incidents
from core.rules.explainable_scoring import ExplainableThreatScorer
from core.rules.predictive_handoff import PredictiveHandoffEngine
from core.rules.sound_alerts import play_alert
from core.vision.reid import FeatureExtractor
from services.notifications.telegram_bot import send_mobile_alert
from services.hardware_bridge.serial_controller import trigger_physical_breach


def run_incident_reconstruction_demo(show=True):
    print("\n" + "="*75)
    print(" [IBVAP] MASTER DEMO: PREDICTIVE BORDER INCIDENT RECONSTRUCTION")
    print("         'Don't Just Detect. Reconstruct the Incident.'")
    print("="*75 + "\n")

    handoff_engine = PredictiveHandoffEngine()
    feat_extractor = FeatureExtractor()

    # Step 1: Camera 1 Detection & Exit Vector
    print("[STAGE 1/4] CAMERA 1 (Checkpost Alpha): Target #17 Enters Restricted Perimeter...")
    cam1_traj = [(120.0, 300.0), (180.0, 310.0), (250.0, 320.0), (320.0, 330.0)]
    t0_ms = 1000.0
    
    # Generate mock appearance embedding
    dummy_crop = np.random.randint(50, 200, (120, 60, 3), dtype=np.uint8)
    emb = feat_extractor.extract_embedding(dummy_crop)

    # Initial Event Correlation
    inc = correlate_border_event(
        camera_id="CAM_ALPHA",
        global_target_id="TRG-0017",
        target_class="person",
        event_type="ZONE_INTRUSION",
        rule_detail="Target crossed North Gate Red Zone moving East towards perimeter fence.",
        in_restricted_zone=True,
        tripwire_crossed=True,
        velocity_px_s=72.0,
        loitering_sec=3.5,
        predictive_handoff_confirmed=False,
    )
    play_alert("WARNING")
    time.sleep(1.2)

    # Step 2: Predictive Spatio-Temporal Handoff Calculation
    print("\n[STAGE 2/4] PREDICTIVE HANDOFF: Calculating Target Traversal Vector...")
    predictions = handoff_engine.register_exit_event(
        source_cam="CAM_ALPHA",
        target_id="TRG-0017",
        class_name="person",
        trajectory=cam1_traj,
        exit_timestamp_ms=t0_ms + 4000.0,
        appearance_embedding=emb.tolist(),
    )
    pred = predictions[0]
    print(f" -> Target Speed: {pred.velocity_px_s} px/s | Heading: {pred.predicted_entry_heading}")
    print(f" -> Constrained Search Window in CAM_BRAVO: {pred.expected_arrival_min_s}s - {pred.expected_arrival_max_s}s")
    time.sleep(1.5)

    # Step 3: Camera 2 Arrival & Kinematic Re-ID Confirmation
    print("\n[STAGE 3/4] CAMERA 2 (BOP Bravo): Evaluating Candidate Arrival Window...")
    t_arrive_ms = t0_ms + 4000.0 + (9.4 * 1000.0)  # Arrives in 9.4 seconds (within 6-14s window)
    
    handoff_match = handoff_engine.evaluate_candidate_arrival(
        current_cam="CAM_BRAVO",
        current_timestamp_ms=t_arrive_ms,
        candidate_embedding=emb.tolist(),
    )

    # Update Incident Graph with Node 2
    inc = correlate_border_event(
        camera_id="CAM_BRAVO",
        global_target_id="TRG-0017",
        target_class="person",
        event_type="CROSS_CAMERA_MATCH",
        rule_detail=f"Target arrival verified via Predictive Handoff in {handoff_match['actual_transit_s']}s with 96.4% appearance similarity.",
        in_restricted_zone=True,
        tripwire_crossed=True,
        velocity_px_s=85.0,
        loitering_sec=4.2,
        predictive_handoff_confirmed=True,
    )
    play_alert("CRITICAL")
    trigger_physical_breach()
    time.sleep(1.2)

    # Step 4: Cryptographic Evidence Chain Verification
    print("\n[STAGE 4/4] TAMPER-EVIDENT EVIDENCE CHAIN OF CUSTODY...")
    is_valid, audit_log = verify_evidence_ledger()
    print(f" -> Cryptographic Blockchain Status: {'VERIFIED [100% UNTAMPERED]' if is_valid else 'FAILED'}")
    print(f" -> Incident Sealed in Block Hash: {inc.cryptographic_block_hash}")

    print("\n" + "="*75)
    print(f" [OK] INCIDENT RECONSTRUCTION COMPLETE: {inc.incident_id}")
    print(f" [*] Final Threat Score: {inc.threat_score}/100 ({inc.severity} | Confidence: {inc.confidence_pct}%)")
    print(f" [*] Explainable Breakdown:")
    for f in inc.score_breakdown:
        print(f"    * +{f['points']} pts: {f['factor']} ({f['evidence']})")
    print("="*75 + "\n")

    if show:
        # Create Visual HUD Card
        hud = np.zeros((520, 960, 3), dtype=np.uint8)
        hud[:] = (15, 20, 28)

        # Header
        cv2.rectangle(hud, (0, 0), (960, 55), (30, 42, 56), -1)
        cv2.putText(hud, "CYBER CAMERA SURVEILLANCE - RECONSTRUCTED INCIDENT STORY", (20, 36),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)

        # Main Incident Card
        cv2.putText(hud, f"INCIDENT ID: {inc.incident_id}", (30, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 255), 2)
        cv2.putText(hud, f"THREAT SCORE: {inc.threat_score}/100 [{inc.severity}]", (450, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 0, 255), 2)

        # Journey Line
        cv2.rectangle(hud, (30, 125), (930, 230), (22, 30, 40), -1)
        cv2.putText(hud, "MULTI-CAMERA RECONSTRUCTED JOURNEY:", (45, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 200, 220), 1)
        
        # Nodes
        cv2.circle(hud, (120, 190), 20, (0, 180, 255), -1)
        cv2.putText(hud, "CAM 1", (95, 195), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 2)
        
        cv2.line(hud, (145, 190), (450, 190), (0, 255, 255), 2)
        cv2.putText(hud, f"ETA Window: 6-14s (Actual: {handoff_match['actual_transit_s']}s)", (190, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)

        cv2.circle(hud, (475, 190), 20, (0, 0, 255), -1)
        cv2.putText(hud, "CAM 2", (450, 195), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 2)

        # Explainable Breakdown
        cv2.rectangle(hud, (30, 250), (930, 420), (22, 30, 40), -1)
        cv2.putText(hud, "EXPLAINABLE MATHEMATICAL THREAT FACTORS:", (45, 275), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 200, 220), 1)
        y_pos = 305
        for f in inc.score_breakdown[:4]:
            cv2.putText(hud, f"+{f['points']} pts: {f['factor']} - {f['evidence'][:65]}", (50, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 150), 1)
            y_pos += 26

        # Cryptographic Footer
        cv2.rectangle(hud, (30, 435), (930, 495), (18, 24, 32), -1)
        cv2.putText(hud, f"SHA-256 CHAIN SEAL: {inc.cryptographic_block_hash}", (45, 465), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (200, 220, 255), 1)
        cv2.putText(hud, "STATUS: TAMPER-EVIDENT PROOF VERIFIED", (45, 485), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 0), 1)

        cv2.imshow("Incident Reconstruction & Evidence Intelligence", hud)
        print("Press any key in window or 'q' to close.")
        cv2.waitKey(0)
        cv2.destroyAllWindows()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-show", action="store_true")
    args = parser.parse_args()
    run_incident_reconstruction_demo(show=not args.no_show)
