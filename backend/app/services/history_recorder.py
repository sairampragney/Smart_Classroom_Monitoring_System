"""History recorder (Phase 9).

The BACKEND owns persistence. The frontend never inserts a record - it only
reads. This class samples the existing StateStore on a timer and decides what
is worth writing.

Write strategy (change detection + heartbeat)
---------------------------------------------
The firmware samples every 1 s and CV publishes at ~30 FPS, so writing on every
event would grow the database without bound. Instead a record is written when
the state has *meaningfully* changed:

* temperature differs by >= TEMP_EPSILON (0.5 °C), or
* humidity differs by >= HUM_EPSILON (2 %RH), or
* light differs by >= LIGHT_EPSILON (5 ADC), or
* motion / head_count / ml_prediction / monitoring / arduino changed, or
* MIN_WRITE_GAP_S (2 s) has passed since the last write.

Long quiet periods are represented by HEARTBEAT_S (60 s) rows, so nothing is
silently dropped from the record.

CV detail is deliberately NOT stored per frame - only the aggregate head count,
which is what the History page shows.
"""

from __future__ import annotations

import threading
import time

from app.logging_config import get_logger
from app.services.history_db import HistoryDatabase, utc_now_iso
from app.services.state import state_store

logger = get_logger(__name__)

SAMPLE_INTERVAL_S = 2.0    # how often the recorder inspects state
MIN_WRITE_GAP_S = 2.0     # never write more often than this
HEARTBEAT_S = 60.0         # force a row even when nothing changed

TEMP_EPSILON = 0.5
HUM_EPSILON = 2.0
LIGHT_EPSILON = 5


class HistoryRecorder:
    """Samples StateStore and persists meaningful changes."""

    def __init__(
        self,
        db: HistoryDatabase,
        sample_interval: float = SAMPLE_INTERVAL_S,
    ) -> None:
        self._db = db
        self._interval = sample_interval
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._last_row: dict | None = None
        self._last_write_monotonic = 0.0
        self.rows_written = 0

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        if self.is_running:
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._loop, name="history-recorder", daemon=True
        )
        self._thread.start()
        logger.info("History recorder started (sample every %.1fs)", self._interval)

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        thread = self._thread
        self._thread = None
        if thread is not None and thread.is_alive():
            thread.join(timeout=timeout)
        logger.info("History recorder stopped (%d row(s) written)", self.rows_written)

    def _loop(self) -> None:
        while not self._stop.is_set():
            if self._stop.wait(timeout=self._interval):
                break
            try:
                self.record_once()
            except Exception as exc:  # noqa: BLE001 - never kill the recorder
                logger.warning("History recorder tick failed: %s", exc)

    def build_record(self, snapshot) -> dict:
        """Flatten a StateStore snapshot into a history row.

        Missing values stay NULL. A failed DHT read or an absent CV/ML signal
        must never be written as 0.
        """
        sensor = snapshot.sensor or {}
        cv = snapshot.cv_result or {}
        ml = snapshot.ml_prediction or {}
        motion = sensor.get("motion")
        return {
            "ts": utc_now_iso(),
            "temperature": sensor.get("temperature"),
            "humidity": sensor.get("humidity"),
            "light": sensor.get("light"),
            # SQLite has no boolean type; NULL must stay NULL, so None -> None
            # and True/False -> 1/0 explicitly.
            "motion": None if motion is None else int(bool(motion)),
            "head_count": cv.get("face_count"),
            "ml_prediction": ml.get("prediction"),
            "ml_confidence": ml.get("confidence"),
            "ml_model": ml.get("model"),
            "arduino": snapshot.arduino.value,
            "cv_state": snapshot.cv.value,
            "ml_state": snapshot.ml.value,
            "monitoring": 1 if snapshot.monitoring_running else 0,
        }

    @staticmethod
    def _meaningfully_changed(new: dict, old: dict | None) -> bool:
        """True when the new record differs enough to justify a row."""
        if old is None:
            return True

        def num(row, key):
            v = row.get(key)
            return None if v is None else float(v)

        for key, eps in (
            ("temperature", TEMP_EPSILON),
            ("humidity", HUM_EPSILON),
            ("light", LIGHT_EPSILON),
        ):
            a, b = num(old, key), num(new, key)
            if a is None or b is None:
                if a is not b:  # one side gained or lost a value
                    return True
                continue
            if abs(a - b) >= eps:
                return True

        for key in ("motion", "head_count", "ml_prediction", "monitoring", "arduino"):
            if old.get(key) != new.get(key):
                return True
        return False

    def record_once(self, force: bool = False) -> bool:
        """Write one row if warranted. Returns True when a row was written."""
        snapshot = state_store.snapshot()
        record = self.build_record(snapshot)

        if (
            record["temperature"] is None
            and record["head_count"] is None
            and record["ml_prediction"] is None
        ):
            # Nothing real has arrived yet - do not persist an all-NULL row.
            return False

        now = time.monotonic()
        with self._lock:
            elapsed = now - self._last_write_monotonic
            changed = self._meaningfully_changed(record, self._last_row)
            if not force:
                if not changed and elapsed < HEARTBEAT_S:
                    return False
                if elapsed < MIN_WRITE_GAP_S:
                    return False
            self._last_write_monotonic = now
            self._last_row = record

        self._db.insert(record)
        self.rows_written += 1
        logger.debug("History row %d written", self.rows_written)
        return True

