"""CVService - the Phase 6 computer vision engine.

Architecture
------------
OpenCV capture and YuNet inference are blocking and CPU-bound, so the pipeline
lives in **one** dedicated background thread. The FastAPI event loop never
touches the camera.

    FastAPI route -> start()/stop()      (thread-safe)
    REST/WS<- StateStore          (snapshot reads)
    CV worker     -> writes into StateStore

Design decisions
----------------
* **No frame queue.** Frames are captured and processed synchronously. A queue
  would let latency grow without bound if detection fell behind capture;
  processing the newest frame always answers "what is visible *now*", which is
  exactly what a head count must mean.
* **One worker, ever.** ``_ensure_worker`` is a no-op while a thread is alive,
  so repeated ``start()`` cannot leak workers or double-open the camera.
* **Head count is per-frame.** Each result is rebuilt from scratch, so faces
  that leave disappear immediately. Nothing is accumulated.
* **Measured FPS.** Computed from a rolling window of real frame times.
* **Clean teardown.** ``stop()`` signals, joins, then releases the camera.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Any

from app.config import get_settings
from app.logging_config import get_logger
from app.models.common import ConnectionState, CVState
from app.models.cv import DetectionResult
from app.services.camera import CameraError, CameraManager
from app.services.face_detector import (
    DETECTOR_NAME,
    DetectorError,
    YuNetDetector,
    build_result,
    scale_boxes,
)
from app.services.state import state_store

logger = get_logger(__name__)

# Rolling window used to compute a stable measured FPS.
FPS_WINDOW = 30
# Backoff if the camera disappears mid-run.
RETRY_INITIAL_S = 1.0
RETRY_MAX_S = 10.0


class CVService:
    """Owns the camera, the detector and the detection worker thread."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._wake_event = threading.Event()
        self._lock = threading.RLock()

        self._running = False
        self._camera: CameraManager | None = None
        self._detector: YuNetDetector | None = None
        self._error: str | None = None
        self._frames_processed = 0
        self._last_result: DetectionResult | None = None
        self._last_frame = None  # newest raw frame (Phase 7 JPEG source)
        self._frame_times: deque[float] = deque(maxlen=FPS_WINDOW)
        self._fps: float | None = None

        # Test seams.
        self._camera_factory: Any = None
        self._detector_factory: Any = None

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    @property
    def error(self) -> str | None:
        return self._error

    @property
    def frames_processed(self) -> int:
        return self._frames_processed

    @property
    def fps(self) -> float | None:
        return self._fps

    @property
    def last_result(self) -> DetectionResult | None:
        return self._last_result

    @property
    def last_frame(self):
        return self._last_frame

    @property
    def detector_name(self) -> str:
        return DETECTOR_NAME

    def _make_camera(self) -> CameraManager:
        if self._camera_factory is not None:
            return self._camera_factory()
        return CameraManager(
            index=self._settings.camera_index,
            width=self._settings.cv_frame_width,
            height=self._settings.cv_frame_height,
        )

    def _make_detector(self) -> YuNetDetector:
        if self._detector_factory is not None:
            return self._detector_factory()
        return YuNetDetector(confidence=self._settings.cv_min_confidence)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def start(self) -> CVState:
        """Start detection. Safe to call repeatedly."""
        with self._lock:
            if self._running:
                return CVState.RUNNING
            self._running = True
            self._stop_event.clear()
            self._error = None
            self._frame_times.clear()
            self._fps = None
            state_store.set_cv_state(CVState.RUNNING)
            state_store.update_connection(camera=ConnectionState.CONNECTING)

        self._ensure_worker()
        return CVState.RUNNING

    def stop(self, timeout: float = 5.0) -> CVState:
        """Stop detection and release the camera."""
        with self._lock:
            if not self._running:
                self._release()
                state_store.set_cv_state(CVState.STOPPED)
                return CVState.STOPPED
            self._running = False
            # The worker loop exits on _stop_event, so it MUST be set here or
            # the thread would spin in its idle branch forever (a real leak).
            # start() clears it again so the service can be restarted.
            self._stop_event.set()

        self._wake_event.set()
        thread = self._thread
        self._thread = None
        if thread is not None and thread.is_alive():
            thread.join(timeout=timeout)

        self._release()
        state_store.set_cv_state(CVState.STOPPED)
        state_store.update_connection(camera=ConnectionState.DISCONNECTED)
        logger.info("CV service stopped")
        return CVState.STOPPED

    def _release(self) -> None:
        """Drop camera + detector references. Never raises."""
        if self._camera is not None:
            self._camera.close()
            self._camera = None
        if self._detector is not None:
            self._detector.close()
            self._detector = None

    def _ensure_worker(self) -> None:
        """Start the worker only if one is not already alive."""
        if self.is_running:
            return
        if self._stop_event.is_set():
            self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._worker_loop, name="cv-worker", daemon=True
        )
        self._thread.start()
        logger.info("CV worker thread started")

    # ------------------------------------------------------------------
    # Worker
    # ------------------------------------------------------------------
    def _worker_loop(self) -> None:
        backoff = RETRY_INITIAL_S

        while not self._stop_event.is_set():
            if not self._running:
                self._wake_event.wait(timeout=0.2)
                self._wake_event.clear()
                continue

            try:
                if self._camera is None or not self._camera.is_open:
                    if not self._initialise():
                        if self._sleep(backoff):
                            return
                        backoff = min(backoff * 2, RETRY_MAX_S)
                        continue
                    backoff = RETRY_INITIAL_S
                self._process_once()

            except (CameraError, DetectorError) as exc:
                # Device or model failure: report it, keep the backend alive.
                self._error = str(exc)
                logger.warning("CV error: %s", exc)
                self._release()
                state_store.set_cv_state(CVState.ERROR)
                state_store.update_connection(camera=ConnectionState.DISCONNECTED)
                if self._sleep(backoff):
                    return
                backoff = min(backoff * 2, RETRY_MAX_S)
                continue
            except Exception as exc:  # noqa: BLE001 - the worker must never die
                self._error = f"Unexpected CV error: {exc}"
                logger.exception("Unexpected CV worker error")
                if self._sleep(backoff):
                    return
                backoff = min(backoff * 2, RETRY_MAX_S)
                continue

            backoff = RETRY_INITIAL_S

        logger.debug("CV worker loop exiting")

    def _initialise(self) -> bool:
        """Open the camera and load the detector. True on success."""
        self._error = None
        try:
            detector = self._make_detector()
            detector.load()
            camera = self._make_camera()
            camera.open()
        except (CameraError, DetectorError) as exc:
            self._error = str(exc)
            logger.warning("CV initialisation failed: %s", exc)
            self._release()
            state_store.set_cv_state(CVState.ERROR)
            state_store.update_connection(camera=ConnectionState.DISCONNECTED)
            return False

        self._detector = detector
        self._camera = camera
        state_store.set_cv_state(CVState.RUNNING)
        state_store.update_connection(camera=ConnectionState.CONNECTED)
        logger.info("CV pipeline ready: camera + %s", DETECTOR_NAME)
        return True

    def _sleep(self, seconds: float) -> bool:
        """Wait, waking early on stop. True => caller should exit."""
        if self._stop_event.is_set():
            return True
        # 100 ms slices so a stop request is honoured promptly.
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            if self._stop_event.is_set():
                return True
            if self._stop_event.wait(timeout=0.1):
                return True
        return False

    # ------------------------------------------------------------------
    # Frame processing
    # ------------------------------------------------------------------
    def _process_once(self) -> None:
        """Capture one frame, detect, and publish the result.

        The result is rebuilt from this frame alone, so the head count always
        reflects the CURRENT view - a face that left is simply absent from the
        new face list.
        """
        camera = self._camera
        detector = self._detector
        if camera is None or detector is None:
            return

        started = time.perf_counter()
        frame = camera.read()
        if frame is None:
            # Driver had nothing ready; not an error, just try again.
            return

        source_w, source_h = frame.width, frame.height

        # Optional downscale for CPU. Boxes are always reported in SOURCE
        # coordinates, so Phase 7 can overlay them without knowing about this.
        process = frame.image
        scale = 1.0
        settings_scale = getattr(self._settings, "cv_process_scale", 1.0) or 1.0
        if settings_scale < 1.0:
            try:
                import cv2

                new_w = max(32, int(source_w * settings_scale))
                new_h = max(32, int(source_h * settings_scale))
                process = cv2.resize(frame.image, (new_w, new_h))
                scale = source_w / new_w
            except Exception as exc:  # noqa: BLE001
                logger.debug("Resize unavailable, using native size: %s", exc)
                process, scale = frame.image, 1.0

        boxes = detector.detect(process)
        if scale != 1.0:
            boxes = scale_boxes(boxes, scale)

        result = build_result(
            boxes,
            source_width=source_w,
            source_height=source_h,
            process_width=int(source_w / scale) if scale != 1.0 else None,
            process_height=int(source_h / scale) if scale != 1.0 else None,
            detector=DETECTOR_NAME,
        )

        elapsed = time.perf_counter() - started
        self._frame_times.append(elapsed)
        if len(self._frame_times) > 1:
            mean = sum(self._frame_times) / len(self._frame_times)
            # FPS is derived from real per-frame processing time.
            self._fps = round(1.0 / mean, 2) if mean > 0 else None

        self._frames_processed += 1
        self._last_result = result
        self._last_frame = frame.image
        self._error = None

        # Publish for REST/WebSocket.
        state_store.update_cv(
            {
                "face_count": result.face_count,
                "faces": [b.model_dump(mode="json") for b in result.faces],
                "frame_width": result.frame_width,
                "frame_height": result.frame_height,
                "detector": result.detector,
                "fps": self._fps,
                "frames_processed": self._frames_processed,
                "processed_at": result.processed_at.isoformat(),
            }
        )


# Process-wide singleton wired into the FastAPI lifespan.
cv_service = CVService()


def get_cv_service() -> CVService:
    """Dependency-injection accessor (keeps routes testable)."""
    return cv_service