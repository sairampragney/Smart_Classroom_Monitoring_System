"""ML prediction service (Phase 8).

Loads the artifact produced by ``ml/scripts/train.py`` ONCE and reuses it. The
model is never retrained on a sensor update.

Input comes from the SAME Arduino sensor feed used by the rest of the system
(``app.models.sensors.SensorReading``), so there is no second, incompatible
sensor schema.

Feature mapping (1:1 with the trained contract)
-----------------------------------------------
    temp_mean   <- DHT22 temperature   (degC)
    light_mean  <- LDR reading         (raw ADC counts)
    pir_count   <- HC-SR501 PIR        (0 or 1)

Known domain limitation
-----------------------
The training data's light sensor ranges roughly 0-280, while the classroom LDR
is a 0-1023 ADC. The StandardScaler is frozen from training, so a raw LDR
reading lands outside the training distribution. That is a REAL mismatch
between the public dataset and our hardware - documented here rather than
hidden. Temperature and PIR map naturally.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.logging_config import get_logger
from app.models.common import MLState
from app.models.sensors import SensorReading
from app.services.state import state_store

logger = get_logger(__name__)

OCCUPIED = "OCCUPIED"
EMPTY = "EMPTY"


class MLServiceError(RuntimeError):
    """Raised when the artifact is missing or cannot be loaded."""


class MLService:
    """Owns the trained pipeline and turns sensor readings into predictions."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._bundle: dict[str, Any] | None = None
        self._lock = threading.RLock()
        self._error: str | None = None

    @property
    def is_loaded(self) -> bool:
        return self._bundle is not None

    @property
    def error(self) -> str | None:
        return self._error

    @property
    def model_name(self) -> str | None:
        return self._bundle["model_name"] if self._bundle else None

    def artifact_path(self) -> Path:
        return self._settings.resolved_ml_model

    def load(self) -> bool:
        """Load the artifact once. Returns True on success; never raises."""
        if self._bundle is not None:
            return True
        path = self.artifact_path()
        if not path.exists():
            self._error = (
                f"Model artifact not found: {path}. Train it with: "
                r".\backend\.venv\Scripts\python.exe ml\scripts\train.py"
            )
            logger.warning(self._error)
            state_store.set_ml_state(MLState.NOT_LOADED)
            return False
        try:
            import joblib

            with self._lock:
                self._bundle = joblib.load(path)
        except Exception as exc:  # noqa: BLE001
            self._error = f"Could not load model artifact: {exc}"
            logger.warning(self._error)
            state_store.set_ml_state(MLState.ERROR)
            return False

        self._error = None
        state_store.set_ml_state(MLState.LOADED)
        logger.info(
            "ML model loaded: %s (features=%s, metrics=%s)",
            self._bundle.get("model_name"),
            self._bundle.get("feature_names"),
            self._bundle.get("metrics"),
        )
        return True

    def info(self) -> dict[str, Any]:
        """Everything the UI needs, straight from the artifact."""
        if not self.load():
            return {"loaded": False, "error": self._error, "model": None}
        b = self._bundle
        return {
            "loaded": True,
            "error": None,
            "model": b["model_name"],
            "feature_names": b["feature_names"],
            "supports_proba": b.get("supports_proba", False),
            "metrics": b.get("metrics", {}),
            "confusion_matrix": b.get("confusion_matrix", []),
            "all_model_results": b.get("all_model_results", []),
            "dataset": b.get("dataset", {}),
            "split": b.get("split", {}),
            "label_map": b.get("label_map", {}),
        }

    # ------------------------------------------------------------------
    # Prediction
    # ------------------------------------------------------------------
    def predict(self, reading: SensorReading) -> dict[str, Any] | None:
        """Predict occupancy from a live sensor reading.

        Returns None when no model is loaded or the reading lacks temperature.
        Confidence is None when the model cannot report a calibrated
        probability - it is never invented.
        """
        if not self.load():
            return None
        if reading.temperature is None:
            return None

        b = self._bundle
        features = b["feature_names"]
        values = {
            "temp_mean": float(reading.temperature),
            "light_mean": float(reading.light if reading.light is not None else 0.0),
            "pir_count": 1.0 if reading.motion else 0.0,
        }
        row = [[values[name] for name in features]]

        try:
            import pandas as pd

            frame = pd.DataFrame(row, columns=features)
            pipeline = b["pipeline"]
            pred = int(pipeline.predict(frame)[0])
        except Exception as exc:  # noqa: BLE001 - a bad frame must not kill the app
            logger.warning("ML prediction failed: %s", exc)
            return None

        label_map = b.get("label_map", {}) or {}
        label = label_map.get(str(pred), label_map.get(pred))
        if label is None:
            label = OCCUPIED if pred == 1 else EMPTY

        confidence: float | None = None
        if b.get("supports_proba"):
            try:
                import pandas as pd

                proba = pipeline.predict_proba(
                    pd.DataFrame(row, columns=features)
                )[0]
                confidence = round(float(proba[pred]), 4)
            except Exception as exc:  # noqa: BLE001
                logger.debug("predict_proba unavailable: %s", exc)

        return {
            "prediction": label,
            "confidence": confidence,
            "model": b["model_name"],
            "code": pred,
            "features": values,
            "source": "sensor",
        }

    def predict_values(
        self, temperature: float, light: float, motion: bool
    ) -> dict[str, Any] | None:
        """Predict from explicit values (used by the /api/ml/predict endpoint)."""
        return self.predict(
            SensorReading(
                temperature=temperature, humidity=None, light=int(light),
                motion=motion, err=None,
            )
        )


# Process-wide singleton wired into the app lifespan.
ml_service = MLService()


def get_ml_service() -> MLService:
    """Dependency-injection accessor (keeps routes testable)."""
    return ml_service
