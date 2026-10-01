# System Architecture

## Design Goals

1. **Local-first.** The entire system runs on one laptop. No cloud dependency.
2. **Real hardware by default.** No simulated sensor values, faces, head counts,
   or ML predictions in the default mode.
3. **Explicit contracts.** Frontend and backend communicate through a documented,
   versioned WebSocket message protocol and typed REST endpoints.
4. **Conceptual separation of ML and CV.** They measure different things and are
   never forced to produce the same value.

---

## Component Diagram

```text
┌─────────────────────────────────────────────────────────────┐
│                    Dell Latitude 5490                       │
│                                                             │
│  ┌───────────────┐                                          │
│  │ Arduino Uno   │  DHT22 · LDR · HC-SR501 PIR              │
│  └───────┬───────┘                                          │
│          │ USB serial (JSON lines)                          │
│          ▼                                                  │
│  ┌──────────────────────────┐     ┌──────────────────────┐  │
│  │  SerialManager (thread)  │     │  Camera              │  │
│  │  discovery·parse·recon   │     └──────────┬───────────┘  │
│  └───────────┬──────────────┘                │              │
│              │                    ┌──────────▼───────────┐  │
│              │                    │  CVService (thread)  │  │
│              │                    │  OpenCV face detect  │  │
│              │                    └──────────┬───────────┘  │
│              │                               │              │
│              └───────────┬───────────────────┘              │
│                          ▼                                  │
│              ┌───────────────────────────┐                  │
│              │   FastAPI Backend         │                  │
│              │  ┌─────────────────────┐  │                  │
│              │  │ MLService (sklearn) │  │                  │
│              │  └─────────────────────┘  │                  │
│              │  ┌─────────────────────┐  │                  │
│              │  │ WebSocketManager    │  │                  │
│              │  └─────────────────────┘  │                  │
│              └────────────┬──────────────┘                  │
│                           │ HTTP + WS                        │
│                           ▼                                  │
│              ┌───────────────────────────┐                  │
│              │   React Frontend :5173    │                  │
│              └───────────────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Threading Model

The backend is an **asynchronous** FastAPI application. CPU-bound and
blocking work is deliberately kept **off the event loop**:

| Work | Execution | Reason |
| --- | --- | --- |
| Serial read loop | Dedicated worker thread | `pyserial` reads block |
| Camera capture + detection | Dedicated worker thread | OpenCV calls are blocking/CPU-heavy |
| ML inference | Cached, executed in worker thread | `sklearn.predict` is CPU-bound |
| WebSocket broadcast | Async, on the event loop | Non-blocking I/O |

A shared, lock-protected **state store** is the single source of truth. Worker
threads publish into it; the WebSocket layer reads from it. This avoids races
without requiring the threads to know about asyncio.

---

## Data Flow

### Sensor path

```text
Sensor → Arduino ADC/DHT → JSON line → USB → SerialManager
       → validated SensorReading → StateStore → WebSocket broadcast → UI
```

### CV path

```text
Camera → frame → grayscale → cascade detector → face boxes
       → tracker (optional smoothing) → head count + FPS
       → StateStore → WebSocket broadcast → UI overlay
```

### ML path

```text
Latest SensorReading → feature vector → StandardScaler
       → trained classifier → OCCUPIED / EMPTY + probability
       → StateStore → WebSocket broadcast → UI
```

---

## CV Coordinate Mapping (critical)

The backend emits face boxes in **source capture resolution** (e.g. `640×480`).
The frontend may render the frame at a completely different size, and CSS
`object-fit: cover` introduces **cropping**.

The frontend therefore maps source coordinates → displayed pixel coordinates
using the *contain*-fit geometry, and clips boxes to the visible viewport. See
`frontend/src/utils/coordinateMapping.ts`. Getting this wrong is the single most
common reason boxes appear misaligned over faces.

---

## State Model

```text
ArduinoState:  DISCONNECTED | CONNECTING | CONNECTED | ERROR
CameraState:    DISCONNECTED | CONNECTING | CONNECTED | ERROR
CVState:        STOPPED | RUNNING | ERROR
MLState:        NOT_LOADED | LOADED | ERROR
```

These are **derived from real runtime activity**, never simulated.

---

## Configuration

All tunables live in environment variables (see [`.env.example`](../.env.example)).
The frontend reads only `VITE_*` variables; the backend reads the rest.