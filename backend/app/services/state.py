"""In-memory state store - the single source of truth for runtime state.

Design rationale
----------------
From Phase 4 onward, hardware/CV work runs in **background threads** while the
WebSocket layer runs on the **asyncio event loop**. Rather than letting threads
push directly to sockets (which requires thread-safe async primitives
everywhere), threads simply publish their latest values into this store, and the
broadcast layer reads from it.

That keeps later phases additive:

* Phase 4 ``SerialManager``  -> ``update_arduino(...)`` / ``update_sensor(...)``
* Phase 6 ``CVService``      -> ``update_cv(...)``
* Phase 8 ``MLService``      -> ``update_ml(...)``

...without restructuring the WebSocket layer or the REST endpoints.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any

from app.models.common import ConnectionState, CVState, MLState


@dataclass
class RuntimeState:
    """Mutable snapshot of everything the backend knows."""

    started_at: float = field(default_factory=time.monotonic)
    arduino: ConnectionState = ConnectionState.DISCONNECTED
    serial: ConnectionState = ConnectionState.DISCONNECTED
    camera: ConnectionState = ConnectionState.DISCONNECTED
    cv: CVState = CVState.STOPPED
    ml: MLState = MLState.NOT_LOADED
    monitoring_running: bool = False
    serial_port: str | None = None

    # Latest sensor reading (Phase 4 populates this).
    sensor: dict[str, Any] | None = None
    sensor_updated_at: float | None = None

    # Latest CV result (Phase 6 populates this).
    cv_result: dict[str, Any] | None = None

    # Latest ML prediction (Phase 8 populates this).
    ml_prediction: dict[str, Any] | None = None

    def uptime_s(self) -> float:
        return round(time.monotonic() - self.started_at, 3)


class StateStore:
    """Thread-safe holder of :class:`RuntimeState`.

    A single re-entrant lock guards every read and write. The critical sections
    are deliberately tiny (dict/enum assignment only), so contention between
    the serial/CV threads and the WebSocket loop is negligible.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._state = RuntimeState()

    # ---------- reads ----------
    def snapshot(self) -> RuntimeState:
        """Return a consistent shallow copy of the current state."""
        with self._lock:
            s = self._state
            return RuntimeState(
                started_at=s.started_at,
                arduino=s.arduino,
                serial=s.serial,
                camera=s.camera,
                cv=s.cv,
                ml=s.ml,
                monitoring_running=s.monitoring_running,
                serial_port=s.serial_port,
                sensor=dict(s.sensor) if s.sensor else None,
                sensor_updated_at=s.sensor_updated_at,
                cv_result=dict(s.cv_result) if s.cv_result else None,
                ml_prediction=dict(s.ml_prediction) if s.ml_prediction else None,
            )

    # ---------- writes (consumed by later phases) ----------
    def update_connection(
        self,
        *,
        arduino: ConnectionState | None = None,
        serial: ConnectionState | None = None,
        camera: ConnectionState | None = None,
        serial_port: str | None = None,
        monitoring_running: bool | None = None,
    ) -> None:
        with self._lock:
            if arduino is not None:
                self._state.arduino = arduino
            if serial is not None:
                self._state.serial = serial
            if camera is not None:
                self._state.camera = camera
            if serial_port is not None:
                self._state.serial_port = serial_port
            if monitoring_running is not None:
                self._state.monitoring_running = monitoring_running

    def update_sensor(self, reading: dict[str, Any]) -> None:
        """Publish a validated sensor reading (Phase 4)."""
        with self._lock:
            self._state.sensor = reading
            self._state.sensor_updated_at = time.monotonic()

    def update_cv(self, result: dict[str, Any]) -> None:
        """Publish the latest CV result (Phase 6)."""
        with self._lock:
            self._state.cv_result = result

    def update_ml(self, prediction: dict[str, Any]) -> None:
        """Publish the latest ML prediction (Phase 8)."""
        with self._lock:
            self._state.ml_prediction = prediction

    def set_cv_state(self, cv: CVState) -> None:
        with self._lock:
            self._state.cv = cv

    def set_ml_state(self, ml: MLState) -> None:
        with self._lock:
            self._state.ml = ml


# Process-wide singleton, shared by the API layer and all services.
state_store = StateStore()