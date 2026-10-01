"""Sensor reading model and Phase 3 serial-protocol parser.

The schema mirrors ``arduino/smart_classroom/smart_classroom.ino`` EXACTLY:

    {"temperature":28.60,"humidity":57.20,"light":642,"motion":true}

Firmware guarantees (see docs/HARDWARE.md):
  1. the four canonical keys are always present, in a fixed order;
  2. an unmeasurable value is emitted as JSON ``null`` - never a number;
  3. lines starting with ``#`` are informational and must be ignored;
  4. ``light`` is always an integer 0..1023;
  5. ``err`` appears only when a sensor failed.

This module is deliberately free of any FastAPI/import coupling so it can be
unit-tested on its own.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Final

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

# Bounds duplicated from the firmware so bad data is rejected host-side too.
TEMP_MIN_C: Final = -40.0
TEMP_MAX_C: Final = 80.0
HUM_MIN_PCT: Final = 0.0
HUM_MAX_PCT: Final = 100.0
LIGHT_MIN: Final = 0
LIGHT_MAX: Final = 1023

REQUIRED_FIELDS: Final = ("temperature", "humidity", "light", "motion")


class ProtocolError(ValueError):
    """Raised when a serial line does not satisfy the Phase 3 contract."""


class SensorReading(BaseModel):
    """One validated sample from the Arduino."""

    model_config = ConfigDict(extra="ignore")

    temperature: float | None = Field(
        default=None,
        ge=TEMP_MIN_C,
        le=TEMP_MAX_C,
        description="Degrees Celsius, or null when the DHT22 failed.",
    )
    humidity: float | None = Field(
        default=None,
        ge=HUM_MIN_PCT,
        le=HUM_MAX_PCT,
        description="Relative humidity %, or null when the DHT22 failed.",
    )
    light: int = Field(
        ...,
        ge=LIGHT_MIN,
        le=LIGHT_MAX,
        description="Raw 10-bit ADC counts from the LDR divider.",
    )
    motion: bool = Field(..., description="HC-SR501 PIR state.")
    err: str | None = Field(default=None, description="Firmware failure label, if any.")
    received_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Host timestamp when this sample was accepted.",
    )

    @field_validator("motion", mode="before")
    @classmethod
    def _coerce_motion(cls, v: Any) -> Any:
        """Accept only real booleans.

        A permissive truthiness check would silently accept ``"false"`` as
        True, which is exactly the kind of quiet data corruption this project
        must avoid.
        """
        if isinstance(v, bool):
            return v
        raise ValueError(f"motion must be a boolean, got {type(v).__name__}")

    @field_validator("light", mode="before")
    @classmethod
    def _coerce_light(cls, v: Any) -> Any:
        """Accept a real integer or an integral float, never a string."""
        if isinstance(v, bool):
            raise ValueError("light must be numeric, not a boolean")
        if isinstance(v, int):
            return v
        if isinstance(v, float) and v.is_integer():
            return int(v)
        raise ValueError(f"light must be an integer, got {type(v).__name__}")

    @property
    def valid(self) -> bool:
        """True when at least one environmental channel produced a number."""
        return self.temperature is not None or self.humidity is not None


def _is_blank(line: str) -> bool:
    return not line or not line.strip()


def _is_comment(line: str) -> bool:
    """Firmware banner lines start with '#' and carry no data."""
    return line.strip().startswith("#")


def parse_sensor_line(line: str) -> SensorReading | None:
    """Parse one serial line.

    Returns:
        A validated :class:`SensorReading`, or ``None`` for lines that carry no
        data (blank lines and ``#`` comments). Blank/comment lines are normal
        and must not be logged as errors.

    Raises:
        ProtocolError: if the line claims to be data but is malformed, has
            missing fields, or has out-of-range values.
    """
    if _is_blank(line) or _is_comment(line):
        return None

    try:
        payload = json.loads(line)
    except (ValueError, TypeError) as exc:
        raise ProtocolError(f"not valid JSON: {exc}") from exc

    if not isinstance(payload, dict):
        raise ProtocolError(
            f"expected a JSON object, got {type(payload).__name__}"
        )

    missing = [f for f in REQUIRED_FIELDS if f not in payload]
    if missing:
        raise ProtocolError(f"missing required field(s): {', '.join(missing)}")

    try:
        return SensorReading(**payload)
    except ValidationError as exc:
        raise ProtocolError(f"field validation failed: {exc.errors()}") from exc