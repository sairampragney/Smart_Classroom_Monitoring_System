import { cn } from '@/utils/cn'
import { aspectRatioStyle, boxToPercentStyle, formatConfidence } from '@/utils/cvMapping'
import type { FaceBox } from '@/types'

interface CameraViewportProps {
  /** MJPEG endpoint served by the backend CV engine. */
  streamUrl: string | null
  boxes: FaceBox[]
  /** Source capture resolution reported by the backend. */
  sourceWidth: number | null
  sourceHeight: number | null
  detectionRunning: boolean
  cameraConnected: boolean
  /** Rendered only when we have never had a frame (CV stopped / no camera). */
  emptyTitle: string
  emptyHint: string
}

/**
 * Camera panel with live face overlay.
 *
 * COORDINATE MAPPING (the critical bit)
 * -------------------------------------
 * 1. The wrapper gets the SOURCE aspect ratio, so `object-contain` fills it
 *    exactly - no letterboxing, no cropping.
 * 2. Boxes are converted to percentages of the source frame, so they stay
 *    locked to the face at any rendered size.
 * 3. Because (1) and (2) agree, the green rectangle sits exactly over the
 *    detected face regardless of window size.
 *
 * The video comes from the backend's OWN camera pipeline, so what is drawn and
 * what is boxed are the same frames - never a second capture.
 */
export function CameraViewport({
  streamUrl,
  boxes,
  sourceWidth,
  sourceHeight,
  detectionRunning,
  cameraConnected,
  emptyTitle,
  emptyHint,
}: CameraViewportProps) {
  const showVideo = Boolean(streamUrl) && cameraConnected

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border border-violet-500/15',
        'bg-[#05040c]',
      )}
      style={aspectRatioStyle(sourceWidth, sourceHeight)}
    >
      {/* Subtle scanline grid so the panel reads as an active viewport. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(139,92,246,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.10) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
        aria-hidden="true"
      />

      {showVideo && streamUrl ? (
        <img
          src={streamUrl}
          alt="Live camera feed"
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <div>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-violet-500/20 bg-violet/[0.06]">
              <span className="text-2xl text-violet/70">◐</span>
            </div>
            <p className="text-sm font-semibold text-fg">{emptyTitle}</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-fg-muted">
              {emptyHint}
            </p>
          </div>
        </div>
      )}

      {/* ---- Face overlay ---- */}
      {showVideo &&
        boxes.map((box, i) => {
          const style = boxToPercentStyle(box, sourceWidth, sourceHeight)
          return (
            <div
              key={`${box.x}-${box.y}-${i}`}
              className="pointer-events-none absolute border-2 border-status-ok shadow-[0_0_18px_rgba(34,197,94,0.45)]"
              style={style}
            >
              <span className="absolute -top-[22px] left-0 flex items-center gap-1 whitespace-nowrap rounded-t bg-status-ok px-1.5 py-0.5 font-mono text-[10px] font-bold text-black">
                FACE DETECTED
                {box.confidence !== null && box.confidence !== undefined && (
                  <span className="opacity-80">
                    {formatConfidence(box.confidence)}
                  </span>
                )}
              </span>
            </div>
          )
        })}

      {/* ---- HUD corner labels ---- */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/55 px-2.5 py-1.5 backdrop-blur">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            detectionRunning ? 'bg-status-ok' : 'bg-status-idle',
          )}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg">
          {detectionRunning ? 'Detection Running' : 'Detection Stopped'}
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg border border-white/10 bg-black/55 px-2.5 py-1.5 font-mono text-[10px] text-fg-muted backdrop-blur">
        {sourceWidth && sourceHeight ? `${sourceWidth}×${sourceHeight}` : 'no source'}
      </div>
    </div>
  )
}