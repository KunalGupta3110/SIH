"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/gateway_forwarder.py
Description: Thin, fail-safe HTTP bridge that forwards rule-based surveillance
            events (restricted-zone entry, tripwire crossing, loitering, etc.)
            from the CV pipeline to the FastAPI gateway's /events endpoint so
            they flow through incident correlation, threat scoring, the
            SHA-256 evidence chain, and the real-time WebSocket push.

The forwarder NEVER raises into the detection loop: a network hiccup, a
stopped backend, or a bad response is logged as a warning and swallowed.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Any, Dict, Optional

import requests

from alerts.schema import AlertType, SecurityEvent

logger = logging.getLogger("ibvap.gateway_forwarder")

DEFAULT_GATEWAY_URL = "http://127.0.0.1:8000"

# alert types that mean "target is inside a restricted / no-go polygon"
_RESTRICTED_ZONE_TYPES = {
    AlertType.ZONE_INTRUSION.value,
    AlertType.LOITERING.value,
    AlertType.DIRECTION_VIOLATION.value,
}
# alert types that imply directed movement across the perimeter toward the line
_TOWARD_BORDER_TYPES = {
    AlertType.TRIPWIRE_CROSS.value,
    AlertType.DIRECTION_VIOLATION.value,
    AlertType.RAPID_APPROACH.value,
}


def _as_bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off", ""}


class GatewayForwarder:
    """POSTs SecurityEvents to the gateway. Safe to call from a hot frame loop."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        enabled: Optional[bool] = None,
        timeout: float = 2.0,
    ) -> None:
        self.base_url = (base_url or os.getenv("IBVAP_GATEWAY_URL") or DEFAULT_GATEWAY_URL).rstrip("/")
        self.enabled = _as_bool_env("IBVAP_GATEWAY_FORWARD", True) if enabled is None else enabled
        self.timeout = timeout
        self._session = requests.Session()
        self._warned = False
        self._lock = threading.Lock()

    # ── payload mapping ──────────────────────────────────────────────────
    @staticmethod
    def event_to_payload(event: SecurityEvent) -> Dict[str, Any]:
        """Map an internal SecurityEvent onto the gateway's EventIn schema."""
        base = event.to_dict()
        alert_type = base["alert_type"]
        metrics = dict(base.get("rule_metrics") or {})

        dwell = metrics.get("dwell_time_s") or metrics.get("dwell_time_sec") or 0.0
        crossing = str(metrics.get("crossing_direction") or "")

        # Explicit, auditable scoring flags for core.backend_service
        metrics.setdefault("in_restricted_zone", alert_type in _RESTRICTED_ZONE_TYPES)
        metrics.setdefault(
            "movement_toward_border",
            alert_type in _TOWARD_BORDER_TYPES or crossing == "INBOUND_BORDER",
        )
        metrics.setdefault("loitering_seconds", float(dwell or 0.0))
        metrics.setdefault(
            "cross_camera_reid_match",
            alert_type == AlertType.CROSS_CAMERA_MATCH.value,
        )

        return {
            "event_id": base["event_id"],
            "timestamp_iso": base["timestamp_iso"],
            "timestamp_ms": base["timestamp_ms"],
            "camera_id": base["camera_id"],
            "track_id": base["track_id"],
            "class_name": base["class_name"],
            "alert_type": alert_type,
            "severity": base["severity"],
            "zone_id": base.get("zone_id"),
            "zone_name": base.get("zone_name"),
            "details": base.get("details", ""),
            "bbox": list(base.get("bbox") or []),
            "centroid": list(base.get("centroid") or []),
            "rule_name": base.get("rule_name", "Spatial Geometry Rule"),
            "rule_metrics": metrics,
            "confidence": base.get("confidence", 0.85),
            "thumbnail_path": base.get("thumbnail_path"),
            "in_restricted_zone": metrics["in_restricted_zone"],
            "movement_toward_border": metrics["movement_toward_border"],
            "loitering_seconds": metrics["loitering_seconds"],
            "cross_camera_reid_match": metrics["cross_camera_reid_match"],
        }

    # ── delivery ────────────────────────────────────────────────────────
    def forward(self, event: SecurityEvent) -> Optional[Dict[str, Any]]:
        """Forward one event. Returns the gateway JSON on success, else None."""
        if not self.enabled:
            return None
        try:
            payload = self.event_to_payload(event)
            resp = self._session.post(
                f"{self.base_url}/events", json=payload, timeout=self.timeout
            )
            resp.raise_for_status()
            self._warned = False
            data = resp.json()
            incident = (data or {}).get("incident") or {}
            logger.info(
                "forwarded %s (%s) -> incident %s score %s",
                event.event_id,
                event.alert_type.value,
                incident.get("incident_id", "?"),
                incident.get("threat_score", "?"),
            )
            return data
        except Exception as exc:  # noqa: BLE001 - never break the detection loop
            with self._lock:
                if not self._warned:
                    logger.warning(
                        "gateway forward failed (%s: %s) - events are still logged "
                        "locally; suppressing further warnings until it recovers",
                        type(exc).__name__,
                        exc,
                    )
                    self._warned = True
            return None


_forwarder: Optional[GatewayForwarder] = None


def get_forwarder() -> GatewayForwarder:
    global _forwarder
    if _forwarder is None:
        _forwarder = GatewayForwarder()
    return _forwarder
