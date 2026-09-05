"""
Safe hardware bridge for IBVAP Sentinel.

Uses PySerial when available and a supported port is present. Otherwise it
automatically stays in simulation mode so local backend development never
requires an Arduino or Firebase/serial setup.
"""

from __future__ import annotations

from typing import Dict, Optional
import time

try:
    import serial

    HAS_PYSERIAL = True
except Exception:
    serial = None
    HAS_PYSERIAL = False


SUPPORTED_PORTS = ("COM3", "/dev/ttyUSB0")
SUPPORTED_COMMANDS = {"RELAY_ON_1", "BOOM_LOCK_1", "SIREN_OFF"}


class PhysicalBarrierController:
    def __init__(self, port: Optional[str] = None, baudrate: int = 9600):
        self.port = port
        self.baudrate = baudrate
        self.serial_conn = None
        self.simulation_mode = True
        self._connect()

    @property
    def is_connected(self) -> bool:
        return bool(self.serial_conn and getattr(self.serial_conn, "is_open", False))

    def _connect(self) -> None:
        if not HAS_PYSERIAL:
            self.simulation_mode = True
            return

        candidate_ports = [self.port] if self.port else list(SUPPORTED_PORTS)
        for candidate in candidate_ports:
            if not candidate:
                continue
            try:
                self.serial_conn = serial.Serial(candidate, self.baudrate, timeout=1)
                time.sleep(1.0)
                self.port = candidate
                self.simulation_mode = False
                print(f"[Hardware Bridge] Connected on {candidate} at {self.baudrate} baud.")
                return
            except Exception:
                self.serial_conn = None

        self.simulation_mode = True

    def send_command(self, command: str) -> Dict[str, str]:
        if command not in SUPPORTED_COMMANDS:
            raise ValueError(f"Unsupported hardware command: {command}")

        if self.is_connected:
            try:
                self.serial_conn.write((command + "\n").encode("ascii"))
                self.serial_conn.flush()
                return {"mode": "serial", "port": self.port or "", "command": command}
            except Exception:
                self.simulation_mode = True

        print(f"[HARDWARE SIMULATION MODE] {command}")
        return {"mode": "simulation", "port": self.port or "", "command": command}

    def trigger_barrier_breach(self) -> Dict[str, str]:
        self.send_command("RELAY_ON_1")
        return self.send_command("BOOM_LOCK_1")

    def reset_barrier(self) -> Dict[str, str]:
        return self.send_command("SIREN_OFF")


_controller = PhysicalBarrierController()


def get_hardware_controller() -> PhysicalBarrierController:
    return _controller


def trigger_physical_breach():
    return _controller.trigger_barrier_breach()


def reset_physical_barrier():
    return _controller.reset_barrier()
