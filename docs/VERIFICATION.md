# Final Verification & Limitations

**Project:** Smart Classroom Monitoring System
**Academic title:** *Low-Cost Smart Classroom Occupancy Detection Using Arduino
Uno and Machine Learning: A Comparative Study of Lightweight Machine Learning
Algorithms*
**Repository:** <https://github.com/sairampragney/Smart_Classroom_Monitoring_System>

This document is the authoritative final verification record. It supersedes the
per-phase matrices, which remain in [`INTEGRATION.md`](INTEGRATION.md) for
history.

**Verdict: Software-complete, hardware verification pending.**

Every software path is implemented, tested and verified against the running
system. The Arduino was never physically connected and no person has yet been
in front of the webcam, so all *physical* hardware tests remain **NOT TESTED**
and are listed explicitly in §4.

---

## 1. Final verification matrix

| Feature | Verification method | Result |
| --- | --- | --- |
| Frontend | Live (Vite dev server, 6 routes) | **PASS** — build + serve, manual page review pending |
| Backend | Live (all endpoints) | **PASS** — 15/15 endpoints 200, 20 OpenAPI paths |
| WebSocket | Live client | **PASS** — connect, disconnect, reconnect, 2 clients, change-only |
| Arduino firmware | Source review + contract tests | **PASS (code)** — ⛔ compile/upload NOT TESTED |
| Arduino sensors | Physical | ⛔ **NOT TESTED** — no board connected |
| Arduino disconnect | Physical | ⛔ **NOT TESTED** — no board to unplug |
| Arduino reconnect | Physical | ⛔ **NOT TESTED** — no board to reconnect |
| Serial parser / lifecycle | Automated | **PASS** — 226 backend/Arduino tests |
| Camera | Physical (device present) | **PASS** — index 0, 640x480, measured 17.5–30.8 FPS |
| Real face detection | Physical (person required) | ⛔ **NOT TESTED** — nobody in frame |
| New face count 1→2 | Physical (person required) | ⛔ **NOT TESTED** — nobody in frame |
| Face movement tracking | Physical (person required) | ⛔ **NOT TESTED** — nobody in frame |
| Face leaving 2→1 | Physical (person required) | ⛔ **NOT TESTED** — nobody in frame |
| Zero-face state | Live (empty room) | **PASS** — `face_count: 0`, camera stays healthy |
| Box alignment | Visual (browser) | ⛔ **NOT TESTED** — manual eyes-on required |
| CV coordinate mapping | Automated | **PASS** — 39 frontend checks incl. clamp/edges/4:3 |
| ML training | Real dataset | **PASS** — 10,129 rows, 5 models, real metrics |
| ML prediction | Live API | **PASS** — real artifact, both classes |
| Detector capability | Real images | **PASS** — YuNet found faces in 82/127 real images |
| History | End-to-end | **PASS** — rows written from live CV, heartbeat verified |
| System monitoring | Live | **PASS** — states match reality in every scenario |
| Startup script | Live | **PASS** — normal, conflict, failure, camera-absent, `-Stop` |
| Production build | Build | **PASS** — exit 0, 0 TS errors, 0 warnings |
| Real-hardware-mode audit | Static | **PASS** — no mocks, no `Math.random`, no console.log |
| Security audit | Static | **PASS** — no secrets, no machine paths, no junk tracked |

## 2. Test totals

| Suite | Tests | Passed | Failed | Duration |
| --- | --- | --- | --- | --- |
| Backend + Arduino (`pytest`) | 226 | 226 | 0 | 69.8 s |
| Frontend — CV mapping | 39 | 39 | 0 | 0.18 s |
| Frontend — History format | 37 | 37 | 0 | 0.17 s |
| Frontend — System status | 90 | 90 | 0 | 0.16 s |
| **Total** | **392** | **392** | **0** | ~70 s |

`npm run build` exits 0 with 0 TypeScript errors and 0 warnings.

## 3. What the "NOT TESTED" rows mean

**Detector capability was independently confirmed.** Feeding 127 real images
from the system into the deployed YuNet model produced face detections in 82 of
them. This proves the detector is genuinely wired up and working, *not* a stub
returning zeros. It does **not** replace the live test: the camera test needs a
real person moving in and out of frame, and nobody was available.

`face_count: 0` reported throughout the CV runs is a **true reading of an empty
room** across thousands of processed frames, not a fabricated value.

## 4. Remaining physical verification checklist

These require physical access and a person. Nothing else can substitute.

- [ ] Plug in the Arduino Uno (data USB cable, IDE Serial Monitor **closed**)
- [ ] Compile and upload the firmware
- [ ] Confirm live temperature, humidity, light and motion values
- [ ] Unplug mid-monitoring → confirm `DISCONNECTED` with no crash, no fake zeros
- [ ] Replug → confirm `CONNECTED` and data resumes
- [ ] Sit in front of the webcam → `HEAD COUNT = 1` with a box on the face
- [ ] Move left/right/near/far → box follows
- [ ] Add a second person → `1 → 2` with no refresh
- [ ] Remove one person → `2 → 1`, stale box disappears
- [ ] Everyone leaves → `0`, camera still healthy
- [ ] Check box alignment at frame edges and after resizing the browser
- [ ] Review all six pages in a real browser

## 5. Final known limitations

These are real and are not hidden.

1. **Model evaluation metrics are dataset-specific and do not represent
   validated real-world classroom performance.** The ~99.85% accuracy was
   measured on the UCI Room Occupancy Estimation dataset, not in a classroom.
2. **Light-scale mismatch between training and deployment.**
   Training light range ≈ **0–280**; the Arduino LDR reports **0–1023** (10-bit
   ADC). The values are not normalized and are not claimed to be equivalent.
   This alone can materially affect real predictions.
3. **Temperature range also differs.** Dataset ≈ 24.4–29.0 °C; the DHT22 can
   report anywhere in −40…+80 °C. Predictions outside the training range are
   extrapolation, not interpolation.
4. **Face detection is bounded by the model.** YuNet degrades under heavy
   occlusion, strong backlighting, very low light, and partial faces turned far
   from the camera. Head count counts *detected* faces, not people.
5. **No identity recognition.** The system counts faces; it deliberately does
   not identify, recognise or track individuals across sessions.
6. **Single-machine local architecture.** Everything runs on one laptop. There
   is no cloud backend, no multi-user support and no remote access.
7. **Browser automation was unavailable during development.** Visual/DOM checks
   need a human at the keyboard. Logic behind those views is covered by 166
   automated frontend checks, but rendering itself was not machine-verified.
8. **History is change-triggered with a 60 s heartbeat**, not a fixed-interval
   log. Quiescent periods are represented by heartbeat rows by design, so row
   spacing is not uniform.
9. **Development disk space was constrained** (C: ≈ 0.25 GB free), which is why
   the startup script verifies dependencies and never installs them.
10. **ML model comparison was effectively a tie** between DecisionTree and
    RandomForest on this dataset; no meaningful winner was claimed.
