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
from app.api.ws import router as ws_router  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.logging_config import get_logger, setup_logging  # noqa: E402
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
    logger.info("=" * 62)

    # Phase 4/6/8 start their background workers here (serial, camera, ML).

    yield

    logger.info("Shutting down; closing %d WebSocket client(s)", ws_manager.client_count)


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