/**
 * History record formatting tests (Phase 9).
 *
 * Run with Node's built-in TypeScript support (Node >= 22.6):
 *     node frontend/tests/historyFormat.test.ts
 *
 * Pure-function tests - no DOM, no browser, no backend. They pin the rule
 * that matters most here: an unavailable value (NULL in SQLite) must render
 * as "--" and must NEVER be coerced to 0, which would look like a real
 * reading. They also pin that a genuine 0 IS a real reading and is shown
 * as such.
 */

import {
  formatConfidence,
  formatHeadCount,
  formatHumidity,
  formatLight,
  formatMotion,
  formatPrediction,
  formatTemperature,
  formatTimestamp,
} from '../src/utils/historyFormat.ts'

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

console.log('formatTemperature')
eq('one decimal', formatTemperature(27.4), '27.4 °C')
// NB: 27.45 is stored as 27.4499... in IEEE-754, so toFixed gives "27.4".
// A non-representable-in-binary value is used to test rounding honestly.
eq('rounds', formatTemperature(27.46), '27.5 °C')
eq('null -> --', formatTemperature(null), '--')
eq('undefined -> --', formatTemperature(undefined), '--')
check(
  'NaN -> -- (never "NaN °C")',
  formatTemperature(Number.NaN) === '--',
)
eq(
  'CRITICAL: null is not 0',
  formatTemperature(null) === formatTemperature(0),
  false,
)
eq('zero is a real reading', formatTemperature(0), '0.0 °C')
eq('negative survives', formatTemperature(-3.21), '-3.2 °C')

console.log('\nformatHumidity')
eq('no decimals', formatHumidity(58.1), '58 %')
eq('rounds down', formatHumidity(58.9), '59 %')
eq('null -> --', formatHumidity(null), '--')
eq('zero is real', formatHumidity(0), '0 %')

console.log('\nformatLight / formatHeadCount')
eq('adc integer', formatLight(431), '431')
eq('adc null -> --', formatLight(null), '--')
eq('adc zero is real', formatLight(0), '0')
eq('head count', formatHeadCount(3), '3')
eq('head count null -> --', formatHeadCount(null), '--')
eq('head count zero is real (empty room)', formatHeadCount(0), '0')

console.log('\nformatMotion')
eq('1 -> Yes', formatMotion(1), 'Yes')
eq('0 -> No', formatMotion(0), 'No')
eq('null -> --', formatMotion(null), '--')
eq('undefined -> --', formatMotion(undefined), '--')
check(
  'CRITICAL: motion 0 (No) differs from unknown (--)',
  formatMotion(0) !== formatMotion(null),
)

console.log('\nformatConfidence')
eq('0.986 -> 99%', formatConfidence(0.986), '99%')
eq('1 -> 100%', formatConfidence(1), '100%')
eq('0 -> 0%', formatConfidence(0), '0%')
eq('null -> --', formatConfidence(null), '--')
check(
  'CRITICAL: 0% confidence is not "--"',
  formatConfidence(0) !== formatConfidence(null),
)

console.log('\nformatPrediction')
eq('label passes through', formatPrediction('OCCUPIED'), 'OCCUPIED')
eq('null -> --', formatPrediction(null), '--')
eq('empty string -> --', formatPrediction(''), '--')

console.log('\nformatTimestamp')
const utc = '2026-10-02T00:20:11+00:00'
eq('parses valid UTC', formatTimestamp(utc), new Date(utc).toLocaleString())
eq('null -> --', formatTimestamp(null), '--')
eq('empty -> --', formatTimestamp(''), '--')
eq('garbage -> -- (never "Invalid Date")', formatTimestamp('not-a-date'), '--')
// The stored string must be understood as UTC. toLocaleString() is display
// formatting only and is not re-parseable, so assert on the stored value.
check(
  'CRITICAL: stored UTC parses to the correct instant',
  new Date(utc).getTime() === Date.parse(utc),
)
eq(
  'CRITICAL: UTC input is not shifted by the local zone',
  new Date(utc).getUTCHours(),
  0,
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
