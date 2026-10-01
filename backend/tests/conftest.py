"""Shared pytest fixtures."""

from __future__ import annotations

import sys
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Make "backend" importable regardless of the working directory.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT.parent))

from backend.main import app  # noqa: E402
from app.services.serial_manager import SerialManager  # noqa: E402
from app.services.state import StateStore  # noqa: E402


@pytest.fixture()
def client():
    """FastAPI TestClient for REST endpoints."""
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def ws_client():
    """TestClient with WebSocket support enabled."""
    with TestClient(app) as c:
        yield c


# ----------------------------------------------------------------------
# Serial fakes
#
# These simulate the TRANSPORT only (a port that yields bytes, or fails).
# They exist to exercise serial-management logic without hardware.
#
# IMPORTANT: passing these tests does NOT prove physical hardware works.
# They say nothing about a real Arduino, a real DHT22, or real timing.
# ----------------------------------------------------------------------
class FakeSerial:
    """Minimal stand-in for ``serial.Serial``."""

    def __init__(self, port: str = "COM5", baud: int = 9600, timeout: float = 1.0):
        self.port = port
        self.baudrate = baud
        self.timeout = timeout
        self.is_open = True
        self._buffer = bytearray()
        self._lock = threading.Lock()
        self.closed_count = 0
        # Exception raised on the next read (simulates an unplugged board).
        self.fail_next_read: Exception | None = None

    def feed(self, text: str) -> None:
        with self._lock:
            self._buffer.extend(text.encode("utf-8"))

    def fail_with(self, exc: Exception) -> None:
        with self._lock:
            self.fail_next_read = exc

    @property
    def in_waiting(self) -> int:
        with self._lock:
            return len(self._buffer)

    def read(self, size: int = 1) -> bytes:
        with self._lock:
            if self.fail_next_read is not None:
                exc = self.fail_next_read
                self.fail_next_read = None
                raise exc
            data = bytes(self._buffer[:size])
            del self._buffer[:size]
            return data

    def readline(self) -> bytes:
        with self._lock:
            if self.fail_next_read is not None:
                exc = self.fail_next_read
                self.fail_next_read = None
                raise exc
            if not self._buffer:
                return b""
            idx = self._buffer.find(b"\n")
            if idx == -1:
                data = bytes(self._buffer)
                self._buffer.clear()
            else:
                data = bytes(self._buffer[: idx + 1])
                del self._buffer[: idx + 1]
            return data

    def close(self) -> None:
        self.is_open = False
        self.closed_count += 1


@pytest.fixture()
def fresh_state(monkeypatch):
    """Replace the process-wide StateStore with an isolated instance."""
    from app.services import serial_manager as sm_mod
    from app.services import state as state_mod

    store = StateStore()
    monkeypatch.setattr(state_mod, "state_store", store)
    monkeypatch.setattr(sm_mod, "state_store", store)
    return store


@pytest.fixture()
def manager(monkeypatch, fresh_state):
    """A SerialManager wired to fakes: no real port is ever opened."""
    created: list[FakeSerial] = []

    def factory(port: str, baud: int, timeout: float) -> FakeSerial:
        s = FakeSerial(port, baud, timeout)
        created.append(s)
        return s

    mgr = SerialManager()
    mgr._serial_factory = factory
    mgr._discover = lambda: ("COM5", [])
    mgr.fake_serials = created  # type: ignore[attr-defined]
    yield mgr
    mgr.stop(timeout=2.0)