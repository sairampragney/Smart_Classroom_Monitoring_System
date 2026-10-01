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
│   │   └── ws.py           # /ws endpoint
│   ├── models/
│   │   ├── common.py       # ConnectionState / CVState / MLState enums
│   │   ├── health.py       # health & status schemas
│   │   └── ws.py           # WebSocket message protocol
│   └── services/
│       ├── state.py        # thread-safe StateStore (single source of truth)
│       └── websocket_manager.py
└── tests/
```

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