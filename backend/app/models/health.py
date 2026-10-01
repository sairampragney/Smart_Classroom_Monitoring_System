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


class DatabaseStatus(BaseModel):
    """Real health of the local history database (Phase 9/10).

    ``status`` is derived from an actual query attempt, never assumed:

    * ``READY``          - the schema is present and a real query succeeded
    * ``NOT_INITIALIZED``- no database handle exists yet
    * ``ERROR``          - the handle exists but the query failed
    """

    status: str = Field(default="NOT_INITIALIZED", examples=["READY"])
    rows: int = Field(default=0, description="Records currently stored")
    #: ISO-8601 UTC timestamp of the newest stored record, if any.
    last_record_ts: datetime | None = None
    error: str | None = Field(default=None, examples=["database is locked"])


class ServiceStatus(BaseModel):
    """Aggregate status of every backend service.

    Lifecycle fields (``arduino``/``serial``/``camera``/``cv``/``ml``) come
    from the shared StateStore, so they always reflect real runtime state.

    Detail fields (detector, fps, head_count, ML model) are read from the
    owning service object. They stay ``None`` whenever the service has never
    run - a missing measurement is never replaced with a placeholder number.
    """

    arduino: ConnectionState = ConnectionState.DISCONNECTED
    serial: ConnectionState = ConnectionState.DISCONNECTED
    camera: ConnectionState = ConnectionState.DISCONNECTED
    cv: CVState = CVState.STOPPED
    ml: MLState = MLState.NOT_LOADED
    monitoring_running: bool = False
    monitoring: MonitoringState = MonitoringState.STOPPED
    serial_port: str | None = Field(default=None, examples=["COM5"])

    # ---- Phase 10: real detail for the System page ----
    #: Actual detector name in use (e.g. "YuNet"), not the configured default.
    cv_detector: str | None = None
    #: Measured inference FPS. None until the pipeline has processed frames.
    cv_fps: float | None = None
    #: Faces visible in the CURRENT frame. None when CV has never run.
    head_count: int | None = None
    #: Name of the model actually loaded in memory, not the configured path.
    ml_model: str | None = None
    ml_error: str | None = None
    database: DatabaseStatus = Field(default_factory=DatabaseStatus)


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