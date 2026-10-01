# System Monitoring (Phase 10)

The System page is a **real health dashboard**. Every status is derived from
live runtime state; nothing is hardcoded, assumed, or replayed from a previous
successful check.

> The guiding rule: *a healthy-looking UI with false green lights is worse than
> an honest error state.*

---

## 1. Why the page was rewritten

Before Phase 10 the System page printed this for three components:

```
Camera            NOT INITIALIZED   "Implemented in Phase 6"
Computer Vision   NOT INITIALIZED   "Implemented in Phase 6"
ML Model          NOT INITIALIZED   "Implemented in Phase 8"
```

That text was frozen at build time. The phases *were* implemented, so the page
was simultaneously wrong and permanently stale. Phase 10 replaced all of it with
values read from the running system.

---

## 2. State architecture

There is exactly **one** source of truth, the process-wide `StateStore`
(`app/services/state.py`). Phase 10 did not create a parallel status system; it
reads the store that Phases 4–9 already populated.

| Component | Origin | Transport to the UI |
| --- | --- | --- |
| Frontend | the browser itself | immediate |
| Backend / FastAPI | live `GET /health` | polled every 2 s |
| WebSocket | `useWebSocket` lifecycle | immediate |
| Arduino | `StateStore.arduino` | WebSocket `arduino_status` |
| Serial | `StateStore.serial` | WebSocket `arduino_status` |
| Camera | `StateStore.camera` + CV lifecycle | `/health` |
| Computer Vision | `StateStore.cv` + `CVService.fps` | `/health` |
| ML Model | `StateStore.ml` + `MLService.model_name` | `/health` |
| Database | real query on the SQLite file | `/health` |

**Real-time behaviour.** Arduino and Serial update **instantly** from the
WebSocket, so unplugging a board flips the card without a refresh. Camera, CV,
ML and Database come from the health snapshot, which the page re-reads every
2 s. The page never opens a second WebSocket — it reuses the single shared
connection owned by `SystemStatusContext`.

---

## 3. States

Different components have different lifecycles, so they are **not** forced into a
binary healthy/unhealthy model.

| Component | Possible states |
| --- | --- |
| Frontend | `RUNNING` |
| Backend | `RUNNING`, `CONNECTING`, `DISCONNECTED` |
| FastAPI | `RUNNING`, `STARTING`, `DISCONNECTED` |
| WebSocket | `CONNECTING`, `CONNECTED`, `RECONNECTING`, `DISCONNECTED`, `ERROR` |
| Arduino | `CONNECTED`, `CONNECTING`, `DISCONNECTED`, `RECONNECTING`, `ERROR` |
| Serial | same as Arduino |
| Camera | `NOT_INITIALIZED`, `STARTING`, `RUNNING`, `STOPPED`, `ERROR` |
| Computer Vision | `STOPPED`, `RUNNING`, `ERROR` |
| ML Model | `NOT_LOADED`, `LOADED`, `ERROR` |
| Database | `READY`, `ERROR`, `NOT_INITIALIZED` |
| *(any backend component, backend down)* | `NOT_AVAILABLE` |

The enums already defined in `app/models/common.py` are reused verbatim. Where
no enum exists (Camera, Database) the state is **derived** from real signals
rather than invented:

- `Camera` = `NOT_INITIALIZED` when no frame was ever processed,
  `STOPPED` when it ran and was stopped, `RUNNING` when capturing.
- `WebSocket` maps the browser's four socket states onto the documented
  vocabulary. A closed socket is `RECONNECTING`, because `useWebSocket` always
  schedules a backoff retry.

---

## 4. The three rules that keep it honest

**1. Never replay a stale state.** If `/health` fails, every backend-derived
component becomes `NOT_AVAILABLE`. A card still reading `Arduino CONNECTED`
after the backend died would be a lie.


## 5. Connection vs. service status

These are deliberately independent. A valid, healthy state is:

```
Backend      RUNNING
WebSocket    CONNECTED
Arduino      DISCONNECTED
Camera       NOT_INITIALIZED
CV           STOPPED
ML           LOADED
Database     READY
```

The database is fine, the model is loaded, and nothing is broken — the board is
simply not plugged in. The overall verdict for that state is `OPERATIONAL`.

| Verdict | Meaning |
| --- | --- |
| `OPERATIONAL` | nothing is in an error state |
| `DEGRADED` | at least one component is in `ERROR` |
| `OFFLINE` | the backend itself is unreachable |

---

## 6. Colour semantics

Green is reserved for genuinely active states. There is no rainbow.

| Tone | States | Meaning |
| --- | --- | --- |
| green | `RUNNING`, `CONNECTED`, `LOADED`, `READY` | active and working |
| amber | `CONNECTING`, `RECONNECTING`, `STARTING` | in progress, not broken |
| red | `ERROR` | genuinely faulty |
| neutral | `DISCONNECTED`, `STOPPED`, `NOT_LOADED`, `NOT_INITIALIZED`, `NOT_AVAILABLE` | idle or unknown — not alarming |

A neutral `DISCONNECTED` matters: an unplugged Arduino on a demo bench is a
normal, correct state, and painting it red would be misleading.

---

## 7. API

No new endpoint was created. `/health` was **extended**, because scattering
health checks across many endpoints is exactly what the spec forbids.

`GET /health` (and its alias `GET /api/status`) now include:

```jsonc
{
  "phase": "10",
  "services": {
    "arduino": "DISCONNECTED", "serial": "DISCONNECTED",
    "camera": "DISCONNECTED", "cv": "STOPPED", "ml": "LOADED",
    "serial_port": null,
    "cv_detector": "YuNet",     // detector actually in use
    "cv_fps": null,             // null until real frames are processed
    "head_count": null,         // null until CV has run
    "ml_model": "DecisionTree", // model actually in memory
    "ml_error": null,
    "database": { "status": "READY", "rows": 0,
                  "last_record_ts": null, "error": null }
  }
}
```

The database probe is wrapped in `try/except`: if SQLite is broken, `/health`
still returns `200` and simply reports `status: "ERROR"` with the message. One
failed subsystem must never take down the health endpoint.

> A side effect worth noting: the `phase` field was hardcoded to `"2"` from
> Phase 2 through Phase 9, so the System page displayed a stale phase for
> several phases. It now reports `"10"`.

---

## 8. Testing

The status logic lives in `src/utils/systemStatus.ts` as **pure functions** —
no React, no fetch, no DOM — following the `utils/cvMapping.ts` convention. That
is what makes the whole status matrix assertable without a browser.

```powershell
node frontend/tests/systemStatus.test.ts     # 90 checks
```

Covered combinations: everything healthy · Arduino disconnected · camera
unavailable · ML unavailable · ML error · WebSocket reconnecting · CV stopped ·
CV running without a measured FPS · database ready (empty) · database error ·
database not initialised · backend unreachable · first poll in flight · live
WebSocket override.

Backend aggregation:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend/tests/test_system_health.py -q
```

14 tests covering honest idle state, real CV values, stale-FPS suppression,
loaded-model reporting, ML errors, all three database outcomes, and the
"database failure must not break /health" guarantee.

---

## 9. Troubleshooting

| Symptom | Likely cause | Where to look |
| --- | --- | --- |
| everything `NOT_AVAILABLE` | backend unreachable | is the server running? `GET /health` |
| Arduino stuck `DISCONNECTED` | no board, or wrong port | `SERIAL_PORT` env var; `/api/arduino/status` |
| Arduino `CONNECTED` but no data | monitoring not started | press RUN PROGRAM |
| WebSocket `RECONNECTING` | backend restarted, or crashed | backend console |
| Camera `NOT_INITIALIZED` | CV never started | start detection on the CV page |
| Camera `ERROR` | camera busy or absent | another app may hold the device |
| CV `STOPPED` with `cv_fps: null` | never started, or no frames yet | expected when idle |
| ML `NOT_LOADED` | model not trained | run the Phase 8 training script |
| Database `ERROR` | file locked or corrupt | `.\backend\data\history.db` permissions |

---

## 10. Known limitations

1. **No browser-rendering verification.** The status logic is unit-tested and
   the build passes, but no DOM-level check of the rendered page was performed
   (no browser automation available).
2. **No physical hardware verification.** All hardware states were observed
   while no Arduino and no camera were connected — which usefully confirms the
   UI reports `DISCONNECTED`/`NOT_INITIALIZED` honestly, but does not prove a
   connected board reports `CONNECTED`.
3. **Health is polled, not pushed, for CV/ML/Database.** A 2 s interval is
   chosen for simplicity; the database probe runs a real query each time.
4. **The overall verdict is intentionally coarse.** A single `ERROR` anywhere
   yields `DEGRADED` without ranking which component matters most.
5. **No historical health data.** The page shows current state only; uptime
   figures come from the health payload, not a persisted record.

**2. Never fabricate a measurement.** `cv_fps` and `head_count` are `null` until
real frames have been processed, and are rendered `--`. A stale FPS from before
detection stopped is not shown either.

**3. Never hardcode an identity.** The ML detail is `MLService.model_name` — the
model actually in memory — not the configured artifact path. The serial port is
only ever a port the backend actually opened.

---
