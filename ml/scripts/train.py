"""Occupancy training pipeline (Phase 8).

Run from the project root:
    .\\backend\\.venv\\Scripts\\python.exe ml\\scripts\\train.py

DATASET (real, not synthetic)
    UCI "Room Occupancy Estimation", downloaded from
    https://archive.ics.uci.edu/static/public/864/data.csv into
    ml/datasets/occupancy_detection.csv (git-ignored).

    Measured profile of that file:
        10,129 rows x 19 columns, 0 missing values, 0 duplicate rows
        target `Room_Occupancy_Count`: {0: 8228, 1: 459, 2: 748, 3: 694}

TARGET
    The target is a COUNT, but the product needs a binary state, so it is
    binarised as `count > 0` -> OCCUPIED. Documented, not assumed.

FEATURES (3, chosen to match what the Arduino can actually measure)
    The dataset has 4 temperature, 4 light, 4 sound, CO2, CO2-slope and 2 PIR
    columns. Our rig has ONE DHT22, ONE LDR and ONE HC-SR501 PIR, so the
    per-sensor columns are aggregated to a 1:1 deployable feature set:

        temp_mean   = mean(S1_Temp..S4_Temp)   <- DHT22 temperature
        light_mean  = mean(S1_Light..S4_Light)  <- LDR
        pir_count   = S6_PIR + S7_PIR          <- PIR motion (0..2)

    Sound and CO2 are deliberately EXCLUDED: the rig cannot measure them, so a
    model needing them could never run on the real sensor feed.

LEAKAGE PREVENTION
    Median imputation and StandardScaler are fit on the TRAIN split only; the
    test split is transformed with those frozen statistics.

CLASS IMBALANCE
    81% of rows are EMPTY, so accuracy alone is misleading. Selection uses the
    F1 score of the OCCUPIED class; macro-F1 is also reported. No resampling is
    applied - an empty classroom is genuinely the common case.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Allow `python ml/scripts/train.py` from the project root to import `app.*`
# (which lives under backend/).
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT / "backend"))

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier

# ---- Reproducibility ------------------------------------------------------
RANDOM_STATE = 42
TEST_SIZE = 0.2
CV_FOLDS = 5

# ---- Source columns (exact names as they appear in the CSV) ---------------
TEMP_COLS = ["S1_Temp", "S2_Temp", "S3_Temp", "S4_Temp"]
LIGHT_COLS = ["S1_Light", "S2_Light", "S3_Light", "S4_Light"]
PIR_COLS = ["S6_PIR", "S7_PIR"]
TARGET_COL = "Room_Occupancy_Count"

#: Deployed feature contract (1:1 with the Arduino sensor feed).
FEATURE_NAMES = ["temp_mean", "light_mean", "pir_count"]

#: KNN and SVC(gamma='scale') cannot report a calibrated probability, so
#: confidence is reported as None for them rather than faked.
SUPPORTS_PROBA = {
    "LogisticRegression": True,
    "DecisionTree": True,
    "KNN": False,
    "SVM": False,
    "RandomForest": True,
}


@dataclass
class ModelResult:
    name: str
    metrics: dict[str, float]
    cv_f1_mean: float
    cv_f1_std: float
    train_seconds: float
    confusion_matrix: list[list[int]]
    supports_proba: bool
    params: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "metrics": self.metrics,
            "cv_f1_mean": round(self.cv_f1_mean, 4),
            "cv_f1_std": round(self.cv_f1_std, 4),
            "train_seconds": round(self.train_seconds, 3),
            "confusion_matrix": self.confusion_matrix,
            "supports_proba": self.supports_proba,
        }


# ---------------------------------------------------------------------------
# Data loading / feature engineering
# ---------------------------------------------------------------------------
def dataset_path() -> Path:
    from app.config import PROJECT_ROOT

    return PROJECT_ROOT / "ml" / "datasets" / "occupancy_detection.csv"


def load_dataset(path: Path | None = None) -> pd.DataFrame:
    """Load the real dataset. Raises if missing - never fabricates data."""
    p = path or dataset_path()
    if not p.exists():
        raise FileNotFoundError(
            f"Dataset not found: {p}\nRun .\\scripts\\fetch_datasets.ps1 to download it."
        )
    df = pd.read_csv(p)
    required = TEMP_COLS + LIGHT_COLS + PIR_COLS + [TARGET_COL]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Dataset is missing required columns: {missing}")
    return df


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate the multi-sensor columns into the 3 deployed features."""
    out = pd.DataFrame(index=df.index)
    out["temp_mean"] = df[TEMP_COLS].mean(axis=1)
    out["light_mean"] = df[LIGHT_COLS].mean(axis=1)
    out["pir_count"] = df[PIR_COLS].sum(axis=1)
    return out[FEATURE_NAMES]


def build_target(df: pd.DataFrame) -> pd.Series:
    """Binarise the occupancy count: more than zero people means OCCUPIED."""
    return (df[TARGET_COL] > 0).astype(int)


# ---------------------------------------------------------------------------
# Preprocessing (fit on TRAIN only)
# ---------------------------------------------------------------------------
def make_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                FEATURE_NAMES,
            )
        ],
        remainder="drop",
    )


def make_models() -> dict[str, Any]:
    """The five required lightweight classifiers.

    Parameters are chosen deliberately rather than left to arbitrary defaults:
      * LogisticRegression: max_iter raised so the solver actually converges.
      * DecisionTree: depth capped to avoid overfitting on 3 features.
      * KNN: k=5, the standard starting point (data is scaled beforehand).
      * SVC: RBF with gamma='scale', the general-purpose default.
      * RandomForest: 200 trees - stable without being slow on CPU.
    """
    return {
        "LogisticRegression": LogisticRegression(
            max_iter=2000, random_state=RANDOM_STATE
        ),
        "DecisionTree": DecisionTreeClassifier(max_depth=8, random_state=RANDOM_STATE),
        "KNN": KNeighborsClassifier(n_neighbors=5),
        # probability=False: SVC probabilities require internal Platt scaling,
        # which is slow and unnecessary here.
        "SVM": SVC(kernel="rbf", gamma="scale", random_state=RANDOM_STATE),
        "RandomForest": RandomForestClassifier(
            n_estimators=200, random_state=RANDOM_STATE, n_jobs=-1
        ),
    }


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------
def evaluate(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    """Binary metrics for the OCCUPIED (positive) class."""
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
        "f1_macro": round(
            float(f1_score(y_true, y_pred, average="macro", zero_division=0)), 4
        ),
    }


def select_model(results: list[ModelResult]) -> ModelResult:
    """Selection criterion: highest test F1 on the OCCUPIED class.

    Ties break on cross-validated F1 mean, then accuracy. F1 is used instead of
    accuracy because 81% of rows are EMPTY - under which accuracy alone would
    reward a model that always predicts "empty".
    """
    return sorted(
        results,
        key=lambda r: (r.metrics["f1"], r.cv_f1_mean, r.metrics["accuracy"]),
        reverse=True,
    )[0]


def train_all(X: pd.DataFrame, y: pd.Series, verbose: bool = True) -> list[ModelResult]:
    """Train + evaluate every candidate on a held-out split, with 5-fold CV."""
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
    )
    cv = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE)

    results: list[ModelResult] = []
    for name, clf in make_models().items():
        started = time.perf_counter()
        pipe = Pipeline([("prep", make_preprocessor()), ("clf", clf)])

        pipe.fit(X_train, y_train)
        y_pred = pipe.predict(X_test)

        cv_scores = cross_val_score(
            pipe, X_train, y_train, cv=cv, scoring="f1", n_jobs=-1
        )
        elapsed = time.perf_counter() - started

        result = ModelResult(
            name=name,
            metrics=evaluate(y_test, y_pred),
            cv_f1_mean=float(cv_scores.mean()),
            cv_f1_std=float(cv_scores.std()),
            train_seconds=elapsed,
            confusion_matrix=confusion_matrix(y_test, y_pred).tolist(),
            supports_proba=SUPPORTS_PROBA[name],
            params=clf.get_params(),
        )
        results.append(result)
        if verbose:
            m = result.metrics
            print(
                f"  {name:<20} acc={m['accuracy']:.4f} prec={m['precision']:.4f} "
                f"rec={m['recall']:.4f} f1={m['f1']:.4f} "
                f"cv_f1={result.cv_f1_mean:.4f}+/-{result.cv_f1_std:.4f} "
                f"({elapsed:.2f}s)"
            )
    return results


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="Train occupancy classifiers.")
    parser.add_argument("--inspect", action="store_true", help="Print dataset profile only.")
    parser.add_argument(
        "--out",
        default="ml/artifacts/occupancy_model.joblib",
        help="Output artifact path (relative to project root).",
    )
    args = parser.parse_args()

    from app.config import PROJECT_ROOT

    df = load_dataset()
    print(f"Dataset loaded : {df.shape[0]} rows x {df.shape[1]} columns")
    print(f"Missing values : {int(df.isna().sum().sum())}")
    print(f"Duplicate rows : {int(df.duplicated().sum())}")
    counts = df[TARGET_COL].value_counts().sort_index()
    print(f"Target '{TARGET_COL}': {counts.to_dict()}")
    y_full = build_target(df)
    print(
        f"Binary target  : {y_full.value_counts().to_dict()} "
        f"({y_full.mean() * 100:.1f}% OCCUPIED)"
    )
    if args.inspect:
        return 0

    X = build_features(df)
    y = y_full
    print(f"\nFeatures ({len(FEATURE_NAMES)}): {FEATURE_NAMES}")
    print(
        f"Split          : {int((1 - TEST_SIZE) * 100)}/{int(TEST_SIZE * 100)} "
        f"stratified, random_state={RANDOM_STATE}"
    )
    print(f"Cross-validation: {CV_FOLDS}-fold stratified\n")
    print("Training and evaluating:")

    results = train_all(X, y)
    best = select_model(results)

    print(f"\nSelected model : {best.name}")
    print("  criterion    : highest test F1 (OCCUPIED class)")
    print(f"  test metrics : {best.metrics}")
    print(f"  confusion    : {best.confusion_matrix}  (rows=true, cols=pred)")
    print(f"  training     : {best.train_seconds:.2f}s")

    # Refit the winner on ALL data for the deployed artifact.
    final = Pipeline([("prep", make_preprocessor()), ("clf", make_models()[best.name])])
    final.fit(X, y)

    out = Path(args.out)
    if not out.is_absolute():
        out = PROJECT_ROOT / out
    out.parent.mkdir(parents=True, exist_ok=True)

    bundle = {
        "pipeline": final,
        "feature_names": FEATURE_NAMES,
        "model_name": best.name,
        "supports_proba": best.supports_proba,
        "label_map": {0: "EMPTY", 1: "OCCUPIED"},
        "metrics": best.metrics,
        "confusion_matrix": best.confusion_matrix,
        "all_model_results": [r.as_dict() for r in results],
        "dataset": {
            "name": "UCI Room Occupancy Estimation",
            "source": "https://archive.ics.uci.edu/static/public/864/data.csv",
            "rows": int(df.shape[0]),
            "columns": int(df.shape[1]),
            "target_column": TARGET_COL,
            "target_transform": "Room_Occupancy_Count > 0 -> OCCUPIED",
            "missing_values": int(df.isna().sum().sum()),
            "duplicate_rows": int(df.duplicated().sum()),
            "class_distribution": {str(k): int(v) for k, v in counts.items()},
        },
        "split": {
            "test_size": TEST_SIZE,
            "random_state": RANDOM_STATE,
            "cv_folds": CV_FOLDS,
            "selection_criterion": "highest test F1 on the OCCUPIED class",
        },
    }
    joblib.dump(bundle, out, compress=3)

    metrics_path = out.with_name("metrics.json")
    metrics_path.write_text(
        json.dumps({k: v for k, v in bundle.items() if k != "pipeline"}, indent=2),
        encoding="utf-8",
    )

    print(f"\nSaved artifact : {out} ({out.stat().st_size / 1024:.1f} KB)")
    print(f"Saved metrics  : {metrics_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
