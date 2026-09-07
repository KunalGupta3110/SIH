"""
IBVAP Sentinel — core/db/migrate.py

Runs Alembic migrations programmatically against a given db_path, so the
backend self-migrates to the latest schema on startup — no manual
`alembic upgrade head` step required for a fresh clone or a live demo
laptop. The IBVAP_DB_PATH env var is how this tells alembic/env.py which
file to target (its `-x`/CLI equivalent for in-process use).
"""

from __future__ import annotations

import os
from pathlib import Path

from alembic import command
from alembic.config import Config

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ALEMBIC_INI = ROOT_DIR / "alembic.ini"


def ensure_schema(db_path: str | Path) -> None:
    """Idempotent: upgrades the database at db_path to the latest Alembic
    revision. Safe to call every time a SentinelBackend is constructed."""
    resolved = Path(db_path)
    if not resolved.is_absolute():
        resolved = ROOT_DIR / resolved
    resolved.parent.mkdir(parents=True, exist_ok=True)

    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(ROOT_DIR / "alembic"))

    previous_env_value = os.environ.get("IBVAP_DB_PATH")
    os.environ["IBVAP_DB_PATH"] = str(resolved)
    try:
        command.upgrade(cfg, "head")
    finally:
        if previous_env_value is None:
            os.environ.pop("IBVAP_DB_PATH", None)
        else:
            os.environ["IBVAP_DB_PATH"] = previous_env_value
