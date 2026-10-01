/**
 * Centralized runtime configuration.
 *
 * Backend URLs are NEVER hardcoded in components. Everything reads from here
 * so Phase 5 can wire the WebSocket without touching page code.
 *
 * Values come from Vite environment variables (see frontend/.env.example).
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? 'ws://localhost:8000'

/** Strip a trailing slash so `${API_BASE_URL}/health` never doubles up. */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

export const config = {
  apiBaseUrl: trimTrailingSlash(API_BASE_URL),
  wsBaseUrl: trimTrailingSlash(WS_BASE_URL),
  /** REST endpoints used across the app. */
  endpoints: {
    health: `${trimTrailingSlash(API_BASE_URL)}/health`,
    status: `${trimTrailingSlash(API_BASE_URL)}/api/status`,
    history: `${trimTrailingSlash(API_BASE_URL)}/api/history`,
  },
  /** WebSocket endpoint. */
  wsUrl: `${trimTrailingSlash(WS_BASE_URL)}/ws`,
  /** Reconnect backoff bounds (ms). */
  reconnect: {
    initialDelayMs: 1000,
    maxDelayMs: 15000,
  },
} as const

export type AppConfig = typeof config