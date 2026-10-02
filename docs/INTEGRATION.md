# Phase 11 — Integration Verification Matrix

Verified on the development machine (Dell Latitude 5490, Windows).

**Legend:** ✅ verified live against the running system ·
❌ failed · ⛔ NOT TESTED (cannot be tested here, stated honestly)

---

## 1. Hardware availability (the honest starting point)

| Component | How it was checked | Result |
| --- | --- | --- |
| Arduino board | `[System.IO.Ports.SerialPort]::GetPortNames()` | **0 ports** — no board connected |
| Arduino board | PnP scan for `COM\d+ / Arduino / CH340 / FTDI` | no match |
| Camera | OpenCV `VideoCapture(0..2)` | **index 0 opened**, 640x480 |

> COM5/COM6 appeared in earlier sessions as ghosted historical devices and are
> **not** usable. Bluetooth pseudo-ports are excluded by the same scan. A
> `port` that does not enumerate is not evidence of a working board.

## 2. Software / no-hardware-required paths

| # | Check | Method | Result |
| --- | --- | --- | --- |
| 1 | `start.ps1` did not exist | file check | ❌ **found & fixed** — created |
| 2 | Startup script runs end to end | `.\start.ps1 -NoBrowser` | ✅ after fix (see §5) |
| 3 | Backend boots | uvicorn log | ✅ `Application startup complete` |
| 4 | Frontend boots | Vite log | ✅ `ready in 889 ms` |
| 5 | Health endpoint | `GET /health` | ✅ `status: ok`, `mode: REAL_HARDWARE` |
| 6 | API docs | `GET /docs` | ✅ 200 |
| 7 | OpenAPI schema | `GET /openapi.json` | ✅ 20 paths |
| 8 | Arduino absent reported honestly | `GET /api/arduino/status` | ✅ `DISCONNECTED`, `readings_received: 0` |
| 9 | No fake sensor data | `GET /api/arduino/sensors` | ✅ all `null`, `has_data: false` |
| 10 | Port discovery empty | `GET /api/arduino/ports` | ✅ `ports: []` |
| 11 | WebSocket handshake + messages | real WS client | ✅ `hello`, `system_status`, `arduino_status`, `face_detection` |
| 12 | Broadcast only on change | 14 s capture | ✅ `face_detection` streamed, others emitted once |
| 13 | CV start | `POST /api/cv/start` | ✅ `RUNNING` → `CONNECTED` |
| 14 | Camera really opened | `GET /api/cv/status` | ✅ 640x480, `detector_ready: true` |
| 15 | Live FPS | `GET /api/cv/status` | ✅ 17.5 – 29.6 FPS observed |
| 16 | Detections endpoint | `GET /api/cv/detections` | ✅ real frame geometry |
| 17 | MJPEG stream | `GET /api/cv/stream` | ✅ `multipart/x-mixed-replace; boundary=frame`, valid JPEG SOI |
| 18 | CV stop releases camera | `POST /api/cv/stop` | ✅ `camera: DISCONNECTED` |
| 19 | CV restart | start again | ✅ back to `RUNNING`/`CONNECTED` |
| 20 | ML artifact loaded | `GET /api/ml/info` | ✅ DecisionTree, real metrics |
| 21 | ML metadata honest | same | ✅ 10,129 rows, 5 models, all metrics present |
| 22 | ML prediction (occupied) | `POST /api/ml/predict` | ✅ `OCCUPIED` |
| 23 | ML prediction (empty) | `POST /api/ml/predict` | ✅ `EMPTY` |
| 24 | History recorded live rows | `GET /api/history` | ✅ CV-derived rows, `total_rows` grows |
| 25 | DB count agrees with health | `GET /api/history/stats` | ✅ same row count as `/health` |
| 26 | Backend tests | pytest | ✅ 226 passed |
| 27 | Firmware contract tests | pytest | ✅ included above |
| 28 | Frontend cvMapping | node | ✅ 39 passed |
| 29 | Frontend historyFormat | node | ✅ 37 passed |
| 30 | Frontend systemStatus | node | ✅ 90 passed |
| 31 | Production build | `npm run build` | ✅ exit 0 |
| 32 | Phase marker | `GET /health` | ❌ was `"10"` → ✅ now `"11"` (+2 tests updated) |

## 3. Hardware paths — Arduino

| # | Check | Result |
| --- | --- | --- |
| 33 | Firmware compiles / uploads | ⛔ NOT TESTED — no board |
| 34 | Live temperature + humidity | ⛔ NOT TESTED — no board |
| 35 | Live light (LDR) | ⛔ NOT TESTED — no board |
| 36 | Live motion (PIR) | ⛔ NOT TESTED — no board |
| 37 | Board disconnect → UI shows offline | ⛔ NOT TESTED — no board to disconnect |
| 38 | Board reconnect → auto-recovery | ⛔ NOT TESTED — no board |
| 39 | Firmware/source review | ✅ contract matches backend (9600 baud, newline-delimited JSON, 4 fixed keys, `null` on failure, `err` field) |

> The *parser* and *contract* are covered by unit tests with recorded input, so
> the software side of this path is tested. Only the physical wire is untested.

## 4. Hardware paths — camera and vision

| # | Check | Result |
| --- | --- | --- |
| 40 | Camera opens at 640x480 | ✅ verified |
| 41 | Frames actually flow (FPS) | ✅ 17.5 – 29.6 FPS |
| 42 | Start / stop / restart lifecycle | ✅ verified |
| 43 | Camera released on stop | ✅ verified |
| 44 | MJPEG serves detector frames | ✅ verified |
| 45 | One face detected in frame | ⛔ NOT TESTED — no person in frame |
| 46 | Head count = 1 shown in UI | ⛔ NOT TESTED — no person in frame |
| 47 | Two faces → count = 2 | ⛔ NOT TESTED — no person in frame |
| 48 | Person leaves → count returns to 0 | ⛔ NOT TESTED — no person in frame |
| 49 | Movement tracked (box moves) | ⛔ NOT TESTED — no person in frame |
| 50 | Box alignment correct in browser | ⛔ NOT TESTED — needs manual eyes-on |
| 51 | Browser rendering of all 6 pages | ⛔ NOT TESTED — no browser automation |

`face_count: 0` above is a **true reading of an empty room**, not a stub. The
detector genuinely reported zero faces across 17,000+ processed frames.

## 5. Defects found and fixed in Phase 11

1. **`start.ps1` did not exist at all.** Phase 12's objective is precisely this
   script; it was never written. Created with preflight checks, a real readiness
   gate, port-conflict detection, and honest state reporting.

2. **Readiness gate falsely reported failure.** The first version polled
   `http://localhost:8000`. On this machine Vite binds `::1` and uvicorn binds
   `127.0.0.1`, so `localhost` probes timed out and a *healthy* backend was
   reported as failed. Fixed by probing loopback explicitly with an IPv4→IPv6
   fallback. Verified: the script now reports `backend healthy (phase 11, ...)`.

3. **Stale phase marker.** `/health` still reported `phase: "10"`, so the System
   page would show a stale value after Phase 11. Updated to `"11"` along with
   both tests that pinned it.

4. **README status table had a duplicated block** listing phases 3–10 as both
   ✅ Complete and ⏳ Pending. Removed the stale rows.

## 6. What a human must still do

- Plug in the Arduino, close the Arduino IDE Serial Monitor, and run the
  upload + live-data + disconnect + reconnect checklist
- Sit in front of the camera and confirm: 1 face detected, head count = 1,
  add a second person for count = 2, leave for count = 0, and that the drawn
  box sits correctly on the face
- Open all six pages in a real browser and confirm rendering

## 7. Honest limitations that still apply

- The ML accuracy figure (~99.85%) is measured on the UCI Room Occupancy
  dataset. It is **not** classroom accuracy.
- The dataset's light range is ~0–280; the Arduino LDR reports 0–1023. The
  values are **not** normalized or claimed to be equivalent.
- DecisionTree and RandomForest were effectively tied on this data.
- The Arduino was never connected, so no claim is made that a live board is
  detected correctly — only that absence is reported honestly.

