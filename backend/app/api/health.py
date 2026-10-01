"""Health and status endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app import __version__
from app.config import get_settings
from app.models.common import ConnectionState, CVState, MLState
from app.models.health import ComponentHealth, HealthResponse, ServiceStatus
from app.services.state import state_store
from app.services.websocket_manager import ws_manager

router = APIRouter(tags=["health"])

SETTINGS = get_settings()


def _components(state) -> list[ComponentHealth]:
    """Component health derived from real runtime state."""
    return [
        ComponentHealth(
            name="backend",
            state="RUNNING",
            detail="FastAPI application is serving",
            healthy=True,
        ),
        ComponentHealth(
            name="websocket",
            state="CONNECTED" if ws_manager.client_count else "IDLE",
            detail=f"{ws_manager.client_count} client(s) connected",
            healthy=True,
        ),
        ComponentHealth(
            name="arduino",
            state=state.arduino.value,
            detail=f"port={state.serial_port}" if state.serial_port else "not connected",
            healthy=state.arduino is ConnectionState.CONNECTED,
        ),
        ComponentHealth(
            name="serial",
            state=state.serial.value,
            detail="serial transport",
            healthy=state.serial is ConnectionState.CONNECTED,
        ),
        ComponentHealth(
            name="camera",
            state=state.camera.value,
            detail="camera transport",
            healthy=state.camera is ConnectionState.CONNECTED,
        ),
        ComponentHealth(
            name="cv_detector",
            state=state.cv.value,
            detail="face detection pipeline",
            healthy=state.cv is CVState.RUNNING,
        ),
        ComponentHealth(
            name="ml_model",
            state=state.ml.value,
            detail=str(SETTINGS.resolved_ml_model.name),
            healthy=state.ml is MLState.LOADED,
        ),
    ]


def _build_health() -> HealthResponse:
    state = state_store.snapshot()
    return HealthResponse(
        status="ok",
        app=SETTINGS.app_name,
        version=__version__,
        phase="2",
        mode="DEMO_MODE" if SETTINGS.demo_mode else "REAL_HARDWARE",
        demo_mode=SETTINGS.demo_mode,
        uptime_s=state.uptime_s(),
        websocket_clients=ws_manager.client_count,
        components=_components(state),
        services=ServiceStatus(
            arduino=state.arduino,
            serial=state.serial,
            camera=state.camera,
            cv=state.cv,
            ml=state.ml,
            monitoring_running=state.monitoring_running,
            serial_port=state.serial_port,
        ),
    )


@router.get("/health", response_model=HealthResponse, summary="Backend health check")
async def health() -> HealthResponse:
    """Confirm the backend is running. Always returns structured JSON."""
    return _build_health()


@router.get("/api/status", response_model=HealthResponse, summary="Alias of /health")
async def status() -> HealthResponse:
    """Same payload as /health, under the versioned /api prefix."""
    return _build_health()