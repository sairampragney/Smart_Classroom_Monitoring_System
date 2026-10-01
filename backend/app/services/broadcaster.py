"""State-change broadcaster (added in Phase 5).

Why this exists
---------------
Phase 4 writes sensor data into the :class:`StateStore`, but nothing pushed it
to connected WebSocket clients - the ``sensor_reading`` / ``arduino_status``
message types were declared and never emitted. A frontend therefore had no way
to receive live values.

Design
------
A single asyncio task polls the StateStore on a short interval and broadcasts
**only when something actually changed**. Polling (rather than pushing from the
serial worker thread) is deliberate:

* the serial worker is a plain thread and must not call async code directly;
* change detection means an idle system produces zero traffic, so the socket is
  quiet when nothing is happening;
* it cannot block or be blocked by serial I/O.

Two message types are emitted:

* ``sensor_reading``  - a new validated sample arrived
* ``arduino_status``  - connection / monitoring / port state changed
"""

from __future__ import annotations

import asyncio

from app.logging_config import get_logger
from app.models.ws import WSMessage, WSMessageType
from app.services.state import state_store
from app.services.websocket_manager import ws_manager

logger = get_logger(__name__)

# How often to check for a change. 200 ms is well under the firmware's 1 s
# sampling interval, so nothing is missed, and cheap when idle.
POLL_INTERVAL_S = 0.2


def _sensor_payload(reading: dict) -> dict:
    """Build the ``sensor_reading`` payload straight from stored data."""
    return {
        "temperature": reading.get("temperature"),
        "humidity": reading.get("humidity"),
        "light": reading.get("light"),
        "motion": reading.get("motion"),
        "err": reading.get("err"),
        "received_at": reading.get("received_at"),
    }


def _status_payload(snapshot) -> dict:
    """Build the ``arduino_status`` payload from a state snapshot."""
    return {
        "arduino": snapshot.arduino.value,
        "serial": snapshot.serial.value,
        "monitoring": snapshot.monitoring.value,
        "monitoring_running": snapshot.monitoring_running,
        "serial_port": snapshot.serial_port,
    }


class StateBroadcaster:
    """Broadcasts StateStore changes to all WebSocket clients."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._last_sensor_stamp: float | None = None
        self._last_status_key: tuple | None = None

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    def reset_tracking(self) -> None:
        """Forget what was last sent (used on startup and by tests)."""
        self._last_sensor_stamp = None
        self._last_status_key = None

    async def _run(self) -> None:
        logger.info("State broadcaster started (poll %.0f ms)", POLL_INTERVAL_S * 1000)
        try:
            while True:
                await asyncio.sleep(POLL_INTERVAL_S)
                try:
                    await self.tick()
                except Exception as exc:  # noqa: BLE001 - never kill the loop
                    logger.warning("Broadcaster tick failed: %s", exc)
        except asyncio.CancelledError:
            logger.info("State broadcaster stopping")
            raise

    async def tick(self) -> None:
        """One polling pass: emit only what changed."""
        if ws_manager.client_count == 0:
            return  # nobody listening; avoid building payloads

        snapshot = state_store.snapshot()

        # --- sensor_reading ---
        if (
            snapshot.sensor is not None
            and snapshot.sensor_updated_at != self._last_sensor_stamp
        ):
            self._last_sensor_stamp = snapshot.sensor_updated_at
            await ws_manager.broadcast(
                WSMessage(
                    type=WSMessageType.SENSOR_READING,
                    payload=_sensor_payload(snapshot.sensor),
                )
            )

        # --- arduino_status ---
        key = (
            snapshot.arduino.value,
            snapshot.serial.value,
            snapshot.monitoring.value,
            snapshot.monitoring_running,
            snapshot.serial_port,
        )
        if key != self._last_status_key:
            self._last_status_key = key
            await ws_manager.broadcast(
                WSMessage(
                    type=WSMessageType.ARDUINO_STATUS,
                    payload=_status_payload(snapshot),
                )
            )

    def start(self) -> None:
        if self.is_running:
            return
        self.reset_tracking()
        self._task = asyncio.create_task(self._run(), name="state-broadcaster")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        except Exception as exc:  # noqa: BLE001
            logger.debug("Broadcaster stop raised: %s", exc)
        self._task = None


# Process-wide singleton wired into the app lifespan.
broadcaster = StateBroadcaster()