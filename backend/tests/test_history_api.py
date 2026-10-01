"""History API tests (Phase 9).

An isolated temporary database is injected so the real one is untouched.
"""

from __future__ import annotations

import pytest

from app.services.history_db import HistoryDatabase, set_history_db, utc_now_iso


@pytest.fixture()
def client_with_db(client, tmp_path):
    db = HistoryDatabase(tmp_path / "api_history.db")
    db.init_db()
    set_history_db(db)
    yield client, db
    db.close()
    set_history_db(None)


def _insert(db, **kw):
    row = {
        "ts": utc_now_iso(),
        "temperature": 25.0, "humidity": 50.0, "light": 300, "motion": 1,
        "head_count": 2, "ml_prediction": "OCCUPIED", "ml_confidence": 0.9,
        "ml_model": "DecisionTree", "arduino": "CONNECTED",
        "cv_state": "RUNNING", "ml_state": "LOADED", "monitoring": 1,
    }
    row.update(kw)
    return db.insert(row)


def test_history_empty_returns_empty_list(client_with_db):
    c, _ = client_with_db
    r = c.get("/api/history")
    assert r.status_code == 200
    body = r.json()
    assert body["records"] == []
    assert body["count"] == 0
    assert body["total_rows"] == 0


def test_history_returns_records_newest_first(client_with_db):
    c, db = client_with_db
    _insert(db, temperature=1.0)
    _insert(db, temperature=2.0)
    _insert(db, temperature=3.0)

    body = c.get("/api/history").json()
    assert body["count"] == 3
    assert [r["temperature"] for r in body["records"]] == [3.0, 2.0, 1.0]


def test_history_limit_parameter(client_with_db):
    c, db = client_with_db
    for i in range(5):
        _insert(db, temperature=float(i))
    body = c.get("/api/history?limit=2").json()
    assert body["count"] == 2
    assert body["limit"] == 2
    assert body["total_rows"] == 5


def test_history_rejects_invalid_limit(client_with_db):
    c, _ = client_with_db
    assert c.get("/api/history?limit=0").status_code == 422
    assert c.get("/api/history?limit=-1").status_code == 422
    assert c.get("/api/history?limit=99999").status_code == 422
    assert c.get("/api/history?limit=abc").status_code == 422


def test_history_latest_endpoint(client_with_db):
    c, db = client_with_db
    empty = c.get("/api/history/latest").json()
    assert empty["has_data"] is False
    assert empty["record"] is None

    _insert(db, temperature=7.5)
    body = c.get("/api/history/latest").json()
    assert body["has_data"] is True
    assert body["record"]["temperature"] == pytest.approx(7.5)


def test_history_stats_endpoint(client_with_db):
    c, db = client_with_db
    _insert(db)
    body = c.get("/api/history/stats").json()
    assert body["rows"] == 1
    assert body["exists"] is True


def test_history_null_fields_survive_the_api(client_with_db):
    c, db = client_with_db
    _insert(db, temperature=None, motion=None, ml_confidence=None)
    rec = c.get("/api/history").json()["records"][0]
    assert rec["temperature"] is None
    assert rec["motion"] is None
    assert rec["ml_confidence"] is None
