"""SerialManager lifecycle tests using a fake serial device.

SIMULATED TESTS. They exercise connection, parsing, disconnect and reconnect
logic against a fake transport. They prove NOTHING about physical hardware.
"""

from __future__ import annotations

import threading
import time

import pytest

from app.models.common import ConnectionState, MonitoringState


def _wait_for(predicate, timeout=3.0, interval=0.02):
    """Poll until predicate() is true or the timeout elapses."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


# ----------------------------------------------------------------------
# Startup / idle behaviour
# ----------------------------------------------------------------------
def test_worker_not_started_before_monitoring(manager, fresh_state):
    """No background thread may exist until monitoring is requested."""
    assert manager.is_running is False
    assert fresh_state.snapshot().monitoring_running is False
    assert fresh_state.snapshot().monitoring is MonitoringState.STOPPED


def test_initial_state_is_disconnected(manager, fresh_state):
    s = fresh_state.snapshot()
    assert s.arduino is ConnectionState.DISCONNECTED
    assert s.serial is ConnectionState.DISCONNECTED
    assert s.serial_port is None
    assert s.sensor is None


def test_stop_monitoring_when_never_started(manager):
    assert manager.stop_monitoring() is MonitoringState.STOPPED


# ----------------------------------------------------------------------
# Connection + data flow
# ----------------------------------------------------------------------
def test_start_monitoring_connects_and_publishes(manager, fresh_state):
    manager.start_monitoring()
    assert _wait_for(lambda: manager.fake_serials), "no serial instance created"

    port = manager.fake_serials[0]
    assert _wait_for(lambda: fresh_state.snapshot().serial_port == "COM5")

    port.feed('{"temperature":28.60,"humidity":57.20,"light":642,"motion":true}\n')

    def got_reading():
        snap = fresh_state.snapshot()
        return snap.sensor is not None and snap.sensor["light"] == 642

    assert _wait_for(got_reading), "sensor reading was never published"

    snap = fresh_state.snapshot()
    assert snap.sensor["temperature"] == pytest.approx(28.6)
    assert snap.sensor["humidity"] == pytest.approx(57.2)
    assert snap.sensor["motion"] is True
    assert snap.arduino is ConnectionState.CONNECTED
    assert snap.serial is ConnectionState.CONNECTED
    assert snap.monitoring is MonitoringState.RUNNING


def test_banner_lines_do_not_create_readings(manager, fresh_state):
    manager.start_monitoring()
    assert _wait_for(lambda: manager.fake_serials)
    port = manager.fake_serials[0]

    port.feed(
        "# Smart Classroom Sensor Firmware v1.0.0\n"
        "# DHT22=D2 LDR=A0 PIR=D7 INTERVAL_MS=1000\n"
        "# READY\n"
    )
    time.sleep(0.4)
    assert fresh_state.snapshot().sensor is None
    assert manager.stats["parse_errors"] == 0


def test_malformed_packets_are_counted_and_survived(manager, fresh_state):
    manager.start_monitoring()
    assert _wait_for(lambda: manager.fake_serials)
    port = manager.fake_serials[0]

    port.feed("garbage-not-json\n{bad json\n")
    assert _wait_for(lambda: manager.stats["parse_errors"] >= 2)

    # The worker must still be alive after malformed input.
    assert manager.is_running is True

    # ...and must still accept good data afterwards.
    port.feed('{"temperature":25.00,"humidity":50.00,"light":100,"motion":false}\n')
    assert _wait_for(
        lambda: fresh_state.snapshot().sensor is not None
        and fresh_state.snapshot().sensor["light"] == 100
    )


def test_null_values_survive_the_pipeline(manager, fresh_state):
    manager.start_monitoring()
    assert _wait_for(lambda: manager.fake_serials)
    manager.fake_serials[0].feed(
        '{"temperature":null,"humidity":null,"light":42,"motion":false,'
        '"err":"DHT22_READ_FAILED"}\n'
    )
    assert _wait_for(lambda: fresh_state.snapshot().sensor is not None)
    snap = fresh_state.snapshot()
    assert snap.sensor["temperature"] is None
    assert snap.sensor["light"] == 42
    assert snap.sensor_error == "DHT22_READ_FAILED"


def test_multiple_lines_in_one_read_are_all_parsed(manager, fresh_state):
    manager.start_monitoring()
    assert _wait_for(lambda: manager.fake_serials)
    manager.fake_serials[0].feed(
        '{"temperature":20.00,"humidity":40.00,"light":1,"motion":false}\n'
        '{"temperature":21.00,"humidity":41.00,"light":2,"motion":true}\n'
    )
    assert _wait_for(lambda: manager.stats["readings_received"] >= 2)
    assert fresh_state.snapshot().sensor["light"] == 2


# ----------------------------------------------------------------------
# Thread hygiene
# ----------------------------------------------------------------------
def test_repeated_start_does_not_create_duplicate_workers(manager):
    for _ in range(5):
        manager.start_monitoring()
    assert _wait_for(lambda: manager.fake_serials)
    time.sleep(0.3)
    names = [t.name for t in threading.enumerate() if t.name == "serial-worker"]
    assert len(names) == 1, f"expected exactly one worker, found {len(names)}"


def test_stop_monitoring_terminates_worker_and_closes_port(manager, fresh_state):
    manager.start_monitoring()
    assert _wait_for(lambda: manager.fake_serials)
    # Wait until the link is actually established before stopping, so this
    # asserts teardown rather than a startup race.
    assert _wait_for(lambda: fresh_state.snapshot().serial_port == "COM5")
    port = manager.fake_serials[0]

    manager.stop_monitoring()

    assert manager.is_running is False
    assert port.closed_count >= 1
    assert port.is_open is False
    snap = fresh_state.snapshot()
    assert snap.monitoring_running is False
    assert snap.monitoring is MonitoringState.STOPPED
    assert snap.arduino is ConnectionState.DISCONNECTED


def test_stop_while_connecting_does_not_leak_the_port(manager, fresh_state):
    """Regression: cancelling mid-connect must not leak an open COM port."""
    manager.start_monitoring()
    # Stop immediately - possibly while _open_port() is in flight.
    manager.stop_monitoring()
    time.sleep(0.3)

    for port in manager.fake_serials:
        assert port.closed_count >= 1, "a serial handle was opened but never closed"
    assert manager.is_running is False


def test_stop_during_backoff_returns_promptly(manager, fresh_state):
    """Regression: stopping must not block for the whole backoff window."""
    # No port ever appears -> the worker sits in backoff.
    manager._discover = lambda: (None, [])
    manager.start_monitoring()
    assert _wait_for(lambda: manager.is_running)
    # Let the backoff grow past 1s.
    time.sleep(1.6)

    started = time.monotonic()
    manager.stop_monitoring()
    elapsed = time.monotonic() - started

    assert manager.is_running is False
    assert elapsed < 1.0, f"stop_monitoring blocked for {elapsed:.2f}s"


def test_stop_is_idempotent(manager):
    manager.start_monitoring()
    manager.stop_monitoring()
    manager.stop_monitoring()
    manager.stop()
    assert manager.is_running is False


# ----------------------------------------------------------------------
# Disconnect + reconnect
# ----------------------------------------------------------------------
def test_read_failure_marks_disconnected_and_keeps_worker_alive(manager, fresh_state):
    manager.start_monitoring()
    assert _wait_for(lambda: manager.fake_serials)
    port = manager.fake_serials[0]
    assert _wait_for(lambda: fresh_state.snapshot().serial_port == "COM5")

    # Simulate the board being yanked out mid-read.
    port.fail_with(OSError("device disconnected"))

    assert _wait_for(
        lambda: fresh_state.snapshot().arduino
        in (ConnectionState.DISCONNECTED, ConnectionState.RECONNECTING),
        timeout=3.0,
    )
    # Crucially, the backend worker must NOT die.
    assert manager.is_running is True
    assert port.closed_count >= 1


def test_reconnects_and_resumes_after_disconnect(manager, fresh_state):
    manager.start_monitoring()
    assert _wait_for(lambda: manager.fake_serials)
    first = manager.fake_serials[0]
    assert _wait_for(lambda: fresh_state.snapshot().serial_port == "COM5")

    first.fail_with(OSError("device disconnected"))
    assert _wait_for(
        lambda: fresh_state.snapshot().arduino is ConnectionState.DISCONNECTED,
        timeout=3.0,
    )

    # A new port instance must be opened automatically.
    assert _wait_for(lambda: len(manager.fake_serials) >= 2, timeout=6.0)
    second = manager.fake_serials[1]

    assert _wait_for(
        lambda: fresh_state.snapshot().arduino is ConnectionState.CONNECTED,
        timeout=6.0,
    )
    assert fresh_state.snapshot().serial_port == "COM5"

    # Data flows again on the NEW handle.
    second.feed('{"temperature":26.00,"humidity":52.00,"light":321,"motion":true}\n')
    assert _wait_for(
        lambda: fresh_state.snapshot().sensor is not None
        and fresh_state.snapshot().sensor["light"] == 321,
        timeout=4.0,
    )


def test_backend_survives_disconnect(manager, fresh_state):
    """State must remain readable while the board is gone."""
    manager.start_monitoring()
    assert _wait_for(lambda: manager.fake_serials)
    manager.fake_serials[0].fail_with(OSError("gone"))

    assert _wait_for(
        lambda: fresh_state.snapshot().arduino is ConnectionState.DISCONNECTED,
        timeout=3.0,
    )
    snap = fresh_state.snapshot()
    assert snap.arduino in (ConnectionState.DISCONNECTED, ConnectionState.RECONNECTING)
    assert manager.is_running is True


def test_no_port_available_stays_disconnected_without_crashing(manager, fresh_state):
    """Discovery returning nothing must not kill the worker."""
    manager._discover = lambda: (None, [])
    manager.start_monitoring()

    assert _wait_for(lambda: manager.is_running)
    time.sleep(0.5)
    assert manager.is_running is True
    assert fresh_state.snapshot().sensor is None

    manager.stop_monitoring()
    assert manager.is_running is False