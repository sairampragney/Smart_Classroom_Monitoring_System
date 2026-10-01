# Machine Learning (Phase 8)

Sensor-based classroom occupancy prediction: dataset, preprocessing, model
comparison, selection and deployment.

> **Scope:** ML predicts occupancy from environmental sensors. It is
> deliberately **separate** from Computer Vision, which counts visible faces.
> Both can be shown side by side; neither is derived from the other.

---

## 1. Dataset

| Item | Value |
| --- | --- |
| Name | UCI *Room Occupancy Estimation* |
| Source | <https://archive.ics.uci.edu/dataset/864/occupancy+detection> |
| Fetched by | `scripts/fetch_datasets.ps1` (not committed — see `.gitignore`) |
| Rows | **10,129** |
| Columns | **19** |
| Missing values | **0** |
| Duplicate rows | **0** |
| Target column | `Room_Occupancy_Count` |
| Target transform | `Room_Occupancy_Count > 0` → `OCCUPIED` (1) |
| Class distribution | `0`: 8,228 EMPTY · `1`: 1,901 OCCUPIED (**18.8% occupied**) |

### Source columns (exact names as shipped)

```
Date, Time,
S1_Temp, S2_Temp, S3_Temp, S4_Temp,
S1_Light, S2_Light, S3_Light, S4_Light,
S1_Sound, S2_Sound, S3_Sound, S4_Sound,
S5_CO2, S5_CO2_Slope, S6_PIR, S7_PIR,
Room_Occupancy_Count
```

### Feature contract (3 features)

The dataset has 19 columns but the classroom rig can only measure three things,
so per-sensor columns are aggregated into a 1:1 deployable contract:

| Feature | Derivation | Arduino source |
| --- | --- | --- |
| `temp_mean` | `mean(S1_Temp..S4_Temp)` | DHT22 temperature (°C) |
| `light_mean` | `mean(S1_Light..S4_Light)` | LDR (raw ADC counts) |
| `pir_count` | `S6_PIR + S7_PIR` | HC-SR501 PIR (0 or 1) |

**Sound and CO2 are deliberately excluded.** The rig has no microphone or CO2
sensor, so a model requiring them could never run on the real sensor feed.

Feature order is fixed and asserted by tests.

---

## 2. Preprocessing

| Step | Detail | Leakage control |
| --- | --- | --- |
| Cleaning | 0 missing, 0 duplicates (verified, not assumed) | n/a |
| Imputation | `SimpleImputer(strategy="median")` | **fit on train split only** |
| Scaling | `StandardScaler` | **fit on train split only** |
| Split | 80/20 **stratified**, `random_state=42` | test never seen during fit |
| Cross-validation | 5-fold stratified on the train split | inside the train split |
| Imbalance | 81% EMPTY | **no resampling** — an empty classroom is genuinely the common case |

The fitted pipeline (`ColumnTransformer` → classifier) is stored inside the
artifact, so inference uses exactly the same transformations.

---

## 3. Models and measured results

All five required algorithms, trained on the same split:

| Model | Accuracy | Precision | Recall | F1 | CV F1 (mean) | Train |
| --- | --- | --- | --- | --- | --- | --- |
| Logistic Regression | 0.9872 | 0.9836 | 0.9474 | 0.9651 | 0.9529 ± 0.0035 | 4.02 s |
| **Decision Tree** | **0.9985** | **0.9948** | **0.9974** | **0.9961** | 0.9928 ± 0.0037 | 2.10 s |
| KNN | 0.9985 | 0.9974 | 0.9947 | 0.9960 | 0.9872 ± 0.0040 | 0.12 s |
| SVM | 0.9926 | 0.9946 | 0.9658 | 0.9800 | 0.9673 ± 0.0031 | 0.40 s |
| Random Forest | 0.9985 | 0.9974 | 0.9947 | 0.9960 | 0.9928 ± 0.0022 | 1.70 s |

Parameters were chosen deliberately, not left to defaults:

- **Logistic Regression** — `max_iter=2000` so the solver actually converges.
- **Decision Tree** — `max_depth=8` to avoid overfitting three features.
- **KNN** — `n_neighbors=5` (data is scaled beforehand).
- **SVM** — RBF, `gamma="scale"`; `probability=False` (Platt scaling is slow).
- **Random Forest** — `n_estimators=200`, stable without being slow on CPU.

### Selected model

**Decision Tree.**

- **Criterion:** highest **test F1 for the OCCUPIED class**.
- **Why not accuracy:** 81% of rows are EMPTY, so a model that always predicted
  "empty" would score 0.81 accuracy while being useless.
- **Tie-break:** cross-validated F1 mean, then accuracy.
- DecisionTree (0.9961) edged out KNN/RandomForest (both 0.9960) on test F1 and
  tied RandomForest on CV F1 (0.9928).
- **Confusion matrix:** `[[1644, 2], [1, 379]]` — 2 false positives, 1 false
  negative on the held-out set.

### Confidence availability

| Model | `predict_proba` | Confidence reported |
| --- | --- | --- |
| Logistic Regression | yes | real probability |
| Decision Tree | yes | real probability |
| KNN | **no** | `null` — never faked |
| SVM | **no** | `null` — never faked |
| Random Forest | yes | real probability |

---

## 4. Reproducing

```powershell
# 1. Fetch the real dataset
.\scripts\fetch_datasets.ps1

# 2. Inspect it without training
.\backend\.venv\Scripts\python.exe ml\scripts\train.py --inspect

# 3. Train + evaluate + save
.\backend\.venv\Scripts\python.exe ml\scripts\train.py
```

Artifacts (both git-ignored; regenerate with the command above):

| Path | Size | Contents |
| --- | --- | --- |
| `ml/artifacts/occupancy_model.joblib` | ~4.3 KB | fitted pipeline + all metadata |
| `ml/artifacts/metrics.json` | — | every model's metrics, human-readable |

---

## 5. Prediction service

**Input** (same schema as the Arduino feed — no second sensor contract):

```json
{ "temperature": 26.0, "light": 220, "motion": true }
```

**Output:**

```json
{
  "prediction": "OCCUPIED",
  "confidence": 1.0,
  "model": "DecisionTree",
  "code": 1,
  "features": { "temp_mean": 26.0, "light_mean": 220.0, "pir_count": 1.0 },
  "source": "sensor"
}
```

`confidence` is a real probability when the model supports one and `null`
otherwise — it is never fabricated.

### Data flow

```text
Arduino → serial → SensorReading → ml_service.predict()
        → StateStore → StateBroadcaster → ml_prediction (WS) → React
```

The model is loaded **once** at backend start-up and reused; it is never
retrained on a sensor update. `ml_prediction` is broadcast only when the
prediction actually changes, so a steady classroom is quiet.

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/ml/info` | model, features, dataset profile, all metrics |
| GET | `/api/ml/status` | lightweight state for the System page |
| POST | `/api/ml/predict` | predict from explicit values |

---

## 6. Known limitations

1. **Light-scale domain mismatch (important).** The dataset's light sensors span
   roughly 0–280; the classroom LDR is a 0–1023 ADC. A raw LDR reading
   therefore sits well outside the training distribution after scaling.
   Temperature and PIR map naturally; **light does not**. Real deployment should
   recalibrate the LDR to the training range, or retrain on the team's own
   collected data.
2. **Reported metrics are dataset metrics, not classroom metrics.** They were
   measured on a public dataset. Do not present 99.85% accuracy as real-world
   performance.
3. **The dataset is highly separable**, partly because it was assembled under
   controlled conditions with ceiling PIR and CO2 sensors. Expect lower accuracy
   on messier real data.
4. **No humidity is used.** The DHT22 reports it, but the dataset has no
   humidity column, so including it would be fabrication.
5. **Binary only.** The source target is a count (0–3), collapsed to
   OCCUPIED/EMPTY to match the product requirement.
6. **Decision trees can be unstable.** A different split could change the
   winner; Random Forest is within 0.0001 F1 and would be the more robust
   choice if stability mattered more than a fraction of a percent.

---

## 7. Verification summary

| Category | Result |
| --- | --- |
| Dataset verification | **PASS** — real UCI file, 10,129 × 19, 0 missing, 0 duplicates |
| Training / evaluation | **PASS** — 5 models trained and evaluated for real |
| Automated tests | **PASS** — 25 ML tests (real-data and real-artifact tests ran, not skipped) |
| Backend regression | **PASS** — 186 tests |
| Frontend build | **PASS** |
| Live prediction | **PASS** — real `/api/ml/predict` responses observed |
| Arduino end-to-end ML | **NOT PERFORMED** — no physical board connected |
