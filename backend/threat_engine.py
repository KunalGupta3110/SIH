"""
IBVAP Sentinel — backend/threat_engine.py

ONE job: turn a handful of yes/no facts about a target into a 0-100 threat
score, a severity label, and a plain-English list of *why*.

This is deliberately NOT a machine-learning model. It's a fixed rulebook —
the same input always gives the same output, and every point on the score
can be traced back to one named rule. That's the whole point: an operator
(or a judge) can ask "why did this get flagged?" and get a real answer.
"""

# Every rule and how many points it's worth. Change a number here and the
# whole scoring system updates — there's only one place this is defined.
RULE_POINTS = {
    "restricted_zone": 30,
    "moving_toward_border": 20,
    "loitering": 15,
    "cross_camera_reid": 12,
    "night_window": 10,
}

LOITERING_THRESHOLD_SECONDS = 240
NIGHT_START_HOUR_IST = 20   # 20:00
NIGHT_END_HOUR_IST = 5      # 05:00


def calculate_threat_score(
    in_restricted_zone: bool = False,
    moving_toward_border: bool = False,
    loitering_seconds: float = 0,
    cross_camera_reid_match: bool = False,
    hour_ist: int | None = None,
) -> dict:
    """
    Calculate an explainable threat score for one target.

    Each argument is one fact the edge AI reported about the target. Every
    fact that's true adds its fixed number of points — nothing here is
    learned or estimated.

    Returns:
        {
            "score": 0-100,
            "severity": "CRITICAL" | "WARNING" | "INFO",
            "factors": [ {"factor": name, "points": n, "reason": text}, ... ],
        }
    """
    factors = []

    if in_restricted_zone:
        factors.append({
            "factor": "Restricted Zone Penetration",
            "points": RULE_POINTS["restricted_zone"],
            "reason": "Target's position fell inside a marked red-zone polygon.",
        })

    if moving_toward_border:
        factors.append({
            "factor": "Movement Toward Border",
            "points": RULE_POINTS["moving_toward_border"],
            "reason": "Track heading points toward the international border line.",
        })

    if loitering_seconds and loitering_seconds > LOITERING_THRESHOLD_SECONDS:
        factors.append({
            "factor": f"Loitering >{LOITERING_THRESHOLD_SECONDS} seconds",
            "points": RULE_POINTS["loitering"],
            "reason": f"Target held roughly the same position for {int(loitering_seconds)}s.",
        })

    if cross_camera_reid_match:
        factors.append({
            "factor": "Cross-Camera Re-ID Match",
            "points": RULE_POINTS["cross_camera_reid"],
            "reason": "Appearance embedding matched a track seen on another camera.",
        })

    if hour_ist is not None and (hour_ist >= NIGHT_START_HOUR_IST or hour_ist < NIGHT_END_HOUR_IST):
        factors.append({
            "factor": "Night Window (20:00-05:00 IST)",
            "points": RULE_POINTS["night_window"],
            "reason": f"Event occurred at {hour_ist:02d}:00 IST, inside the low-visibility window.",
        })

    total_points = sum(f["points"] for f in factors)
    score = min(100, total_points)
    severity = severity_for_score(score)

    return {"score": score, "severity": severity, "factors": factors}


def severity_for_score(score: int) -> str:
    """70-100 CRITICAL, 40-69 WARNING, 0-39 INFO."""
    if score >= 70:
        return "CRITICAL"
    if score >= 40:
        return "WARNING"
    return "INFO"
