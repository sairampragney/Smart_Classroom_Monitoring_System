"""Smart Classroom Monitoring System - FastAPI application entry point.

Run (from the project root):

    uvicorn backend.main:app --reload --port 8000

or simply::

    python backend/main.py
"""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Allow "python backend/main.py" as well as "uvicorn backend.main:app".
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from app import __version__  # noqa: E402
from app.api.health import router as health_router  # noqa: E402
from app.api.arduino import router as arduino_router  # noqa: E402
from app.api.cv import router as cv_router  # noqa: E402
from app.api.ml import router as ml_router  # noqa: E402
from app.api.ws import router as ws_router  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.logging_config import get_logger, setup_logging  # noqa: E402
from app.services.broadcaster import broadcaster
from app.services.cv_service import cv_service  # noqa: E402
from app.services.ml_service import ml_service  # noqa: E402
from app.services.serial_manager import serial_manager  # noqa: E402
from app.services.websocket_manager import ws_manager  # noqa: E402

settings = get_settings()
setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("=" * 62)
    logger.info("%s v%s starting", settings.app_name, __version__)
    logger.info("Mode: %s", "DEMO_MODE" if settings.demo_mode else "REAL_HARDWARE")
    logger.info("CORS origins: %s", ", ".join(settings.cors_origin_list))
    if settings.serial_port:
        logger.info(
            "Arduino port: %s (explicitly configured)", settings.serial_port
        )
    else:
        logger.info("Arduino port: auto-discovery enabled")
    logger.info("=" * 62)

    # Phase 4: the serial worker is started only on demand (the future
    # "RUN PROGRAM" control), so an absent Arduino is a normal state and the
    # backend still starts cleanly.
    logger.info("Serial manager ready (monitoring is OFF until requested)")

    # Phase 5: push state changes (sensor_reading / arduino_status) to clients.
    broadcaster.start()

    # Phase 6: the camera is NOT auto-started. Detection begins only when
    # POST /api/cv/start is called, so an absent camera is a normal state and
    # the webcam is never held open unexpectedly.
    logger.info(
        "CV engine ready (detector=%s, camera=%s, not started)",
        cv_service.detector_name,
        settings.camera_index,
    )

    # Phase 8: load the trained occupancy model ONCE at startup. It is never
    # retrained on a sensor update; inference reuses this instance.
    if ml_service.load():
        logger.info("ML model ready: %s", ml_service.model_name)
    else:
        logger.warning("ML model NOT available: %s", ml_service.error)

    yield

    logger.info("Shutting down; closing %d WebSocket client(s)", ws_manager.client_count)
    # Phase 6: release the camera before the process exits.
    cv_service.stop()
    # Phase 5: stop the broadcaster so no task is left running.
    await broadcaster.stop()
    # Phase 4: stop the serial worker so no thread or COM handle is leaked.
    serial_manager.stop()


app = FastAPI(
    title=settings.app_name,
    version=__version__,
    description=(
        "Backend for the Smart Classroom Monitoring System.\n\n"
        "Phase 2 (foundation): health/status endpoints and the WebSocket "
        "channel. Arduino, computer vision and machine learning are added in "
        "later phases."
    ),
    lifespan=lifespan,
)

# Explicit allow-list - no wildcard. Credentials are not needed because the
# frontend and backend are same-origin over localhost.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(arduino_router)
app.include_router(cv_router)
app.include_router(ml_router)
app.include_router(ws_router)


@app.get("/", include_in_schema=False)
async def root() -> dict:
    """Friendly landing payload."""
    return {
        "app": settings.app_name,
        "version": __version__,
        "docs": "/docs",
        "health": "/health",
        "websocket": "/ws",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=False,
    )