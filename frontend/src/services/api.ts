/**
 * Thin REST client.
 *
 * Phase 1 creates the contract only. Calls are made on demand by the System
 * page's manual refresh; live updates arrive over the WebSocket in Phase 5.
 * Nothing here fabricates data - a failed request surfaces as an Error.
 */

import { config } from '@/config/env'
import type {
  ArduinoStatusResponse,
  CVStatusResponse,
  HealthResponse,
  HistoryResponse,
  MLInfo,
  MonitoringResponse,
  SensorResponse,
} from '@/types'

/** Error carrying the HTTP status so the UI can report it accurately. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  url: string,
  init?: RequestInit,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { ...init, signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    // Network-level failure: backend down or blocked by CORS.
    throw new ApiError(
      `Cannot reach the backend at ${config.apiBaseUrl}. Is it running?`,
      0,
    )
  }

  if (!response.ok) {
    throw new ApiError(`Request failed: ${response.status}`, response.status)
  }
  return (await response.json()) as T
}

/** Fetch the backend health snapshot. */
export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>(config.endpoints.health, undefined, signal)
}

/** Current Arduino connection + monitoring state (Phase 4). */
export function getArduinoStatus(signal?: AbortSignal): Promise<ArduinoStatusResponse> {
  return request<ArduinoStatusResponse>(config.endpoints.arduinoStatus, undefined, signal)
}

/** Latest accepted sensor reading; nulls when nothing has arrived. */
export function getSensors(signal?: AbortSignal): Promise<SensorResponse> {
  return request<SensorResponse>(config.endpoints.arduinoSensors, undefined, signal)
}

/** Start/stop the CV engine (Phase 7). */
export function startCv(signal?: AbortSignal): Promise<{ cv: string; camera: string; message: string }> {
  return request(config.endpoints.cvStart, { method: 'POST' }, signal)
}

export function stopCv(signal?: AbortSignal): Promise<{ cv: string; camera: string; message: string }> {
  return request(config.endpoints.cvStop, { method: 'POST' }, signal)
}

/** Current CV pipeline status (Phase 7). */
export function getCVStatus(signal?: AbortSignal): Promise<CVStatusResponse> {
  return request<CVStatusResponse>(config.endpoints.cvStatus, undefined, signal)
}

/** Trained model, dataset profile and every model's REAL metrics (Phase 8). */
export function getMLInfo(signal?: AbortSignal): Promise<MLInfo> {
  return request<MLInfo>(config.endpoints.mlInfo, undefined, signal)
}

/** Recent monitoring history, newest first (Phase 9). */
export function getHistory(
  limit = 100,
  signal?: AbortSignal,
): Promise<HistoryResponse> {
  return request<HistoryResponse>(
    `${config.endpoints.history}?limit=${limit}`,
    undefined,
    signal,
  )
}

/**
 * Start monitoring. This is the backend half of the RUN PROGRAM button and
 * does NOT upload firmware - the board firmware must already be running.
 */
export function startMonitoring(signal?: AbortSignal): Promise<MonitoringResponse> {
  return request<MonitoringResponse>(
    config.endpoints.monitoringStart,
    { method: 'POST' },
    signal,
  )
}

/** Stop monitoring. The backend keeps running and can be restarted later. */
export function stopMonitoring(signal?: AbortSignal): Promise<MonitoringResponse> {
  return request<MonitoringResponse>(
    config.endpoints.monitoringStop,
    { method: 'POST' },
    signal,
  )
}