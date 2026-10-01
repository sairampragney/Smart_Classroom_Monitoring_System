"""Arduino / serial endpoints (Phase 4).

These are the backend half of the future "RUN PROGRAM" control. Phase 5 wires
the UI to them; nothing here fabricates data - every value is whatever the
serial worker actually last received.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.common import MonitoringState
from app.services.serial_manager import available_ports, get_serial_manager
from app.services.state import state_store

router = APIRouter(prefix="/api/arduino", tags=["arduino"])


class ArduinoStatusResponse(BaseModel):
    """Current Arduino/serial state."""

    arduino: str
    serial: str
    monitoring: str
    monitoring_running: bool
    serial_port: str | None = None
    worker_running: bool
    readings_received: int = 0
    parse_errors: int = 0
    sensor_error: str | None = None
    server_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SensorResponse(BaseModel):
    """Latest accepted sensor reading, or nulls when nothing has arrived."""

    temperature: float | None = None
    humidity: float | None = None
    light: int | None = None
    motion: bool | None = None
    err: str | None = None
    received_at: str | None = None
    has_data: bool = False


class MonitoringResponse(BaseModel):
    """Result of a start/stop request."""

    monitoring: str
    monitoring_running: bool
    arduino: str
    message: str


def _status() -> ArduinoStatusResponse:
    s = state_store.snapshot()
    mgr = get_serial_manager()
    stats = mgr.stats
    return ArduinoStatusResponse(
        arduino=s.arduino.value,
        serial=s.serial.value,
        monitoring=s.monitoring.value,
        monitoring_running=s.monitoring_running,
        serial_port=s.serial_port,
        worker_running=mgr.is_running,
        readings_received=stats["readings_received"],
        parse_errors=stats["parse_errors"],
        sensor_error=s.sensor_error,
    )


@router.get("/status", response_model=ArduinoStatusResponse)
async def arduino_status() -> ArduinoStatusResponse:
    """Current Arduino connection + monitoring state."""
    return _status()


@router.get("/sensors", response_model=SensorResponse)
async def current_sensors() -> SensorResponse:
    """Latest valid sensor reading.

    Returns nulls (and ``has_data=false``) when nothing has been received yet -
    it never returns placeholder numbers.
    """
    s = state_store.snapshot()
    if not s.sensor:
        return SensorResponse(has_data=False)
    data = s.sensor
    return SensorResponse(
        temperature=data.get("temperature"),
        humidity=data.get("humidity"),
        light=data.get("light"),
        motion=data.get("motion"),
        err=data.get("err"),
        received_at=data.get("received_at"),
        has_data=True,
    )


@router.post("/monitoring/start", response_model=MonitoringResponse)
async def start_monitoring() -> MonitoringResponse:
    """Start consuming the sensor stream (backend side of RUN PROGRAM).

    This does NOT upload firmware - it only opens an already-running board.
    """
    mgr = get_serial_manager()
    state = mgr.start_monitoring()
    status = _status()
    return MonitoringResponse(
        monitoring=state.value,
        monitoring_running=status.monitoring_running,
        arduino=status.arduino,
        message=(
            "Monitoring started. The worker will keep retrying if no Arduino "
            "is present."
        ),
    )


@router.post("/monitoring/stop", response_model=MonitoringResponse)
async def stop_monitoring() -> MonitoringResponse:
    """Stop consuming the sensor stream. The backend keeps running."""
    mgr = get_serial_manager()
    state = mgr.stop_monitoring()
    status = _status()
    return MonitoringResponse(
        monitoring=state.value,
        monitoring_running=status.monitoring_running,
        arduino=status.arduino,
        message="Monitoring stopped.",
    )


@router.get("/ports")
async def list_serial_ports() -> dict:
    """Diagnostic: enumerate serial ports with Arduino-likeness scores."""
    mgr = get_serial_manager()
    return {
        "ports": available_ports(),
        "configured_port": mgr._settings.serial_port or None,
        "auto_discovery": not (mgr._settings.serial_port or "").strip(),
    }


@router.get("/config")
async def serial_config() -> dict:
    """Effective serial settings (never a secret; port + baud only)."""
    mgr = get_serial_manager()
    cfg = mgr._settings
    return {
        "serial_port": cfg.serial_port or None,
        "serial_baud": cfg.serial_baud,
        "serial_read_timeout_s": cfg.serial_read_timeout_s,
        "auto_discovery": not (cfg.serial_port or "").strip(),
    }