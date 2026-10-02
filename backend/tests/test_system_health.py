"""Phase 10 - system health aggregation.

The System page must never show a fabricated green light, so these tests pin
two things:

1. the /health payload reports REAL runtime state (detector, fps, head count,
   loaded model, database probe) rather than configured defaults;
2. a failing database degrades to ``ERROR`` instead of taking /health down.

These tests use fakes. They prove the reporting logic is honest; they do NOT
prove any physical hardware is connected.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import health as health_api  # noqa: E402
from app.models.common import ConnectionState, CVState, MLState  # noqa: E402
from app.services.state import state_store  # noqa: E402


@pytest.fixture()
def health_client():
    """TestClient WITHOUT the app lifespan.

    These tests exercise read-only reporting logic on /health. Running the
    lifespan would re-load the real ML model and spin up the recorder and
    broadcaster for every single test, which is slow and irrelevant here. The
    component state is injected explicitly below instead.
    """
    return TestClient(__import__("backend.main", fromlist=["app"]).app)


@pytest.fixture(autouse=True)
def _reset_state():
    """Every test starts from, and returns to, a clean idle runtime.

    The StateStore is process-wide, so it is forced back to its idle values
    around every test to keep ordering irrelevant.
    """
    def _idle():
        state_store.update_connection(
            arduino=ConnectionState.DISCONNECTED,
            serial=ConnectionState.DISCONNECTED,
            camera=ConnectionState.DISCONNECTED,
        )
        state_store.set_cv_state(CVState.STOPPED)
        state_store.set_ml_state(MLState.NOT_LOADED)

    _idle()
    yield
    _idle()


class _FakeCV:
    detector_name = "YuNet"
    fps = None


class _FakeML:
    model_name = "DecisionTree"
    error = None
    is_loaded = True


def _patch(monkeypatch, cv=None, ml=None):
    monkeypatch.setattr(health_api, "get_cv_service", lambda: cv or _FakeCV())
    monkeypatch.setattr(health_api, "get_ml_service", lambda: ml or _FakeML())


def _cv(fps):
    return type("CV", (), {"detector_name": "YuNet", "fps": fps})()


def _ml(name, error=None, loaded=True):
    return type(
        "ML", (), {"model_name": name, "error": error, "is_loaded": loaded}
    )()


# ---------------------------------------------------------------- idle state
def test_health_reports_honest_idle_state(health_client, monkeypatch):
    """Nothing has run yet, so nothing may claim to be running."""
    _patch(monkeypatch)
    svc = health_client.get("/health").json()["services"]

    assert svc["arduino"] == "DISCONNECTED"
    assert svc["serial"] == "DISCONNECTED"
    assert svc["cv"] == "STOPPED"
    assert svc["ml"] == "NOT_LOADED"
    # Detail values must be absent, not zero-filled.
    assert svc["cv_fps"] is None
    assert svc["head_count"] is None
    assert svc["ml_model"] is None


def test_health_reports_running_cv_with_real_values(health_client, monkeypatch):
    _patch(monkeypatch, cv=_cv(30.88))
    state_store.set_cv_state(CVState.RUNNING)
    state_store.update_connection(camera=ConnectionState.CONNECTED)
    state_store.update_cv({"face_count": 3, "fps": 30.88})

    svc = health_client.get("/health").json()["services"]

    assert svc["cv"] == "RUNNING"
    assert svc["cv_fps"] == 30.88
    assert svc["head_count"] == 3
    assert svc["cv_detector"] == "YuNet"


def test_fps_and_head_count_hidden_when_cv_stopped(health_client, monkeypatch):
    """A stale measured FPS must not be shown once detection has stopped."""
    _patch(monkeypatch, cv=_cv(30.88))
    state_store.set_cv_state(CVState.STOPPED)
    state_store.update_cv({"face_count": 3, "fps": 30.88})

    svc = health_client.get("/health").json()["services"]

    assert svc["cv_fps"] is None
    assert svc["head_count"] is None


def test_health_reports_loaded_model_not_configured_artifact(health_client, monkeypatch):
    """The model name comes from the loaded model, not the config default."""
    _patch(monkeypatch, ml=_ml("RandomForest"))
    state_store.set_ml_state(MLState.LOADED)

    svc = health_client.get("/health").json()["services"]

    assert svc["ml"] == "LOADED"
    assert svc["ml_model"] == "RandomForest"


# ----------------------------------------------------------------- database
def test_database_reports_ready_with_row_count(health_client, monkeypatch):
    class DB:
        def latest(self):
            return {"ts": "2026-10-02T00:20:11+00:00"}

        def count(self):
            return 42

    monkeypatch.setattr(health_api, "get_history_db", lambda: DB())
    _patch(monkeypatch)

    db = health_client.get("/health").json()["services"]["database"]

    assert db["status"] == "READY"
    assert db["rows"] == 42
    assert db["last_record_ts"].startswith("2026-10-02T00:20:11")
    assert db["error"] is None


def test_database_error_does_not_break_health(health_client, monkeypatch):
    """A broken database must be reported, not raise."""

    class Broken:
        def latest(self):
            raise RuntimeError("database is locked")

        def count(self):
            return 0

    monkeypatch.setattr(health_api, "get_history_db", lambda: Broken())
    _patch(monkeypatch)

    response = health_client.get("/health")

    assert response.status_code == 200
    db = response.json()["services"]["database"]
    assert db["status"] == "ERROR"
    assert "database is locked" in db["error"]
    # The rest of the payload is still complete.
    assert response.json()["services"]["cv"] == "STOPPED"


def test_database_unavailable_reports_error(health_client, monkeypatch):
    def boom():
        raise RuntimeError("no handle")

    monkeypatch.setattr(health_api, "get_history_db", boom)
    _patch(monkeypatch)

    response = health_client.get("/health")

    assert response.status_code == 200
    assert response.json()["services"]["database"]["status"] == "ERROR"


def test_unparseable_timestamp_is_dropped_not_faked(health_client, monkeypatch):
    class DB:
        def latest(self):
            return {"ts": "not-a-timestamp"}

        def count(self):
            return 1

    monkeypatch.setattr(health_api, "get_history_db", lambda: DB())
    _patch(monkeypatch)

    db = health_client.get("/health").json()["services"]["database"]

    assert db["status"] == "READY"
    assert db["last_record_ts"] is None


# --------------------------------------------------------------- components
def test_components_include_every_monitored_component(health_client, monkeypatch):
    _patch(monkeypatch)
    names = {c["name"] for c in health_client.get("/health").json()["components"]}

    for expected in (
        "backend", "websocket", "arduino", "serial",
        "camera", "cv_detector", "ml_model", "database",
    ):
        assert expected in names


def test_arduino_healthy_only_when_connected(health_client, monkeypatch):
    _patch(monkeypatch)
    state_store.update_connection(arduino=ConnectionState.CONNECTED)
    comps = {c["name"]: c for c in health_client.get("/health").json()["components"]}
    assert comps["arduino"]["healthy"] is True

    state_store.update_connection(arduino=ConnectionState.DISCONNECTED)
    comps = {c["name"]: c for c in health_client.get("/health").json()["components"]}
    assert comps["arduino"]["healthy"] is False
    assert comps["arduino"]["state"] == "DISCONNECTED"


def test_serial_port_never_hardcoded(health_client, monkeypatch):
    _patch(monkeypatch)
    svc = health_client.get("/health").json()["services"]
    # No board is connected in CI, so no port may be claimed.
    assert svc["serial_port"] is None
    assert svc["arduino"] == "DISCONNECTED"


def test_status_alias_matches_health(health_client, monkeypatch):
    _patch(monkeypatch)
    a = health_client.get("/health").json()
    b = health_client.get("/api/status").json()
    assert a["components"] == b["components"]
    assert a["services"] == b["services"]


def test_phase_is_reported(health_client, monkeypatch):
    _patch(monkeypatch)
    assert health_client.get("/health").json()["phase"] == "11"



def test_ml_error_is_surfaced(health_client, monkeypatch):
    _patch(monkeypatch, ml=_ml(None, error="artifact missing", loaded=False))
    state_store.set_ml_state(MLState.ERROR)

    svc = health_client.get("/health").json()["services"]

    assert svc["ml"] == "ERROR"
    assert svc["ml_error"] == "artifact missing"
    # An unloaded model must not be named.
    assert svc["ml_model"] is None

