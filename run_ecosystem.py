"""
IBVAP Sentinel — run_ecosystem.py

Starts the whole backend with one command:

    python run_ecosystem.py

What this does, in order:
  1. Initialize the database (creates tables if they don't exist yet).
  2. SQLite is put into WAL mode (this happens automatically every time
     database.get_connection() is used — see backend/database.py).
  3. Verify the evidence ledger, so you see immediately if something in
     data/events.db was tampered with before the server even starts serving
     requests.
  4. Start the FastAPI app with Uvicorn, listening on 0.0.0.0:8000.
  5. Open the interactive API docs (http://localhost:8000/docs) in your
     browser, so you can try every endpoint by hand without writing any
     client code.

The frontend (built separately) is its own app and isn't started from
here — point it at http://localhost:8000.
"""

import threading
import time
import webbrowser

from backend import database, evidence_ledger


def main():
    print("=" * 60)
    print(" IBVAP SENTINEL — BACKEND STARTUP")
    print("=" * 60)

    print("[1/3] Initializing database (data/events.db) ...")
    database.init_database()
    print("      done.")

    print("[2/3] Verifying evidence ledger ...")
    blocks = database.get_all_ledger_blocks()
    if not blocks:
        print(f"      no blocks yet — ledger starts empty at genesis '{evidence_ledger.GENESIS_VALUE}'.")
    else:
        result = evidence_ledger.verify_chain(blocks)
        if result["is_valid"]:
            print(f"      OK — {len(blocks)} block(s), chain intact.")
        else:
            print(f"      *** LEDGER TAMPERED *** broken at block {result['broken_index']}: {result['reason']}")

    print("[3/3] Starting FastAPI server on http://0.0.0.0:8000 ...")
    print("      API docs: http://localhost:8000/docs")
    print("=" * 60)

    _open_docs_after_short_delay()

    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000)


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
