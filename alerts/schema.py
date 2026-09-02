"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/schema.py
Description: Shared data contracts, severity tiers, event schemas, and incident records.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple


class AlertSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class AlertType(str, Enum):
    ZONE_INTRUSION = "ZONE_INTRUSION"
    TRIPWIRE_CROSS = "TRIPWIRE_CROSS"
    LOITERING = "LOITERING"
    DIRECTION_VIOLATION = "DIRECTION_VIOLATION"
    CROSS_CAMERA_MATCH = "CROSS_CAMERA_MATCH"
    TACTICAL_CRAWL = "TACTICAL_CRAWL"
    GROUP_CLUSTER = "GROUP_CLUSTER"
    SPEED_RUSH = "SPEED_RUSH"


@dataclass
class SecurityEvent:
    """Structured security alert event with explainable rationale."""
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
    thumbnail_path: Optional[str] = None

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
            "thumbnail_path": self.thumbnail_path,
        }
