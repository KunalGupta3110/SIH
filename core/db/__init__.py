"""
IBVAP Sentinel — core/db

SQLAlchemy persistence layer. One SQLite file (data/events.db), reproducible
via Alembic migrations (see alembic/), matching the project's "100% local,
zero cloud, air-gapped Jetson Orin" deployment constraint — no database
server process to run or lose during a live demo.
"""

from core.db.base import Base, get_engine, get_session, session_scope

__all__ = ["Base", "get_engine", "get_session", "session_scope"]
