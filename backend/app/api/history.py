"""History endpoints (Phase 9). Read-only from the frontend's perspective:
the backend recorder is the only writer.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services.history_db import get_history_db
from app.services.history_recorder import HistoryRecorder  # noqa: F401 (typing)

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
async def list_history(
    limit: int = Query(default=100, ge=1, le=1000),
) -> dict:
    """Most recent records, newest first.

    ``limit`` is clamped to 1..1000 by FastAPI validation, so a bad value
    returns 422 rather than silently loading everything.
    """
    try:
        db = get_history_db()
        rows = db.recent(limit=limit)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=503, detail=f"History unavailable: {exc}"
        ) from exc

    return {
        "count": len(rows),
        "limit": limit,
        "total_rows": db.count(),
        "records": rows,
    }


@router.get("/latest")
async def latest_record() -> dict:
    """Single most recent record, or a null record when empty."""
    row = get_history_db().latest()
    return {"record": row, "has_data": row is not None}


@router.get("/stats")
async def history_stats() -> dict:
    """Row count and database path (useful for the System page)."""
    return get_history_db().stats()
