"""Machine learning tests (Phase 8).

Split into two clearly separated groups, because they prove different things:

* SYNTHETIC / LOGIC tests - a tiny in-memory DataFrame. They prove the pipeline
  shape, validation and selection rules.
* REAL DATA / REAL MODEL tests - skipped automatically when the real dataset or
  the trained artifact is absent. When present they evaluate for real.

Neither group fabricates metrics: every number checked here comes from an
actual fit/predict call.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
for _p in (_PROJECT_ROOT / "backend", _PROJECT_ROOT):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from ml.scripts.train import (  # noqa: E402
    FEATURE_NAMES,
    LIGHT_COLS,
    PIR_COLS,
    TARGET_COL,
    TEMP_COLS,
    ModelResult,
    build_features,
    build_target,
    evaluate,
    load_dataset,
    make_models,
    make_preprocessor,
    select_model,
)

DATASET = _PROJECT_ROOT / "ml" / "datasets" / "occupancy_detection.csv"
ARTIFACT = _PROJECT_ROOT / "ml" / "artifacts" / "occupancy_model.joblib"

has_dataset = DATASET.exists()
has_artifact = ARTIFACT.exists()


def _synthetic_frame(n: int = 400, seed: int = 0) -> pd.DataFrame:
    """Small deterministic frame for LOGIC tests only.

    Never used for reported metrics - real numbers come from the real dataset.
    """
    rng = np.random.default_rng(seed)
    data: dict[str, object] = {}
    for i, c in enumerate(TEMP_COLS):
        data[c] = 21.0 + i * 0.1 + rng.normal(0, 0.4, n)
    for c in LIGHT_COLS:
        data[c] = rng.uniform(0, 200, n)
    for c in PIR_COLS:
        data[c] = rng.integers(0, 2, n)
    data[TARGET_COL] = rng.integers(0, 3, n)
    return pd.DataFrame(data)


# ----------------------------------------------------------------------
# Data loading
# ----------------------------------------------------------------------
def test_load_dataset_raises_when_missing(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_dataset(tmp_path / "nope.csv")


def test_load_dataset_rejects_wrong_schema(tmp_path):
    bad = tmp_path / "bad.csv"
    bad.write_text("a,b,c\n1,2,3\n", encoding="utf-8")
    with pytest.raises(ValueError, match="missing required columns"):
        load_dataset(bad)


@pytest.mark.skipif(not has_dataset, reason="real dataset not fetched")
def test_real_dataset_schema():
    df = load_dataset()
    assert len(df) == 10129
    for col in TEMP_COLS + LIGHT_COLS + PIR_COLS + [TARGET_COL]:
        assert col in df.columns
    assert df.isna().sum().sum() == 0
    assert df.duplicated().sum() == 0


# ----------------------------------------------------------------------
# Feature engineering / target
# ----------------------------------------------------------------------
def test_feature_names_are_the_deployed_contract():
    assert FEATURE_NAMES == ["temp_mean", "light_mean", "pir_count"]


def test_build_features_produces_exact_contract():
    X = build_features(_synthetic_frame(50))
    assert list(X.columns) == FEATURE_NAMES
    assert len(X) == 50


def test_build_features_averages_temps_and_sums_pir():
    df = _synthetic_frame(1)
    df.loc[0, TEMP_COLS] = [20.0, 21.0, 22.0, 23.0]
    df.loc[0, LIGHT_COLS] = [10.0, 20.0, 30.0, 40.0]
    df.loc[0, PIR_COLS] = [1, 1]
    row = build_features(df).iloc[0]
    assert row["temp_mean"] == pytest.approx(21.5)
    assert row["light_mean"] == pytest.approx(25.0)
    assert row["pir_count"] == pytest.approx(2.0)


def test_target_is_binarised_on_count():
    df = pd.DataFrame({TARGET_COL: [0, 1, 2, 3]})
    assert build_target(df).tolist() == [0, 1, 1, 1]


def test_feature_order_is_deterministic():
    a = list(build_features(_synthetic_frame(20)).columns)
    b = list(build_features(_synthetic_frame(20)).columns)
    assert a == b == FEATURE_NAMES


# ----------------------------------------------------------------------
# Models
# ----------------------------------------------------------------------
def test_all_five_required_models_are_present():
    assert set(make_models()) == {
        "LogisticRegression", "DecisionTree", "KNN", "SVM", "RandomForest",
    }


@pytest.mark.parametrize(
    "name", ["LogisticRegression", "DecisionTree", "KNN", "SVM", "RandomForest"]
)
def test_every_model_trains_and_predicts(name):
    """Each candidate must actually fit and return a usable label."""
    from sklearn.pipeline import Pipeline

    df = _synthetic_frame(300, seed=1)
    X, y = build_features(df), build_target(df)
    pipe = Pipeline([("prep", make_preprocessor()), ("clf", make_models()[name])])
    pipe.fit(X, y)
    pred = pipe.predict(X)
    assert pred.shape == (len(X),)
    assert set(np.unique(pred)).issubset({0, 1})


def test_preprocessor_handles_missing_values():
    """Median imputation must survive NaNs at inference time."""
    from sklearn.pipeline import Pipeline

    df = _synthetic_frame(200, seed=2)
    X, y = build_features(df), build_target(df)
    pipe = Pipeline([("prep", make_preprocessor()), ("clf", make_models()["DecisionTree"])])
    pipe.fit(X, y)

    holed = X.copy()
    holed.loc[0, "temp_mean"] = np.nan
    assert len(pipe.predict(holed)) == len(holed)


def test_preprocessing_is_fitted_on_training_data_only():
    """Scaling is learned once at fit time and never recomputed per row."""
    from sklearn.pipeline import Pipeline

    df = _synthetic_frame(300, seed=3)
    X, y = build_features(df), build_target(df)
    pipe = Pipeline([("prep", make_preprocessor()), ("clf", make_models()["DecisionTree"])])
    pipe.fit(X, y)

    scaler = pipe.named_steps["prep"].named_transformers_["num"].named_steps["scaler"]
    assert scaler.mean_.shape == (len(FEATURE_NAMES),)
    before = scaler.mean_.copy()
    pipe.predict(X.head(5))
    assert np.allclose(scaler.mean_, before)


# ----------------------------------------------------------------------
# Metrics + selection
# ----------------------------------------------------------------------
def test_evaluate_computes_expected_values():
    y_true = np.array([0, 0, 0, 1, 1, 1])
    y_pred = np.array([0, 0, 1, 1, 1, 0])
    m = evaluate(y_true, y_pred)
    assert m["accuracy"] == pytest.approx(4 / 6, abs=1e-3)
    for k in ("precision", "recall", "f1", "f1_macro"):
        assert 0.0 <= m[k] <= 1.0


def test_perfect_prediction_scores_one():
    y = np.array([0, 0, 1, 1])
    m = evaluate(y, y)
    assert m["accuracy"] == 1.0
    assert m["precision"] == 1.0
    assert m["recall"] == 1.0
    assert m["f1"] == 1.0


def _result(name, f1, cv=0.5, acc=0.5):
    return ModelResult(
        name=name,
        metrics={"accuracy": acc, "precision": f1, "recall": f1, "f1": f1},
        cv_f1_mean=cv, cv_f1_std=0.0, train_seconds=0.1,
        confusion_matrix=[[1, 0], [0, 1]], supports_proba=True,
    )


def test_selection_prefers_highest_f1_not_accuracy():
    """A high-accuracy model must not win on accuracy alone."""
    high_acc_low_f1 = _result("A", f1=0.50, cv=0.50, acc=0.99)
    low_acc_high_f1 = _result("B", f1=0.90, cv=0.90, acc=0.85)
    assert select_model([high_acc_low_f1, low_acc_high_f1]).name == "B"


def test_selection_ties_break_on_cv_then_accuracy():
    a = _result("A", f1=0.9, cv=0.80, acc=0.90)
    b = _result("B", f1=0.9, cv=0.95, acc=0.90)
    assert select_model([a, b]).name == "B"


# ----------------------------------------------------------------------
# Real data / real artifact
# ----------------------------------------------------------------------
@pytest.mark.skipif(not has_dataset, reason="real dataset not fetched")
def test_real_dataset_class_distribution():
    y = build_target(load_dataset())
    assert int((y == 1).sum()) == 1901
    assert int((y == 0).sum()) == 8228


@pytest.mark.skipif(not has_artifact, reason="model not trained")
def test_real_artifact_exposes_real_metrics():
    import joblib

    b = joblib.load(ARTIFACT)
    assert b["model_name"] in {
        "LogisticRegression", "DecisionTree", "KNN", "SVM", "RandomForest",
    }
    assert len(b["all_model_results"]) == 5
    for r in b["all_model_results"]:
        for k in ("accuracy", "precision", "recall", "f1"):
            assert 0.0 <= r["metrics"][k] <= 1.0
    assert b["feature_names"] == FEATURE_NAMES


@pytest.mark.skipif(not has_artifact, reason="model not trained")
def test_prediction_service_returns_structured_output():
    from app.models.sensors import SensorReading
    from app.services.ml_service import MLService

    svc = MLService()
    assert svc.load() is True
    result = svc.predict(
        SensorReading(temperature=25.0, humidity=None, light=100, motion=True)
    )
    assert result is not None
    assert result["prediction"] in {"OCCUPIED", "EMPTY"}
    assert result["model"] is not None
    # Confidence is a real probability or explicitly None - never faked.
    assert result["confidence"] is None or 0.0 <= result["confidence"] <= 1.0


@pytest.mark.skipif(not has_artifact, reason="model not trained")
def test_prediction_service_rejects_missing_temperature():
    from app.models.sensors import SensorReading
    from app.services.ml_service import MLService

    svc = MLService()
    assert svc.predict(
        SensorReading(temperature=None, humidity=None, light=10, motion=False)
    ) is None


def test_ml_service_reports_missing_artifact(tmp_path, monkeypatch):
    from app.services.ml_service import MLService

    svc = MLService()
    monkeypatch.setattr(svc, "artifact_path", lambda: tmp_path / "absent.joblib")
    assert svc.load() is False
    assert svc.error is not None
    assert "not found" in svc.error
