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