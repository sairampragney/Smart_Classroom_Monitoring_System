"""Camera MJPEG stream (added in Phase 7).

Why this exists
---------------
Phase 6 produced detections but exposed frames only as a polled base64 JPEG on
``/api/cv/frame``. Polling that endpoint from the browser is wasteful and gives
a slideshow, not a live view.

This endpoint streams the frames the CV engine ALREADY captured:

    cv_service.last_frame  <-  the exact frame the detector just processed

There is deliberately **no second `VideoCapture`**. The backend remains the
single authoritative camera source, which is what guarantees the video the user
sees and the boxes drawn over it come from the same pipeline.
"""

from __future__ import annotations

import asyncio

from app.logging_config import get_logger
from app.services.cv_service import get_cv_service

logger = get_logger(__name__)

# MJPEG multipart boundary. Any unique string works.
BOUNDARY = "frame"
# Longest we wait for a new frame before emitting a keep-alive boundary so the
# browser connection is not silently dropped while the CV service is stopped.
IDLE_TIMEOUT_S = 1.0


def encode_jpeg(image) -> bytes | None:
    """Encode a frame to JPEG bytes using the configured quality."""
    try:
        import cv2

        from app.config import get_settings

        quality = get_settings().cv_jpeg_quality
        ok, buf = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        return buf.tobytes() if ok else None
    except Exception as exc:  # noqa: BLE001 - never break the stream
        logger.warning("JPEG encode failed: %s", exc)
        return None


async def mjpeg_frames():
    """Yield multipart JPEG chunks for the authoritative CV frame."""
    svc = get_cv_service()
    last_sent = None

    while True:
        frame = svc.last_frame

        if frame is None:
            # CV not running (or no frame yet): send a keep-alive boundary so
            # the browser keeps the connection open and recovers on its own.
            yield (
                f"--{BOUNDARY}\r\nContent-Type: image/jpeg\r\n"
                f"Content-Length: 0\r\n\r\n".encode()
            )
            await asyncio.sleep(0.2)
            continue

        if frame is not last_sent:
            payload = encode_jpeg(frame)
            last_sent = frame
            if payload:
                yield (
                    f"--{BOUNDARY}\r\n"
                    f"Content-Type: image/jpeg\r\n"
                    f"Content-Length: {len(payload)}\r\n\r\n"
                ).encode() + payload + b"\r\n"

        await asyncio.sleep(0.01)  # ~100 fps cap; naturally limited by the camera


async def stream_iter():
    """Wrap the generator so disconnects stop generation immediately."""
    try:
        async for chunk in mjpeg_frames():
            yield chunk
    except asyncio.CancelledError:
        logger.debug("MJPEG client disconnected")
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning("MJPEG stream ended: %s", exc)
        raise