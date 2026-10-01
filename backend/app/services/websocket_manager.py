"""WebSocket connection management and broadcasting.

Responsibilities in Phase 2:
  * accept / release connections safely
  * send a ``hello`` handshake and an initial ``system_status`` snapshot
  * answer client ``ping`` messages
  * broadcast to every connected client

Later phases only need to call :meth:`WebSocketManager.broadcast` with a new
message type - no changes to the connection lifecycle.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.logging_config import get_logger
from app.models.ws import WSMessage, WSMessageType
from app.services.state import RuntimeState, state_store

logger = get_logger(__name__)


def _status_payload(state: RuntimeState, client_count: int) -> dict:
    """Build the ``system_status`` payload from a state snapshot."""
    return {
        "uptime_s": state.uptime_s(),
        "websocket_clients": client_count,
        "monitoring_running": state.monitoring_running,
        "arduino": state.arduino.value,
        "serial": state.serial.value,
        "serial_port": state.serial_port,
        "camera": state.camera.value,
        "cv": state.cv.value,
        "ml": state.ml.value,
        "sensor": state.sensor,
        "ml_prediction": state.ml_prediction,
    }


class WebSocketManager:
    """Tracks active WebSocket clients and broadcasts to them."""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def connect(self, websocket: WebSocket) -> None:
        """Accept a connection and register it."""
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)
        logger.info("WebSocket client connected (%d total)", len(self._clients))

    async def disconnect(self, websocket: WebSocket) -> None:
        """Deregister a connection (idempotent)."""
        async with self._lock:
            self._clients.discard(websocket)
        logger.info("WebSocket client disconnected (%d remain)", len(self._clients))

    async def send(self, websocket: WebSocket, message: WSMessage) -> bool:
        """Send one message to a single client, dropping dead sockets."""
        try:
            if websocket.client_state is not WebSocketState.CONNECTED:
                await self.disconnect(websocket)
                return False
            await websocket.send_json(message.to_json_dict())
            return True
        except Exception as exc:  # noqa: BLE001 - never let one bad client kill the loop
            logger.warning("Dropping WebSocket client after send failure: %s", exc)
            await self.disconnect(websocket)
            return False

    async def broadcast(self, message: WSMessage) -> int:
        """Broadcast to all clients. Returns the number successfully reached."""
        if not self._clients:
            return 0
        payload = message.to_json_dict()
        targets = list(self._clients)
        results = await asyncio.gather(
            *(self._safe_send(ws, payload) for ws in targets), return_exceptions=True
        )
        return sum(1 for r in results if r is True)

    async def _safe_send(self, websocket: WebSocket, payload: dict) -> bool:
        try:
            if websocket.client_state is not WebSocketState.CONNECTED:
                await self.disconnect(websocket)
                return False
            await websocket.send_json(payload)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("Broadcast send failed, dropping client: %s", exc)
            await self.disconnect(websocket)
            return False

    async def send_system_status(self, websocket: WebSocket) -> None:
        """Send the current state snapshot to one client."""
        await self.send(
            websocket,
            WSMessage(
                type=WSMessageType.SYSTEM_STATUS,
                payload=_status_payload(state_store.snapshot(), self.client_count),
            ),
        )

    async def broadcast_system_status(self) -> int:
        """Broadcast the current state snapshot to everyone."""
        return await self.broadcast(
            WSMessage(
                type=WSMessageType.SYSTEM_STATUS,
                payload=_status_payload(state_store.snapshot(), self.client_count),
            )
        )


# Process-wide singleton used by the API layer.
ws_manager = WebSocketManager()