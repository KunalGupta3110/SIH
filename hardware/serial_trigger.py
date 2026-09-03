"""
Cyber Camera Surveillance - Hardware Interlock Controller
Module: hardware/serial_trigger.py
Description: USB Serial Bridge connecting Edge AI Threat Engine to physical Arduino/ESP32
             to drop the boom barrier servo and sound the perimeter buzzer on breaches.
"""

import os
import sys
import time
from typing import Optional

try:
    import serial
    import serial.tools.list_ports
    HAS_PYSERIAL = True
except ImportError:
    HAS_PYSERIAL = False


class PhysicalBarrierController:
    """
    Manages physical hardware barrier interlock over USB Serial.
    """

    def __init__(self, port: Optional[str] = None, baudrate: int = 9600):
        self.port = port
        self.baudrate = baudrate
        self.serial_conn = None
        self.is_connected = False
        self._init_connection()

    def _init_connection(self):
        if not HAS_PYSERIAL:
            print("[Hardware Bridge] PySerial not installed. Operating in SIMULATION MODE.")
            return

        # Auto-detect COM port if not specified
        if not self.port:
            ports = list(serial.tools.list_ports.comports())
            for p in ports:
                if "Arduino" in p.description or "CH340" in p.description or "USB Serial" in p.description or "Silicon Labs" in p.description:
                    self.port = p.device
                    break
            if not self.port and ports:
                self.port = ports[0].device

        if self.port:
            try:
                self.serial_conn = serial.Serial(self.port, self.baudrate, timeout=1)
                time.sleep(1.5)  # Allow Arduino reset cycle
                self.is_connected = True
                print(f"[Hardware Bridge] ✅ Connected to Physical Barrier on {self.port} @ {self.baudrate} baud.")
            except Exception as e:
                print(f"[Hardware Bridge] ⚠️ Could not connect to {self.port}: {e}. (Simulation Mode active)")
                self.is_connected = False
        else:
            print("[Hardware Bridge] No physical COM port detected. (Simulation Mode active)")

    def trigger_barrier_breach(self):
        """Sends breach signal to drop physical boom barrier and pulse buzzer."""
        if self.is_connected and self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.write(b"B")
                self.serial_conn.flush()
                print("🚧 [HARDWARE INTERLOCK] Sent BREACH signal -> Physical Boom Barrier Dropped & Buzzer Sounded!")
            except Exception as e:
                print(f"[Hardware Bridge] Write error: {e}")
        else:
            print("🚧 [HARDWARE SIMULATION] BREACH Triggered -> Mini Servo Barrier [LOCKED 90°] | Buzzer [ON]")

    def reset_barrier(self):
        """Sends reset signal to lift physical boom barrier."""
        if self.is_connected and self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.write(b"R")
                self.serial_conn.flush()
                print("🚧 [HARDWARE INTERLOCK] Sent RESET signal -> Physical Boom Barrier Raised [OPEN].")
            except Exception as e:
                print(f"[Hardware Bridge] Write error: {e}")
        else:
            print("🚧 [HARDWARE SIMULATION] RESET Triggered -> Mini Servo Barrier [OPEN 0°] | Buzzer [OFF]")

    def close(self):
        if self.serial_conn and self.serial_conn.is_open:
            self.serial_conn.close()


# Global Singleton Controller
_barrier_controller = PhysicalBarrierController()


def trigger_physical_breach():
    """Public helper to trigger the physical barrier."""
    _barrier_controller.trigger_barrier_breach()


def reset_physical_barrier():
    """Public helper to reset the physical barrier."""
    _barrier_controller.reset_barrier()


if __name__ == "__main__":
    print("\n--- Testing Physical Barrier Controller ---")
    trigger_physical_breach()
    time.sleep(2)
    reset_physical_barrier()
    print("--- Test Complete ---")
