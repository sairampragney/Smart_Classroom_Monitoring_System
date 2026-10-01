/**
 * System + sensor status context.
 *
 * Owns EXACTLY ONE WebSocket connection and one health fetch for the entire
 * application. Pages never open their own socket, and route changes cannot
 * create duplicates.
 *
 * Data flow: backend WS message -> validated payload -> context state -> pages.
 * Nothing here invents a value; a `null` from the backend stays `null`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { config } from '@/config/env'
import {
  getArduinoStatus,
  getCVStatus,
  getHealth,
  getMLInfo,
  getSensors,
  startCv as apiStartCv,
  startMonitoring as apiStartMonitoring,
  stopCv as apiStopCv,
  stopMonitoring as apiStopMonitoring,
  ApiError,
} from '@/services/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import type {
  ArduinoStatusResponse,
  ConnectionState,
  CVStatusResponse,
  FaceBox,
  HealthResponse,
  MLInfo,
  MLPredictionPayload,
  MonitoringState,
  SensorReading,
  WSMessage,
  WsConnectionState,
} from '@/types'

/** One point on the rolling chart window. */
export interface SensorSample {
  /** Epoch ms, used as the chart X value. */
  t: number
  temperature: number | null
  humidity: number | null
  light: number | null
  motion: boolean | null
}

interface SystemStatusValue {
  // ---- backend ----
  health: HealthResponse | null
  healthError: string | null
  loading: boolean
  wsState: WsConnectionState
  lastMessage: WSMessage | null
  messageCount: number
  refreshHealth: () => void
  reconnectWs: () => void

  // ---- arduino (live, from WS) ----
  arduino: ArduinoStatusResponse | null
  connectionState: ConnectionState
  monitoring: MonitoringState
  monitoringRunning: boolean
  serialPort: string | null

  // ---- sensors (live, from WS) ----
  latest: SensorReading | null
  /** Epoch ms of the most recent sensor message, or null. */
  lastSensorAt: number | null
  /** Bounded rolling window for charts. */
  history: SensorSample[]
  /** True when data has been seen but is older than the stale threshold. */
  isStale: boolean

  // ---- actions ----
  startMonitoring: () => Promise<void>
  stopMonitoring: () => Promise<void>
  actionPending: boolean
  actionError: string | null

  // ---- computer vision (Phase 6/7) ----
  cvStatus: CVStatusResponse | null
  /** Current detection set ONLY - never accumulated across frames. */
  faces: FaceBox[]
  faceCount: number
  cvFps: number | null
  cvDetector: string
  cvFrameWidth: number | null
  cvFrameHeight: number | null
  /** Epoch ms of the most recent face_detection message. */
  lastDetectionAt: number | null
  cvError: string | null
  startCv: () => Promise<void>
  stopCv: () => Promise<void>
  cvPending: boolean
  /** MJPEG endpoint for the camera panel (null when the backend is down). */
  cvStreamUrl: string | null

  // ---- machine learning (Phase 8) ----
  mlInfo: MLInfo | null
  /** Latest sensor-based prediction, pushed over the same WebSocket. */
  mlPrediction: MLPredictionPayload | null
  refreshMl: () => void
}

const SystemStatusContext = createContext<SystemStatusValue | null>(null)

export function SystemStatusProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [arduino, setArduino] = useState<ArduinoStatusResponse | null>(null)
  const [latest, setLatest] = useState<SensorReading | null>(null)
  const [lastSensorAt, setLastSensorAt] = useState<number | null>(null)
  const [history, setHistory] = useState<SensorSample[]>([])
  const [clockTick, setClockTick] = useState(0) // drives the staleness re-render

  const [actionPending, setActionPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // ---- CV state (Phase 6/7) ----
  const [cvStatus, setCvStatus] = useState<CVStatusResponse | null>(null)
  const [faces, setFaces] = useState<FaceBox[]>([])
  const [faceCount, setFaceCount] = useState(0)
  const [cvFps, setCvFps] = useState<number | null>(null)
  const [cvFrameWidth, setCvFrameWidth] = useState<number | null>(null)
  const [cvFrameHeight, setCvFrameHeight] = useState<number | null>(null)
  const [lastDetectionAt, setLastDetectionAt] = useState<number | null>(null)

  // ---- ML state (Phase 8) ----
  const [mlInfo, setMlInfo] = useState<MLInfo | null>(null)
  const [mlPrediction, setMlPrediction] = useState<MLPredictionPayload | null>(null)

  const fetchHealth = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await getHealth(signal)
      setHealth(data)
      setHealthError(null)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setHealth(null)
      setHealthError(
        err instanceof ApiError
          ? err.message
          : 'Unexpected error while contacting the backend.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial snapshot: health + arduino state + last known reading.
  useEffect(() => {
    const controller = new AbortController()
    void fetchHealth(controller.signal)
    void getArduinoStatus(controller.signal)
      .then((s) => setArduino(s))
      .catch(() => undefined)
    void getSensors(controller.signal)
      .then((s) => {
        // has_data=false means nothing has ever arrived - keep nulls honest.
        if (s.has_data) {
          setLatest({
            temperature: s.temperature,
            humidity: s.humidity,
            light: s.light,
            motion: s.motion,
            err: s.err,
            received_at: s.received_at ?? new Date().toISOString(),
          })
          setLastSensorAt(Date.now())
        }
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [fetchHealth])

  // ---- WebSocket message handling (single shared socket) ---------------
  const handleMessage = useCallback(
    (message: WSMessage) => {
      switch (message.type) {
        case 'system_status':
        case 'hello':
          void fetchHealth()
          void getArduinoStatus()
            .then((s) => setArduino(s))
            .catch(() => undefined)
          break

        case 'arduino_status': {
          const p = message.payload as Record<string, unknown>
          setArduino((prev) => ({
            arduino: (p.arduino as ConnectionState) ?? 'DISCONNECTED',
            serial: (p.serial as ConnectionState) ?? 'DISCONNECTED',
            monitoring: (p.monitoring as MonitoringState) ?? 'STOPPED',
            monitoring_running: Boolean(p.monitoring_running),
            serial_port: (p.serial_port as string | null) ?? null,
            // Preserve counters that only the REST endpoint knows.
            worker_running: prev?.worker_running ?? false,
            readings_received: prev?.readings_received ?? 0,
            parse_errors: prev?.parse_errors ?? 0,
            sensor_error: prev?.sensor_error ?? null,
            server_time: message.timestamp,
          }))
          break
        }

        case 'sensor_reading': {
          const p = message.payload as Record<string, unknown>
          const reading: SensorReading = {
            temperature: (p.temperature as number | null) ?? null,
            humidity: (p.humidity as number | null) ?? null,
            light: (p.light as number | null) ?? null,
            motion: (p.motion as boolean | null) ?? null,
            err: (p.err as string | null) ?? null,
            received_at: (p.received_at as string) ?? message.timestamp,
          }
          setLatest(reading)
          const now = Date.now()
          setLastSensorAt(now)
          setHistory((prev) => {
            const appended: SensorSample[] = [
              ...prev,
              {
                t: now,
                temperature: reading.temperature,
                humidity: reading.humidity,
                light: reading.light,
                motion: reading.motion,
              },
            ]
            // Bounded window - never grows without limit.
            return appended.length > config.chartPointLimit
              ? appended.slice(-config.chartPointLimit)
              : appended
          })
          break
        }

        case 'face_detection': {
          // Replace the whole current set. Never merge with the previous
          // frame: a face that left must simply be absent, which is what
          // makes the head count fall correctly.
          const p = message.payload as Record<string, unknown>
          const nextFaces = (p.faces as FaceBox[] | undefined) ?? []
          setFaces(nextFaces)
          setFaceCount(
            typeof p.face_count === 'number' ? p.face_count : nextFaces.length,
          )
          setCvFps(typeof p.fps === 'number' ? p.fps : null)
          setCvFrameWidth(typeof p.frame_width === 'number' ? p.frame_width : null)
          setCvFrameHeight(
            typeof p.frame_height === 'number' ? p.frame_height : null,
          )
          setLastDetectionAt(Date.now())
          break
        }

        case 'ml_prediction': {
          setMlPrediction(message.payload as unknown as MLPredictionPayload)
          break
        }

        default:
          break
      }
    },
    [fetchHealth],
  )

  const { state, lastMessage, messageCount, reconnectNow } = useWebSocket(handleMessage)

  // Re-render once a second while data is flowing so staleness stays honest.
  useEffect(() => {
    if (lastSensorAt === null) return
    const id = setInterval(() => setClockTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [lastSensorAt])

  const isStale = useMemo(
    () =>
      lastSensorAt !== null && Date.now() - lastSensorAt > config.staleAfterMs,
    // clockTick re-evaluates the comparison on each tick.
    [lastSensorAt, clockTick],
  )

  // ---- RUN PROGRAM actions --------------------------------------------
  const handleStart = useCallback(async () => {
    setActionPending(true)
    setActionError(null)
    try {
      await apiStartMonitoring()
      setArduino(await getArduinoStatus())
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to start monitoring.',
      )
    } finally {
      setActionPending(false)
    }
  }, [])

  const handleStop = useCallback(async () => {
    setActionPending(true)
    setActionError(null)
    try {
      await apiStopMonitoring()
      setArduino(await getArduinoStatus())
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to stop monitoring.',
      )
    } finally {
      setActionPending(false)
    }
  }, [])

  // ---- CV actions ---------------------------------------------------
  const refreshCv = useCallback(async () => {
    try {
      setCvStatus(await getCVStatus())
    } catch {
      /* backend down - healthError already reflects it */
    }
  }, [])

  const handleStartCv = useCallback(async () => {
    try {
      await apiStartCv()
      await refreshCv()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to start detection.',
      )
    }
  }, [refreshCv])

  const handleStopCv = useCallback(async () => {
    try {
      await apiStopCv()
      // Clearing the faces immediately is correct: detection has stopped, so
      // showing the previous boxes would be presenting stale data as live.
      setFaces([])
      setFaceCount(0)
      setLastDetectionAt(null)
      await refreshCv()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to stop detection.',
      )
    }
  }, [refreshCv])

  const cvPending = cvStatus?.cv === 'RUNNING' && !cvStatus.detector_ready

  const refreshMl = useCallback(async () => {
    try {
      setMlInfo(await getMLInfo())
    } catch {
      /* backend down - healthError already reflects it */
    }
  }, [])

  // Load the trained-model metadata once, alongside the first health fetch.
  useEffect(() => {
    void refreshMl()
  }, [refreshMl])

  const value = useMemo<SystemStatusValue>(
    () => ({
      health,
      healthError,
      loading,
      wsState: state,
      lastMessage,
      messageCount,
      refreshHealth: () => void fetchHealth(),
      reconnectWs: reconnectNow,

      arduino,
      connectionState:
        arduino?.arduino ?? health?.services.arduino ?? 'DISCONNECTED',
      monitoring: arduino?.monitoring ?? health?.services.monitoring ?? 'STOPPED',
      monitoringRunning:
        arduino?.monitoring_running ?? health?.services.monitoring_running ?? false,
      serialPort: arduino?.serial_port ?? health?.services.serial_port ?? null,

      latest,
      lastSensorAt,
      history,
      isStale,

      startMonitoring: handleStart,
      stopMonitoring: handleStop,
      actionPending,
      actionError,

      cvStatus,
      faces,
      faceCount,
      cvFps,
      cvDetector: cvStatus?.detector ?? '—',
      cvFrameWidth,
      cvFrameHeight,
      lastDetectionAt,
      cvError: cvStatus?.error ?? null,
      startCv: handleStartCv,
      stopCv: handleStopCv,
      cvPending,
      cvStreamUrl: health ? config.endpoints.cvStream : null,

      mlInfo,
      mlPrediction,
      refreshMl: () => void refreshMl(),
    }),
    [
      health, healthError, loading, state, lastMessage, messageCount, fetchHealth,
      reconnectNow, arduino, latest, lastSensorAt, history, isStale,
      handleStart, handleStop, actionPending, actionError,
      cvStatus, faces, faceCount, cvFps, cvFrameWidth, cvFrameHeight,
      lastDetectionAt, handleStartCv, handleStopCv, cvPending,
      mlInfo, mlPrediction, refreshMl,
    ],
  )

  return (
    <SystemStatusContext.Provider value={value}>{children}</SystemStatusContext.Provider>
  )
}

export function useSystemStatus(): SystemStatusValue {
  const ctx = useContext(SystemStatusContext)
  if (!ctx) {
    throw new Error('useSystemStatus must be used inside <SystemStatusProvider>')
  }
  return ctx
}