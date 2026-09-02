"""
IBVAP - Intelligent Border Video Analytics Platform
Module: alerts/sound_alerts.py
Description: Non-blocking sound and audio alert dispatcher for border surveillance.
             Generates distinct audible sirens and beeps based on threat severity
             (CRITICAL, WARNING, INFO) without stalling video inference.
"""

from enum import Enum
import os
from pathlib import Path
import platform
import sys
import threading
import time

# Ensure project root in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Check for Windows native sound
IS_WINDOWS = platform.system() == "Windows"
if IS_WINDOWS:
    import winsound


class SoundAlertDispatcher:
    """
    Asynchronous, non-blocking sound dispatcher.
    Plays distinct audio alarms for security incidents in a separate worker thread.
    """

    def __init__(self, enabled: bool = True, cooldown_sec: float = 2.0):
        """
        Args:
            enabled: Global toggle for audio alerts.
            cooldown_sec: Minimum seconds between sound triggers to avoid ear fatigue.
        """
        self.enabled = enabled
        self.cooldown_sec = cooldown_sec
        self.last_played_time = 0.0
        self._lock = threading.Lock()

    def _play_siren_critical(self):
        """High-urgency pulsing siren for CRITICAL breaches (Restricted Zone / Perimeter Cut)."""
        try:
            if IS_WINDOWS:
                # 3 rapid alternating urgent pulses
                for _ in range(3):
                    winsound.Beep(2200, 100)
                    time.sleep(0.04)
                    winsound.Beep(2800, 120)
                    time.sleep(0.04)
            else:
                # Terminal bell fallback for Linux
                print("\a\a\a", end="", flush=True)
        except Exception:
            pass

    def _play_warning_beep(self):
        """Moderate warning tone for loitering / caution buffer entries."""
        try:
            if IS_WINDOWS:
                # Double warning tone
                winsound.Beep(1200, 150)
                time.sleep(0.08)
                winsound.Beep(1200, 150)
            else:
                print("\a", end="", flush=True)
        except Exception:
            pass

    def _play_info_chime(self):
        """Notification chime for Cross-Camera Re-ID target match."""
        try:
            if IS_WINDOWS:
                # Ascending 2-tone chime
                winsound.Beep(1400, 90)
                winsound.Beep(1900, 140)
            else:
                print("\a", end="", flush=True)
        except Exception:
            pass

    def trigger(self, severity: str = "CRITICAL"):
        """
        Dispatches sound alert in a non-blocking background thread.

        Args:
            severity: 'CRITICAL', 'WARNING', or 'INFO'
        """
        if not self.enabled:
            return

        now = time.time()
        with self._lock:
            # Respect cooldown
            if (now - self.last_played_time) < self.cooldown_sec:
                return
            self.last_played_time = now

        # Select sound function
        sev = severity.upper()
        if sev == "CRITICAL":
            target_fn = self._play_siren_critical
        elif sev == "WARNING":
            target_fn = self._play_warning_beep
        else:
            target_fn = self._play_info_chime

        # Launch in background thread so computer vision loop is never blocked
        t = threading.Thread(target=target_fn, daemon=True)
        t.start()


# Global Singleton Dispatcher
sound_dispatcher = SoundAlertDispatcher()


def play_alert(severity: str = "CRITICAL"):
    """Global helper function to trigger audible alerts."""
    sound_dispatcher.trigger(severity)


if __name__ == "__main__":
    print("[Sound Test] Testing CRITICAL siren...")
    play_alert("CRITICAL")
    time.sleep(2.5)

    print("[Sound Test] Testing WARNING beep...")
    play_alert("WARNING")
    time.sleep(2.5)

    print("[Sound Test] Testing INFO chime...")
    play_alert("INFO")
    time.sleep(1.0)
    print("[Sound Test] Done!")
