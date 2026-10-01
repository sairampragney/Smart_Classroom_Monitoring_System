"""Computer vision endpoints (Phase 6).

Exposed for Phase 7. Nothing here fabricates data - every value comes from the
CV worker's last real frame.
"""

from __future__ import annotations

import base64

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.models.cv import (
    CVActionResponse,
    CVStatusResponse,
    DetectedFrameResponse,
    FaceBox,
)
from app.services.cv_service import get_cv_service
from app.services.state import state_store

router = APIRouter(prefix="/api/cv", tags=["computer-vision"])


class DetectionResponse(BaseModel):
    """Latest detection result (no image payload)."""

    face_count: int
    fps: float | None
    detector: str
    frame_width: int | None
    frame_height: int | None
    faces: list[FaceBox] = Field(default_factory=list)
    processed_at: str | None = None


def _status() -> CVStatusResponse:
    svc = get_cv_service()
    snap = state_store.snapshot()
    result = svc.last_result
    return CVStatusResponse(
        cv=snap.cv.value,
        camera=snap.camera.value,
        detector=svc.detector_name,
        detector_ready=svc._detector is not None,
        worker_running=svc.is_running,
        camera_index=svc._settings.camera_index,
        face_count=result.face_count if result else 0,
        fps=svc.fps,
        frames_processed=svc.frames_processed,
        source_width=result.frame_width if result else None,
        source_height=result.frame_height if result else None,
        error=svc.error,
        last_update=result.processed_at if result else None,
    )


@router.get("/status", response_model=CVStatusResponse)
async def cv_status() -> CVStatusResponse:
    """Current CV pipeline state."""
    return _status()


@router.get("/detections", response_model=DetectionResponse)
async def detections() -> DetectionResponse:
    """Latest detection result in SOURCE frame coordinates."""
    svc = get_cv_service()
    result = svc.last_result
    if result is None:
        return DetectionResponse(
            face_count=0, fps=None, detector=svc.detector_name,
            frame_width=None, frame_height=None, faces=[],
        )
    return DetectionResponse(
        face_count=result.face_count,
        fps=svc.fps,
        detector=result.detector,
        frame_width=result.frame_width,
        frame_height=result.frame_height,
        faces=result.faces,
        processed_at=result.processed_at.isoformat(),
    )


@router.get("/frame", response_model=DetectedFrameResponse)
async def frame(include_image: bool = Query(default=True)) -> DetectedFrameResponse:
    """Latest detection result plus an optional base64 JPEG of the frame.

    Phase 7 uses this to render the camera view without opening a second
    capture handle.
    """
    svc = get_cv_service()
    result = svc.last_result
    payload = DetectedFrameResponse(
        face_count=result.face_count if result else 0,
        fps=svc.fps,
        detector=svc.detector_name,
        frame_width=result.frame_width if result else None,
        frame_height=result.frame_height if result else None,
        faces=result.faces if result else [],
        image=None,
    )
    if include_image and svc.last_frame is not None:
        try:
            import cv2

            ok, buf = cv2.imencode(
                ".jpg", svc.last_frame,
                [int(cv2.IMWRITE_JPEG_QUALITY), svc._settings.cv_jpeg_quality],
            )
            if ok:
                payload.image = base64.b64encode(buf.tobytes()).decode("ascii")
        except Exception:  # noqa: BLE001 - an image is optional, never fatal
            payload.image = None
    return payload


@router.get("/stream")
async def stream():
    """Live MJPEG feed of the frames the CV engine already captured.

    The backend stays the single authoritative camera source - this does NOT
    open a second capture, so the video and the detection boxes always come
    from the same pipeline.
    """
    from fastapi.responses import StreamingResponse

    from app.services.cv_stream import BOUNDARY, stream_iter

    return StreamingResponse(
        stream_iter(),
        media_type=f"multipart/x-mixed-replace; boundary={BOUNDARY}",
        headers={"Cache-Control": "no-store", "Pragma": "no-cache"},
    )


@router.post("/start", response_model=CVActionResponse)
async def start_cv() -> CVActionResponse:
    """Start continuous face detection."""
    svc = get_cv_service()
    svc.start()
    s = state_store.snapshot()
    return CVActionResponse(
        cv=s.cv.value,
        camera=s.camera.value,
        message="Face detection started.",
    )


@router.post("/stop", response_model=CVActionResponse)
async def stop_cv() -> CVActionResponse:
    """Stop detection and release the camera."""
    svc = get_cv_service()
    svc.stop()
    s = state_store.snapshot()
    return CVActionResponse(
        cv=s.cv.value,
        camera=s.camera.value,
        message="Face detection stopped; camera released.",
    )