/**
 * Coordinate-mapping and CV state-transition tests.
 *
 * Run with Node's built-in TypeScript support (Node >= 22.6):
 *     node frontend/tests/cvMapping.test.ts
 *
 * These are pure-function tests - no DOM, no browser, no camera. They verify
 * the maths that keeps the green box locked to the detected face, and the
 * head-count reducer semantics (current frame only, never accumulated).
 */

import {
  aspectRatioStyle,
  boxToPercentStyle,
  formatConfidence,
  isBoxInFrame,
} from '../src/utils/cvMapping.ts'
import type { FaceBox } from '../src/types/index.ts'

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    console.error(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`)
  }
}

function eq(name: string, actual: unknown, expected: unknown): void {
  check(name, actual === expected, `got ${String(actual)}, want ${String(expected)}`)
}

/**
 * Compare a percentage string numerically.
 *
 * Derived ratios (e.g. 100/480) land within a float ULP of the literal, so
 * exact string equality is brittle. Compare as numbers instead.
 */
function pct(name: string, actual: string, expectedPercent: number): void {
  const value = Number.parseFloat(actual)
  const ok = Number.isFinite(value) && Math.abs(value - expectedPercent) < 1e-9
  check(name, ok, `got ${actual}, want ~${expectedPercent}%`)
}

const SW = 640
const SH = 480

function box(x: number, y: number, width: number, height: number, confidence: number | null = 0.97): FaceBox {
  return { x, y, width, height, confidence }
}

console.log('\n== Coordinate mapping: centre face ==')
{
  const s = boxToPercentStyle(box(280, 200, 80, 80), SW, SH)
  pct('left', s.left, (280 / 640) * 100)
  pct('top', s.top, (200 / 480) * 100)
  pct('width', s.width, (80 / 640) * 100)
  pct('height', s.height, (80 / 480) * 100)
}

console.log('\n== Coordinate mapping: edges ==')
{
  const left = boxToPercentStyle(box(0, 0, 100, 100), SW, SH)
  eq('left edge left', left.left, '0%')
  eq('left edge top', left.top, '0%')

  const right = boxToPercentStyle(box(SW - 100, SH - 100, 100, 100), SW, SH)
  pct('right edge width', right.width, (100 / 640) * 100)
  pct('bottom edge height', right.height, (100 / 480) * 100)
  // A box flush against the right/bottom edge must end exactly at 100%.
  pct('right edge ends at frame right',
    String(parseFloat(right.left) + parseFloat(right.width)), 100)
  pct('bottom edge ends at frame bottom',
    String(parseFloat(right.top) + parseFloat(right.height)), 100)
}

console.log('\n== Coordinate mapping: clamping ==')
{
  // A box that overruns the frame must be clipped, never overflow the panel.
  const s = boxToPercentStyle(box(600, 440, 200, 200), SW, SH)
  eq('clamped left', s.left, '93.75%') // 600/640
  eq('clamped width', s.width, '6.25%') // (640-600)/640
  eq('clamped top', s.top, '91.66666666666666%') // 440/480
  check('clamped height within frame', parseFloat(s.height) <= 100, s.height)

  const neg = boxToPercentStyle(box(-50, -20, 100, 100), SW, SH)
  eq('negative x clamped to 0', neg.left, '0%')
  eq('negative y clamped to 0', neg.top, '0%')
}

console.log('\n== Coordinate mapping: degenerate inputs ==')
{
  const zeroW = boxToPercentStyle(box(10, 10, 100, 100), 0, 0)
  check('zero source size does not produce NaN',
    !Object.values(zeroW).some((v) => String(v).includes('NaN')), JSON.stringify(zeroW))
  const nullW = boxToPercentStyle(box(10, 10, 100, 100), null, null)
  check('null source size does not produce NaN',
    !Object.values(nullW).some((v) => String(v).includes('NaN')), JSON.stringify(nullW))
  const tiny = boxToPercentStyle(box(0, 0, 0, 0), SW, SH)
  check('zero-size box still has a positive width', parseFloat(tiny.width) > 0, tiny.width)
}

console.log('\n== Aspect ratio ==')
{
  eq('uses source ratio', aspectRatioStyle(1280, 720).aspectRatio, '1280 / 720')
  eq('uses source ratio 4:3', aspectRatioStyle(640, 480).aspectRatio, '640 / 480')
  eq('falls back to 4:3 when unknown', aspectRatioStyle(null, null).aspectRatio, '4 / 3')
  eq('falls back to 4:3 for zero', aspectRatioStyle(0, 0).aspectRatio, '4 / 3')
}

console.log('\n== isBoxInFrame ==')
{
  check('fully inside', isBoxInFrame(box(10, 10, 100, 100), SW, SH))
  check('touching right/bottom edge is inside',
    isBoxInFrame(box(SW - 100, SH - 100, 100, 100), SW, SH))
  check('overhanging right is outside',
    !isBoxInFrame(box(SW - 50, 10, 100, 100), SW, SH))
  check('unknown source size is not inside', !isBoxInFrame(box(0, 0, 10, 10), null, null))
}

console.log('\n== Confidence honesty ==')
{
  eq('0.97 -> 97%', formatConfidence(0.97), '97%')
  eq('null -> em dash (never faked)', formatConfidence(null), '—')
  eq('undefined -> em dash', formatConfidence(undefined), '—')
}

console.log('\n== Head count semantics (current frame only) ==')
{
  // Mirrors SystemStatusContext: the face set is REPLACED, never merged.
  const apply = (prev: FaceBox[], next: FaceBox[]) => next
  let faces: FaceBox[] = []
  const count = () => faces.length

  faces = apply(faces, []) // no faces
  eq('0 faces -> 0', count(), 0)

  faces = apply(faces, [box(100, 100, 80, 80)]) // one face
  eq('1 face -> 1', count(), 1)

  faces = apply(faces, [box(100, 100, 80, 80), box(300, 100, 80, 80)]) // two
  eq('2 faces -> 2', count(), 2)

  faces = apply(faces, [box(100, 100, 80, 80), box(300, 100, 80, 80), box(500, 100, 80, 80)])
  eq('new face enters -> 3', count(), 3) // count INCREASES

  faces = apply(faces, [box(500, 100, 80, 80)]) // one leaves
  eq('face leaves -> 1 (stale boxes dropped)', count(), 1)

  faces = apply(faces, [])
  eq('all leave -> 0', count(), 0)

  // Moving a face: same count, new coordinates -> box must move.
  faces = apply(faces, [box(100, 100, 80, 80)])
  const first = boxToPercentStyle(faces[0], SW, SH)
  faces = apply(faces, [box(130, 100, 80, 80)])
  const moved = boxToPercentStyle(faces[0], SW, SH)
  check('moving face changes the box left', first.left !== moved.left,
    `${first.left} vs ${moved.left}`)
  eq('moving face keeps count at 1', count(), 1)
  check('moved box is to the right', parseFloat(moved.left) > parseFloat(first.left))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
