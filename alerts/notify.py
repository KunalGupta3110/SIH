"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/notify.py
Description: Asynchronous Mobile & Telegram Alert Dispatcher.
             Immediately dispatches real-time security breach alerts, explainable rule telemetry,
             and cropped high-resolution photographic snapshot evidence directly to field officers' phones.
"""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import threading
from typing import Dict, List, Optional
import requests

# Ensure project root in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from alerts.schema import AlertSeverity, SecurityEvent


CONFIG_PATH = os.path.join(ROOT_DIR, "data", "notification_config.json")


def load_notification_config() -> Dict[str, str]:
    """Loads notification settings or defaults."""
    default_cfg = {
        "enabled": True,
        "telegram_bot_token": os.environ.get("IBVAP_BOT_TOKEN", ""),
        "telegram_chat_id": os.environ.get("IBVAP_CHAT_ID", ""),
        "mock_mode": True,  # When True, logs formatted mobile message locally if token not set
    }
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                cfg = json.load(f)
                default_cfg.update(cfg)
        except Exception:
            pass
    return default_cfg


def save_notification_config(bot_token: str, chat_id: str, enabled: bool = True):
    """Saves Telegram bot token and chat ID to data/notification_config.json."""
    os.makedirs(os.path.dirname(CONFIG_PATH) or ".", exist_ok=True)
    cfg = {
        "enabled": enabled,
        "telegram_bot_token": bot_token.strip(),
        "telegram_chat_id": chat_id.strip(),
        "mock_mode": not bool(bot_token.strip() and chat_id.strip()),
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
        """Constructs mobile card and sends to Telegram or mock mobile feed."""
        bot_token = self.config.get("telegram_bot_token", "").strip()
        chat_id = self.config.get("telegram_chat_id", "").strip()

        severity_icon = "🚨" if event.severity == AlertSeverity.CRITICAL else ("⚠️" if event.severity == AlertSeverity.WARNING else "ℹ️")
        
        # Professional Tactical Telegram Message Card
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

        # 1. Real Telegram Dispatch if configured
        if bot_token and chat_id:
            try:
                # Send Photo with Caption if thumbnail exists
                if event.thumbnail_path and os.path.exists(event.thumbnail_path):
                    url = f"https://api.telegram.org/bot{bot_token}/sendPhoto"
                    with open(event.thumbnail_path, "rb") as photo_file:
                        files = {"photo": photo_file}
                        data = {"chat_id": chat_id, "caption": caption_text, "parse_mode": "Markdown"}
                        res = requests.post(url, data=data, files=files, timeout=4)
                        if res.status_code == 200:
                            print(f"[Mobile Notify] ✅ Telegram photo alert sent to {chat_id} for {event.event_id}")
                            return
                        else:
                            print(f"[Mobile Notify] ⚠️ Telegram API returned {res.status_code}: {res.text}")

                # Text fallback
                url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
                data = {"chat_id": chat_id, "text": caption_text, "parse_mode": "Markdown"}
                requests.post(url, json=data, timeout=4)
                print(f"[Mobile Notify] ✅ Telegram text alert sent to {chat_id}")

            except Exception as e:
                print(f"[Mobile Notify] ⚠️ Telegram dispatch error: {e}")

        # 2. Mock Mobile Logging (for live demo when token not yet inserted)
        else:
            print(f"\n📱 [MOBILE PUSH NOTIFICATION SIMULATOR]")
            print(caption_text)
            if event.thumbnail_path:
                print(f"📸 Attached Snapshot: {event.thumbnail_path}")
            print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")


# Global Singleton Dispatcher
_dispatcher = MobileAlertDispatcher()


def send_mobile_alert(event: SecurityEvent):
    """Public helper to send an alert."""
    _dispatcher.dispatch_alert_async(event)


def test_mobile_alert(bot_token: Optional[str] = None, chat_id: Optional[str] = None):
    """Sends a sample test alert to verify mobile dispatch."""
    if bot_token and chat_id:
        save_notification_config(bot_token, chat_id)
        _dispatcher.reload_config()

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
