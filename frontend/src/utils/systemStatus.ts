/**
 * System status derivation (Phase 10).
 *
 * WHY THIS IS A PURE FUNCTION
 * ---------------------------
 * Turning raw state into a component list is exactly the logic most likely to
 * drift back into "hardcoded green lights". Keeping it pure - no React, no
 * fetch, no DOM - means every scenario in the status matrix can be asserted
 * directly:
 *
 *     node frontend/tests/systemStatus.test.ts
 *
 * THE ONE RULE THAT MATTERS MOST
 * ------------------------------
 * When the backend is unreachable, EVERY backend-derived component becomes
 * NOT_AVAILABLE. The last known state is never replayed, because a frozen
 * "Arduino CONNECTED" is a lie the moment the backend dies. Only the frontend
 * and the WebSocket (which the browser owns) keep their own real state.
 */

import type {
  ConnectionState,
  ServiceStatus,
  WsConnectionState,
} from '@/types'
import type { StatusTone } from '@/utils/status'

/** One row in the System page component grid. */
export interface SystemRow {
  name: string
  state: string
  detail: string
  tone: StatusTone
}

/** Everything the builder is allowed to look at. All of it is real state. */
export interface SystemStatusInput {
  /** null when the last /health call failed or has never succeeded. */
  services: ServiceStatus | null
  /** True while the very first health request is still in flight. */
  loading: boolean
  wsState: WsConnectionState
  /** True when the browser socket is retrying after a close. */
  wsRetrying?: boolean
  /** Frames the CV pipeline has processed this session (0 = never ran). */
  cvFramesProcessed?: number
  /**
   * Live connection state pushed over the WebSocket.
   *
   * The `arduino_status` message arrives the instant a board is unplugged,
   * whereas /health only reflects the last poll. When present it wins for the
   * Arduino and Serial rows, which is what makes those two update without a
   * page refresh. Still pure - the caller just supplies the real value.
   */
  liveConnection?: {
    arduino: ConnectionState
    serial: ConnectionState
    serial_port: string | null
  } | null
}

const UNAVAILABLE = 'NOT_AVAILABLE'

/** Tone for a lifecycle state, independent of the transport. */
function toneFor(state: string): StatusTone {
  switch (state) {
    case 'RUNNING':
    case 'CONNECTED':
    case 'LOADED':
    case 'READY':
      return 'ok'
    case 'CONNECTING':
    case 'RECONNECTING':
    case 'STARTING':
      return 'warn'
    case 'ERROR':
      return 'bad'
    case 'DISCONNECTED':
    case 'STOPPED':
    case 'NOT_LOADED':
    case 'NOT_INITIALIZED':
    case 'NOT_AVAILABLE':
      return 'idle'
    default:
      return 'violet'
  }
}

/** Map the browser's socket state onto the documented vocabulary. */
export function wsStateLabel(
  state: WsConnectionState,
  retrying = false,
): string {
  switch (state) {
    case 'open':
      return 'CONNECTED'
    case 'connecting':
      return 'CONNECTING'
    case 'error':
      return 'ERROR'
    case 'closed':
      // useWebSocket always schedules a backoff retry after a close, so
      // "closed" is an in-progress reconnect, not a permanent disconnect.
      return retrying ? 'RECONNECTING' : 'DISCONNECTED'
    default:
      return 'DISCONNECTED'
  }
}

/**
 * Camera has no dedicated enum of its own, so its displayed state is derived
 * from the CV lifecycle plus whether the pipeline ever produced a frame.
 *
 * NOT_INITIALIZED ("never opened") and STOPPED ("was open, now closed") are
 * genuinely different situations and are shown differently.
 */
export function cameraStateLabel(
  cv: string | undefined,
  camera: string | undefined,
  framesProcessed: number,
): string {
  if (camera === 'ERROR' || cv === 'ERROR') return 'ERROR'
  if (cv === 'RUNNING' && camera === 'CONNECTED') return 'RUNNING'
  if (camera === 'CONNECTING') return 'STARTING'
  // CV stopped. Distinguish "never ran" from "ran then stopped".
  return framesProcessed > 0 ? 'STOPPED' : 'NOT_INITIALIZED'
}

/** Build the technical-detail line for Computer Vision. */
export function cvDetail(s: ServiceStatus, framesProcessed: number): string {
  if (s.cv !== 'RUNNING') {
    return framesProcessed > 0
      ? 'Pipeline stopped'
      : 'Not started — start detection to begin'
  }
  const parts: string[] = []
  if (s.cv_detector) parts.push(s.cv_detector)
  // FPS is shown ONLY when the backend actually measured it.
  parts.push(s.cv_fps != null ? `${s.cv_fps.toFixed(2)} FPS` : 'FPS --')
  parts.push(`Head count ${s.head_count ?? '--'}`)
  return parts.join(' · ')
}

/** Build the technical-detail line for the ML model. */
export function mlDetail(s: ServiceStatus): string {
  if (s.ml === 'LOADED' && s.ml_model) return s.ml_model
  if (s.ml === 'ERROR') return s.ml_error || 'Model failed to load'
  return 'No model loaded — train it in Phase 8 tooling'
}

/** Build the technical-detail line for the database. */
export function dbDetail(s: ServiceStatus): string {
  const db = s.database
  if (db.status === 'ERROR') return db.error || 'Query failed'
  if (db.status === 'NOT_INITIALIZED') return 'Database not initialised'
  if (db.rows === 0) return 'Ready · no records stored yet'
  return `Ready · ${db.rows} record(s) stored`
}

/**
 * Derive every System page row from real state.
 *
 * Ordering is fixed so the dashboard reads top-down: local runtime first, then
 * the transport, then hardware, then the pipelines, then storage.
 */
export function buildSystemRows(input: SystemStatusInput): SystemRow[] {
  const { services: s, loading, wsState, wsRetrying, cvFramesProcessed } = input
  const frames = cvFramesProcessed ?? 0

  // The backend is only "up" once a real /health payload has arrived.
  const backendUp = s !== null

  const wsLabel = wsStateLabel(wsState, wsRetrying)

  const rows: SystemRow[] = [
    {
      name: 'Frontend',
      // Rendering this row proves the React runtime is alive. It says nothing
      // about the backend - that is what the next two rows are for.
      state: 'RUNNING',
      detail: 'React application is serving this page',
      tone: 'ok',
    },
    {
      name: 'Backend',
      state: backendUp ? 'RUNNING' : loading ? 'CONNECTING' : 'DISCONNECTED',
      detail: backendUp
        ? 'Health endpoint responded'
        : loading
          ? 'Waiting for the first health response'
          : 'No response from /health',
      tone: backendUp ? 'ok' : loading ? 'warn' : 'bad',
    },
    {
      name: 'FastAPI',
      state: backendUp ? 'RUNNING' : loading ? 'STARTING' : 'DISCONNECTED',
      detail: backendUp
        ? 'Application lifespan is running'
        : 'Server is not responding',
      tone: backendUp ? 'ok' : loading ? 'warn' : 'bad',
    },
    {
      name: 'WebSocket',
      state: wsLabel,
      detail: backendUp
        ? 'Live state channel to the backend'
        : 'Browser socket state (backend unreachable)',
      tone: toneFor(wsLabel),
    },
  ]

  if (!backendUp) {
    // Backend-derived components: one honest state, no invented detail.
    for (const name of [
      'Arduino', 'Serial', 'Camera', 'Computer Vision', 'ML Model', 'Database',
    ]) {
      rows.push({
        name,
        state: UNAVAILABLE,
        detail: 'State unknown — backend is unreachable',
        tone: 'idle',
      })
    }
    return rows
  }

  const svc = s as ServiceStatus
  const cam = cameraStateLabel(svc.cv, svc.camera, frames)

  // Live WebSocket state wins over the last /health poll for the serial link.
  const live = input.liveConnection
  const arduinoState = live?.arduino ?? svc.arduino
  const serialState = live?.serial ?? svc.serial
  const port = live?.serial_port ?? svc.serial_port

  rows.push(
    {
      name: 'Arduino',
      state: arduinoState,
      detail: port ? `Port ${port}` : 'No serial port connected',
      tone: toneFor(arduinoState),
    },
    {
      name: 'Serial',
      state: serialState,
      detail: port
        ? `Transport on ${port}`
        : 'pyserial transport idle',
      tone: toneFor(serialState),
    },
    {
      name: 'Camera',
      state: cam,
      detail:
        svc.cv === 'RUNNING'
          ? 'Capturing frames for detection'
          : frames > 0
            ? 'Camera released'
            : 'Not opened — CV has not been started',
      tone: toneFor(cam),
    },
    {
      name: 'Computer Vision',
      state: svc.cv,
      detail: cvDetail(svc, frames),
      tone: toneFor(svc.cv),
    },
    {
      name: 'ML Model',
      state: svc.ml,
      detail: mlDetail(svc),
      tone: toneFor(svc.ml),
    },
    {
      name: 'Database',
      state: svc.database.status,
      detail: dbDetail(svc),
      tone: toneFor(svc.database.status),
    },
  )

  return rows
}

/**
 * Overall verdict for the dashboard header.
 *
 * Deliberately conservative: an idle-but-correct system (Arduino unplugged, CV
 * stopped) is OPERATIONAL, not a failure. Only a real fault - a lost backend or
 * an explicit ERROR state - degrades the verdict.
 */
export function overallStatus(rows: SystemRow[]): {
  state: 'OPERATIONAL' | 'DEGRADED' | 'OFFLINE'
  tone: StatusTone
} {
  const byName = (n: string) => rows.find((r) => r.name === n)

  if (byName('Backend')?.state === 'DISCONNECTED') {
    return { state: 'OFFLINE', tone: 'bad' }
  }
  if (rows.some((r) => r.tone === 'bad')) {
    return { state: 'DEGRADED', tone: 'warn' }
  }
  return { state: 'OPERATIONAL', tone: 'ok' }
}
