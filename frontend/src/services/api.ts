/**
 * Thin REST client.
 *
 * Phase 1 creates the contract only. Calls are made on demand by the System
 * page's manual refresh; live updates arrive over the WebSocket in Phase 5.
 * Nothing here fabricates data - a failed request surfaces as an Error.
 */

import { config } from '@/config/env'
import type { HealthResponse } from '@/types'

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

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
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
  return request<HealthResponse>(config.endpoints.health, signal)
}