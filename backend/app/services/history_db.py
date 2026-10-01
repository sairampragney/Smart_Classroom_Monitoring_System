"""SQLite persistence for monitoring history (Phase 9).

Why SQLite
----------
This is a single-machine, single-user classroom demo. SQLite needs no server,
no credentials and no extra process, and it ships with Python. A client/server
database would add installation risk for no benefit here.

Concurrency model
-----------------
SQLite connections are not safe to share across threads, so each thread gets
its own connection via :func:`threading.local`. WAL mode lets the recorder
write while API reads are in flight, so a slow read never blocks a write.

Timestamps
----------
All timestamps are **timezone-aware ISO-8601 in UTC**, matching the rest of the
backend. Local naive timestamps are never mixed in.
"""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.logging_config import get_logger

logger = get_logger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            TEXT    NOT NULL,   -- ISO-8601 UTC
    temperature   REAL,               -- degC, NULL when the DHT failed
    humidity      REAL,               -- %RH, NULL when the DHT failed
    light         INTEGER,            -- LDR ADC, NULL when unknown
    motion        INTEGER,            -- 0/1, NULL when unknown
    head_count    INTEGER,            -- CV faces, NULL when CV is off
    ml_prediction TEXT,               -- OCCUPIED / EMPTY, NULL when no model
    ml_confidence REAL,               -- real probability, NULL if unsupported
    ml_model      TEXT,               -- model name, NULL when no model
    arduino       TEXT,               -- connection state at write time
    cv_state      TEXT,
    ml_state      TEXT,
    monitoring    INTEGER             -- 1 while monitoring is running
);

CREATE INDEX IF NOT EXISTS idx_history_ts ON history (ts DESC);
"""


def utc_now_iso() -> str:
    """Timezone-aware ISO-8601 timestamp in UTC (the project convention)."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class HistoryDatabase:
    """Thread-safe data access for the ``history`` table."""

    COLUMNS = (
        "ts", "temperature", "humidity", "light", "motion", "head_count",
        "ml_prediction", "ml_confidence", "ml_model", "arduino",
        "cv_state", "ml_state", "monitoring",
    )

    def __init__(self, path: Path) -> None:
        self.path = path
        self._local = threading.local()
        self._write_lock = threading.Lock()
        self._initialised = False
        self._init_lock = threading.Lock()

    def connect(self) -> sqlite3.Connection:
        """Return this thread's connection, creating it on first use."""
        conn = getattr(self._local, "conn", None)
        if conn is None:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(str(self.path), timeout=10.0)
            conn.row_factory = sqlite3.Row
            try:
                # WAL: readers do not block the writer.
                conn.execute("PRAGMA journal_mode=WAL")
            except sqlite3.Error:
                pass
            conn.execute("PRAGMA synchronous=NORMAL")
            self._local.conn = conn
        return conn

    def init_db(self) -> None:
        """Create the file and tables if needed. Never destroys data."""
        with self._init_lock:
            if self._initialised:
                return
            self.connect()
            with self._write_lock:
                conn = self.connect()
                conn.executescript(SCHEMA)
                conn.commit()
            self._initialised = True
            logger.info("History database ready at %s", self.path)

    def close(self) -> None:
        """Close this thread's connection (if any)."""
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            try:
                conn.close()
            except sqlite3.Error:
                pass
            self._local.conn = None

    def insert(self, record: dict[str, Any]) -> int:
        """Insert one record and return its row id."""
        self.init_db()
        values = tuple(record.get(c) for c in self.COLUMNS)
        with self._write_lock:
            conn = self.connect()
            cur = conn.execute(
                f"INSERT INTO history ({', '.join(self.COLUMNS)}) "
                f"VALUES ({', '.join('?' * len(self.COLUMNS))})",
                values,
            )
            conn.commit()
            return int(cur.lastrowid or 0)

    def recent(self, limit: int = 100) -> list[dict[str, Any]]:
        """Most recent rows, newest first."""
        self.init_db()
        limit = max(1, min(int(limit), 1000))
        cur = self.connect().execute(
            "SELECT * FROM history ORDER BY id DESC LIMIT ?", (limit,)
        )
        return [dict(r) for r in cur.fetchall()]

    def count(self) -> int:
        self.init_db()
        row = self.connect().execute("SELECT COUNT(*) AS n FROM history").fetchone()
        return int(row["n"]) if row else 0

    def latest(self) -> dict[str, Any] | None:
        """Single most recent row, or None when empty."""
        rows = self.recent(limit=1)
        return rows[0] if rows else None

    def stats(self) -> dict[str, Any]:
        """Lightweight summary for the System page."""
        return {
            "path": str(self.path),
            "rows": self.count(),
            "exists": self.path.exists(),
        }


# Process-wide singleton, created at startup by main.py.
_history_db: HistoryDatabase | None = None


def get_history_db() -> HistoryDatabase:
    """Return the process-wide database handle, creating it if needed."""
    global _history_db
    if _history_db is None:
        from app.config import get_settings

        _history_db = HistoryDatabase(get_settings().resolved_history_db)
        _history_db.init_db()
    return _history_db


def set_history_db(db: HistoryDatabase | None) -> None:
    """Inject a database handle (used by tests)."""
    global _history_db
    _history_db = db
