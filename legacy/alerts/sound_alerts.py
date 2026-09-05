"""
Cyber Camera Surveillance Platform
Module: alerts/sound_alerts.py
Description: Sound alert bridge forwarding to core/rules/sound_alerts.py with persistent siren support.
"""

from core.rules.sound_alerts import (
    is_siren_active,
    play_alert,
    start_persistent_critical_siren,
    stop_persistent_siren,
)

# Retain legacy class for backwards compatibility
class SoundAlertDispatcher:
    def __init__(self, enabled: bool = True, cooldown_sec: float = 2.0):
        self.enabled = enabled
        self.cooldown_sec = cooldown_sec

    def play_alert(self, severity: str = "INFO"):
        if self.enabled:
            play_alert(severity)
