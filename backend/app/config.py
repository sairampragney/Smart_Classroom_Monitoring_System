"""Centralized application configuration.

All runtime configuration is loaded from environment variables (optionally
sourced from a ``backend/.env`` file, which is git-ignored).

Every other module must import settings from here rather than reading
``os.environ`` directly, so that configuration stays in one place and later
phases (serial / CV / ML) have an obvious place to add their own settings.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> backend/app -> backend
BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    """Application settings resolved from the environment."""

    model_config = SettingsConfigDict(
        env_file=(BACKEND_ROOT / ".env", PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---------- Backend server ----------
    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    backend_log_level: str = "INFO"

    # ---------- CORS ----------
    # Comma-separated allow-list. No wildcard by default.
    cors_allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # ---------- Runtime mode ----------
    # False => REAL HARDWARE MODE (default). No simulated data is ever produced.
    demo_mode: bool = Field(default=False)

    # ---------- Arduino / Serial (consumed from Phase 4) ----------
    # Empty string => automatic port discovery (recommended).
    # Accepts either SERIAL_PORT or the ARDUINO_PORT name used in the docs.
    serial_port: str = Field(
        default="",
        validation_alias=AliasChoices("SERIAL_PORT", "ARDUINO_PORT"),
    )
    serial_baud: int = 9600
    serial_read_timeout_s: float = 1.0
    serial_force_port: bool = False

    # ---------- Computer Vision (consumed from Phase 6) ----------
    camera_index: int = 0
    cv_frame_width: int = 640
    cv_frame_height: int = 480
    cv_min_confidence: float = 0.6
    cv_track_timeout_s: float = 1.5
    # Processing downscale for CPU. 1.0 = process at the source resolution.
    # Boxes are always reported in SOURCE coordinates regardless of this.
    cv_process_scale: float = Field(default=1.0, gt=0.0, le=1.0)
    # YuNet ONNX model (relative to the project root).
    cv_model_path: str = "cv/models/face_detection_yunet_2023mar.onnx"
    # JPEG quality for the snapshot endpoint used by Phase 7.
    cv_jpeg_quality: int = Field(default=70, ge=1, le=100)

    # ---------- Machine Learning (consumed from Phase 8) ----------
    ml_model_path: str = "ml/artifacts/occupancy_model.joblib"
    ml_occupied_threshold: float = 0.5

    # ---------- Storage (consumed from Phase 9) ----------
    history_db_path: str = "backend/data/history.db"
    history_max_rows: int = 5000

    # ---------- Service metadata ----------
    app_name: str = "Smart Classroom Monitoring System"
    app_version: str = "0.2.0"

    @property
    def cors_origin_list(self) -> list[str]:
        """Parsed CORS allow-list."""
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def resolved_history_db(self) -> Path:
        """History database path, resolved relative to the project root."""
        p = Path(self.history_db_path)
        return p if p.is_absolute() else PROJECT_ROOT / p

    @property
    def resolved_ml_model(self) -> Path:
        """Trained ML model path, resolved relative to the project root."""
        p = Path(self.ml_model_path)
        return p if p.is_absolute() else PROJECT_ROOT / p


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached application settings instance."""
    return Settings()