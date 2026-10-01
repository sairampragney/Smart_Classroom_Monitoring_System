"""Face detector (Phase 6).

Detector selection
-----------------
**YuNet** (``face_detection_yunet_2023mar.onnx``) via ``cv2.FaceDetectorYN``.

Alternatives considered:

* **Haar cascade** - the classic choice. However ``cv2.CascadeClassifier`` was
  **removed in OpenCV 5.0** and no cascades ship with the wheel, so it is not
  available on this stack at all. It also exposes no confidence score.
* **MediaPipe Face Detection** - accurate, but pulls a large extra dependency
  tree and a second runtime into the venv for a task OpenCV already handles.
* **DNN detectors (ResNet/MTCNN)** - far heavier than this project needs.

YuNet was chosen because it is a 227 KB ONNX model, runs comfortably on CPU,
returns a **real** confidence score, detects **multiple** faces per frame, and
ships directly in OpenCV. It is the smallest option that meets the requirement.

This module performs **detection only**. There is no identification, embedding
or matching of any kind.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.logging_config import get_logger
from app.models.cv import DetectionResult, FaceBox

logger = get_logger(__name__)

DETECTOR_NAME = "YuNet"
DEFAULT_MODEL = "cv/models/face_detection_yunet_2023mar.onnx"
DEFAULT_CONFIDENCE = 0.6
DEFAULT_NMS_THRESHOLD = 0.3
DEFAULT_TOP_K = 5000


class DetectorError(RuntimeError):
    """Raised when the detector cannot be created or run."""


def resolve_model_path(path: str) -> Path:
    """Resolve the model path against the project root."""
    from app.config import PROJECT_ROOT

    p = Path(path)
    return p if p.is_absolute() else (PROJECT_ROOT / p)


class YuNetDetector:
    """Thin, testable wrapper around ``cv2.FaceDetectorYN``."""

    name = DETECTOR_NAME

    def __init__(
        self,
        model_path: str = DEFAULT_MODEL,
        confidence: float = DEFAULT_CONFIDENCE,
        nms_threshold: float = DEFAULT_NMS_THRESHOLD,
        top_k: int = DEFAULT_TOP_K,
        # Test seam: inject a pre-built detector.
        factory: Any | None = None,
    ) -> None:
        self.model_path = resolve_model_path(model_path)
        self.confidence = confidence
        self.nms_threshold = nms_threshold
        self.top_k = top_k
        self._factory = factory or self._default_factory
        self._det: Any | None = None
        self._input_size: tuple[int, int] | None = None

    @staticmethod
    def _default_factory(model: str, config: str, input_size, score, nms, top_k) -> Any:
        import cv2

        return cv2.FaceDetectorYN.create(model, config, input_size, score, nms, top_k)

    @property
    def is_ready(self) -> bool:
        return self._det is not None

    def load(self) -> None:
        """Create the detector. Raises :class:`DetectorError` on failure."""
        if self._det is not None:
            return
        if not self.model_path.exists():
            raise DetectorError(
                f"Detector model not found: {self.model_path}. "
                "Run scripts/fetch_cv_models.ps1 to download it."
            )
        try:
            # OpenCV requires a non-empty input size at construction; the real
            # size is set per frame via set_input_size().
            self._det = self._factory(
                str(self.model_path), "", (320, 240), self.confidence,
                self.nms_threshold, self.top_k,
            )
        except Exception as exc:  # noqa: BLE001
            raise DetectorError(f"Could not initialise YuNet: {exc}") from exc
        logger.info(
            "Detector %s loaded (model=%s, confidence=%.2f)",
            self.name, self.model_path.name, self.confidence,
        )

    def set_input_size(self, width: int, height: int) -> None:
        if self._det is None:
            raise DetectorError("Detector is not loaded")
        if self._input_size == (width, height):
            return
        self._input_size = (width, height)
        try:
            self._det.setInputSize((width, height))
        except Exception as exc:  # noqa: BLE001
            raise DetectorError(f"setInputSize failed: {exc}") from exc

    def detect(self, image: Any) -> list[FaceBox]:
        """Detect every face in one frame (same coordinate space as ``image``).

        An empty list is a normal, valid result.
        """
        if self._det is None:
            raise DetectorError("Detector is not loaded")
        height, width = image.shape[:2]
        self.set_input_size(int(width), int(height))
        try:
            _, faces = self._det.detect(image)
        except Exception as exc:  # noqa: BLE001
            raise DetectorError(f"Detection failed: {exc}") from exc
        return parse_yunet_output(faces, int(width), int(height))

    def close(self) -> None:
        """Drop the model reference so nothing keeps it alive."""
        self._det = None
        self._input_size = None


def parse_yunet_output(
    faces: Any, source_width: int, source_height: int
) -> list[FaceBox]:
    """Convert raw YuNet rows into validated :class:`FaceBox` objects.

    YuNet returns an (N, 15) float array:
        x, y, w, h, score, then 10 landmark coordinates
    or ``None`` when nothing is found. Malformed, non-finite or degenerate rows
    are skipped rather than propagated.
    """
    if faces is None:
        return []
    try:
        rows = list(faces)
    except TypeError:
        return []
    if not rows:
        return []

    boxes: list[FaceBox] = []
    for row in rows:
        try:
            values = [float(v) for v in list(row)[:15]]
        except (TypeError, ValueError):
            continue
        if len(values) < 5:
            continue

        x, y, w, h, score = values[:5]
        # NaN / infinity guard - a bad row must never become a box.
        if any(v != v or abs(v) == float("inf") for v in (x, y, w, h, score)):
            continue
        if w <= 1 or h <= 1:
            continue

        # Clamp to the frame so a box can never leave the viewport.
        x0 = max(0, min(int(round(x)), source_width - 1))
        y0 = max(0, min(int(round(y)), source_height - 1))
        box_w = max(1, min(int(round(w)), source_width - x0))
        box_h = max(1, min(int(round(h)), source_height - y0))

        landmarks: list[list[int]] = []
        if len(values) >= 15:
            pts = values[5:15]
            for i in range(0, 10, 2):
                landmarks.append(
                    [
                        max(0, min(int(round(pts[i])), source_width - 1)),
                        max(0, min(int(round(pts[i + 1])), source_height - 1)),
                    ]
                )

        boxes.append(
            FaceBox(
                x=x0,
                y=y0,
                width=box_w,
                height=box_h,
                confidence=max(0.0, min(1.0, score)),
                landmarks=landmarks,
            )
        )
    return boxes


def scale_boxes(boxes: list[FaceBox], factor: float) -> list[FaceBox]:
    """Rescale boxes from the processing frame back to the source frame.

    ``factor`` is ``source_width / process_width``. Returns the input list
    unchanged when no scaling is needed.
    """
    if abs(factor - 1.0) < 1e-6:
        return boxes
    out: list[FaceBox] = []
    for b in boxes:
        out.append(
            FaceBox(
                x=int(round(b.x * factor)),
                y=int(round(b.y * factor)),
                width=max(1, int(round(b.width * factor))),
                height=max(1, int(round(b.height * factor))),
                confidence=b.confidence,
                landmarks=[
                    [int(round(p[0] * factor)), int(round(p[1] * factor))]
                    for p in b.landmarks
                ],
            )
        )
    return out


def build_result(
    boxes: list[FaceBox],
    source_width: int,
    source_height: int,
    process_width: int | None = None,
    process_height: int | None = None,
    detector: str = DETECTOR_NAME,
) -> DetectionResult:
    return DetectionResult(
        faces=boxes,
        frame_width=source_width,
        frame_height=source_height,
        detector=detector,
        process_width=process_width,
        process_height=process_height,
    )