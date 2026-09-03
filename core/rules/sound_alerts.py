"""
Cyber Camera Surveillance Platform
Module: core/rules/sound_alerts.py
Description: Audio alert synthesizer with multi-frequency tone generation for security breaches.
"""

import sys
import threading


def play_alert(severity: str = "INFO"):
    """Plays an asynchronous audio tone based on alert severity."""
    def _beep():
        if sys.platform == "win32":
            import winsound
            try:
                if severity == "CRITICAL":
                    winsound.Beep(1800, 180)
                    winsound.Beep(2400, 220)
                elif severity == "WARNING":
                    winsound.Beep(1200, 160)
                else:
                    winsound.Beep(800, 100)
            except Exception:
                pass
        else:
            sys.stdout.write("\a")
            sys.stdout.flush()

    threading.Thread(target=_beep, daemon=True).start()
