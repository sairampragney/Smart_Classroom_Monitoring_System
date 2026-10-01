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

## Phase 1 — Frontend Foundation

**Objective:** React + Vite + TypeScript app with routing, navigation, the
**Dark Violet AI + IoT Command Center** design system, responsive layout, and
page skeletons for all six pages.

Deliverables: `Dashboard`, `Live Monitoring`, `Computer Vision`, `ML Analysis`,
`History`, `System`.

---

## Phase 2 — Backend Foundation

**Objective:** FastAPI application, centralized config, logging, `/health`
endpoint, CORS, and the WebSocket foundation.

Deliverables: `backend/main.py`, `config.py`, logging, health endpoint,
`websocket_manager.py`.

---

## Phase 3 — Arduino Firmware

**Objective:** Arduino Uno firmware reading DHT22, LDR, and HC-SR501 PIR and
emitting structured JSON over USB serial.

Deliverables: `arduino/smart_classroom/smart_classroom.ino`, wiring docs,
required library list, upload procedure.

---

## Phase 4 — Arduino ↔ Backend Connection

**Objective:** `pyserial` port discovery, connection, JSON parsing, validation,
malformed-packet rejection, disconnect detection, and automatic reconnection.

Deliverables: `backend/app/services/serial_manager.py` + tests.

---

## Phase 5 — Frontend ↔ Backend Real-Time Connection

**Objective:** end-to-end WebSocket link, sensor cards, connection indicators,
**RUN PROGRAM** control, and reconnect behaviour.

Deliverables: `useWebSocket` hook, API service, Live Monitoring wiring.

---

## Phase 6 — Computer Vision Engine

**Objective:** real camera capture, face detection, multi-face support,
bounding boxes, confidence, live head count, and clean resource teardown.

Deliverables: `backend/app/services/cv_service.py` + tests.

---

## Phase 7 — Computer Vision Frontend

**Objective:** live camera view with green `FACE DETECTED` boxes, accurate
**CV coordinate mapping** (source resolution → displayed size, aspect ratio,
`object-fit`), head count, FPS, and status sidebar.

Deliverables: CV page, coordinate-mapping utility.

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