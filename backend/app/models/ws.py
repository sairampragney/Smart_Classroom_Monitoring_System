"""WebSocket message protocol.

Every server -> client message uses ONE envelope:

    {
      "type": "<message type>",
      "timestamp": "<ISO-8601 UTC>",
      "payload": { ... type-specific ... }
    }

Later phases add new message types by extending ``WSMessageType`` and the
payload models below - the envelope itself never changes, so the frontend only
needs one message handler.

Message types introduced so far (Phase 2):
    - ``hello``          : sent on connect; protocol + server info
    - ``system_status``  : full snapshot of component/service states
    - ``pong``           : reply to a client ``ping``

Reserved for later phases (not yet emitted):
    ``sensor_reading``, ``arduino_status``, ``cv_frame``, ``face_detection``,
    ``ml_prediction``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class WSMessageType(str, Enum):
    """Explicit WebSocket message types."""

    # --- Phase 2 (implemented) ---
    HELLO = "hello"
    SYSTEM_STATUS = "system_status"
    PONG = "pong"
    ERROR = "error"

    # --- Reserved for later phases ---
    SENSOR_READING = "sensor_reading"
    ARDUINO_STATUS = "arduino_status"
    PROGRAM_STATUS = "program_status"
    CV_FRAME = "cv_frame"
    FACE_DETECTION = "face_detection"
    ML_PREDICTION = "ml_prediction"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class WSMessage(BaseModel):
    """The single envelope used for all server -> client messages."""

    type: WSMessageType
    timestamp: datetime = Field(default_factory=_utc_now)
    payload: dict[str, Any] = Field(default_factory=dict)

    def to_json_dict(self) -> dict[str, Any]:
        """JSON-safe representation (datetimes serialised to ISO-8601)."""
        return self.model_dump(mode="json")