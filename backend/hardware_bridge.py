"""
IBVAP Sentinel — backend/hardware_bridge.py

ONE job: send simple text commands to a physical controller (a boom
barrier relay, a siren) over a serial port.

IMPORTANT: the backend must keep working even with no hardware attached —
which is true for almost every demo laptop. So this module always falls
back to SIMULATION MODE automatically when:
  - the `pyserial` package isn't installed, or
  - none of the expected ports (COM3, /dev/ttyUSB0) can be opened.

In simulation mode, every command is just printed to the console instead
of sent anywhere, and the function still returns normally. Nothing else in
the backend needs to know or care which mode it's in.
"""

try:
    import serial   # pyserial
    PYSERIAL_INSTALLED = True
except ImportError:
    PYSERIAL_INSTALLED = False

CANDIDATE_PORTS = ["COM3", "/dev/ttyUSB0"]
BAUD_RATE = 9600
KNOWN_COMMANDS = ["RELAY_ON_1", "BOOM_LOCK_1", "SIREN_OFF"]

# Module-level state — this whole file represents ONE serial connection.
_serial_connection = None
_simulation_mode = True   # stays True until a real port is actually opened


def connect() -> None:
    """
    Try each candidate port and use the first one that opens. If pyserial
    isn't installed, or no port opens, switch to SIMULATION MODE — this
    function never raises, so a missing controller can't crash startup.
    """
    global _serial_connection, _simulation_mode

    if not PYSERIAL_INSTALLED:
        print("[hardware_bridge] pyserial is not installed -> SIMULATION MODE")
        _simulation_mode = True
        return

    for port in CANDIDATE_PORTS:
        try:
            _serial_connection = serial.Serial(port, BAUD_RATE, timeout=1)
            _simulation_mode = False
            print(f"[hardware_bridge] connected to {port} @ {BAUD_RATE} baud")
            return
        except Exception:
            continue   # try the next port

    print(f"[hardware_bridge] no hardware found on {CANDIDATE_PORTS} -> SIMULATION MODE")
    _simulation_mode = True


def is_simulation_mode() -> bool:
    return _simulation_mode


def send_command(command: str) -> str:
    """
    Send one of KNOWN_COMMANDS to the controller. Always returns a short
    status string and never raises — a hardware problem should never take
    the rest of the API down with it.
    """
    global _simulation_mode

    if _simulation_mode or _serial_connection is None:
        print(f"[hardware_bridge] SIMULATION: would send '{command}'")
        return f"simulated:{command}"

    try:
        _serial_connection.write((command + "\n").encode("utf-8"))
        return f"sent:{command}"
    except Exception as error:
        print(f"[hardware_bridge] send failed ({error}) -> falling back to SIMULATION MODE")
        _simulation_mode = True
        return f"simulated:{command}"
