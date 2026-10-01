"""SerialManager - the single owner of the Arduino USB connection.

Architecture
------------
``pyserial`` reads are blocking, so the whole serial lifecycle lives in **one**
dedicated background thread. That thread is the only thing that ever touches the
port; FastAPI's event loop never blocks on I/O.

    FastAPI route  ->  start_monitoring()/stop_monitoring()   (thread-safe)
    WebSocket/API  <-  StateStore (snapshot reads)
    Serial worker  ->  writes into StateStore

Design guarantees:

* **One worker, ever.** ``_ensure_worker`` starts the thread only if it is not
  already alive, so repeated ``start_monitoring()`` calls cannot spawn a second
  reader or two threads fighting over the same COM port.
* **Blocking reads are bounded** by ``SERIAL_READ_TIMEOUT_S`` so the loop can
  always re-check its stop flag.
* **Disconnect is normal, not fatal.** Any ``SerialException``/``OSError`` closes
  the port, publishes ``DISCONNECTED`` and schedules a backed-off retry. The
  backend keeps serving HTTP and WebSocket traffic throughout.
* **Clean shutdown.** ``stop()`` signals the flag, wakes the loop, joins the
  thread and closes the port - no leaked threads or handles.

Python NEVER uploads firmware. It only reads firmware already running on the
board.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Callable

from app.config import get_settings
from app.logging_config import get_logger
from app.models.common import ConnectionState, MonitoringState
from app.models.sensors import ProtocolError, parse_sensor_line
from app.services.port_discovery import discover_arduino_port, list_ports
from app.services.state import state_store

logger = get_logger(__name__)

# Backoff bounds for reconnection attempts.
RECONNECT_INITIAL_S = 1.0
RECONNECT_MAX_S = 15.0


class SerialManager:
    """Owns the Arduino serial connection and its background worker."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._wake_event = threading.Event()
        self._monitor_lock = threading.RLock()

        self._monitoring = False
        self._connected_port: str | None = None
        self._serial: Any | None = None
        # True once a link has been established at least once; distinguishes a
        # first connect (CONNECTING) from a retry (RECONNECTING).
        self._had_connection = False
        # Test seams: allow injecting a fake serial factory / port discovery.
        self._serial_factory: Callable[[str, int, float], Any] | None = None
        self._discover: Callable[[], tuple[str | None, list[Any]]] = (
            discover_arduino_port
        )
        self._received_count = 0
        self._parse_error_count = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    @property
    def is_running(self) -> bool:
        """True when a background worker thread is alive."""
        return self._thread is not None and self._thread.is_alive()

    @property
    def port(self) -> str | None:
        return self._connected_port

    @property
    def stats(self) -> dict:
        return {
            "readings_received": self._received_count,
            "parse_errors": self._parse_error_count,
        }

    def start_monitoring(self) -> MonitoringState:
        """Begin (or resume) consuming the sensor stream.

        Safe to call repeatedly - it never creates a second worker.
        """
        with self._monitor_lock:
            if self._monitoring:
                logger.info("Monitoring already running")
                return MonitoringState.RUNNING
            self._monitoring = True
            self._stop_event.clear()
            state_store.update_monitoring(
                monitoring=True, monitoring_state=MonitoringState.STARTING
            )

        self._ensure_worker()
        return MonitoringState.RUNNING

    def stop_monitoring(self, close_port: bool = True) -> MonitoringState:
        """Stop consuming the stream. Does NOT stop the backend."""
        with self._monitor_lock:
            if not self._monitoring:
                return MonitoringState.STOPPED
            self._monitoring = False
            state_store.update_monitoring(
                monitoring=False, monitoring_state=MonitoringState.STOPPING
            )

        self._wake_event.set()
        if close_port:
            self._close_port()

        # Join BEFORE publishing the final state, so a late publish from the
        # worker can never overwrite STOPPED.
        self._joined_thread()

        state_store.update_monitoring(monitoring_state=MonitoringState.STOPPED)
        state_store.update_connection(arduino=ConnectionState.DISCONNECTED)
        logger.info("Monitoring stopped")
        return MonitoringState.STOPPED

    def stop(self, timeout: float = 5.0) -> None:
        """Full shutdown, used by the app lifespan."""
        logger.info("Stopping serial manager...")
        self.stop_monitoring(close_port=True)
        self._stop_event.set()
        self._wake_event.set()
        self._joined_thread(timeout)
        logger.info("Serial manager stopped")

    # ------------------------------------------------------------------
    # Worker lifecycle
    # ------------------------------------------------------------------
    def _ensure_worker(self) -> None:
        """Start the worker only if one is not already alive."""
        if self.is_running:
            return
        if self._stop_event.is_set():
            self._stop_event.clear()  # allow restart after a previous stop()
        self._thread = threading.Thread(
            target=self._worker_loop, name="serial-worker", daemon=True
        )
        self._thread.start()
        logger.info("Serial worker thread started")

    def _joined_thread(self, timeout: float = 5.0) -> None:
        thread = self._thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=timeout)
        self._thread = None

    # ------------------------------------------------------------------
    # Connection handling
    # ------------------------------------------------------------------
    def _open_port(self) -> tuple[str | None, Any]:
        """Resolve a port and open it. Returns ``(device, serial)``."""
        settings = self._settings
        configured = (settings.serial_port or "").strip()

        if configured:
            device: str | None = configured
            logger.info("Using configured ARDUINO_PORT: %s", device)
        else:
            device, _ports = self._discover()
            if not device:
                return None, None

        logger.info("Connecting to %s at %d baud...", device, settings.serial_baud)

        factory = self._serial_factory or self._default_factory
        try:
            serial_obj = factory(device, settings.serial_baud, settings.serial_read_timeout_s)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to open %s: %s", device, exc)
            return device, None

        self._connected_port = device
        # Assign the handle HERE (not in the caller) so that a concurrent
        # stop_monitoring() can never race between "port opened" and
        # "handle stored" and leak an open COM port.
        self._serial = serial_obj
        state_store.update_connection(
            arduino=ConnectionState.CONNECTED,
            serial=ConnectionState.CONNECTED,
            serial_port=device,
        )
        logger.info("Arduino connected on %s", device)
        return device, serial_obj

    @staticmethod
    def _default_factory(device: str, baud: int, timeout: float) -> Any:
        import serial  # imported lazily so tests run without hardware

        return serial.Serial(port=device, baudrate=baud, timeout=timeout)

    def _close_port(self) -> None:
        """Close the serial handle defensively; never raises."""
        serial_obj = self._serial
        self._serial = None
        self._connected_port = None
        if serial_obj is not None:
            try:
                serial_obj.close()
            except Exception as exc:  # noqa: BLE001
                logger.debug("Ignoring error while closing port: %s", exc)
        state_store.update_connection(
            serial=ConnectionState.DISCONNECTED, serial_port=None
        )

    # ------------------------------------------------------------------
    # Worker loop
    # ------------------------------------------------------------------
    def _worker_loop(self) -> None:
        """The single background loop.

        wait for monitoring -> ensure connected -> read -> parse -> publish.
        Every failure path funnels back to a backed-off reconnect.
        """
        backoff = RECONNECT_INITIAL_S

        while not self._stop_event.is_set():
            if not self._monitoring:
                # Idle: sleep cheaply but wake when monitoring starts.
                self._wake_event.wait(timeout=0.25)
                self._wake_event.clear()
                continue

            try:
                if self._serial is None:
                    # Only advertise RECONNECTING once we have actually had a
                    # link; otherwise this is a first connect. Keeping the
                    # DISCONNECTED state visible during backoff is important -
                    # the UI must be able to show "Arduino disconnected" while
                    # the board is genuinely absent.
                    state_store.update_connection(
                        arduino=(
                            ConnectionState.RECONNECTING
                            if self._had_connection
                            else ConnectionState.CONNECTING
                        )
                    )
                    device, serial_obj = self._open_port()
                    if serial_obj is None:
                        # No port, or it refused to open -> retry later.
                        state_store.update_connection(
                            arduino=ConnectionState.DISCONNECTED
                        )
                        state_store.update_monitoring(
                            monitoring_state=MonitoringState.RUNNING
                        )
                        if self._sleep_backoff(backoff):
                            return
                        backoff = min(backoff * 2, RECONNECT_MAX_S)
                        continue
                    self._had_connection = True
                    backoff = RECONNECT_INITIAL_S

                    # Bail out BEFORE publishing RUNNING: monitoring may have
                    # been cancelled while the port was opening, and a late
                    # RUNNING publish would overwrite the STOPPED state.
                    if not self._monitoring:
                        self._close_port()
                        continue

                    state_store.update_monitoring(
                        monitoring_state=MonitoringState.RUNNING
                    )

                self._read_once()

            except Exception as exc:  # noqa: BLE001 - the loop must never die
                logger.warning("Arduino disconnected (%s)", exc)
                self._close_port()
                # Leave the state at DISCONNECTED for the whole backoff window
                # so the frontend can actually display it.
                state_store.update_connection(
                    arduino=ConnectionState.DISCONNECTED,
                    serial=ConnectionState.DISCONNECTED,
                )
                state_store.update_monitoring(
                    monitoring_state=MonitoringState.RUNNING
                )
                logger.info("Attempting reconnection...")
                if self._sleep_backoff(backoff):
                    return
                backoff = min(backoff * 2, RECONNECT_MAX_S)

        logger.debug("Serial worker loop exiting")

    # ------------------------------------------------------------------
    # Reading and parsing
    # ------------------------------------------------------------------
    def _read_once(self) -> None:
        """Read whatever bytes are currently available, then handle them.

        The port timeout bounds each read, so an unplugged board surfaces as
        an error instead of hanging the worker forever.
        """
        serial_obj = self._serial
        if serial_obj is None:
            return

        waiting = getattr(serial_obj, "in_waiting", 0) or 0
        if waiting == 0:
            line = serial_obj.readline()
        else:
            line = serial_obj.read(waiting)

        if not line:
            return
        if isinstance(line, (bytes, bytearray)):
            line = line.decode("utf-8", errors="replace")

        for raw in str(line).splitlines():
            self._handle_line(raw)

    def _handle_line(self, raw: str) -> None:
        """Parse one line and publish valid readings into the StateStore."""
        try:
            reading = parse_sensor_line(raw)
        except ProtocolError as exc:
            self._parse_error_count += 1
            # Log the first few, then throttle, so a noisy cable cannot flood
            # the terminal.
            if self._parse_error_count <= 5 or self._parse_error_count % 50 == 0:
                logger.warning("Malformed serial packet: %s", exc)
            return

        if reading is None:
            return  # blank line or '#' banner - normal, not an error

        self._received_count += 1
        state_store.update_sensor(reading)
        logger.info(
            "Sensor data received: T=%s H=%s L=%s M=%s",
            reading.temperature,
            reading.humidity,
            reading.light,
            reading.motion,
        )

    def _sleep_backoff(self, seconds: float) -> bool:
        """Sleep, waking early on shutdown OR monitoring cancellation.

        Waits in short slices rather than one long sleep, so a stop request is
        honoured promptly instead of only after the whole backoff window
        (which can be up to RECONNECT_MAX_S seconds).

        Returns True when the worker should exit.
        """
        deadline = time.monotonic() + seconds
        while True:
            if self._stop_event.is_set():
                return True
            if not self._monitoring:
                return True
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return False
            # Slice the wait so cancellation is noticed within ~100 ms.
            self._stop_event.wait(timeout=min(0.1, remaining))


# Process-wide singleton wired into the FastAPI lifespan.
serial_manager = SerialManager()


def get_serial_manager() -> SerialManager:
    """Dependency-injection accessor (keeps routes testable)."""
    return serial_manager


def available_ports() -> list[dict]:
    """Diagnostic helper for the System page."""
    return [p.as_dict() for p in list_ports()]