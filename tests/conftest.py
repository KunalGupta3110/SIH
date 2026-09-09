"""
IBVAP Sentinel — tests/conftest.py

Shared pytest fixtures. The `client` fixture gives every test its own
throwaway SentinelBackend + calibration store + clean network/offline-queue
state, wired into a real TestClient(app) — none of it ever touches real
project data (data/events.db, data/site_alert_calibration.json).
"""

from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import pytest
from fastapi.testclient import TestClient

import core.backend_service as backend_service
from core.rules import site_calibration
from services.api_gateway import server as gateway


@pytest.fixture()
def client(tmp_path, monkeypatch):
    test_backend = backend_service.SentinelBackend(tmp_path / "test_events.db")
    monkeypatch.setattr(backend_service, "_default_backend", test_backend)
    monkeypatch.setattr(
        site_calibration, "_calibration_engine",
        site_calibration.SiteAlertCalibrationEngine(config_path=str(tmp_path / "site_calibration.json")),
    )
    gateway.NETWORK_STATE["simulated_down"] = False
    gateway.OFFLINE_EVENT_QUEUE.clear()
    with TestClient(gateway.app) as test_client:
        yield test_client
    gateway.NETWORK_STATE["simulated_down"] = False
    gateway.OFFLINE_EVENT_QUEUE.clear()
