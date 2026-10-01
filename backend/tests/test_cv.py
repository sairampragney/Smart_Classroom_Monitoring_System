"""Computer vision tests (Phase 6).

TEST CATEGORIES - kept deliberately separate:

* SYNTHETIC / MOCKED: fake camera + fake detector, used for schema, head-count
  arithmetic, malformed output, state transitions and cleanup. These prove the
  PIPELINE LOGIC is correct.
* REAL CAMERA: exercised separately by starting /api/cv on this machine.

Neither category implies the other. See docs/COMPUTER_VISION.md.
"""

from __future__ import annotations

import threading
import time

import pytest

from app.models.common import ConnectionState, CVState
from app.models.cv import DetectionResult, FaceBox
from app.services.cv_service import CVService
from app.services.face_detector import (
    DetectorError,
    YuNetDetector,
    parse_yunet_output,
    scale_boxes,
)
from app.services.state import StateStore


def _wait_for(predicate, timeout=3.0, interval=0.02) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        if predicate():
            return True
        time.sleep(interval)
    return False


# ----------------------------------------------------------------------
# Fakes
# ----------------------------------------------------------------------
class FakeImage:
    def __init__(self, width, height):
        self._w, self._h = width, height

    @property
    def shape(self):
        return (self._h, self._w, 3)


class FakeFrame:
    def __init__(self, width=640, height=480):
        self.image = FakeImage(width, height)
        self.width = width
        self.height = height


class FakeCamera:
    """Fake CameraManager with scriptable frames and failures."""

    def __init__(self, width=640, height=480, frames=None):
        self.index = 0
        self.width = width
        self.height = height
        self.is_open = False
        self.open_error: Exception | None = None
        self.read_error: Exception | None = None
        self.closed_count = 0
        self._script: list[list[FaceBox]] = list(frames or [[]])
        self._calls = 0
        self._lock = threading.Lock()

    def open(self):
        if self.open_error is not None:
            raise self.open_error
        self.is_open = True

    def read(self):
        with self._lock:
            self._calls += 1
            if self.read_error is not None:
                raise self.read_error
            # Clamp at the last entry (do NOT wrap): this models a scenario
            # where faces leave and the frame then stays empty, which is what
            # the head-count behaviour test needs.
            idx = min(self._calls - 1, len(self._script) - 1)
            boxes = self._script[idx]
        return None if boxes is None else FakeFrame(self.width, self.height)

    def close(self):
        self.is_open = False
        self.closed_count += 1


class FakeDetector:
    """Fake detector returning scripted boxes."""

    def __init__(self, boxes_per_frame=None):
        self.is_ready = True
        self.closed_count = 0
        self._boxes = list(boxes_per_frame or [[]])
        self._calls = 0
        self._lock = threading.Lock()

    def load(self):
        self.is_ready = True

    def detect(self, image):
        with self._lock:
            self._calls += 1
            # Clamp, not wrap - see FakeCamera.read.
            return list(self._boxes[min(self._calls - 1, len(self._boxes) - 1)])

    def close(self):
        self.is_ready = False
        self.closed_count += 1


def box(x=100, y=80, w=140, h=140, conf=0.97) -> FaceBox:
    return FaceBox(x=x, y=y, width=w, height=h, confidence=conf)


@pytest.fixture()
def cv_store(monkeypatch):
    store = StateStore()
    from app.services import broadcaster as bmod
    from app.services import cv_service as cmod

    monkeypatch.setattr(cmod, "state_store", store)
    monkeypatch.setattr(bmod, "state_store", store)
    return store


def make_service(camera, detector) -> CVService:
    svc = CVService()
    svc._camera_factory = lambda: camera
    svc._detector_factory = lambda: detector
    return svc


# ----------------------------------------------------------------------
# Head count / result schema
# ----------------------------------------------------------------------
def test_face_count_equals_number_of_faces():
    r = DetectionResult(faces=[box(), box()], frame_width=640, frame_height=480)
    assert r.face_count == 2


def test_empty_detection_has_zero_count():
    r = DetectionResult(faces=[], frame_width=640, frame_height=480)
    assert r.face_count == 0


def test_no_cap_on_face_count():
    """Many simultaneous faces must be representable (no artificial maximum)."""
    faces = [box(x=i * 50, y=10) for i in range(10)]
    assert DetectionResult(faces=faces, frame_width=1280, frame_height=720).face_count == 10


def test_confidence_is_optional_and_not_faked():
    assert FaceBox(x=1, y=1, width=10, height=10).confidence is None


def test_result_carries_source_dimensions():
    r = DetectionResult(faces=[], frame_width=1280, frame_height=720)
    assert (r.frame_width, r.frame_height) == (1280, 720)


# ----------------------------------------------------------------------
# YuNet output parsing
# ----------------------------------------------------------------------
def test_parse_yunet_none_yields_empty():
    assert parse_yunet_output(None, 640, 480) == []


def test_parse_yunet_single_row():
    row = [100, 80, 140, 140, 0.97, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    b = parse_yunet_output([row], 640, 480)[0]
    assert (b.x, b.y, b.width, b.height) == (100, 80, 140, 140)
    assert b.confidence == pytest.approx(0.97)
    assert len(b.landmarks) == 5


def test_parse_yunet_multiple_rows():
    rows = [
        [10, 10, 50, 50, 0.9, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
        [200, 100, 60, 60, 0.8, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
    ]
    assert len(parse_yunet_output(rows, 640, 480)) == 2


def test_parse_skips_nan_rows():
    rows = [[float("nan"), 10, 50, 50, 0.9, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]]
    assert parse_yunet_output(rows, 640, 480) == []


def test_parse_skips_degenerate_boxes():
    rows = [[10, 10, 0, 0, 0.9, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]]
    assert parse_yunet_output(rows, 640, 480) == []


def test_parse_clamps_boxes_inside_frame():
    rows = [[700, 500, 200, 200, 0.9, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]]
    b = parse_yunet_output(rows, 640, 480)[0]
    assert b.x + b.width <= 640
    assert b.y + b.height <= 480


def test_scale_boxes_maps_process_to_source():
    out = scale_boxes([box(x=50, y=40, w=70, h=70)], 2.0)
    assert (out[0].x, out[0].y, out[0].width, out[0].height) == (100, 80, 140, 140)


def test_scale_boxes_identity_when_factor_is_one():
    boxes = [box()]
    assert scale_boxes(boxes, 1.0) == boxes


def test_detector_reports_missing_model(tmp_path):
    with pytest.raises(DetectorError, match="not found"):
        YuNetDetector(model_path=str(tmp_path / "nope.onnx")).load()


def test_detector_detect_before_load_raises():
    with pytest.raises(DetectorError, match="not loaded"):
        YuNetDetector().detect(FakeImage(640, 480))


# ----------------------------------------------------------------------
# Lifecycle (synthetic camera + detector)
# ----------------------------------------------------------------------
def test_worker_not_started_before_start(cv_store):
    svc = make_service(FakeCamera(), FakeDetector())
    assert svc.is_running is False
    assert cv_store.snapshot().cv is CVState.STOPPED


def test_start_opens_camera_and_publishes(cv_store):
    cam, det = FakeCamera(frames=[[box()]]), FakeDetector([[box()]])
    svc = make_service(cam, det)
    svc.start()
    assert _wait_for(lambda: svc.frames_processed > 0)
    assert cam.is_open is True
    snap = cv_store.snapshot()
    assert snap.cv is CVState.RUNNING
    assert snap.camera is ConnectionState.CONNECTED
    svc.stop()


def test_repeated_start_does_not_duplicate_workers(cv_store):
    """Repeated start() must not spawn extra workers for THIS service."""
    svc = make_service(FakeCamera(), FakeDetector())
    svc.start()
    first_thread = svc._thread
    assert first_thread is not None

    for _ in range(5):
        svc.start()
    time.sleep(0.3)

    # The very same thread object is still doing the work - no replacement and
    # no second reader racing for the camera.
    assert svc._thread is first_thread
    assert svc.is_running is True
    svc.stop()
    assert first_thread.is_alive() is False, "worker thread leaked after stop"


def test_stop_releases_camera_and_detector(cv_store):
    cam, det = FakeCamera(frames=[[box()]]), FakeDetector([[box()]])
    svc = make_service(cam, det)
    svc.start()
    assert _wait_for(lambda: svc.frames_processed > 0)
    worker = svc._thread
    assert worker is not None

    svc.stop()
    assert svc.is_running is False
    # The thread must actually terminate, not merely be forgotten.
    assert worker.is_alive() is False, "worker thread leaked after stop"
    assert cam.closed_count >= 1
    assert cam.is_open is False
    assert det.closed_count >= 1
    assert cv_store.snapshot().cv is CVState.STOPPED
    assert cv_store.snapshot().camera is ConnectionState.DISCONNECTED


def test_stop_without_start_is_safe(cv_store):
    assert make_service(FakeCamera(), FakeDetector()).stop() is CVState.STOPPED


def test_repeated_start_stop_cycles_do_not_leak_threads(cv_store):
    """Regression: start/stop must not accumulate cv-worker threads."""
    baseline = len([t for t in threading.enumerate() if t.name == "cv-worker"])
    for _ in range(4):
        svc = make_service(
            FakeCamera(frames=[[box()]]), FakeDetector([[box()]])
        )
        svc.start()
        assert _wait_for(lambda: svc.frames_processed > 0, timeout=3.0)
        svc.stop()
    time.sleep(0.3)
    after = len([t for t in threading.enumerate() if t.name == "cv-worker"])
    assert after <= baseline, f"cv-worker threads leaked: {baseline} -> {after}"


def test_camera_open_failure_reports_error_without_crashing(cv_store):
    from app.services.camera import CameraError

    cam = FakeCamera()
    cam.open_error = CameraError("no camera")
    svc = make_service(cam, FakeDetector())
    svc.start()
    assert _wait_for(lambda: svc.error is not None, timeout=3.0)
    assert "no camera" in svc.error
    assert svc.is_running is True  # worker survives
    assert cv_store.snapshot().cv is CVState.ERROR
    svc.stop()


def test_frame_read_failure_is_handled(cv_store):
    from app.services.camera import CameraError

    cam = FakeCamera(frames=[[box()]])
    cam.read_error = CameraError("read boom")
    svc = make_service(cam, FakeDetector())
    svc.start()
    assert _wait_for(lambda: svc.error is not None, timeout=3.0)
    assert svc.is_running is True
    svc.stop()


def test_detector_load_failure_reports_error(cv_store):
    class BadDetector(FakeDetector):
        def load(self):
            raise DetectorError("model missing")

    svc = make_service(FakeCamera(), BadDetector())
    svc.start()
    assert _wait_for(lambda: svc.error is not None, timeout=3.0)
    assert "model missing" in svc.error
    svc.stop()


def test_head_count_tracks_current_frame_not_cumulative(cv_store):
    """KEY behaviour: the count follows the CURRENT frame only."""
    script = [
        [box(x=10), box(x=200)],                 # 2 faces
        [box(x=10), box(x=200), box(x=400)],      # 3 faces
        [box(x=10)],                              # 1 face (one left)
        [],                                       # 0 faces (all left)
    ]
    svc = make_service(FakeCamera(frames=script), FakeDetector(script))
    svc.start()
    assert _wait_for(lambda: svc.frames_processed >= 4, timeout=4.0)

    seen = []
    for _ in range(60):
        r = svc.last_result
        if r is not None:
            seen.append(r.face_count)
        time.sleep(0.01)
    svc.stop()

    assert max(seen) <= 3, "count must never accumulate beyond a single frame"
    assert seen[-1] == 0, f"count did not return to 0: {seen[-5:]}"


def test_fps_is_measured_not_hardcoded(cv_store):
    svc = make_service(FakeCamera(frames=[[box()]]), FakeDetector([[box()]]))
    svc.start()
    assert _wait_for(lambda: svc.fps is not None, timeout=3.0)
    assert isinstance(svc.fps, float) and svc.fps > 0
    svc.stop()