"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/notify.py
Description: Asynchronous Mobile Alert Dispatcher.
             Immediately dispatches real-time security breach alerts, explainable rule telemetry,
             and cropped high-resolution photographic snapshot evidence to the operator console.
"""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import threading
import time
from typing import Dict, List, Optional

# Ensure project root in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from alerts.schema import AlertSeverity, AlertType, SecurityEvent


CONFIG_PATH = os.path.join(ROOT_DIR, "data", "notification_config.json")


def load_notification_config() -> Dict[str, bool]:
    """Loads notification settings or defaults."""
    default_cfg = {
        "enabled": True,
    }
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                cfg = json.load(f)
                default_cfg.update(cfg)
        except Exception:
            pass
    return default_cfg


def save_notification_config(enabled: bool = True):
    """Saves mobile alert dispatcher settings to data/notification_config.json."""
    os.makedirs(os.path.dirname(CONFIG_PATH) or ".", exist_ok=True)
    cfg = {
        "enabled": enabled,
    }
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2)
    print(f"[IBVAP Notify] Notification configuration saved: {CONFIG_PATH}")


class MobileAlertDispatcher:
    """
    Non-blocking background thread dispatcher for instant mobile notifications.
    """

    def __init__(self):
        self.config = load_notification_config()

    def reload_config(self):
        self.config = load_notification_config()

    def dispatch_alert_async(self, event: SecurityEvent):
        """Dispatches alert in a daemon thread so video processing never stutters."""
        if not self.config.get("enabled", True):
            return

        thread = threading.Thread(target=self._send_payload, args=(event,), daemon=True)
        thread.start()

    def _send_payload(self, event: SecurityEvent):
        """Constructs and logs a mobile alert card to the operator console."""
        severity_icon = "🚨" if event.severity == AlertSeverity.CRITICAL else ("⚠️" if event.severity == AlertSeverity.WARNING else "ℹ️")

        # Professional Tactical Mobile Alert Card
        caption_text = (
            f"{severity_icon} *IBVAP BORDER ALERT [{event.severity.value}]*\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"📍 *Node:* `{event.camera_id}` | *Zone:* `{event.zone_name or 'Border Perimeter'}`\n"
            f"🎯 *Threat:* *{event.alert_type.value}*\n"
            f"👤 *Target:* `{event.class_name.upper()}` (Track ID `#{event.track_id}`)\n"
            f"⏱️ *Time:* `{event.timestamp_iso}`\n"
            f"📝 *Details:* {event.details}\n"
            f"🔍 *Rule:* `{event.rule_name}` (Confidence: {event.confidence*100:.1f}%)\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"🛡️ _Advisory alert for operator verification_"
        )

        print(f"\n[MOBILE PUSH NOTIFICATION SIMULATOR]")
        print(caption_text)
        if event.thumbnail_path:
            print(f"[Attached Snapshot] {event.thumbnail_path}")
        print(f"====================================\n")


# Global Singleton Dispatcher
_dispatcher = MobileAlertDispatcher()


def send_mobile_alert(event: SecurityEvent):
    """Public helper to send an alert."""
    _dispatcher.dispatch_alert_async(event)


def test_mobile_alert():
    """Sends a sample test alert to verify mobile dispatch."""
    test_ev = SecurityEvent(
        event_id=f"evt_test_{int(time.time()*1000)}",
        timestamp_iso=datetime.now(timezone.utc).isoformat(),
        timestamp_ms=1000.0,
        camera_id="CAM_ALPHA",
        track_id=101,
        class_name="person",
        alert_type=AlertType.ZONE_INTRUSION,
        severity=AlertSeverity.CRITICAL,
        zone_id="alpha_restricted_gate",
        zone_name="Checkpost Alpha Red Zone",
        details="Unauthorized target breached Checkpost Red Zone heading towards perimeter gate.",
        bbox=[100, 100, 250, 350],
        centroid=(175, 225),
        rule_name="Point-in-Polygon Boundary Containment",
        confidence=0.95,
        thumbnail_path="data/thumbnails/evt_anpr_watchlist_33.jpg" if os.path.exists("data/thumbnails/evt_anpr_watchlist_33.jpg") else None,
    )
    print("[IBVAP] Sending sample test alert to mobile dispatcher...")
    _dispatcher._send_payload(test_ev)


if __name__ == "__main__":
    test_mobile_alert()
