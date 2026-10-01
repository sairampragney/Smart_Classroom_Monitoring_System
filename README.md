# Smart Classroom Monitoring System

> **Low-Cost Smart Classroom Occupancy Detection Using Arduino Uno and Machine
> Learning: A Comparative Study of Lightweight Machine Learning Algorithms**

A real-time, fully local monitoring system that combines **IoT hardware sensing**,
**machine learning**, and **computer vision** to report classroom occupancy and
visible head count.

Everything runs on a single local machine (target: **Dell Latitude 5490**).
No cloud backend is required.

| Component | Address |
| --- | --- |
| React frontend | http://localhost:5173 |
| FastAPI backend | http://localhost:8000 |
| WebSocket | ws://localhost:8000/ws |
| API docs | http://localhost:8000/docs |

---

## Status

This repository is built in phases. The table below is the authoritative
progress tracker.

| Phase | Name | Status |
| --- | --- | --- |
| 0 | Project Initialization | ✅ Complete |
| 1 | Frontend Foundation | ✅ Complete |
| 2 | Backend Foundation | ✅ Complete |
| 3 | Arduino Firmware | ✅ Complete |
| 4 | Arduino ↔ Backend Connection | ✅ Complete |
| 5 | Frontend ↔ Backend Real-Time | ✅ Complete |
| 6 | Computer Vision Engine | ✅ Complete |
| 7 | Computer Vision Frontend | ✅ Complete |
| 8 | Machine Learning | ✅ Complete |
| 9 | History / Data Persistence | ✅ Complete |
| 10 | System Monitoring | ✅ Complete |
| 3 | Arduino Firmware | ⏳ Pending |
| 4 | Arduino ↔ Backend Connection | ⏳ Pending |
| 5 | Frontend ↔ Backend Real-Time Connection | ⏳ Pending |
| 6 | Computer Vision Engine | ⏳ Pending |
| 7 | Computer Vision Frontend | ⏳ Pending |
| 8 | Machine Learning | ⏳ Pending |
| 9 | History / Data | ⏳ Pending |
| 10 | System Monitoring | ⏳ Pending |
| 11 | Integration | ⏳ Pending |
| 12 | Local Demo Automation | ⏳ Pending |
| 13 | Final Testing & Quality | ⏳ Pending |

See [`docs/PHASES.md`](docs/PHASES.md) for the full phase plan.

> **Phases 1 & 2 are both complete.** Phase 1 was previously reported as done
> but never actually implemented. It has now been built from scratch after the
> Phase 2 backend, as required. The dev server, all six routes, and the
> production build have all been verified.

---

## Architecture

```text
        ARDUINO UNO                          COMPUTER VISION
    DHT22 / LDR / PIR                            Camera
              │                                     │
              ▼                                     ▼
        Arduino Uno                         OpenCV Detector
              │                                     │
         USB Serial                     Bounding Boxes + Count
              │                                     │
              ▼                                     ▼
     Python Serial Manager                   CV Service
              │                                     │
              └──────────────┬──────────────────────┘
                             ▼
                      Python Backend (FastAPI)
                             │
                        WebSocket / REST
                             ▼
                      React Frontend (Vite)
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
    Dashboard        Live Monitoring      Computer Vision
                                             ML Analysis
                                                History
                                                System
```

- **ML** and **CV** are deliberately kept **conceptually separate**:
  ML predicts `OCCUPIED / EMPTY` from environmental sensors, while CV reports
  the number of *currently visible faces*. They are never forced to agree.

---

## Project Structure

```text
Smart_Classroom_Monitoring_System/
├── arduino/            # Arduino Uno firmware (sketch)
│   └── smart_classroom/
├── backend/            # FastAPI backend (Python)
│   ├── app/            # application package
│   │   ├── api/        # REST + WebSocket routers
│   │   └── services/   # serial, cv, ml, websocket services
│   ├── tests/
│   ├── requirements.txt
│   └── main.py
├── cv/                 # Computer vision assets & tests
│   └── models/         # face detector cascades (git-ignored, fetched by script)
├── frontend/           # React + Vite + TypeScript
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       ├── services/
│       ├── types/
│       └── utils/
├── ml/                 # Machine learning
│   ├── datasets/       # dataset files (git-ignored, fetched by script)
│   ├── scripts/        # training + evaluation scripts
│   └── artifacts/      # trained model bundles (git-ignored)
├── docs/               # architecture, hardware, testing docs
├── scripts/            # PowerShell helper scripts
├── start.ps1           # one-command local startup
├── .env.example        # centralized configuration template
└── README.md
```

---

## Hardware

| Sensor | Purpose | Arduino pin (default) |
| --- | --- | --- |
| DHT22 / AM2302 | Temperature + humidity | D2 (data) |
| LDR + 10 kΩ resistor | Light intensity | A0 |
| HC-SR501 PIR | Motion detection | D7 |

See [`docs/HARDWARE.md`](docs/HARDWARE.md) for the full wiring diagram and
upload procedure.

---

---

## Arduino Firmware (Phase 3)

Firmware: [`arduino/smart_classroom/smart_classroom.ino`](arduino/smart_classroom/smart_classroom.ino)

### Sensors

| Sensor | Measures | Pin |
| --- | --- | --- |
| DHT22 / AM2302 | temperature, humidity | `D2` |
| LDR + 10 kΩ | light intensity | `A0` |
| HC-SR501 PIR | motion | `D7` |

Required library: **DHT sensor library 1.4.7** (Adafruit).

### Compile and upload

```powershell
# Compile only
arduino-cli compile --fqbn arduino:avr:uno arduino\smart_classroom

# Compile and upload
arduino-cli compile --fqbn arduino:avr:uno -u arduino/smart_classroom
```

Or in the Arduino IDE: open the `.ino` → Tools → Board → Arduino Uno →
Tools → Port → `Arduino Uno (COMx)` → Verify → Upload.

Verified build: **7406 bytes flash (22%)**, **267 bytes RAM (13%)**, zero warnings
with `--warnings all`.

### Serial output

One JSON object per line at **9600 baud**, every **1000 ms**:

```json
{"temperature":28.60,"humidity":57.20,"light":642,"motion":true}
```

- The four keys are always present, in a fixed order.
- An unmeasurable value is emitted as `null` — never a made-up number.
- Lines starting with `#` are informational and ignored by the parser.
- Optional `"err":"DHT22_READ_FAILED"` / `"LDR_READ_FAILED"` on failure.

Full wiring diagram, protocol rules and troubleshooting:
[`docs/HARDWARE.md`](docs/HARDWARE.md).

### Firmware contract tests

```powershell
.\backend\.venv\Scripts\python.exe -m pytest arduino\tests -v
```

> Close the Arduino IDE **Serial Monitor** before running the backend — it holds
> the COM port exclusively and blocks `pyserial`.

---

## Computer Vision Engine (Phase 6)

Real face detection and head count from the local camera.
Full documentation: [`docs/COMPUTER_VISION.md`](docs/COMPUTER_VISION.md).

### Setup

```powershell
# 1. Download the detector model (227 KB, not committed)
.\scripts\fetch_cv_models.ps1

# 2. Install CV dependencies
.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

### Run

```powershell
Invoke-RestMethod -Method POST http://localhost:8000/api/cv/start
Invoke-RestMethod http://localhost:8000/api/cv/status
Invoke-RestMethod -Method POST http://localhost:8000/api/cv/stop   # releases camera
```

| Endpoint | Purpose |
| --- | --- |
| `GET /api/cv/status` | pipeline state, FPS, counters, error |
| `GET /api/cv/detections` | latest face boxes (no image) |
| `GET /api/cv/frame` | latest boxes + base64 JPEG snapshot |
| `POST /api/cv/start` | begin detection |
| `POST /api/cv/stop` | stop and release the camera |
| `GET /api/cv/stream` | **MJPEG feed of the backend's own frames** |

### The CV page (Phase 7)

Open **Computer Vision** in the app and press **START DETECTION**. The panel
shows the backend's live camera feed with green `FACE DETECTED` boxes, a large
`HEAD COUNT`, and the real camera/detection state, measured FPS and detector
name.

The video is **not** a second camera capture. The MJPEG stream
(`/api/cv/stream`) serves the exact frames the detector processed, so the box
is always locked to the face it describes. Bounding boxes are converted to
percentages of the source frame, and the panel takes the source aspect ratio,
so alignment holds at any window size.

### Detector

**YuNet** (`cv2.FaceDetectorYN`, 227 KB ONNX). Haar cascades were rejected
because `cv2.CascadeClassifier` was **removed in OpenCV 5.0**; MediaPipe and
DNN detectors were rejected as unnecessarily heavy. YuNet returns a **real**
confidence score and supports multiple faces per frame.

### Configuration

`CAMERA_INDEX`, `CV_FRAME_WIDTH`, `CV_FRAME_HEIGHT`, `CV_MIN_CONFIDENCE`,
`CV_PROCESS_SCALE`, `CV_MODEL_PATH`, `CV_JPEG_QUALITY`.

### Coordinate contract

Boxes are in **source-frame pixels**, origin top-left, `+x` right, `+y` down.
`frame_width` / `frame_height` accompany every result so Phase 7 can map boxes
onto the displayed video correctly.

### Measured on this machine

640×480, Dell Latitude 5490 (i5-8350U, CPU only): **30.88 FPS measured**,
582 frames processed. Head count correctly `0` with nobody in frame.

> **Real face detection on live camera is not yet verified** — no person was in
> front of the camera during the test. Capture, detection loop, FPS, WebSocket
> streaming and camera release **were** verified on the real camera.

---

## Machine Learning (Phase 8)

Sensor-based classroom occupancy prediction. Full documentation:
[`docs/MACHINE_LEARNING.md`](docs/MACHINE_LEARNING.md).

### Setup

```powershell
# 1. Download the real dataset (932 KB, not committed)
.\scripts\fetch_datasets.ps1

# 2. Train all five classifiers and save the artifact
.\backend\.venv\Scripts\python.exe ml\scripts\train.py
```

The backend loads the artifact **once** at startup — it is never retrained on a
sensor update.

### Dataset

| Item | Value |
| --- | --- |
| Name | UCI *Room Occupancy Estimation* |
| Source | <https://archive.ics.uci.edu/dataset/864/occupancy+detection> |
| Size | **10,129 rows × 19 columns** |
| Missing / duplicates | 0 / 0 |
| Target | `Room_Occupancy_Count` → binarised `> 0` = OCCUPIED |
| Class balance | 8,228 EMPTY / 1,901 OCCUPIED (**18.8% occupied**) |

Features are aggregated to exactly what the Arduino measures:
`temp_mean` (DHT22), `light_mean` (LDR), `pir_count` (HC-SR501).

### Measured model comparison (80/20 stratified split, seed 42)

| Model | Accuracy | Precision | Recall | F1 | CV F1 |
| --- | --- | --- | --- | --- | --- |
| Logistic Regression | 0.9872 | 0.9836 | 0.9474 | 0.9651 | 0.9529 |
| **Decision Tree** | **0.9985** | **0.9948** | **0.9974** | **0.9961** | 0.9928 |
| KNN | 0.9985 | 0.9974 | 0.9947 | 0.9960 | 0.9872 |
| SVM | 0.9926 | 0.9946 | 0.9658 | 0.9800 | 0.9673 |
| Random Forest | 0.9985 | 0.9974 | 0.9947 | 0.9960 | 0.9928 |

**Selected: Decision Tree** on the highest test F1 for the OCCUPIED class
(accuracy alone is misleading when 81% of rows are EMPTY).
Confusion matrix `[[1644, 2], [1, 379]]`. Training took **2.10 s**.

### Prediction

```powershell
Invoke-RestMethod http://localhost:8000/api/ml/info
Invoke-RestMethod -Method POST http://localhost:8000/api/ml/predict `
  -ContentType 'application/json' `
  -Body '{"temperature":26.0,"light":220,"motion":true}'
```

The prediction is produced **in the backend** when a sensor reading arrives and
pushed to the UI as a `ml_prediction` WebSocket message. It is conceptually
separate from Computer Vision: ML predicts occupancy from sensors, CV counts
visible faces.

> **Known limitation:** the dataset's light sensor spans roughly 0–280 while
> the classroom LDR is a 0–1023 ADC, so raw LDR values sit outside the training
> distribution. These metrics are measured on the public dataset and should not
> be read as real-world classroom accuracy.

---

## History / Persistence (Phase 9)

Local persistence of monitoring records. Full documentation:
[`docs/HISTORY.md`](docs/HISTORY.md).

### Database

| Item | Value |
| --- | --- |
| Engine | **SQLite** (bundled with Python — no server, no credentials) |
| Location | `backend/data/history.db` (git-ignored) |
| Created | automatically on first backend start |
| Concurrency | per-thread connections + WAL, so reads never block writes |
| Timestamps | timezone-aware ISO-8601 **UTC** everywhere |

### Schema

```sql
history(id, ts, temperature, humidity, light, motion, head_count,
       ml_prediction, ml_confidence, ml_model,
       arduino, cv_state, ml_state, monitoring)
```

Every measurement column is **nullable** — a failed DHT read is stored as
`NULL`, never as `0`.

### Write strategy

The **backend** owns persistence; the frontend only reads. A recorder thread
samples the state every 2 s and writes a row only when the state *meaningfully*
changed (temperature ≥ 0.5 °C, humidity ≥ 2 %, light ≥ 5 ADC, or motion /
head_count / ML prediction changed), with a 60 s heartbeat so quiet periods are
still represented. Identical repeats never create duplicate rows.

### API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/history?limit=100` | recent records, newest first (limit 1–1000) |
| GET | `/api/history/latest` | single newest record |
| GET | `/api/history/stats` | row count and database path |

```powershell
Invoke-RestMethod 'http://localhost:8000/api/history?limit=20'
```

### Inspecting the database locally

```powershell
# Row count
Invoke-RestMethod http://localhost:8000/api/history/stats

# Raw SQL (Python ships sqlite3; no extra tool needed)
.\backend\.venv\Scripts\python.exe -c "import sqlite3;c=sqlite3.connect(r'backend\data\history.db');print(c.execute('SELECT COUNT(*) FROM history').fetchone())"
```

---

## System Monitoring (Phase 10)

The System page is a real health dashboard: every status is derived from live
runtime state. Full documentation: [`docs/SYSTEM_MONITORING.md`](docs/SYSTEM_MONITORING.md).

### Components monitored

| Component | State source |
| --- | --- |
| Frontend | the browser (page is rendering) |
| Backend / FastAPI | live `GET /health` response |
| WebSocket | browser socket lifecycle (`useWebSocket`) |
| Arduino | shared `StateStore`, pushed over the WebSocket |
| Serial | shared `StateStore`, pushed over the WebSocket |
| Camera | `StateStore` + CV lifecycle |
| Computer Vision | `StateStore` + measured FPS / head count |
| ML Model | `StateStore` + the model actually loaded in memory |
| Database | a real query against the SQLite file |

### Key rules

- **No hardcoded status.** `Arduino` shows `DISCONNECTED` when no board exists.
- **No stale green.** When the backend is unreachable, every backend-derived
  component becomes `NOT_AVAILABLE` — the last known state is never replayed.
- **No fabricated measurements.** FPS and head count are `null` (rendered `--`)
  until real frames have been processed.
- **One disconnected component is not "the system is down".** Arduino being
  unplugged does not turn the database red.

### Checking status from the shell

```powershell
Invoke-RestMethod http://localhost:8000/health | ConvertTo-Json -Depth 5
```

---

## Quick Start

```powershell
# One-command startup (creates venv + installs deps if needed)
.\start.ps1
```

### Manual setup

```powershell
# 1. Backend
python -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
uvicorn backend.main:app --reload --port 8000

# 2. Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Then open <http://localhost:5173>.

---

## Backend Setup (Phase 2+)

The backend lives in `backend/` and runs on **http://localhost:8000**.

```powershell
# One-time setup
python -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt

# Start (from the project root)
uvicorn backend.main:app --reload --port 8000
```

Or without activating the venv:

```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```

Then verify:

```powershell
Invoke-WebRequest http://localhost:8000/health | Select-Object -ExpandProperty Content
```

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Structured health JSON |
| `GET /api/status` | Alias of `/health` |
| `GET /api/arduino/status` | Arduino + monitoring state |
| `GET /api/arduino/sensors` | Latest valid reading (nulls if none) |
| `GET /api/arduino/ports` | Discovered ports + Arduino-likeness scores |
| `GET /api/arduino/config` | Effective serial settings |
| `POST /api/arduino/monitoring/start` | Start monitoring (RUN PROGRAM backend half) |
| `POST /api/arduino/monitoring/stop` | Stop monitoring |
| `WS /ws` | Real-time channel |
| `GET /docs` | Swagger UI |

### Run the backend tests

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend/tests -v
```

### Backend structure

```text
backend/
├── main.py                 # App factory, CORS, lifespan
├── requirements.txt
├── app/
│   ├── config.py           # pydantic-settings (all env vars)
│   ├── logging_config.py   # console + rotating file logging
│   ├── api/
│   │   ├── health.py       # /health, /api/status
│   │   ├── arduino.py      # /api/arduino/*  (Phase 4)
│   │   └── ws.py           # /ws endpoint
│   ├── models/
│   │   ├── common.py       # ConnectionState / CVState / MLState / MonitoringState
│   │   ├── health.py       # health & status schemas
│   │   ├── sensors.py      # Phase 3 protocol parser + validation
│   │   └── ws.py           # WebSocket message protocol
│   └── services/
│       ├── state.py        # thread-safe StateStore (single source of truth)
│       ├── serial_manager.py   # Phase 4 Arduino worker thread
│       ├── port_discovery.py   # Phase 4 COM-port discovery
│       └── websocket_manager.py
└── tests/
```

---

## Arduino ↔ Backend Connection (Phase 4)

### Automatic detection (recommended)

Leave the port unset. The backend enumerates serial ports, **excludes
Bluetooth pseudo-ports** (COM3/COM4/COM9/COM10 on a typical Windows laptop are
Bluetooth, not Arduino), and ranks candidates by USB VID/PID
(Arduino `0x2341`, WCH `0x1A86`, Silicon Labs `0x10C4`, FTDI `0x0403`).

```powershell
Invoke-RestMethod http://localhost:8000/api/arduino/ports | ConvertTo-Json -Depth 5
```

If more than one candidate is found the backend logs a warning and picks the
highest score. It never guesses silently.

### Pinning the port manually

Create `backend\.env`:

```dotenv
# Either name works:
ARDUINO_PORT=COM5
SERIAL_PORT=COM5
```

Verify the port is real hardware:

```powershell
Get-PnpDevice -Class Ports | Format-Table Status, FriendlyName
```

### Monitoring lifecycle

| Step | Command | Expected |
| --- | --- | --- |
| 1. Start the backend | `uvicorn backend.main:app --reload --port 8000` | `Serial manager ready` |
| 2. Inspect discovered ports | `GET /api/arduino/ports` | your Arduino, `is_arduino_likely: true` |
| 3. Start monitoring | `POST /api/arduino/monitoring/start` | `"monitoring":"RUNNING"` |
| 4. Watch values | `GET /api/arduino/sensors` | real T/H/L/motion |
| 5. Watch logs | backend console | `Arduino connected on COMx`, `Sensor data received: ...` |
| 6. Stop monitoring | `POST /api/arduino/monitoring/stop` | `"monitoring":"STOPPED"` |

### What happens with no Arduino

This is a normal, fully-supported state:

- `GET /api/arduino/sensors` returns all `null` with `"has_data": false` —
  it never invents placeholder values.
- The worker rescans with exponential backoff (1s → 2s → 4s → 8s → 15s cap).
- HTTP and WebSocket stay fully responsive the whole time.
- Unplug/replug the board and the state recovers on its own — no backend
  restart is needed.

### Verified logs

```text
[INFO] Scanning serial ports...
[INFO] Arduino candidate found: COM5 (Arduino Uno (COM5))
[INFO] Connecting to COM5 at 9600 baud...
[INFO] Arduino connected on COM5
[INFO] Sensor data received: T=28.60 H=57.20 L=642 M=True
[WARNING] Malformed serial packet: missing required field(s): motion
[WARNING] Arduino disconnected (device disconnected)
[INFO] Attempting reconnection...
```

### Serial tests

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend\tests\test_serial_parser.py -v
.\backend\.venv\Scripts\python.exe -m pytest backend\tests\test_serial_manager.py -v
.\backend\.venv\Scripts\python.exe -m pytest backend\tests\test_port_discovery.py -v
```

These use a fake serial device. **They do not prove physical hardware works.**

---

## Real-Time Data Flow (Phase 5)

```text
Arduino ──USB──> pyserial ──> StateStore ──> StateBroadcaster ──> WS /ws
                                                                   │
                                                                   ▼
                                        SystemStatusContext (ONE socket)
                                                                   │
                        ┌──────────────────────┬───────────────────┴────────┐
                        ▼                      ▼                            ▼
                   Live Monitoring         Dashboard                    System
```

### Backend

A broadcaster task polls the StateStore every 200 ms and emits a message **only
when something changed**, so an idle system produces zero traffic.

| Message | Emitted when |
| --- | --- |
| `hello` | on connect (protocol + mode) |
| `system_status` | on connect (full snapshot) |
| `arduino_status` | connection / monitoring / port state changed |
| `sensor_reading` | a new validated sample arrived |
| `pong` | reply to a client `ping` |

Envelope: `{ "type", "timestamp", "payload" }`.

### Frontend

`SystemStatusContext` owns **one** WebSocket for the whole app, so navigating
between pages never creates a duplicate connection. It re-connects with
exponential backoff (1s → 15s cap) and surfaces
`CONNECTING / OPEN / CLOSED / ERROR`.

### Data freshness

The UI distinguishes three states and never presents stale data as live:

| State | Meaning | Card shows |
| --- | --- | --- |
| `Live` | a reading arrived recently | the real value |
| `Stale` | last known value, older than 5 s | the real value + "Last known value" |
| `No data` | nothing ever received | `--` + "No data" |

A `null` from the firmware (failed DHT22 read) is rendered as `--`, **never**
as `0`.

### Charts

Recharts renders Temperature, Humidity and Light from received data only.
The window is bounded to the last 60 points. Motion is boolean, so it uses a
discrete state strip rather than a misleading continuous line.

### WebSocket message protocol

Every server → client message uses one envelope:

```json
{
  "type": "system_status",
  "timestamp": "2026-10-01T12:39:26Z",
  "payload": { "arduino": "DISCONNECTED", "cv": "STOPPED" }
}
```

Message types in Phase 2: `hello`, `system_status`, `pong`, `error`.
Reserved for later phases: `sensor_reading`, `arduino_status`, `program_status`,
`cv_frame`, `face_detection`, `ml_prediction`.

---

## Frontend Setup (Phase 1+)

The frontend lives in `frontend/` and runs on **http://localhost:5173**.

```powershell
# One-time setup
cd frontend
npm install

# Start the dev server
npm run dev
```

### Production build

```powershell
cd frontend
npm run build      # type-checks (tsc -b) then bundles to dist/
npm run preview    # serve the production build locally
```

### Frontend configuration

Backend URLs are **never hardcoded**. Copy the template and edit if needed:

```powershell
Copy-Item frontend\.env.example frontend\.env.local
```

```dotenv
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_BASE_URL=ws://localhost:8000
```

Only `VITE_*` variables reach the browser bundle. Never put a secret here.

### Frontend structure

```text
frontend/src/
├── main.tsx                  # React root
├── App.tsx                   # routes (lazy-loaded pages)
├── config/env.ts             # centralized API/WS URLs
├── context/                  # single shared WebSocket + health state
├── hooks/useWebSocket.ts     # connect / reconnect / dispatch
├── services/api.ts           # REST client
├── types/                    # mirrors the backend contract
├── layouts/AppLayout.tsx     # shell + ambient background
├── components/
│   ├── layout/               # Sidebar, TopBar
│   ├── ui/                   # Card, StatCard, StatusPill, EmptyState…
│   └── cv/CameraViewport.tsx # face-box overlay + coordinate mapping
└── pages/                    # the six views + 404
```

### Design system

**Dark Violet AI + IoT Command Center** — defined in `tailwind.config.js` and
`src/index.css`.

| Token | Value |
| --- | --- |
| Deep background | `#070611` |
| Secondary | `#0D0B1A` |
| Card | `#121022` |
| Violet | `#8B5CF6` |
| Electric violet | `#A855F7` |
| Indigo | `#6366F1` |
| Soft purple | `#C084FC` |
| White | `#F8FAFC` |
| Muted | `#94A3B8` |

Green (`#22C55E`) is reserved **exclusively** for semantic status — `CONNECTED`,
`RUNNING`, `FACE DETECTED`. It is never used as a general theme colour.

Accessibility: `prefers-reduced-motion` is honoured, keyboard focus rings are
visible, and the layout is responsive from mobile to wide desktop.

---

## Configuration

All configuration is centralized in environment variables — backend URLs are
**never** hardcoded in the frontend.

```dotenv
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_BASE_URL=ws://localhost:8000
```

Copy [`.env.example`](.env.example) to `backend\.env` and `frontend\.env.local`.
Real `.env` files are git-ignored and must never be committed.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Arduino shows `DISCONNECTED` | Check USB cable (must be a **data** cable), then confirm the port in `backend\.env` or leave `SERIAL_PORT` empty for auto-detection. |
| Wrong port selected | Bluetooth pseudo-ports (e.g. `COM3`) may be picked up. Set `SERIAL_PORT` explicitly, or unplug unused Bluetooth devices. |
| Camera will not start | Close any other app using the camera (Teams/Zoom/Meet). Try a different `CAMERA_INDEX`. |
| Backend will not start | Activate the venv and `pip install -r backend\requirements.txt`. |
| Frontend cannot reach backend | Confirm `VITE_API_BASE_URL` and the backend CORS origins. |

---

## Repository

<https://github.com/sairampragney/Smart_Classroom_Monitoring_System>

---

## License

See [`LICENSE`](LICENSE).