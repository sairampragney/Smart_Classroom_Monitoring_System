"""Computer vision models (Phase 6).

Coordinate contract
-------------------
Every box is expressed in the **SOURCE camera frame** coordinate system:

* origin (0, 0) = top-left pixel of the captured frame
* +x = right, +y = down
* units = pixels of the SOURCE frame, not the (possibly downscaled)
  processing frame

The source dimensions travel with every result (``frame_width`` /
``frame_height``) so the Phase 7 overlay can map boxes onto the displayed
video regardless of how the browser scales or crops it.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class FaceBox(BaseModel):
    """One detected face, in SOURCE frame pixels."""

    model_config = ConfigDict(extra="ignore")

    x: int = Field(..., ge=0, description="Left edge, source-frame pixels.")
    y: int = Field(..., ge=0, description="Top edge, source-frame pixels.")
    width: int = Field(..., ge=1, description="Box width in source-frame pixels.")
    height: int = Field(..., ge=1, description="Box height in source-frame pixels.")

    #: YuNet returns a real 0..1 score. This stays None for detectors that
    #: expose no confidence - it is never faked.
    confidence: float | None = Field(
        default=None, ge=0.0, le=1.0, description="Detector confidence, if available."
    )

    #: 5 landmark points (right eye, left eye, nose, right mouth, left mouth)
    #: when the detector supplies them. Empty list otherwise - never invented.
    landmarks: list[list[int]] = Field(default_factory=list)


class DetectionResult(BaseModel):
    """The complete result of processing ONE frame.

    ``face_count`` is always ``len(faces)`` and always describes the CURRENT
    frame only - it is never a cumulative visitor total.
    """

    faces: list[FaceBox] = Field(default_factory=list)
    frame_width: int = Field(..., gt=0)
    frame_height: int = Field(..., gt=0)
    detector: str = Field(default="YuNet", examples=["YuNet"])
    #: Processing resolution actually used (may be < source when downscaling).
    process_width: int | None = None
    process_height: int | None = None
    processed_at: datetime = Field(default_factory=_utc_now)

    @property
    def face_count(self) -> int:
        """Number of faces visible in THIS frame."""
        return len(self.faces)


class CVStatusResponse(BaseModel):
    """REST status for the CV engine."""

    cv: str = Field(..., examples=["RUNNING"])
    camera: str = Field(..., examples=["CONNECTED"])
    detector: str = Field(..., examples=["YuNet"])
    detector_ready: bool
    worker_running: bool
    camera_index: int
    face_count: int
    fps: float | None = Field(default=None, description="Measured inference FPS")
    frames_processed: int = 0
    source_width: int | None = None
    source_height: int | None = None
    error: str | None = None
    last_update: datetime | None = None


class DetectedFrameResponse(BaseModel):
    """Latest detection result plus a single JPEG frame (Phase 7 consumes this)."""

    face_count: int
    fps: float | None
    detector: str
    frame_width: int | None
    frame_height: int | None
    faces: list[FaceBox]
    image: str | None = Field(
        default=None, description="Base64 JPEG of the processed frame, if enabled."
    )
    encoding: Literal["jpeg"] = "jpeg"


class CVActionResponse(BaseModel):
    cv: str
    camera: str
    message: str