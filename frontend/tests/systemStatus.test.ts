/**
 * System status derivation tests (Phase 10).
 *
 * Run with Node's built-in TypeScript support (Node >= 22.6):
 *     node frontend/tests/systemStatus.test.ts
 *
 * Pure-function tests - no React, no DOM, no backend. They cover the status
 * matrix from the Phase 10 spec:
 *
 *   everything healthy / backend healthy + Arduino disconnected
 *   backend healthy + camera unavailable / backend healthy + ML unavailable
 *   WebSocket reconnecting / database ready / database error
 *   CV stopped / CV running / backend unavailable
 *
 * The single most important assertion in this file is near the end: when the
 * backend is unreachable, NO component may still be showing a green light.
 */

import {
  buildSystemRows,
  cameraStateLabel,
  cvDetail,
  dbDetail,
  mlDetail,
  overallStatus,
  wsStateLabel,
  type SystemRow,
} from '../src/utils/systemStatus.ts'
import type { ServiceStatus } from '../src/types/index.ts'

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

/** A fully-populated, healthy service status to mutate per scenario. */
function services(over: Partial<ServiceStatus> = {}): ServiceStatus {
  return {
    arduino: 'CONNECTED',
    serial: 'CONNECTED',
    camera: 'CONNECTED',
    cv: 'RUNNING',
    ml: 'LOADED',
    monitoring_running: true,
    monitoring: 'RUNNING',
    serial_port: 'COM5',
    cv_detector: 'YuNet',
    cv_fps: 30.88,
    head_count: 2,
    ml_model: 'DecisionTree',
    ml_error: null,
    database: {
      status: 'READY',
      rows: 128,
      last_record_ts: '2026-10-02T00:20:11+00:00',
      error: null,
    },
    ...over,
  }
}

const row = (rows: SystemRow[], name: string): SystemRow => {
  const found = rows.find((r) => r.name === name)
  if (!found) throw new Error(`missing row: ${name}`)
  return found
}

console.log('wsStateLabel')
eq('open -> CONNECTED', wsStateLabel('open'), 'CONNECTED')
eq('connecting -> CONNECTING', wsStateLabel('connecting'), 'CONNECTING')
eq('error -> ERROR', wsStateLabel('error'), 'ERROR')
eq('closed + retry -> RECONNECTING', wsStateLabel('closed', true), 'RECONNECTING')
eq('closed no retry -> DISCONNECTED', wsStateLabel('closed', false), 'DISCONNECTED')

console.log('\ncameraStateLabel')
eq('cv running + connected', cameraStateLabel('RUNNING', 'CONNECTED', 99), 'RUNNING')
eq('never opened', cameraStateLabel('STOPPED', 'DISCONNECTED', 0), 'NOT_INITIALIZED')
eq('was open, now stopped', cameraStateLabel('STOPPED', 'DISCONNECTED', 500), 'STOPPED')
eq('cv error', cameraStateLabel('ERROR', 'DISCONNECTED', 5), 'ERROR')
eq('camera error', cameraStateLabel('STOPPED', 'ERROR', 0), 'ERROR')
eq('connecting', cameraStateLabel('STOPPED', 'CONNECTING', 0), 'STARTING')

console.log('\nscenario: everything healthy')
{
  const rows = buildSystemRows({
    services: services(), loading: false, wsState: 'open', cvFramesProcessed: 500,
  })
  eq('ten components reported', rows.length, 10)
  eq('Backend RUNNING', row(rows, 'Backend').state, 'RUNNING')
  eq('FastAPI RUNNING', row(rows, 'FastAPI').state, 'RUNNING')
  eq('WebSocket CONNECTED', row(rows, 'WebSocket').state, 'CONNECTED')
  eq('Arduino CONNECTED', row(rows, 'Arduino').state, 'CONNECTED')
  eq('Serial CONNECTED', row(rows, 'Serial').state, 'CONNECTED')
  eq('Camera RUNNING', row(rows, 'Camera').state, 'RUNNING')
  eq('CV RUNNING', row(rows, 'Computer Vision').state, 'RUNNING')
  eq('ML LOADED', row(rows, 'ML Model').state, 'LOADED')
  eq('Database READY', row(rows, 'Database').state, 'READY')
  eq('overall OPERATIONAL', overallStatus(rows).state, 'OPERATIONAL')
  check('CV detail has real FPS', row(rows, 'Computer Vision').detail.includes('30.88 FPS'))
  check('CV detail has real head count', row(rows, 'Computer Vision').detail.includes('Head count 2'))
  eq('ML detail is the real model name', row(rows, 'ML Model').detail, 'DecisionTree')
  eq('DB detail shows row count', row(rows, 'Database').detail, 'Ready · 128 record(s) stored')
  eq('Arduino shows the real port', row(rows, 'Arduino').detail, 'Port COM5')
}


console.log('\nscenario: backend healthy + Arduino disconnected')
{
  const rows = buildSystemRows({
    services: services({ arduino: 'DISCONNECTED', serial: 'DISCONNECTED', serial_port: null }),
    loading: false, wsState: 'open', cvFramesProcessed: 500,
  })
  eq('Arduino DISCONNECTED', row(rows, 'Arduino').state, 'DISCONNECTED')
  eq('Serial DISCONNECTED (not ACTIVE)', row(rows, 'Serial').state, 'DISCONNECTED')
  eq('no port is claimed', row(rows, 'Arduino').detail, 'No serial port connected')
  eq('CV unaffected', row(rows, 'Computer Vision').state, 'RUNNING')
  eq('DB unaffected', row(rows, 'Database').state, 'READY')
  // An idle board is a normal state, not a fault.
  eq('overall still OPERATIONAL', overallStatus(rows).state, 'OPERATIONAL')
  check('disconnected is neutral, not red', row(rows, 'Arduino').tone === 'idle')
}

console.log('\nscenario: backend healthy + camera unavailable')
{
  const rows = buildSystemRows({
    services: services({ cv: 'ERROR', camera: 'ERROR' }),
    loading: false, wsState: 'open', cvFramesProcessed: 120,
  })
  eq('Camera ERROR', row(rows, 'Camera').state, 'ERROR')
  eq('CV ERROR', row(rows, 'Computer Vision').state, 'ERROR')
  eq('Arduino still fine', row(rows, 'Arduino').state, 'CONNECTED')
  eq('DB still fine', row(rows, 'Database').state, 'READY')
  check('error is red', row(rows, 'Camera').tone === 'bad')
  eq('overall DEGRADED', overallStatus(rows).state, 'DEGRADED')
}

console.log('\nscenario: backend healthy + ML unavailable')
{
  const rows = buildSystemRows({
    services: services({ ml: 'NOT_LOADED', ml_model: null }),
    loading: false, wsState: 'open', cvFramesProcessed: 10,
  })
  eq('ML NOT_LOADED', row(rows, 'ML Model').state, 'NOT_LOADED')
  check('no model name is invented', !row(rows, 'ML Model').detail.includes('DecisionTree'))
  eq('everything else healthy', row(rows, 'Arduino').state, 'CONNECTED')

  const err = buildSystemRows({
    services: services({ ml: 'ERROR', ml_model: null, ml_error: 'artifact missing' }),
    loading: false, wsState: 'open', cvFramesProcessed: 10,
  })
  eq('ML ERROR', row(err, 'ML Model').state, 'ERROR')
  eq('ML error surfaced', row(err, 'ML Model').detail, 'artifact missing')
  eq('overall DEGRADED on ML error', overallStatus(err).state, 'DEGRADED')
}

console.log('\nscenario: WebSocket reconnecting')
{
  const rows = buildSystemRows({
    services: services(), loading: false, wsState: 'closed', wsRetrying: true, cvFramesProcessed: 5,
  })
  eq('WebSocket RECONNECTING', row(rows, 'WebSocket').state, 'RECONNECTING')
  check('reconnecting is a warning, not a fault', row(rows, 'WebSocket').tone === 'warn')
  eq('Backend still RUNNING', row(rows, 'Backend').state, 'RUNNING')
  eq('overall still OPERATIONAL', overallStatus(rows).state, 'OPERATIONAL')
}

console.log('\nscenario: CV stopped (never started)')
{
  const rows = buildSystemRows({
    services: services({ cv: 'STOPPED', camera: 'DISCONNECTED', cv_fps: null, head_count: null }),
    loading: false, wsState: 'open', cvFramesProcessed: 0,
  })
  eq('CV STOPPED', row(rows, 'Computer Vision').state, 'STOPPED')
  eq('Camera NOT_INITIALIZED', row(rows, 'Camera').state, 'NOT_INITIALIZED')
  check('no FPS is fabricated', row(rows, 'Computer Vision').detail.includes('Not started'))
  check('no FPS number appears', !/\d+\.\d+ FPS/.test(row(rows, 'Computer Vision').detail))
  eq('overall OPERATIONAL (stopped is intentional)', overallStatus(rows).state, 'OPERATIONAL')
}

console.log('\nscenario: CV running but FPS not yet measured')
{
  const rows = buildSystemRows({
    services: services({ cv_fps: null, head_count: null }),
    loading: false, wsState: 'open', cvFramesProcessed: 1,
  })
  eq('CV RUNNING', row(rows, 'Computer Vision').state, 'RUNNING')
  check('FPS shown as --, not 0.00', row(rows, 'Computer Vision').detail.includes('FPS --'))
  check('head count shown as --, not 0', row(rows, 'Computer Vision').detail.includes('Head count --'))
}

console.log('\nscenario: database ready (empty)')
{
  const s = services({ database: { status: 'READY', rows: 0, last_record_ts: null, error: null } })
  eq('Database READY detail', dbDetail(s), 'Ready · no records stored yet')
  const rows = buildSystemRows({ services: s, loading: false, wsState: 'open', cvFramesProcessed: 3 })
  eq('ready DB is green', row(rows, 'Database').tone, 'ok')
}

console.log('\nscenario: database error')
{
  const s = services({ database: { status: 'ERROR', rows: 0, last_record_ts: null, error: 'disk I/O error' } })
  eq('error surfaced', dbDetail(s), 'disk I/O error')
  const rows = buildSystemRows({ services: s, loading: false, wsState: 'open', cvFramesProcessed: 3 })
  eq('Database ERROR', row(rows, 'Database').state, 'ERROR')

console.log('\nscenario: backend unavailable (the critical one)')
{
  const rows = buildSystemRows({
    services: null, loading: false, wsState: 'closed', wsRetrying: true, cvFramesProcessed: 900,
  })
  eq('all ten rows still present', rows.length, 10)
  eq('Backend DISCONNECTED', row(rows, 'Backend').state, 'DISCONNECTED')
  eq('FastAPI DISCONNECTED', row(rows, 'FastAPI').state, 'DISCONNECTED')
  eq('Frontend still RUNNING', row(rows, 'Frontend').state, 'RUNNING')
  eq('WebSocket still real', row(rows, 'WebSocket').state, 'RECONNECTING')
  eq('overall OFFLINE', overallStatus(rows).state, 'OFFLINE')

  for (const name of ['Arduino', 'Serial', 'Camera', 'Computer Vision', 'ML Model', 'Database']) {
    eq(`${name} NOT_AVAILABLE`, row(rows, name).state, 'NOT_AVAILABLE')
    check(`${name} is not green`, row(rows, name).tone !== 'ok')
  }
  check(
    'CRITICAL: nothing stays green while the backend is down',
    rows
      .filter((r) => r.name !== 'Frontend' && r.name !== 'WebSocket')
      .every((r) => r.tone !== 'ok'),
  )
}

console.log('\nscenario: first health poll still in flight')
{
  const rows = buildSystemRows({
    services: null, loading: true, wsState: 'connecting', cvFramesProcessed: 0,
  })
  eq('Backend CONNECTING (not DISCONNECTED)', row(rows, 'Backend').state, 'CONNECTING')
  check('connecting is a warning', row(rows, 'Backend').tone === 'warn')
  eq('FastAPI STARTING', row(rows, 'FastAPI').state, 'STARTING')
  eq('WebSocket CONNECTING', row(rows, 'WebSocket').state, 'CONNECTING')
}

console.log('\nscenario: live WebSocket state overrides the health poll')
{
  // /health still says CONNECTED, but the board was just unplugged and the
  // arduino_status message already arrived.
  const rows = buildSystemRows({
    services: services(), loading: false, wsState: 'open', cvFramesProcessed: 5,
    liveConnection: { arduino: 'DISCONNECTED', serial: 'DISCONNECTED', serial_port: null },
  })
  eq('Arduino reflects the live push', row(rows, 'Arduino').state, 'DISCONNECTED')
  eq('Serial reflects the live push', row(rows, 'Serial').state, 'DISCONNECTED')
}

console.log('\ndetail formatters never fabricate')
{
  const noFps = services({ cv_fps: null, head_count: null })
  check('cvDetail omits FPS when null', cvDetail(noFps, 4).includes('FPS --'))
  const notLoaded = services({ ml: 'NOT_LOADED', ml_model: null })
  eq(
    'mlDetail never names a model when NOT_LOADED',
    mlDetail(notLoaded).includes('DecisionTree'),
    false,
  )
  eq(
    'cvDetail never claims a head count when null',
    cvDetail(noFps, 4).includes('Head count 0'),
    false,
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

  check('DB error is red', row(rows, 'Database').tone === 'bad')
  // The rest of the dashboard must keep working.
  eq('Arduino still reported', row(rows, 'Arduino').state, 'CONNECTED')
  eq('CV still reported', row(rows, 'Computer Vision').state, 'RUNNING')
  eq('overall DEGRADED not OFFLINE', overallStatus(rows).state, 'DEGRADED')
}

console.log('\nscenario: database not initialized')
{
  const s = services({ database: { status: 'NOT_INITIALIZED', rows: 0, last_record_ts: null, error: null } })
  eq('not-initialised surfaced', dbDetail(s), 'Database not initialised')
}
