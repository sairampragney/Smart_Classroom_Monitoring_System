"""Response schemas for health and status endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field

from app.models.common import ConnectionState, CVState, MLState, MonitoringState


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ComponentHealth(BaseModel):
    """Health of a single backend component."""

    name: str = Field(..., examples=["backend"])
    state: str = Field(..., examples=["RUNNING"])
    detail: str = Field(default="", examples=["FastAPI application is serving"])
    healthy: bool = Field(default=True)


class ServiceStatus(BaseModel):
    """Aggregate status of the services that later phases will populate.

    In Phase 2 every field reports its honest initial value: nothing is wired up
    yet, so serial/CV/ML are DISCONNECTED / STOPPED / NOT_LOADED.
    """

    arduino: ConnectionState = ConnectionState.DISCONNECTED
    serial: ConnectionState = ConnectionState.DISCONNECTED
    camera: ConnectionState = ConnectionState.DISCONNECTED
    cv: CVState = CVState.STOPPED
    ml: MLState = MLState.NOT_LOADED
    monitoring_running: bool = False
    monitoring: MonitoringState = MonitoringState.STOPPED
    serial_port: str | None = Field(default=None, examples=["COM5"])


class HealthResponse(BaseModel):
    """Payload returned by GET /health."""

    status: str = Field(..., examples=["ok"], description="'ok' when the backend is serving")
    app: str = Field(..., examples=["Smart Classroom Monitoring System"])
    version: str = Field(..., examples=["0.2.0"])
    phase: str = Field(..., examples=["2"])
    mode: str = Field(..., examples=["REAL_HARDWARE"])
    demo_mode: bool = Field(default=False)
    uptime_s: float = Field(..., examples=[12.34], description="Seconds since process start")
    server_time: datetime = Field(default_factory=_utc_now)
    websocket_clients: int = Field(default=0)
    components: list[ComponentHealth] = Field(default_factory=list)
    services: ServiceStatus = Field(default_factory=ServiceStatus)