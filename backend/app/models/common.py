"""Shared domain enumerations.

These states are deliberately defined now, in Phase 2, so that the frontend and
the later Arduino / CV / ML services all agree on the exact vocabulary. Each
value reflects REAL runtime state - none of them is ever simulated.
"""

from __future__ import annotations

from enum import Enum


class ConnectionState(str, Enum):
    """Lifecycle state for any externally-connected component."""

    DISCONNECTED = "DISCONNECTED"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    ERROR = "ERROR"
    # Added in Phase 4: the port was lost and a retry is in progress.
    RECONNECTING = "RECONNECTING"


class MonitoringState(str, Enum):
    """Whether the backend is actively consuming the sensor stream.

    Distinct from :class:`ConnectionState`: a board can be physically CONNECTED
    while monitoring is deliberately STOPPED (this is what the future
    "RUN PROGRAM" control toggles).
    """

    STOPPED = "STOPPED"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    STOPPING = "STOPPING"


class CVState(str, Enum):
    """Lifecycle state for the computer vision pipeline."""

    STOPPED = "STOPPED"
    RUNNING = "RUNNING"
    ERROR = "ERROR"


class MLState(str, Enum):
    """Lifecycle state for the machine learning model."""

    NOT_LOADED = "NOT_LOADED"
    LOADED = "LOADED"
    ERROR = "ERROR"