"""History persistence tests (Phase 9).

All tests use a temporary SQLite file - the real database is never touched.
"""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from app.models.sensors import SensorReading
from app.services.history_db import HistoryDatabase, utc_now_iso
from app.services.history_recorder import HistoryRecorder
from app.services.state import StateStore


@pytest.fixture()
def db(tmp_path: Path) -> HistoryDatabase:
    d = HistoryDatabase(tmp_path / "history.db")
    d.init_db()
    yield d
    d.close()


def _row(**kw):
    base = {
        "ts": utc_now_iso(),
        "temperature": 25.5, "humidity": 55.0, "light": 400, "motion": 1,
        "head_count": 2, "ml_prediction": "OCCUPIED", "ml_confidence": 0.91,
        "ml_model": "DecisionTree", "arduino": "CONNECTED",
        "cv_state": "RUNNING", "ml_state": "LOADED", "monitoring": 1,
    }
    base.update(kw)
    return base


# ----------------------------------------------------------------------
# Initialisation
# ----------------------------------------------------------------------
def test_init_creates_file_and_tables(db):
    assert db.path.exists()
    names = {
        r["name"]
        for r in db.connect().execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    assert "history" in names


def test_init_is_idempotent_and_non_destructive(db):
    db.insert(_row())
    before = db.count()
    db.init_db()          # a second call must not wipe anything
    db.init_db()
    assert db.count() == before


def test_empty_database_returns_no_rows(db):
    assert db.count() == 0
    assert db.recent(10) == []
    assert db.latest() is None


# ----------------------------------------------------------------------
# Insert / retrieval
# ----------------------------------------------------------------------
def test_insert_and_retrieve(db):
    assert db.insert(_row()) > 0
    rows = db.recent(10)
    assert len(rows) == 1
    assert rows[0]["temperature"] == pytest.approx(25.5)
    assert rows[0]["light"] == 400


def test_recent_is_newest_first(db):
    db.insert(_row(temperature=1.0))
    db.insert(_row(temperature=2.0))
    db.insert(_row(temperature=3.0))
    assert [r["temperature"] for r in db.recent(10)] == [3.0, 2.0, 1.0]


def test_limit_is_respected(db):
    for i in range(10):
        db.insert(_row(temperature=float(i)))
    assert len(db.recent(3)) == 3
    assert len(db.recent(1000)) == 10


def test_limit_is_clamped_to_at_least_one(db):
    db.insert(_row())
    assert len(db.recent(0)) == 1      # clamped up, not a crash
    assert len(db.recent(-5)) == 1


def test_latest_returns_newest(db):
    db.insert(_row(temperature=1.0))
    db.insert(_row(temperature=9.0))
    assert db.latest()["temperature"] == pytest.approx(9.0)


# ----------------------------------------------------------------------
# Null / boolean handling
# ----------------------------------------------------------------------
def test_nullable_fields_stay_null(db):
    db.insert(
        _row(temperature=None, humidity=None, light=None, motion=None,
             head_count=None, ml_prediction=None, ml_confidence=None)
    )
    r = db.recent(1)[0]
    assert r["temperature"] is None
    assert r["motion"] is None       # NOT coerced to 0
    assert r["head_count"] is None
    assert r["ml_confidence"] is None


def test_motion_stored_as_integer(db):
    db.insert(_row(motion=0))
    assert db.recent(1)[0]["motion"] == 0
    db.insert(_row(motion=1))
    assert db.recent(1)[0]["motion"] == 1


def test_timestamp_is_iso_utc(db):
    db.insert(_row())
    ts = db.recent(1)[0]["ts"]
    assert ts.endswith("+00:00") or ts.endswith("Z")


# ----------------------------------------------------------------------
# Recorder: change detection
# ----------------------------------------------------------------------
@pytest.fixture()
def recorder(monkeypatch, db):
    store = StateStore()
    from app.services import history_recorder as mod

    monkeypatch.setattr(mod, "state_store", store)
    return HistoryRecorder(db, sample_interval=0.05), store


def _feed(store, **sensor_kw):
    store.update_sensor(
        SensorReading(
            temperature=sensor_kw.get("temperature"),
            humidity=sensor_kw.get("humidity"),
            light=sensor_kw.get("light"),
            motion=sensor_kw.get("motion"),
            err=None,
        )
    )


def test_recorder_skips_when_nothing_has_arrived(recorder):
    rec, _ = recorder
    # No sensor, no CV, no ML -> nothing real to persist.
    assert rec.record_once() is False
    assert rec.rows_written == 0


def test_recorder_writes_first_real_reading(recorder):
    rec, store = recorder
    _feed(store, temperature=25.0, humidity=50.0, light=300, motion=True)
    assert rec.record_once(force=True) is True
    assert rec.rows_written == 1


def test_recorder_suppresses_unchanged_state(recorder):
    rec, store = recorder
    _feed(store, temperature=25.0, humidity=50.0, light=300, motion=True)
    rec.record_once(force=True)
    written = rec.rows_written
    for _ in range(5):
        rec.record_once()          # identical values -> no duplicates
    assert rec.rows_written == written


def test_recorder_writes_on_meaningful_change(recorder):
    rec, store = recorder
    _feed(store, temperature=25.0, humidity=50.0, light=300, motion=True)
    rec.record_once(force=True)
    first = rec.rows_written

    # Light jumps past the epsilon -> a new row is justified.
    _feed(store, temperature=25.0, humidity=50.0, light=900, motion=True)
    time.sleep(2.1)                 # clear MIN_WRITE_GAP_S
    assert rec.record_once() is True
    assert rec.rows_written == first + 1


def test_recorder_ignores_tiny_fluctuation(recorder):
    rec, store = recorder
    _feed(store, temperature=25.0, humidity=50.0, light=300, motion=True)
    rec.record_once(force=True)
    before = rec.rows_written

    _feed(store, temperature=25.1, humidity=50.0, light=300, motion=True)
    time.sleep(2.1)
    assert rec.record_once() is False     # 0.1 degC is below TEMP_EPSILON
    assert rec.rows_written == before


def test_recorder_writes_on_motion_change(recorder):
    rec, store = recorder
    _feed(store, temperature=25.0, humidity=50.0, light=300, motion=False)
    rec.record_once(force=True)
    before = rec.rows_written

    _feed(store, temperature=25.0, humidity=50.0, light=300, motion=True)
    time.sleep(2.1)
    assert rec.record_once() is True
    assert rec.rows_written == before + 1


def test_recorder_persists_head_count_and_ml(recorder):
    rec, store = recorder
    _feed(store, temperature=25.0, humidity=50.0, light=300, motion=True)
    store.update_cv({"face_count": 3, "faces": [], "frame_width": 640,
                     "frame_height": 480, "detector": "YuNet", "fps": 30.0})
    store.update_ml({"prediction": "OCCUPIED", "confidence": 0.9,
                     "model": "DecisionTree"})
    rec.record_once(force=True)

    row = rec._db.recent(1)[0]
    assert row["head_count"] == 3
    assert row["ml_prediction"] == "OCCUPIED"
    assert row["ml_confidence"] == pytest.approx(0.9)
    assert row["ml_model"] == "DecisionTree"


def test_recorder_start_stop_does_not_leak(recorder):
    rec, _ = recorder
    rec.start()
    assert rec.is_running is True
    rec.start()          # idempotent
    rec.stop()
    assert rec.is_running is False
    rec.stop()           # idempotent

