"""WebSocket endpoint (/ws).

Phase 2 implements the connection lifecycle and a minimal message vocabulary.
Later phases extend the server's outbound message types; the envelope is fixed.

Client -> server messages accepted today:
    {"type": "ping"}                -> {"type": "pong", ...}
    {"type": "request_status"}      -> {"type": "system_status", ...}
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app import __version__
from app.config import get_settings
from app.logging_config import get_logger
from app.models.ws import WSMessage, WSMessageType
from app.services.websocket_manager import ws_manager

logger = get_logger(__name__)
router = APIRouter(tags=["websocket"])
SETTINGS = get_settings()


async def _handle_client_message(raw: str) -> WSMessage | None:
    """Translate a client message into a reply, or None to stay silent."""
    import json

    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return WSMessage(
            type=WSMessageType.ERROR,
            payload={"detail": "invalid JSON"},
        )

    if not isinstance(data, dict):
        return WSMessage(type=WSMessageType.ERROR, payload={"detail": "expected object"})

    msg_type = data.get("type")

    if msg_type == "ping":
        return WSMessage(type=WSMessageType.PONG, payload={"echo": data.get("payload")})
    if msg_type == "request_status":
        return WSMessage(
            type=WSMessageType.SYSTEM_STATUS,
            payload={
                "uptime_s": None,
                "note": "use /health for the authoritative snapshot",
                "websocket_clients": ws_manager.client_count,
            },
        )

    return WSMessage(
        type=WSMessageType.ERROR,
        payload={"detail": f"unknown message type: {msg_type!r}"},
    )


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Primary real-time channel between backend and React frontend."""
    await ws_manager.connect(websocket)
    try:
        await ws_manager.send(
            websocket,
            WSMessage(
                type=WSMessageType.HELLO,
                payload={
                    "app": SETTINGS.app_name,
                    "version": __version__,
                    "protocol": 1,
                    "mode": "DEMO_MODE" if SETTINGS.demo_mode else "REAL_HARDWARE",
                    "server_time": datetime.now(timezone.utc).isoformat(),
                },
            ),
        )
        await ws_manager.send_system_status(websocket)

        while True:
            raw = await websocket.receive_text()
            reply = await _handle_client_message(raw)
            if reply is not None:
                await ws_manager.send(websocket, reply)

    except WebSocketDisconnect:
        logger.info("Client closed the WebSocket connection")
    except Exception as exc:  # noqa: BLE001 - never crash the server on one socket
        logger.warning("WebSocket error: %s", exc)
    finally:
        await ws_manager.disconnect(websocket)