"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/schema.py
Description: Shared data contracts, severity tiers, explainability metrics,
             operator review states, and incident event schemas.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple


class AlertSeverity(str, Enum):
    INFO = "INFO"          # Target in monitored non-restricted zone
    WARNING = "WARNING"    # Loitering, Rapid approach vector, Group cluster
    CRITICAL = "CRITICAL"  # Restricted zone incursion, Tripwire crossing, Flagged Re-ID match


class AlertType(str, Enum):
    ZONE_INTRUSION = "ZONE_INTRUSION"
    TRIPWIRE_CROSS = "TRIPWIRE_CROSS"
    DIRECTION_VIOLATION = "DIRECTION_VIOLATION"
    LOITERING = "LOITERING"
    RAPID_APPROACH = "RAPID_APPROACH"
    GROUP_CLUSTER = "GROUP_CLUSTER"
    CROSS_CAMERA_MATCH = "CROSS_CAMERA_MATCH"
    ANPR_HOTLIST_HIT = "ANPR_HOTLIST_HIT"
    ANPR_PLATE_READ = "ANPR_PLATE_READ"


class OperatorStatus(str, Enum):
    UNREVIEWED = "UNREVIEWED"
    CONFIRMED = "CONFIRMED"
    DISMISSED_FP = "DISMISSED_FP"  # Dismissed as False Positive by operator


@dataclass
class SecurityEvent:
    """
    Structured security alert event with explainable rationale and human-in-the-loop tracking.
    """
    event_id: str
    timestamp_iso: str
    timestamp_ms: float
    camera_id: str
    track_id: int
    class_name: str
    alert_type: AlertType
    severity: AlertSeverity
    zone_id: Optional[str]
    zone_name: Optional[str]
    details: str
    bbox: List[float]
    centroid: Tuple[float, float]
    # Explainability & Operator Triage Fields
    rule_name: str = "Spatial Geometry Rule"
    rule_metrics: Dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.85
    operator_status: OperatorStatus = OperatorStatus.UNREVIEWED
    operator_notes: Optional[str] = None
    thumbnail_path: Optional[str] = None
    # ANPR Specific Fields
    plate_text: Optional[str] = None
    plate_confidence: Optional[float] = None
    is_hotlist: bool = False
    hotlist_reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "timestamp_iso": self.timestamp_iso,
            "timestamp_ms": round(self.timestamp_ms, 2),
            "camera_id": self.camera_id,
            "track_id": self.track_id,
            "class_name": self.class_name,
            "alert_type": self.alert_type.value,
            "severity": self.severity.value,
            "zone_id": self.zone_id,
            "zone_name": self.zone_name,
            "details": self.details,
            "bbox": [round(c, 2) for c in self.bbox],
            "centroid": (round(self.centroid[0], 2), round(self.centroid[1], 2)),
            "rule_name": self.rule_name,
            "rule_metrics": self.rule_metrics,
            "confidence": round(self.confidence, 4),
            "operator_status": self.operator_status.value,
            "operator_notes": self.operator_notes,
            "thumbnail_path": self.thumbnail_path,
            "plate_text": self.plate_text,
            "plate_confidence": round(self.plate_confidence, 2) if self.plate_confidence is not None else None,
            "is_hotlist": self.is_hotlist,
            "hotlist_reason": self.hotlist_reason,
        }
