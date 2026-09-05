"""
IBVAP - Intelligent Border Video Analytics Platform
Module: data/seed_clean_demo_events.py
Description: Seeds clean, professional border security events into SQLite DB for dashboard presentation.
"""

from datetime import datetime, timezone
import os
from pathlib import Path
import sys
import time

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import cv2
import numpy as np
from alerts.events import EventDatabase
from alerts.schema import AlertSeverity, AlertType, OperatorStatus, SecurityEvent

def seed():
    db = EventDatabase("data/events.db")
    os.makedirs("data/thumbnails", exist_ok=True)

    # 1. Checkpost Vehicle ANPR Threat
    v_thumb = "data/thumbnails/evt_anpr_DL01AB1234.jpg"
    v_img = np.zeros((140, 220, 3), dtype=np.uint8)
    v_img[:, :] = [30, 35, 40]
    cv2.rectangle(v_img, (10, 10), (210, 130), (0, 0, 220), 2)
    cv2.putText(v_img, "DL-01-AB-1234", (25, 75), cv2.FONT_HERSHEY_DUPLEX, 0.65, (255, 255, 255), 2)
    cv2.imwrite(v_thumb, v_img)

    ev1 = SecurityEvent(
        event_id="evt_chk_dl01_001",
        timestamp_iso=datetime.now(timezone.utc).isoformat(),
        timestamp_ms=12000.0,
        camera_id="CAM_CHECKPOST",
        track_id=901,
        class_name="car",
        alert_type=AlertType.ZONE_INTRUSION,
        severity=AlertSeverity.CRITICAL,
        zone_id="checkpoint_restricted_core",
        zone_name="Checkpoint Restricted Red Zone",
        details="Optical License Plate Match: DL-01-AB-1234 matches intelligence watchlist (High-Risk Infiltration Vehicle).",
        bbox=[450, 300, 830, 580],
        centroid=(640, 440),
        rule_name="Optical Plate Recognition & Watchlist Database",
        rule_metrics={"plate_number": "DL-01-AB-1234", "threat_level": "CRITICAL"},
        confidence=0.96,
        operator_status=OperatorStatus.CONFIRMED,
        operator_notes="Confirmed breach by Operator. QRT Dispatched.",
        thumbnail_path=v_thumb,
    )
    db.insert_event(ev1)

    # 2. Checkpost Rapid Approach Warning
    ev2 = SecurityEvent(
        event_id="evt_chk_rapid_002",
        timestamp_iso=datetime.now(timezone.utc).isoformat(),
        timestamp_ms=8000.0,
        camera_id="CAM_CHECKPOST",
        track_id=901,
        class_name="car",
        alert_type=AlertType.RAPID_APPROACH,
        severity=AlertSeverity.WARNING,
        zone_id="approach_caution_corridor",
        zone_name="Long-Range Approach Corridor",
        details="Rapid vehicle acceleration detected towards barrier: 118.5 px/s (Threshold: 80 px/s).",
        bbox=[520, 200, 760, 380],
        centroid=(640, 290),
        rule_name="Velocity Vector Acceleration Rate",
        rule_metrics={"rate_px_s": 118.5, "threshold": 80.0},
        confidence=0.92,
        operator_status=OperatorStatus.CONFIRMED,
        thumbnail_path=v_thumb,
    )
    db.insert_event(ev2)

    # 3. Cross-Camera Re-ID Match
    reid_thumb = "data/thumbnails/evt_reid_trg002.jpg"
    r_img = np.zeros((140, 140, 3), dtype=np.uint8)
    r_img[:, :] = [25, 30, 45]
    cv2.circle(r_img, (70, 50), 25, (180, 180, 180), -1)
    cv2.rectangle(r_img, (40, 80), (100, 135), (200, 150, 40), -1)
    cv2.imwrite(reid_thumb, r_img)

    ev3 = SecurityEvent(
        event_id="evt_reid_match_003",
        timestamp_iso=datetime.now(timezone.utc).isoformat(),
        timestamp_ms=16000.0,
        camera_id="CAM_BRAVO",
        track_id=2,
        class_name="person",
        alert_type=AlertType.CROSS_CAMERA_MATCH,
        severity=AlertSeverity.INFO,
        zone_id="bop_bravo_perimeter",
        zone_name="BOP Bravo Outer Perimeter",
        details="Cross-Camera Re-ID match: Target TRG-0002 re-identified on CAM_BRAVO (Cosine Similarity: 98.4%).",
        bbox=[300, 150, 450, 500],
        centroid=(375, 325),
        rule_name="ResNet18 512-D Appearance Embedding Cosine Similarity",
        rule_metrics={"cosine_similarity": 0.984, "threshold": 0.70},
        confidence=0.98,
        operator_status=OperatorStatus.CONFIRMED,
        thumbnail_path=reid_thumb,
    )
    db.insert_event(ev3)

    print("[IBVAP] Seeded clean professional border threat demo events.")

if __name__ == "__main__":
    seed()
