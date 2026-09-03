"""
Cyber Camera Surveillance Platform
Module: services/notifications/telegram_bot.py
Description: Asynchronous Telegram & Mobile Alert Dispatcher.
"""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import threading
import time
from typing import Dict, List, Optional
import requests

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from core.database.schema import AlertSeverity, AlertType, SecurityEvent

CONFIG_PATH = os.path.join(ROOT_DIR, "data", "notification_config.json")


def load_notification_config() -> Dict[str, str]:
    default_cfg = {
        "enabled": True,
        "telegram_bot_token": os.environ.get("IBVAP_BOT_TOKEN", ""),
        "telegram_chat_id": os.environ.get("IBVAP_CHAT_ID", ""),
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
    os.makedirs(os.path.dirname(CONFIG_PATH) or ".", exist_ok=True)
    cfg = {
        "enabled": enabled,
        "telegram_bot_token": bot_token.strip(),
        "telegram_chat_id": chat_id.strip(),
    }
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2)
    print(f"[Mobile Notify] Saved configuration: {CONFIG_PATH}")


class MobileAlertDispatcher:
    def __init__(self):
        self.config = load_notification_config()

    def reload_config(self):
        self.config = load_notification_config()

    def dispatch_alert_async(self, event: SecurityEvent):
        if not self.config.get("enabled", True):
            return
        threading.Thread(target=self._send_payload, args=(event,), daemon=True).start()

    def _send_payload(self, event: SecurityEvent):
        bot_token = self.config.get("telegram_bot_token", "").strip()
        chat_id = self.config.get("telegram_chat_id", "").strip()

        severity_icon = "🚨" if event.severity == AlertSeverity.CRITICAL else ("⚠️" if event.severity == AlertSeverity.WARNING else "ℹ️")
        
        caption_text = (
            f"{severity_icon} *CYBER CAMERA SURVEILLANCE ALERT [{event.severity.value}]*\n"
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

        if bot_token and chat_id:
            try:
                if event.thumbnail_path and os.path.exists(event.thumbnail_path):
                    url = f"https://api.telegram.org/bot{bot_token}/sendPhoto"
                    with open(event.thumbnail_path, "rb") as photo_file:
                        files = {"photo": photo_file}
                        data = {"chat_id": chat_id, "caption": caption_text, "parse_mode": "Markdown"}
                        res = requests.post(url, data=data, files=files, timeout=4)
                        if res.status_code == 200:
                            print(f"[Mobile Notify] [OK] Telegram photo alert sent to {chat_id} for {event.event_id}")
                            return

                url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
                data = {"chat_id": chat_id, "text": caption_text, "parse_mode": "Markdown"}
                requests.post(url, json=data, timeout=4)
                print(f"[Mobile Notify] [OK] Telegram text alert sent to {chat_id}")
            except Exception as e:
                print(f"[Mobile Notify] [ERROR] Telegram dispatch error: {e}")
        else:
            print(f"\n[MOBILE PUSH NOTIFICATION SIMULATOR]")
            print(caption_text)
            if event.thumbnail_path:
                print(f"[Attached Snapshot] {event.thumbnail_path}")
            print(f"====================================\n")


_dispatcher = MobileAlertDispatcher()


def send_mobile_alert(event: SecurityEvent):
    _dispatcher.dispatch_alert_async(event)


def test_mobile_alert(bot_token: Optional[str] = None, chat_id: Optional[str] = None):
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
        thumbnail_path="data/thumbnails/evt_anpr_DL01AB1234.jpg" if os.path.exists("data/thumbnails/evt_anpr_DL01AB1234.jpg") else None,
    )
    _dispatcher._send_payload(test_ev)
