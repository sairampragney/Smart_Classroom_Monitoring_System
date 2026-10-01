/**
 * History record formatting (Phase 9).
 *
 * WHY NULLABLE NUMBERS MATTER
 * ---------------------------
 * Every measurement column in the history table is nullable: a failed DHT
 * read is stored as NULL, never as 0. If these helpers fell back to 0 the UI
 * would display "0.0 °C" for a sensor that never answered, which reads as a
 * real measurement. Every unavailable value renders as "--" instead, so
 * "missing" stays visually distinct from "zero".
 *
 * Pure functions only - no DOM, no browser, no API calls - so they are
 * directly unit-testable with Node's built-in TypeScript support:
 *     node frontend/tests/historyFormat.test.ts
 */

/** A nullable value as stored in a history record. */
export type Maybe = number | null | undefined

/** True only for a real, finite number (0 is a real reading, null is not). */
function isReal(v: Maybe): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Format a temperature, e.g. 27.45 -> "27.5 °C"; null -> "--". */
export function formatTemperature(v: Maybe): string {
  return isReal(v) ? `${v.toFixed(1)} °C` : '--'
}

/** Format humidity with no decimals, e.g. 58.1 -> "58 %"; null -> "--". */
export function formatHumidity(v: Maybe): string {
  return isReal(v) ? `${v.toFixed(0)} %` : '--'
}

/** Format the raw LDR ADC count, e.g. 431 -> "431"; null -> "--". */
export function formatLight(v: Maybe): string {
  return isReal(v) ? `${v.toFixed(0)}` : '--'
}

/** Format the visible head count, e.g. 0 -> "0"; null -> "--". */
export function formatHeadCount(v: Maybe): string {
  return isReal(v) ? `${v.toFixed(0)}` : '--'
}

/**
 * Format stored motion (0/1) as Yes/No.
 *
 * A 0 is a genuine "no motion detected" reading and must NOT collapse to the
 * "--" placeholder, which is reserved for "unknown".
 */
export function formatMotion(v: Maybe): string {
  if (!isReal(v)) return '--'
  return v ? 'Yes' : 'No'
}

/** Format an ML confidence 0-1 as a whole percentage, e.g. 0.986 -> "99%". */
export function formatConfidence(v: Maybe): string {
  return isReal(v) ? `${(v * 100).toFixed(0)}%` : '--'
}

/** Format the ML prediction label; null -> "--". */
export function formatPrediction(v: string | null | undefined): string {
  return v ? v : '--'
}

/**
 * Render a stored ISO-8601 UTC timestamp in the viewer's local time.
 *
 * The stored value is always UTC (written by the backend, never by the
 * browser); toLocaleString() is display formatting only. An unparseable
 * string yields "--" rather than "Invalid Date".
 */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--'
  return d.toLocaleString()
}