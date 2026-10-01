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
| 1 | Frontend Foundation | ⏳ Pending |
| 2 | Backend Foundation | ⏳ Pending |
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