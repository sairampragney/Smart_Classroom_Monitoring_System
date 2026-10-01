"""Shared pytest fixtures."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Make "backend" importable regardless of the working directory.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT.parent))

from backend.main import app  # noqa: E402


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