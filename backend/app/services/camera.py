"""Camera capture (Phase 6).

Isolated from the detector and from FastAPI so each can be tested (and
replaced) independently. Every failure mode - camera unavailable, permission
denied, open failure, read failure, disconnect - is reported as a value, never
raised into the worker loop.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from app.logging_config import get_logger

logger = get_logger(__name__)


class CameraError(RuntimeError):
    """Raised when the camera cannot be opened."""


@dataclass
class Frame:
    """A captured frame plus its true source dimensions."""

    image: Any  # numpy.ndarray (kept untyped to avoid a hard numpy import)
    width: int
    height: int


class CameraManager:
    """Owns the capture handle. Exactly one instance per CV worker."""

    def __init__(
        self,
        index: int = 0,
        width: int = 640,
        height: int = 480,
        # Test seam: inject a fake capture object.
        capture_factory: Callable[[int], Any] | None = None,
    ) -> None:
        self.index = index
        self.width = width
        self.height = height
        self._capture_factory = capture_factory or self._default_factory
        self._cap: Any | None = None

    @staticmethod
    def _default_factory(index: int) -> Any:
        import cv2  # lazy so tests can import this module without OpenCV

        return cv2.VideoCapture(index)

    @property
    def is_open(self) -> bool:
        if self._cap is None:
            return False
        try:
            return bool(self._cap.isOpened())
        except Exception:  # noqa: BLE001
            return False

    def open(self) -> None:
        """Open the device. Raises :class:`CameraError` on failure."""
        if self.is_open:
            return
        self.close()

        logger.info("Opening camera index %s (%dx%d)...", self.index, self.width, self.height)
        try:
            cap = self._capture_factory(self.index)
        except Exception as exc:  # noqa: BLE001
            raise CameraError(f"Camera {self.index} could not be created: {exc}") from exc

        if cap is None:
            raise CameraError(f"Camera {self.index} could not be created")

        try:
            opened = bool(cap.isOpened())
        except Exception as exc:  # noqa: BLE001
            raise CameraError(f"Camera {self.index} status check failed: {exc}") from exc

        if not opened:
            # Release the half-open handle so the device is not left locked.
            try:
                cap.release()
            except Exception:  # noqa: BLE001
                pass
            raise CameraError(
                f"Camera {self.index} could not be opened. It may be in use by "
                "another application, disabled, or not present."
            )

        # Request a practical capture size; drivers may ignore these.
        for prop, value in (
            ("CAP_PROP_FRAME_WIDTH", self.width),
            ("CAP_PROP_FRAME_HEIGHT", self.height),
        ):
            try:
                cap.set(prop, value)
            except Exception:  # noqa: BLE001 - property support varies
                pass

        self._cap = cap
        logger.info("Camera %s opened", self.index)

    def read(self) -> Frame | None:
        """Read the newest frame.

        Returns ``None`` when the driver yields no frame. A hard failure is
        raised as :class:`CameraError` so the worker can react.
        """
        if not self.is_open:
            return None
        try:
            ok, image = self._cap.read()
        except Exception as exc:  # noqa: BLE001
            raise CameraError(f"Camera {self.index} read failed: {exc}") from exc

        if not ok or image is None:
            return None

        height, width = image.shape[:2]
        return Frame(image=image, width=int(width), height=int(height))

    def close(self) -> None:
        """Release the device so the webcam is never left locked."""
        cap = self._cap
        self._cap = None
        if cap is None:
            return
        try:
            cap.release()
        except Exception as exc:  # noqa: BLE001
            logger.debug("Ignoring error releasing camera: %s", exc)
        logger.info("Camera %s released", self.index)