"""
IBVAP Sentinel — core/db/base.py

Engine/session plumbing, kept deliberately small. One process, one SQLite
file, WAL mode so a reader (dashboard poll) never blocks a writer (event
ingestion) — the same trade-off core.backend_service made before this ORM
migration, just expressed through SQLAlchemy now.

build_engine() is the one place that creates a fresh, correctly-configured
Engine for a given db_path — SentinelBackend uses it directly (one engine
per instance, so two backends pointed at two different files, like in
tests, never share state). get_engine()/session_scope() are a thin
module-level convenience on top of it, for Alembic and one-off scripts that
just want "the" default database.
"""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = ROOT_DIR / "data" / "events.db"


class Base(DeclarativeBase):
    pass


def resolve_db_path(db_path: str | Path | None) -> Path:
    resolved = Path(db_path) if db_path is not None else DEFAULT_DB_PATH
    if not resolved.is_absolute():
        resolved = ROOT_DIR / resolved
    return resolved


def build_engine(db_path: str | Path | None = None) -> Engine:
    """A fresh Engine bound to db_path, with the standard SQLite pragmas set
    on every new connection (foreign keys on, WAL journal, NORMAL sync)."""
    resolved = resolve_db_path(db_path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    # NullPool: no idle pooled connections held open between sessions. Costs
    # a little latency reopening SQLite each call (a single-digit-ms local
    # file, so negligible), but means a SentinelBackend never keeps a stray
    # handle on its db file — matters on Windows, where an open handle blocks
    # deleting/renaming the file (e.g. a test's tmp_path cleanup).
    engine = create_engine(f"sqlite:///{resolved.as_posix()}", future=True, poolclass=NullPool)

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

    return engine


# --- module-level default engine, for Alembic / simple scripts only ---

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None
_current_db_path: Path | None = None


def get_engine(db_path: str | Path | None = None) -> Engine:
    global _engine, _SessionLocal, _current_db_path
    resolved = resolve_db_path(db_path)

    if _engine is not None and _current_db_path == resolved:
        return _engine

    if _engine is not None:
        _engine.dispose()

    _engine = build_engine(resolved)
    _SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False, future=True)
    _current_db_path = resolved
    return _engine


def get_session() -> Session:
    if _SessionLocal is None:
        get_engine()
    assert _SessionLocal is not None
    return _SessionLocal()


@contextmanager
def session_scope(db_path: str | Path | None = None) -> Iterator[Session]:
    if db_path is not None:
        get_engine(db_path)
    session = get_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
