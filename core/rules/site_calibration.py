"""
IBVAP Sentinel
Module: core/rules/site_calibration.py
Description: NOVELTY 5 — Site-Specific Operator False-Alarm Learning & Calibration Layer.
             Learns from operator feedback (wildlife, shadows, fog, vegetation) to suppress site false alarms.
"""

from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path
import sys
from typing import Dict, List, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

CALIBRATION_FILE = os.path.join(ROOT_DIR, "data", "site_alert_calibration.json")


@dataclass
class CameraSiteProfile:
    camera_id: str
    total_reviews: int = 0
    confirmed_threats: int = 0
    false_positives: int = 0
    reason_counts: Dict[str, int] = None
    min_confidence_filter: float = 0.25
    loitering_tolerance_sec: float = 3.0
    vegetation_filter_active: bool = False

    def __post_init__(self):
        if self.reason_counts is None:
            self.reason_counts = {"vegetation": 0, "animal": 0, "weather": 0, "camera_noise": 0, "other": 0}


class SiteAlertCalibrationEngine:
    """
    Suppresses recurring environmental false alarms through site-specific calibration rather
    than unrealistic global model retraining.
    """

    def __init__(self, config_path: str = CALIBRATION_FILE):
        self.config_path = config_path
        self.profiles: Dict[str, CameraSiteProfile] = {}
        self._load()

    def _load(self):
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r") as f:
                    data = json.load(f)
                    for cid, p in data.items():
                        self.profiles[cid] = CameraSiteProfile(**p)
            except Exception:
                pass

    def _save(self):
        os.makedirs(os.path.dirname(self.config_path) or ".", exist_ok=True)
        with open(self.config_path, "w") as f:
            json.dump({cid: asdict(p) for cid, p in self.profiles.items()}, f, indent=2)

    def get_profile(self, camera_id: str) -> CameraSiteProfile:
        if camera_id not in self.profiles:
            self.profiles[camera_id] = CameraSiteProfile(camera_id=camera_id)
        return self.profiles[camera_id]

    def record_operator_feedback(self, camera_id: str, is_confirmed: bool, false_reason: Optional[str] = None):
        prof = self.get_profile(camera_id)
        prof.total_reviews += 1

        if is_confirmed:
            prof.confirmed_threats += 1
        else:
            prof.false_positives += 1
            reason_key = (false_reason or "other").lower()
            if reason_key in prof.reason_counts:
                prof.reason_counts[reason_key] += 1
            else:
                prof.reason_counts["other"] += 1

            # Adaptive site calibration rules
            if prof.reason_counts["vegetation"] >= 3:
                prof.vegetation_filter_active = True
                prof.min_confidence_filter = 0.35
            if prof.reason_counts["animal"] >= 3:
                prof.loitering_tolerance_sec = 4.5

        self._save()
        print(f"🛠️ [SITE CALIBRATION] Updated profile for {camera_id} (FP: {prof.false_positives}/{prof.total_reviews} | Reasons: {prof.reason_counts})")

    def should_filter_detection(self, camera_id: str, confidence: float, class_name: str) -> bool:
        prof = self.get_profile(camera_id)
        if confidence < prof.min_confidence_filter:
            return True
        return False


_calibration_engine = SiteAlertCalibrationEngine()


def record_site_feedback(camera_id: str, is_confirmed: bool, false_reason: Optional[str] = None):
    _calibration_engine.record_operator_feedback(camera_id, is_confirmed, false_reason)


def get_site_profiles() -> Dict[str, Dict]:
    return {cid: asdict(p) for cid, p in _calibration_engine.profiles.items()}


def get_calibration_summary(camera_id: Optional[str] = None) -> Dict:
    """
    Aggregated dismissal-reason tallies for the operator triage sidebar.
    With no camera_id, sums every camera's profile; otherwise scoped to one.
    """
    profiles = (
        [_calibration_engine.get_profile(camera_id)]
        if camera_id
        else list(_calibration_engine.profiles.values())
    )
    by_reason: Dict[str, int] = {}
    total_dismissed = 0
    for prof in profiles:
        total_dismissed += prof.false_positives
        for reason, count in prof.reason_counts.items():
            by_reason[reason] = by_reason.get(reason, 0) + count

    if not by_reason:
        by_reason = {"vegetation": 0, "animal": 0, "weather": 0, "camera_noise": 0, "other": 0}

    return {"camera_id": camera_id, "total_dismissed": total_dismissed, "by_reason": by_reason}
