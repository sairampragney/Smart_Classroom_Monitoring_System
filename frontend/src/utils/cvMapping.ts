/**
 * CV coordinate mapping (Phase 7).
 *
 * WHY PERCENTAGES, NOT PIXELS
 * ---------------------------
 * The backend reports face boxes in SOURCE camera pixels (e.g. 640x480) but
 * the browser renders the video at whatever size the layout gives it. Raw pixel
 * values would therefore drift the moment the window resizes.
 *
 * Converting each box to a percentage of the source frame makes the overlay
 * resolution-independent: left/top/width/height become fractions of the frame,
 * and CSS resolves them against the rendered element. The same style string is
 * correct at 400 px wide and at 1920 px wide.
 *
 * The wrapper element is given the SOURCE aspect ratio, so `object-contain`
 * fills it exactly with no letterboxing or cropping. Percentages therefore
 * need no knowledge of the rendered size at all - which is precisely what makes
 * them robust.
 */

import type { FaceBox } from '@/types'

/** Guard against a 0/0 or missing source size producing NaN styles. */
function safeDenominator(value: number | null | undefined): number {
  return typeof value === 'number' && value > 0 ? value : 1
}

export interface BoxStyle {
  left: string
  top: string
  width: string
  height: string
}

/**
 * Convert a source-frame box into CSS percentage styles.
 *
 * The box is clamped to the frame so a detector edge case can never push a
 * rectangle outside the panel.
 */
export function boxToPercentStyle(
  box: FaceBox,
  sourceWidth: number | null,
  sourceHeight: number | null,
): BoxStyle {
  const sw = safeDenominator(sourceWidth)
  const sh = safeDenominator(sourceHeight)

  const x = Math.max(0, Math.min(box.x, sw))
  const y = Math.max(0, Math.min(box.y, sh))
  const w = Math.max(1, Math.min(box.width, sw - x))
  const h = Math.max(1, Math.min(box.height, sh - y))

  return {
    left: `${(x / sw) * 100}%`,
    top: `${(y / sh) * 100}%`,
    width: `${(w / sw) * 100}%`,
    height: `${(h / sh) * 100}%`,
  }
}

/** True when a box lies fully inside the source frame. */
export function isBoxInFrame(
  box: FaceBox,
  sourceWidth: number | null,
  sourceHeight: number | null,
): boolean {
  if (!sourceWidth || !sourceHeight) return false
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= sourceWidth &&
    box.y + box.height <= sourceHeight &&
    box.width > 0 &&
    box.height > 0
  )
}

/** CSS aspect-ratio for the wrapper, falling back to 4:3 before any frame. */
export function aspectRatioStyle(
  sourceWidth: number | null,
  sourceHeight: number | null,
): { aspectRatio: string } {
  if (sourceWidth && sourceHeight && sourceWidth > 0 && sourceHeight > 0) {
    return { aspectRatio: `${sourceWidth} / ${sourceHeight}` }
  }
  return { aspectRatio: '4 / 3' }
}

/** Human-readable confidence label; honest when the detector gives none. */
export function formatConfidence(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined) return '—'
  return `${(confidence * 100).toFixed(0)}%`
}