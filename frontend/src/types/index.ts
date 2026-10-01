/**
 * Types mirroring the Phase 2 backend contract
 * (backend/app/models/common.py, health.py, ws.py).
 *
 * Kept deliberately close to the Python definitions so the frontend/backend
 * contract stays explicit and reviewable.
 */

export type ConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'ERROR'

export type CVState = 'STOPPED' | 'RUNNING' | 'ERROR'
export type MLState = 'NOT_LOADED' | 'LOADED' | 'ERROR'

/** Runtime mode reported by the backend. Never silently faked. */
export type RuntimeMode = 'REAL_HARDWARE' | 'DEMO_MODE'

export interface ComponentHealth {
  name: string
  state: string
  detail: string
  healthy: boolean
}

export interface ServiceStatus {
  arduino: ConnectionState
  serial: ConnectionState
  camera: ConnectionState
  cv: CVState
  ml: MLState
  monitoring_running: boolean
  serial_port: string | null
}

export interface HealthResponse {
  status: string
  app: string
  version: string
  phase: string
  mode: RuntimeMode
  demo_mode: boolean
  uptime_s: number
  server_time: string
  websocket_clients: number
  components: ComponentHealth[]
  services: ServiceStatus
}

/** Sensor reading shape defined by the Arduino firmware (Phase 3/4). */
export interface SensorReading {
  temperature: number
  humidity: number
  light: number
  motion: boolean
  timestamp?: string
}

/** Detected face box in SOURCE camera coordinates (Phase 6/7). */
export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

/** Server -> client WebSocket message types (see backend/app/models/ws.py). */
export type WSMessageType =
  | 'hello'
  | 'system_status'
  | 'pong'
  | 'error'
  | 'sensor_reading'
  | 'arduino_status'
  | 'program_status'
  | 'cv_frame'
  | 'face_detection'
  | 'ml_prediction'

export interface WSMessage<T = Record<string, unknown>> {
  type: WSMessageType
  timestamp: string
  payload: T
}

/** Lifecycle of the frontend's own WebSocket link. */
export type WsConnectionState = 'connecting' | 'open' | 'closed' | 'error'