import { useRef } from 'react'
import { cn } from '@/utils/cn'
import type { FaceBox } from '@/types'

interface CameraViewportProps {
  /** Live frame as a data/blob URL; null until the CV service streams. */
  frameUrl: string | null
  boxes: FaceBox[]
  /** Source capture resolution, used for coordinate mapping. */
  sourceWidth: number | null
  sourceHeight: number | null
  detectionRunning: boolean
}

/**
 * Camera panel with face overlay.
 *
 * COORDINATE MAPPING (critical)
 * ------------------------------
 * Boxes arrive in SOURCE capture pixels (e.g. 640x480) but the panel is
 * rendered at a responsive CSS size. Rendering raw source coordinates would
 * misalign the boxes, so each box is converted into a percentage-based style:
 * left/top/width/height are fractions of the source frame. Percentages stay
 * correct under any responsive resize, aspect-ratio change or object-fit
 * letterboxing without needing pixel math.
 *
 * Phase 1 renders no frames and no boxes - both props are empty by design.
 */
export function CameraViewport({
  frameUrl,
  boxes,
  sourceWidth,
  sourceHeight,
  detectionRunning,
}: CameraViewportProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={panelRef}
      className={cn(
        'relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-violet-500/15',
        'bg-[#05040c]',
      )}
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

      {frameUrl ? (
        <img
          src={frameUrl}
          alt="Live camera feed"
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <div>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-violet-500/20 bg-violet/[0.06]">
              <span className="text-2xl text-violet/70">◐</span>
            </div>
            <p className="text-sm font-semibold text-fg">Camera not started</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-fg-muted">
              The camera feed and face detection engine arrive in Phase 6. No
              synthetic faces or head counts are shown in the meantime.
            </p>
            <span className="mt-4 inline-block rounded-full border border-violet-500/25 bg-violet/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-soft">
              Phase 6
            </span>
          </div>
        </div>
      )}

      {/* ---- Face overlay ---- */}
      {frameUrl &&
        boxes.map((box, i) => (
          <div
            key={`${box.x}-${box.y}-${i}`}
            className="pointer-events-none absolute border-2 border-status-ok shadow-[0_0_18px_rgba(34,197,94,0.45)]"
            style={{
              left: `${(box.x / (sourceWidth || 1)) * 100}%`,
              top: `${(box.y / (sourceHeight || 1)) * 100}%`,
              width: `${(box.width / (sourceWidth || 1)) * 100}%`,
              height: `${(box.height / (sourceHeight || 1)) * 100}%`,
            }}
          >
            <span className="absolute -top-[22px] left-0 whitespace-nowrap rounded-t bg-status-ok px-1.5 py-0.5 font-mono text-[10px] font-bold text-black">
              FACE DETECTED
            </span>
          </div>
        ))}

      {/* ---- HUD corner labels ---- */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 backdrop-blur">
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

      <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 font-mono text-[10px] text-fg-muted backdrop-blur">
        {sourceWidth && sourceHeight ? `${sourceWidth}×${sourceHeight}` : 'no source'}
      </div>
    </div>
  )
}