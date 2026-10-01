# Development Phase Plan

The project is built incrementally. Each phase must be **implemented, verified,
documented, committed, and pushed** before the next phase begins.

A phase is only complete when it passes its **phase gate**:

- [ ] Implementation complete
- [ ] Relevant tests performed
- [ ] Discovered errors fixed where possible
- [ ] Documentation updated
- [ ] Git commit created
- [ ] Changes pushed to GitHub
- [ ] Phase report delivered in the required format

---

## Phase 0 — Project Initialization ✅

**Objective:** create the repository, local project tree, `.gitignore`,
README skeleton, and phase plan.

- [x] GitHub repository created
- [x] Local project initialised
- [x] Folder structure established
- [x] `.gitignore` written (no secrets, no `node_modules`, no venv)
- [x] `.env.example` configuration template
- [x] README skeleton
- [x] Phase plan
- [x] First commit + push

---

## Phase 1 — Frontend Foundation ✅

**Objective:** React + Vite + TypeScript app with routing, navigation, the
**Dark Violet AI + IoT Command Center** design system, responsive layout, and
page skeletons for all six pages.

Deliverables: `Dashboard`, `Live Monitoring`, `Computer Vision`, `ML Analysis`,
`History`, `System`.

Verified: `npm run build` succeeds (55 modules, code-split per page); Vite dev
server serves all six routes; all modules transform without error; backend
regression (24/24 tests, 4 endpoints, WebSocket, CORS) still green.

---

## Phase 2 — Backend Foundation ✅

**Objective:** FastAPI application, centralized config, logging, `/health`
endpoint, CORS, and the WebSocket foundation.

Deliverables: `backend/main.py`, `config.py`, logging, health endpoint,
`websocket_manager.py`.

Verified: 24/24 pytest passing; `/health`, `/api/status`, `/docs`,
`/openapi.json` all return 200; `/ws` handshake, ping/pong and error handling
confirmed over a real WebSocket connection.

---

## Phase 3 — Arduino Firmware

**Objective:** Arduino Uno firmware reading DHT22, LDR, and HC-SR501 PIR and
emitting structured JSON over USB serial.

Deliverables: `arduino/smart_classroom/smart_classroom.ino`, wiring docs,
required library list, upload procedure.

---

## Phase 3 — Arduino Firmware ✅

**Objective:** firmware reading DHT22, LDR and HC-SR501 PIR and emitting
structured newline-delimited JSON over USB serial.

Deliverables: `arduino/smart_classroom/smart_classroom.ino`, wiring/protocol
documentation, contract tests.

Verified: compiles for `arduino:avr:uno` (7406 bytes / 22% flash, 267 bytes /
13% RAM, zero warnings with `--warnings all`); 25 protocol contract tests pass.

> **Hardware testing NOT performed** — no Arduino or sensors were connected.

---

## Phase 4 — Arduino ↔ Backend Connection

**Objective:** `pyserial` port discovery, connection, JSON parsing, validation,
malformed-packet rejection, disconnect detection, and automatic reconnection.

Deliverables: `backend/app/services/serial_manager.py` + tests.

---

## Phase 4 — Arduino ↔ Backend Connection ✅

**Objective:** pyserial port discovery, JSON line parsing with validation,
connection state, disconnect detection and automatic reconnection, integrated
into the Phase 2 backend.

Deliverables: `serial_manager.py`, `port_discovery.py`, `models/sensors.py`,
`api/arduino.py`, monitoring lifecycle endpoints.

Verified: 128 automated tests (parser, manager lifecycle, discovery) pass;
live backend serves all endpoints; monitoring lifecycle exercised against a real
server with no Arduino present; frontend build unchanged and green.

> **Hardware testing NOT performed** — no Arduino was connected. Live serial
> behaviour is verified against a fake device only.

---

## Phase 5 — Frontend ↔ Backend Real-Time Connection

**Objective:** end-to-end WebSocket link, sensor cards, connection indicators,
**RUN PROGRAM** control, and reconnect behaviour.

Deliverables: `useWebSocket` hook, API service, Live Monitoring wiring.

---

## Phase 5 — Frontend ↔ Backend Real-Time Connection ✅

**Objective:** bind the existing frontend to the real backend — WebSocket
streaming, Arduino status, RUN PROGRAM, live sensor values and live charts.

Deliverables: state broadcaster, sensor/Arduino types, single-socket context,
live monitoring page, charts, dashboard/system integration.

Verified: 135 automated tests pass; production build succeeds; all six routes
and all modules transform; live WebSocket confirmed pushing `arduino_status` on
real RUN PROGRAM state changes; client accounting exact with no leaks.

> **Hardware testing NOT performed** — no Arduino connected, so no real sensor
> values have ever flowed through this path.

---

## Phase 6 — Computer Vision Engine

**Objective:** real camera capture, face detection, multi-face support,
bounding boxes, confidence, live head count, and clean resource teardown.

Deliverables: `backend/app/services/cv_service.py` + tests.

---

## Phase 6 — Computer Vision Engine ✅

**Objective:** real camera capture, face detection, bounding boxes, head count
and measured FPS, integrated into the existing FastAPI backend.

Deliverables: `models/cv.py`, `services/camera.py`, `services/face_detector.py`,
`services/cv_service.py`, `api/cv.py`, `face_detection` WS message,
`scripts/fetch_cv_models.ps1`, `docs/COMPUTER_VISION.md`.

Detector: **YuNet** (Haar cascades are unavailable — `cv2.CascadeClassifier`
was removed in OpenCV 5.0).

Verified: 161 automated tests pass; production build unaffected; **real
`Integrated Webcam` used** — 582 frames, measured 30.88 FPS, 102 `face_detection`
messages, camera released on stop.

> **Real face detection on live camera NOT verified** — nobody was in front of
> the camera, so head-count changes were only tested with synthetic frames.

---

## Phase 7 — Computer Vision Frontend

**Objective:** live camera view with green `FACE DETECTED` boxes, accurate
**CV coordinate mapping** (source resolution → displayed size, aspect ratio,
`object-fit`), head count, FPS, and status sidebar.

Deliverables: CV page, coordinate-mapping utility.

---

## Phase 7 — Computer Vision Frontend ✅

**Objective:** integrate the Phase 6 engine into the React Computer Vision
page — live feed, green `FACE DETECTED` boxes, head count, real status/FPS/model.

Deliverables: `/api/cv/stream` (MJPEG), `utils/cvMapping.ts`, CV types, CV state
in the shared context, upgraded `CameraViewport`, real Computer Vision page,
`frontend/tests/cvMapping.test.ts`.

Verified: 161 backend tests pass; 39/39 frontend coordinate-mapping tests pass;
`npm run build` passes; live end-to-end on the real webcam — 81
`face_detection` messages, MJPEG 136 KB/s, camera released on stop.

> **Real human-in-frame test NOT performed** — no person was available in front
> of the camera. Face-detection behaviour is verified with scripted detector
> output, not a real face.

---

## Phase 8 — Machine Learning

**Objective:** dataset loading, preprocessing, training and comparison of
lightweight classifiers, genuine evaluation metrics, and a prediction service.

Models: Logistic Regression, Decision Tree, KNN, SVM, Random Forest.

**No metrics may be fabricated** — all numbers come from real evaluation.

---

## Phase 9 — History / Data

**Objective:** persist timestamped records (sensors, ML prediction, head count)
and surface them in the History page.

Deliverables: SQLite storage layer + History page integration.

---

## Phase 10 — System Monitoring

**Objective:** real health states for frontend, backend, WebSocket, Arduino,
serial, camera, CV, and ML — all reflecting actual runtime state.

Deliverables: health aggregation endpoint + System page.

---

## Phase 11 — Integration

**Objective:** run and verify the complete architecture
(Arduino → serial → FastAPI → WebSocket → React, and Camera → OpenCV → WebSocket → React).

---

## Phase 12 — Local Demo Automation

**Objective:** a reliable `.\start.ps1` for the college demo, with visible
errors and documented manual fallbacks.

---

## Phase 13 — Final Testing & Quality

**Objective:** complete verification across hardware, backend, CV, ML,
frontend, and integration. Final documentation.

**Rule:** physical hardware results must never be claimed unless actually tested.