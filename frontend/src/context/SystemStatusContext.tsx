/**
 * System status context.
 *
 * Owns EXACTLY ONE WebSocket connection and one health fetch for the whole
 * application, so pages never open duplicate sockets. The System page and the
 * top bar both read from here.
 *
 * Phase 1 surfaces backend + WebSocket status from the verified Phase 2
 * backend. Arduino / camera / CV / ML states come through the same channel in
 * later phases; the shape of this context does not need to change.
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
import { getHealth, ApiError } from '@/services/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { HealthResponse, WsConnectionState, WSMessage } from '@/types'

interface SystemStatusValue {
  /** null while never fetched; used to distinguish "unknown" from "down". */
  health: HealthResponse | null
  healthError: string | null
  /** True only during the very first fetch. */
  loading: boolean
  wsState: WsConnectionState
  lastMessage: WSMessage | null
  messageCount: number
  refreshHealth: () => void
  reconnectWs: () => void
}

const SystemStatusContext = createContext<SystemStatusValue | null>(null)

export function SystemStatusProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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

  // Initial health fetch.
  useEffect(() => {
    const controller = new AbortController()
    void fetchHealth(controller.signal)
    return () => controller.abort()
  }, [fetchHealth])

  // Single shared WebSocket. The backend pushes an initial system_status on
  // connect, which keeps the UI fresh without polling.
  const handleMessage = useCallback((message: WSMessage) => {
    if (message.type === 'system_status' || message.type === 'hello') {
      void fetchHealth()
    }
  }, [fetchHealth])

  const { state, lastMessage, messageCount, reconnectNow } = useWebSocket(handleMessage)

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
    }),
    [health, healthError, loading, state, lastMessage, messageCount, fetchHealth, reconnectNow],
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