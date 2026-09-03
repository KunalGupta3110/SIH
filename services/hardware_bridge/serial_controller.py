"""
Cyber Camera Surveillance Platform
Module: services/hardware_bridge/serial_controller.py
Description: USB Serial Controller connecting AI Threat alerts to physical Arduino barrier and buzzer.
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
    def __init__(self, port: Optional[str] = None, baudrate: int = 9600):
        self.port = port
        self.baudrate = baudrate
        self.serial_conn = None
        self.is_connected = False
        self._init_connection()

    def _init_connection(self):
        if not HAS_PYSERIAL:
            return

        if not self.port:
            ports = list(serial.tools.list_ports.comports())
            for p in ports:
                if any(k in p.description for k in ("Arduino", "CH340", "USB Serial", "Silicon Labs")):
                    self.port = p.device
                    break
            if not self.port and ports:
                self.port = ports[0].device

        if self.port:
            try:
                self.serial_conn = serial.Serial(self.port, self.baudrate, timeout=1)
                time.sleep(1.5)
                self.is_connected = True
                print(f"[Hardware Bridge] Connected to Physical Barrier on {self.port}.")
            except Exception:
                self.is_connected = False

    def trigger_barrier_breach(self):
        if self.is_connected and self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.write(b"B")
                self.serial_conn.flush()
                print("🚧 [HARDWARE INTERLOCK] Sent BREACH signal -> Barrier Dropped & Buzzer Sounded!")
            except Exception:
                pass
        else:
            print("🚧 [HARDWARE SIMULATION] BREACH -> Barrier [LOCKED 90°] | Buzzer [ON]")

    def reset_barrier(self):
        if self.is_connected and self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.write(b"R")
                self.serial_conn.flush()
                print("🚧 [HARDWARE INTERLOCK] Sent RESET signal -> Barrier Raised [OPEN].")
            except Exception:
                pass
        else:
            print("🚧 [HARDWARE SIMULATION] RESET -> Barrier [OPEN 0°] | Buzzer [OFF]")


_controller = PhysicalBarrierController()


def trigger_physical_breach():
    _controller.trigger_barrier_breach()


def reset_physical_barrier():
    _controller.reset_barrier()
