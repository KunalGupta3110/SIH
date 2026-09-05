"""
Cyber Camera Surveillance Platform
Module: core/rules/sound_alerts.py
Description: Audio alert synthesizer with persistent continuous emergency sirens.
             Loops high-frequency siren beeps continuously until an operator explicitly acknowledges / mutes it.
"""

import sys
import threading
import time

_siren_active = False
_siren_lock = threading.Lock()
_siren_thread = None
_siren_reason = "CRITICAL BREACH"


def start_persistent_critical_siren(reason: str = "CRITICAL PERIMETER BREACH"):
    """
    Starts an unstoppable continuous emergency siren that loops indefinitely
    until an operator presses 'M' (Mute) or clicks Acknowledge.
    """
    global _siren_active, _siren_thread, _siren_reason

    with _siren_lock:
        _siren_reason = reason
        if _siren_active:
            return  # Already ringing
        _siren_active = True

    def _continuous_siren_loop():
        global _siren_active
        print(f"\n🚨 [CRITICAL SIREN ENGAGED] {_siren_reason} -> SIREN LOOPING UNTIL OPERATOR INTERVENTION!")
        
        while True:
            with _siren_lock:
                if not _siren_active:
                    break

            if sys.platform == "win32":
                import winsound
                try:
                    # Alternating High-Urgency Tactical Siren
                    winsound.Beep(2400, 180)
                    time.sleep(0.04)
                    winsound.Beep(3000, 220)
                    time.sleep(0.08)
                except Exception:
                    time.sleep(0.3)
            else:
                sys.stdout.write("\a")
                sys.stdout.flush()
                time.sleep(0.4)

        print(f"🛑 [SIREN SILENCED] Operator acknowledged critical alert.")

    _siren_thread = threading.Thread(target=_continuous_siren_loop, daemon=True)
    _siren_thread.start()


def stop_persistent_siren():
    """Silences the active persistent siren."""
    global _siren_active
    with _siren_lock:
        _siren_active = False


def is_siren_active() -> bool:
    """Returns whether the persistent emergency siren is currently sounding."""
    global _siren_active
    return _siren_active


def play_alert(severity: str = "INFO", persistent: bool = False):
    """
    Plays sound alert. If persistent=True or severity=='CRITICAL',
    it will loop continuously until acknowledged!
    """
    if severity == "CRITICAL" and persistent:
        start_persistent_critical_siren("CRITICAL SECURITY THREAT")
        return

    def _single_beep():
        if sys.platform == "win32":
            import winsound
            try:
                if severity == "CRITICAL":
                    winsound.Beep(2200, 200)
                    winsound.Beep(2800, 250)
                elif severity == "WARNING":
                    winsound.Beep(1400, 160)
                else:
                    winsound.Beep(850, 100)
            except Exception:
                pass
        else:
            sys.stdout.write("\a")
            sys.stdout.flush()

    threading.Thread(target=_single_beep, daemon=True).start()
