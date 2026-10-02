"""Health and status endpoints."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter

from app import __version__
from app.config import get_settings
from app.models.common import ConnectionState, CVState, MLState
from app.models.health import (
    ComponentHealth,
    DatabaseStatus,
    HealthResponse,
    ServiceStatus,
)
from app.services.cv_service import get_cv_service
from app.services.history_db import get_history_db
from app.services.ml_service import get_ml_service
from app.services.state import state_store
from app.services.websocket_manager import ws_manager

router = APIRouter(tags=["health"])

SETTINGS = get_settings()


def _database_status() -> DatabaseStatus:
    """Probe the history database with a real query.

    A broken database must never take down /health: the failure is reported as
    ``ERROR`` so the System page can show it, and the rest of the payload is
    still served.
    """
    try:
        db = get_history_db()
    except Exception as exc:  # noqa: BLE001 - health must never raise
        return DatabaseStatus(status="ERROR", error=f"unavailable: {exc}")

    try:
        latest = db.latest()
        rows = db.count()
    except Exception as exc:  # noqa: BLE001 - health must never raise
        return DatabaseStatus(status="ERROR", error=str(exc))

    # Parse the stored ISO string; an unparseable value is dropped, not faked.
    last_ts = None
    if latest and isinstance(latest.get("ts"), str):
        try:
            last_ts = datetime.fromisoformat(latest["ts"])
        except ValueError:
            last_ts = None

    return DatabaseStatus(status="READY", rows=rows, last_record_ts=last_ts)


def _components(state, db: DatabaseStatus) -> list[ComponentHealth]:
    """Component health derived from real runtime state."""
    cv_svc = get_cv_service()
    ml_svc = get_ml_service()
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
            detail=f"face detection pipeline ({cv_svc.detector_name})",
            healthy=state.cv is CVState.RUNNING,
        ),
        ComponentHealth(
            # The model actually in memory - never the configured artifact name.
            name="ml_model",
            state=state.ml.value,
            detail=ml_svc.model_name or (ml_svc.error or "no model loaded"),
            healthy=state.ml is MLState.LOADED,
        ),
        ComponentHealth(
            name="database",
            state=db.status,
            detail=db.error or f"{db.rows} record(s) stored",
            healthy=db.status == "READY",
        ),
    ]


def _build_health() -> HealthResponse:
    state = state_store.snapshot()
    cv_svc = get_cv_service()
    ml_svc = get_ml_service()
    db = _database_status()

    # Detail values are exposed ONLY when the pipeline has actually produced
    # them. fps/head_count stay None until real frames were processed, so the UI
    # can show "--" instead of a fabricated 0.00 / 0.
    cv_running = state.cv is CVState.RUNNING

    return HealthResponse(
        status="ok",
        app=SETTINGS.app_name,
        version=__version__,
        phase="11",
        mode="DEMO_MODE" if SETTINGS.demo_mode else "REAL_HARDWARE",
        demo_mode=SETTINGS.demo_mode,
        uptime_s=state.uptime_s(),
        websocket_clients=ws_manager.client_count,
        components=_components(state, db),
        services=ServiceStatus(
            arduino=state.arduino,
            serial=state.serial,
            camera=state.camera,
            cv=state.cv,
            ml=state.ml,
            monitoring_running=state.monitoring_running,
            monitoring=state.monitoring,
            serial_port=state.serial_port,
            cv_detector=cv_svc.detector_name,
            cv_fps=cv_svc.fps if cv_running else None,
            head_count=(
                state.cv_result.get("face_count")
                if cv_running and state.cv_result
                else None
            ),
            ml_model=ml_svc.model_name if state.ml is MLState.LOADED else None,
            ml_error=ml_svc.error,
            database=db,
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