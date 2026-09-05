"""
Cyber Camera Surveillance Platform
Module: core/database/schema.py
Description: Data contracts and security event schemas with explainable AI metrics and operator triage.
"""

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
import json
from typing import Any, Dict, List, Optional, Tuple


class AlertSeverity(Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class AlertType(Enum):
    ZONE_INTRUSION = "ZONE_INTRUSION"
    TRIPWIRE_CROSS = "TRIPWIRE_CROSS"
    LOITERING = "LOITERING"
    RAPID_APPROACH = "RAPID_APPROACH"
    GROUP_CLUSTER = "GROUP_CLUSTER"
    CROSS_CAMERA_MATCH = "CROSS_CAMERA_MATCH"
    WATCHLIST_VEHICLE = "WATCHLIST_VEHICLE"
    MASKED_HOSTILE = "MASKED_HOSTILE"


class OperatorStatus(Enum):
    UNREVIEWED = "UNREVIEWED"
    CONFIRMED = "CONFIRMED"
    DISMISSED_FP = "DISMISSED_FP"


@dataclass
class SecurityEvent:
    event_id: str
    timestamp_iso: str
    timestamp_ms: float
    camera_id: str
    track_id: int
    class_name: str
    alert_type: AlertType
    severity: AlertSeverity
    zone_id: Optional[str] = None
    zone_name: Optional[str] = None
    details: str = ""
    bbox: Optional[List[float]] = None
    centroid: Optional[Tuple[float, float]] = None
    rule_name: str = "Spatial Geometry Rule"
    rule_metrics: Dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.85
    operator_status: OperatorStatus = OperatorStatus.UNREVIEWED
    operator_notes: Optional[str] = None
    thumbnail_path: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["alert_type"] = self.alert_type.value
        d["severity"] = self.severity.value
        d["operator_status"] = self.operator_status.value
        return d
