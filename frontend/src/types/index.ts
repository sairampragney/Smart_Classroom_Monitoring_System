/**
 * Types mirroring the ACTUAL FastAPI backend models.
 *
 * Source of truth:
 *   backend/app/models/common.py  -> ConnectionState, MonitoringState
 *   backend/app/models/sensors.py -> SensorReading
 *   backend/app/models/ws.py      -> WSMessageType, WSMessage envelope
 *   backend/app/models/health.py  -> HealthResponse
 *   backend/app/api/arduino.py    -> ArduinoStatusResponse, SensorResponse
 *
 * Keep these in sync with the backend. No anonymous object shapes in components.
 */

export type ConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'ERROR'
  | 'RECONNECTING'

export type CVState = 'STOPPED' | 'RUNNING' | 'ERROR'
export type MLState = 'NOT_LOADED' | 'LOADED' | 'ERROR'

/** Monitoring lifecycle (distinct from the physical connection state). */
export type MonitoringState = 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING'

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
  monitoring: MonitoringState
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

// ---------------------------------------------------------------------------
// Phase 4 REST contracts (backend/app/api/arduino.py)
// ---------------------------------------------------------------------------

export interface ArduinoStatusResponse {
  arduino: ConnectionState
  serial: ConnectionState
  monitoring: MonitoringState
  monitoring_running: boolean
  serial_port: string | null
  worker_running: boolean
  readings_received: number
  parse_errors: number
  sensor_error: string | null
  server_time: string
}

export interface SensorResponse {
  temperature: number | null
  humidity: number | null
  light: number | null
  motion: boolean | null
  err: string | null
  received_at: string | null
  has_data: boolean
}

export interface MonitoringResponse {
  monitoring: MonitoringState
  monitoring_running: boolean
  arduino: ConnectionState
  message: string
}

// ---------------------------------------------------------------------------
// Sensor readings
// ---------------------------------------------------------------------------

/**
 * One accepted Arduino sample.
 *
 * Every numeric field is `number | null` because the firmware deliberately
 * emits JSON `null` when a DHT22 read fails. The UI MUST show "no data" in
 * that case - never coerce null to 0.
 */
export interface SensorReading {
  temperature: number | null
  humidity: number | null
  light: number | null
  motion: boolean | null
  err: string | null
  received_at: string
}

/* NOTE: FaceBox is defined once further down, next to the Phase 6/7 CV
   contracts. Do not redeclare it here. */

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

/** The single server -> client envelope. */
export interface WSMessage<T = Record<string, unknown>> {
  type: WSMessageType
  timestamp: string
  payload: T
}

/** Payload of a `sensor_reading` message (backend/services/broadcaster.py). */
export interface SensorReadingPayload {
  temperature: number | null
  humidity: number | null
  light: number | null
  motion: boolean | null
  err: string | null
  received_at: string
}

/** Payload of an `arduino_status` message. */
export interface ArduinoStatusPayload {
  arduino: ConnectionState
  serial: ConnectionState
  monitoring: MonitoringState
  monitoring_running: boolean
  serial_port: string | null
}

// ---------------------------------------------------------------------------
// Phase 6/7 Computer vision contracts
//
// Mirrors backend/app/models/cv.py and the `face_detection` WebSocket payload
// produced by backend/app/services/cv_service.py.
// ---------------------------------------------------------------------------

/**
 * One detected face, in SOURCE camera-frame pixels.
 *
 * Coordinate contract (see docs/COMPUTER_VISION.md):
 *   origin (0,0) = top-left, +x right, +y down
 *   units        = pixels of the source frame
 */
export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
  /** Real detector score 0..1, or null when the detector supplies none. */
  confidence: number | null
  /** 5 landmark points, or an empty list - never invented. */
  landmarks?: number[][]
}

/** Payload of the `face_detection` WebSocket message. */
export interface FaceDetectionPayload {
  face_count: number
  faces: FaceBox[]
  frame_width: number
  frame_height: number
  detector: string
  fps: number | null
  frames_processed: number
  processed_at: string
}

/** GET /api/cv/status */
export interface CVStatusResponse {
  cv: string
  camera: string
  detector: string
  detector_ready: boolean
  worker_running: boolean
  camera_index: number
  face_count: number
  fps: number | null
  frames_processed: number
  source_width: number | null
  source_height: number | null
  error: string | null
  last_update: string | null
}

/**
 * How the CV panel should treat the data it is showing.
 * - live  : frames arriving and detections current
 * - stale : connection dropped or CV stopped; data must be marked as such
 * - none  : nothing has ever arrived
 */
// ---------------------------------------------------------------------------
// Phase 8 machine learning contracts
//
// Mirrors backend/app/services/ml_service.py and the `ml_prediction` payload.
// ---------------------------------------------------------------------------

/** One model's REAL measured metrics (never a placeholder). */
export interface MLMetrics {
  accuracy: number
  precision: number
  recall: number
  /** F1 for the OCCUPIED (positive) class - the selection criterion. */
  f1: number
  /** Macro-averaged F1, reported because the data is imbalanced. */
  f1_macro?: number
}

export interface MLModelResult {
  name: string
  metrics: MLMetrics
  cv_f1_mean: number
  cv_f1_std: number
  train_seconds: number
  /** Rows = true, cols = predicted: [[TN, FP], [FN, TP]] */
  confusion_matrix: number[][]
  supports_proba: boolean
}

export interface MLDatasetInfo {
  name: string
  source: string
  rows: number
  columns: number
  target_column: string
  target_transform: string
  missing_values: number
  duplicate_rows: number
  class_distribution: Record<string, number>
}

export interface MLInfo {
  loaded: boolean
  error: string | null
  model: string | null
  feature_names?: string[]
  supports_proba?: boolean
  metrics?: MLMetrics
  confusion_matrix?: number[][]
  all_model_results?: MLModelResult[]
  dataset?: MLDatasetInfo
  split?: Record<string, unknown>
  label_map?: Record<string, string>
}

/** Payload of the `ml_prediction` WebSocket message. */
export interface MLPredictionPayload {
  prediction: 'OCCUPIED' | 'EMPTY'
  /** Real probability, or null when the model cannot report one. */
  confidence: number | null
  model: string
  features: Record<string, number>
  source: string
  at: number
}

export type CvDataState = 'live' | 'stale' | 'none'

/** Lifecycle of the frontend's own WebSocket link. */
export type WsConnectionState = 'connecting' | 'open' | 'closed' | 'error'

/**
 * How the UI should treat a displayed sensor value.
 * - live  : a genuinely recent value from the Arduino
 * - stale : last known value, but nothing recent (must be marked as such)
 * - none  : never received anything
 */
export type DataFreshness = 'live' | 'stale' | 'none'