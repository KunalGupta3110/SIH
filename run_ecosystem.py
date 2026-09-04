"""
IBVAP Sentinel - run_ecosystem.py

Starts the whole backend with one command:

    python run_ecosystem.py

What this does, in order:
  1. Initialize the database (creates tables if they don't exist yet).
  2. SQLite is put into WAL mode (this happens automatically every time
     database.get_connection() is used - see backend/database.py).
  3. Verify the evidence ledger, so you see immediately if something in
     data/events.db was tampered with before the server even starts serving
     requests.
  4. Start the FastAPI app with Uvicorn, listening on 0.0.0.0:8000.
  5. Open the interactive API docs (http://localhost:8000/docs) in your
     browser, so you can try every endpoint by hand without writing any
     client code.

The frontend (built separately) is its own app and isn't started from
here - point it at http://localhost:8000.

Note on the print() calls below: every one passes flush=True. Without that,
Python buffers stdout when it isn't a live terminal (piped to a file, some
IDE consoles), while Uvicorn's own log lines go out unbuffered on stderr -
so without flush=True this banner can appear to print AFTER "Uvicorn
running..." even though it actually ran first. flush=True keeps the printed
order on screen matching the real order of what happened.
"""

import sys
import threading
import time
import webbrowser

from backend import database, evidence_ledger


def main():
    print("=" * 60, flush=True)
    print(" IBVAP SENTINEL - BACKEND STARTUP", flush=True)
    print("=" * 60, flush=True)

    print("[1/3] Initializing database (data/events.db) ...", flush=True)
    database.init_database()
    print("      done.", flush=True)

    print("[2/3] Verifying evidence ledger ...", flush=True)
    blocks = database.get_all_ledger_blocks()
    if not blocks:
        print(f"      no blocks yet - ledger starts empty at genesis '{evidence_ledger.GENESIS_VALUE}'.", flush=True)
    else:
        result = evidence_ledger.verify_chain(blocks)
        if result["is_valid"]:
            print(f"      OK - {len(blocks)} block(s), chain intact.", flush=True)
        else:
            print(f"      *** LEDGER TAMPERED *** broken at block {result['broken_index']}: {result['reason']}", flush=True)

    print("[3/3] Starting FastAPI server on http://0.0.0.0:8000 ...", flush=True)
    print("      API docs: http://localhost:8000/docs", flush=True)
    print("=" * 60, flush=True)
    sys.stdout.flush()

    _free_port_if_occupied(8000)
    _open_docs_after_short_delay()

    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000)


def _free_port_if_occupied(port: int = 8000):
    """If a previous background process is still holding the port, terminate it to prevent [Errno 10048]."""
    import socket
    import subprocess
    import os
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return  # Port is already free
        
        if os.name == 'nt':
            cmd = f'powershell -Command "Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"'
            res = subprocess.check_output(cmd, shell=True, text=True).strip()
            current_pid = str(os.getpid())
            for pid_str in res.split():
                pid_str = pid_str.strip()
                if pid_str and pid_str != '0' and pid_str != current_pid:
                    print(f"      [Auto-Recovery] Port {port} was occupied — terminating lingering PID {pid_str} ...", flush=True)
                    subprocess.run(f'taskkill /F /PID {pid_str}', shell=True, capture_output=True)
            time.sleep(0.6)
    except Exception:
        pass


def _open_docs_after_short_delay():
    """Give Uvicorn a moment to actually start listening before we try to open a browser tab."""
    def _open():
        time.sleep(1.5)
        try:
            webbrowser.open("http://localhost:8000/docs")
        except Exception:
            pass   # no browser available (e.g. a headless server) — not a problem
    threading.Thread(target=_open, daemon=True).start()


if __name__ == "__main__":
    main()
