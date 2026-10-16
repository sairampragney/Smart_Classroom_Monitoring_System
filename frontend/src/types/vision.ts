export interface DetectionResult {
  class: string
  score: number
  bbox: [number, number, number, number] // [x, y, width, height]
}

export type MovementStatus = 'NO_MOVEMENT' | 'SLIGHT_MOVEMENT' | 'SIGNIFICANT_MOVEMENT' | 'UNKNOWN'

export interface AnalysisResult {
  id: string
  timestamp: string
  personCount: number
  detections: DetectionResult[]
  movementStatus: MovementStatus
  processingTimeMs: number
  modelName: string
  modelVersion: string
  imageDataUrl?: string
  frameWidth: number
  frameHeight: number
}

export interface DetectionEvent {
  id: string
  timestamp: string
  personCount: number
  maxConfidence: number
  movementStatus: MovementStatus
}

export interface SessionMetrics {
  currentCount: number
  maxOccupancy: number
  framesAnalyzed: number
  avgInferenceMs: number
  totalEvents: number
  movementStatus: MovementStatus
}

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'processing' | 'error'
