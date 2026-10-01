"""Machine learning endpoints (Phase 8)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.ml_service import get_ml_service
from app.services.state import state_store

router = APIRouter(prefix="/api/ml", tags=["machine-learning"])


class PredictRequest(BaseModel):
    """Input matching the Arduino sensor feature contract."""

    temperature: float = Field(..., ge=-40.0, le=80.0, description="DHT22 °C")
    light: float = Field(..., ge=0, le=1023, description="LDR raw ADC counts")
    motion: bool = Field(..., description="HC-SR501 PIR state")


@router.get("/info")
async def ml_info() -> dict:
    """Trained model, dataset profile and every model's real metrics."""
    return get_ml_service().info()


@router.get("/status")
async def ml_status() -> dict:
    """Lightweight ML state for the System page."""
    svc = get_ml_service()
    snap = state_store.snapshot()
    return {
        "ml": snap.ml.value,
        "model": svc.model_name,
        "loaded": svc.is_loaded,
        "error": svc.error,
    }


@router.post("/predict")
async def ml_predict(payload: PredictRequest) -> dict:
    """Predict occupancy from explicit sensor values."""
    svc = get_ml_service()
    if not svc.load():
        raise HTTPException(
            status_code=503,
            detail=svc.error or "ML model is not available. Train it first.",
        )
    result = svc.predict_values(payload.temperature, payload.light, payload.motion)
    if result is None:
        raise HTTPException(status_code=422, detail="Prediction failed for these inputs.")
    return result
