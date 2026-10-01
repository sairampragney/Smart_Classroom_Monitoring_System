"""Tests for configuration loading."""

from __future__ import annotations

from app.config import Settings, get_settings
from app.services.state import RuntimeState, StateStore


def test_defaults_are_safe():
    s = Settings()
    assert s.demo_mode is False           # REAL HARDWARE by default
    assert s.serial_port == ""            # empty => auto-discovery
    assert s.serial_force_port is False
    assert "localhost:5173" in " ".join(s.cors_origin_list)
    assert "*" not in s.cors_origin_list  # never a wildcard


def test_cors_origin_list_parses_and_trims():
    s = Settings(cors_allowed_origins="http://a.test , http://b.test ,")
    assert s.cors_origin_list == ["http://a.test", "http://b.test"]


def test_paths_resolve_against_project_root():
    s = Settings(history_db_path="backend/data/history.db")
    assert s.resolved_history_db.is_absolute()
    assert s.resolved_history_db.name == "history.db"


def test_get_settings_is_cached():
    assert get_settings() is get_settings()


def test_state_store_defaults_are_not_connected():
    store = StateStore()
    s = store.snapshot()
    assert s.arduino.value == "DISCONNECTED"
    assert s.cv.value == "STOPPED"
    assert s.ml.value == "NOT_LOADED"
    assert s.sensor is None
    assert s.cv_result is None
    assert s.ml_prediction is None


def test_state_store_updates_are_visible_in_snapshot():
    store = StateStore()
    store.update_sensor({"temperature": 25.0})
    store.update_cv({"face_count": 2})
    store.update_ml({"prediction": "OCCUPIED"})
    s = store.snapshot()
    assert s.sensor == {"temperature": 25.0}
    assert s.cv_result == {"face_count": 2}
    assert s.ml_prediction == {"prediction": "OCCUPIED"}


def test_snapshot_returns_a_copy_not_live_state():
    """Mutating a snapshot must not corrupt the store."""
    store = StateStore()
    snap = store.snapshot()
    snap.sensor = {"tampered": True}
    assert store.snapshot().sensor is None


def test_uptime_is_monotonic():
    store = StateStore()
    assert store.snapshot().uptime_s() >= 0.0
    assert isinstance(store.snapshot(), RuntimeState)