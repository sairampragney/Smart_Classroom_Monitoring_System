"""Application logging configuration.

A single, readable console format plus optional file output. Later phases just
call ``get_logger(__name__)`` and inherit this configuration.
"""

from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.config import BACKEND_ROOT, get_settings

LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-28s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging(level: str | None = None) -> None:
    """Configure root logging. Safe to call once during app startup."""
    settings = get_settings()
    resolved_level = (level or settings.backend_log_level).upper()

    root = logging.getLogger()
    root.setLevel(resolved_level)
    for handler in list(root.handlers):
        root.removeHandler(handler)

    formatter = logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT)

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    root.addHandler(console)

    log_dir = BACKEND_ROOT / "logs"
    try:
        log_dir.mkdir(exist_ok=True)
        file_handler = RotatingFileHandler(
            log_dir / "backend.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8"
        )
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)
    except OSError:
        # File logging is a convenience; never block startup because of it.
        root.warning("File logging disabled: could not create %s", log_dir)

    # Uvicorn installs its own handlers; let records reach ours instead.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True


def get_logger(name: str) -> logging.Logger:
    """Return a module logger."""
    return logging.getLogger(name)