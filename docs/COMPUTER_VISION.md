# Computer Vision Engine (Phase 6)

Real-time face detection and current head count from the local camera.

> **Scope:** this is the Python/OpenCV engine. The React camera UI is Phase 7.

---

## 1. Detector

| Item | Value |
| --- | --- |
| Detector | **YuNet** (`cv2.FaceDetectorYN`) |
| Model | `cv/models/face_detection_yunet_2023mar.onnx` (227 KB) |
| Source | OpenCV model zoo |
| Download | `scripts/fetch_cv_models.ps1` (not committed — see `.gitignore`) |
| Confidence | real 0–1 score from the model |
| Landmarks | 5 points per face (eyes, nose, mouth corners) |

### Why YuNet

| Candidate | Verdict |
| --- | --- |
| **Haar cascade** | Rejected. `cv2.CascadeClassifier` was **removed in OpenCV 5.0** and no cascades ship with the wheel, so it is unavailable on this stack. It also gives no confidence score. |
| **MediaPipe Face Detection** | Rejected. Accurate, but pulls a large extra dependency tree and a second runtime into the venv for a task OpenCV already handles. |
| **DNN detectors (ResNet / MTCNN)** | Rejected. Far heavier than this project needs on a CPU-only laptop. |
| **YuNet** | **Chosen.** 227 KB, CPU-friendly, real confidence, multi-face, ships inside OpenCV. |

### Limitations (honest)

- **No face recognition.** Only *where* faces are, never *who*.
- Trained mostly on frontal faces: **strong profile / 90° side faces are often
  missed**.
- **Occlusion** (a partially hidden face) can suppress detection.
- **Very small faces** in a wide classroom shot may fall below the 0.6
  confidence threshold — move closer or lower `CV_MIN_CONFIDENCE`.
- **Poor or backlit lighting** degrades detection. Backlit windows behind
  students are a common classroom failure mode.
- Detection is per-frame, with no temporal smoothing (by design — the current
  frame is the source of truth).

---

## 2. Architecture

```text
main.py (lifespan)
   └── CVService  (one background thread, "cv-worker")
         ├── CameraManager   -> cv2.VideoCapture
         └── YuNetDetector   -> cv2.FaceDetectorYN
                    │
                    ▼
               StateStore.update_cv(...)
                    │
                    ├── REST  /api/cv/*
                    └── WS    face_detection  (via StateBroadcaster)
```

| File | Responsibility |
| --- | --- |
| `app/models/cv.py` | `FaceBox`, `DetectionResult` + coordinate contract |
| `app/services/camera.py` | capture, open/release, every failure as a value |
| `app/services/face_detector.py` | YuNet wrapper + output parsing/validation |
| `app/services/cv_service.py` | worker thread, lifecycle, FPS, publishing |
| `app/api/cv.py` | REST endpoints for Phase 7 |

### Threading

Capture and inference are blocking and CPU-bound, so the whole pipeline runs in
**one** daemon thread. FastAPI's event loop never touches the camera.

- **No frame queue.** Capture and detection happen synchronously. A queue would
  let latency grow without bound when detection fell behind capture; processing
  the newest frame always answers *"what is visible right now"* — which is
  exactly what a head count must mean.
- **One worker, ever.** Repeated `start()` calls are no-ops while a thread is
  alive, so the camera can never be opened twice.
- Reconnection to a camera that disappears uses exponential backoff (1 s → 10 s).

---

## 3. Camera configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `CAMERA_INDEX` | `0` | 0 = laptop webcam, 1 = external USB camera |
| `CV_FRAME_WIDTH` | `640` | requested capture width |
| `CV_FRAME_HEIGHT` | `480` | requested capture height |
| `CV_MIN_CONFIDENCE` | `0.6` | YuNet score threshold |
| `CV_PROCESS_SCALE` | `1.0` | downscale for CPU; boxes still in SOURCE coords |
| `CV_MODEL_PATH` | `cv/models/face_detection_yunet_2023mar.onnx` | model file |
| `CV_JPEG_QUALITY` | `70` | quality for the Phase 7 snapshot endpoint |

```powershell
Get-PnpDevice -Class Camera | Format-Table Status, FriendlyName
.\backend\.venv\Scripts\python.exe -c "import cv2; c=cv2.VideoCapture(1); print(c.isOpened()); c.release()"
```

### Processing resolution

Default `640×480` at `CV_PROCESS_SCALE=1.0`. On the target Dell Latitude 5490
(i5-8350U, **no CUDA**) this measured **~31 FPS**, so downscaling is not
needed. If you lower the scale, boxes are scaled back up so the coordinate
contract below always holds.

---

## 4. Coordinate contract

Every box is in **SOURCE camera frame pixels**:

- origin `(0, 0)` = **top-left** of the captured frame
- `+x` = **right**, `+y` = **down**
- units = pixels of the **source** frame, *not* the (optionally downscaled)
  processing frame
- source dimensions travel with every result as `frame_width` / `frame_height`

Phase 7 should convert these to percentages of the displayed video rather than
raw pixels, so boxes stay aligned under any CSS resize or `object-fit` crop.

---

## 5. Output schema

`GET /api/cv/detections`:

```json
{
  "face_count": 3,
  "fps": 30.88,
  "detector": "YuNet",
  "frame_width": 640,
  "frame_height": 480,
  "faces": [
    {
      "x": 120, "y": 80, "width": 140, "height": 140,
      "confidence": 0.97,
      "landmarks": [[141, 130], [165, 130], [153, 152], [143, 170], [164, 170]]
    }
  ],
  "processed_at": "2026-10-01T23:31:04.512Z"
}
```

WebSocket `face_detection` message:

```json
{
  "type": "face_detection",
  "timestamp": "2026-10-01T23:31:04.512Z",
  "payload": {
    "face_count": 3,
    "faces": [ /* … */ ],
    "frame_width": 640,
    "frame_height": 480,
    "detector": "YuNet",
    "fps": 30.88,
    "frames_processed": 582,
    "processed_at": "2026-10-01T23:31:04.512Z"
  }
}
```

`confidence` is `null` (never faked) for a detector that cannot supply one.

---

## 6. Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/cv/status` | pipeline state, FPS, counters, error |
| GET | `/api/cv/detections` | latest boxes (no image) |
| GET | `/api/cv/frame` | latest boxes + base64 JPEG snapshot |
| POST | `/api/cv/start` | begin detection |
| POST | `/api/cv/stop` | stop detection and **release the camera** |

```powershell
Invoke-RestMethod -Method POST http://localhost:8000/api/cv/start
Invoke-RestMethod http://localhost:8000/api/cv/status
Invoke-RestMethod -Method POST http://localhost:8000/api/cv/stop
```

The camera is **never** opened at backend start-up — only by `/api/cv/start`,
so an absent camera is a normal state.

---

## 7. Lifecycle & states

```text
STOPPED --start--> RUNNING --> STOPPED (camera released)
                │
                └─ camera/detector failure -> ERROR  (backend stays alive)
```

`camera` is separately `DISCONNECTED / CONNECTING / CONNECTED`, so "backend up
but no camera" stays distinguishable from "camera up but detector failed".

A first camera open can take **~3 seconds** on Windows while the driver
initialises. `cv` reports `RUNNING` immediately, but `camera` stays
`CONNECTING` until the device is genuinely ready.

---

## 8. Verification status

Reported separately, as required:

| Category | Result |
| --- | --- |
| Automated CV tests | **PASS** — 26 tests (`backend/tests/test_cv.py`) |
| Synthetic / mocked CV tests | **PASS** — fake camera + fake detector |
| **Real camera verification** | **PARTIAL PASS** — real `Integrated Webcam` used |

### What the real camera test proved

- camera opened on index 0, real `640×480` frames
- **582 frames** captured
- **measured FPS 30.88** (derived from real per-frame time, not hardcoded)
- **102 `face_detection` WebSocket messages** delivered
- `face_count = 0` (correct — nobody was in front of the camera)
- live JPEG snapshot produced (7.5 KB base64)
- `POST /api/cv/stop` released the camera → `camera = DISCONNECTED`

### What the real camera test could NOT prove

No person was in front of the camera, so **actual face detection was not
observed on real hardware**. These behaviours are verified only against
synthetic frames:

- `New face enters → headcount increases` — **NOT TESTED on real hardware**
- `Face leaves → headcount decreases` — **NOT TESTED on real hardware**
- `Moving face → coordinates update` — **NOT TESTED on real hardware**

To close this gap: start the backend, `POST /api/cv/start`, and sit in front
of the webcam while `/api/cv/detections` is open.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Camera 0 could not be opened` | Another app holds the camera (Teams/Zoom/Meet/browser tab). Close it, then retry. |
| No camera found | Try `CAMERA_INDEX=1`, or check `Get-PnpDevice -Class Camera`. |
| `Detector model not found` | Run `.\scripts\fetch_cv_models.ps1`. |
| `Could not initialise YuNet` | Model file corrupt — delete it and re-run the fetch script. |
| `cv` stuck at `CONNECTING` | Windows driver still initialising (~3 s). Check `/api/cv/status` again shortly. |
| Faces not detected | Improve frontal lighting, move closer, or lower `CV_MIN_CONFIDENCE` to `0.4`. |
| Low FPS | Set `CV_PROCESS_SCALE=0.75` (or `0.5`); boxes stay in source coordinates. |
| Webcam light stays on after stop | `POST /api/cv/stop` releases it; the backend also releases on shutdown. |
