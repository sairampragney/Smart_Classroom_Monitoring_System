/**
 * WebSocket hook: connection lifecycle + message dispatch.
 *
 * Responsibilities (required by the spec):
 *  - connect automatically on mount
 *  - reconnect with exponential backoff after a failure
 *  - never create duplicate connections
 *  - clean up timers and sockets on unmount
 *  - expose the live connection state
 *
 * Phase 1 wires this to the verified Phase 2 backend for backend/WebSocket
 * status only. Arduino / CV / ML message types are already defined in the
 * protocol; Phase 5+ adds their handlers without changing this hook.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from '@/config/env'
import type { WsConnectionState, WSMessage } from '@/types'

type Handler = (message: WSMessage) => void

export interface UseWebSocketResult {
  state: WsConnectionState
  lastMessage: WSMessage | null
  /** Messages received since mount - useful for the System page. */
  messageCount: number
  send: (data: unknown) => boolean
  /** Force an immediate reconnect (used by the "Retry" control). */
  reconnectNow: () => void
}

export function useWebSocket(onMessage?: Handler): UseWebSocketResult {
  const [state, setState] = useState<WsConnectionState>('connecting')
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null)
  const [messageCount, setMessageCount] = useState(0)

  const socketRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closedByUsRef = useRef(false)
  // Keep the latest handler without forcing a reconnect on every render.
  const handlerRef = useRef<Handler | undefined>(onMessage)
  handlerRef.current = onMessage

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    // Guard: never open a second socket while one is live or opening.
    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return
    }

    clearTimer()
    setState('connecting')

    let socket: WebSocket
    try {
      socket = new WebSocket(config.wsUrl)
    } catch {
      // Invalid URL or blocked by the browser - surface as an error state.
      setState('error')
      return
    }
    socketRef.current = socket

    socket.onopen = () => {
      retryRef.current = 0
      setState('open')
    }

    socket.onmessage = (event: MessageEvent<string>) => {
      let parsed: WSMessage
      try {
        parsed = JSON.parse(event.data) as WSMessage
      } catch {
        // Malformed frame - ignore it rather than corrupting app state.
        return
      }
      setLastMessage(parsed)
      setMessageCount((n) => n + 1)
      handlerRef.current?.(parsed)
    }

    socket.onerror = () => {
      // The browser gives no useful detail here; 'onclose' drives the retry.
      setState('error')
    }

    socket.onclose = () => {
      socketRef.current = null
      if (closedByUsRef.current) return
      setState('closed')

      // Exponential backoff, capped.
      const delay = Math.min(
        config.reconnect.initialDelayMs * 2 ** retryRef.current,
        config.reconnect.maxDelayMs,
      )
      retryRef.current += 1
      timerRef.current = setTimeout(connect, delay)
    }
  }, [clearTimer])

  const disconnect = useCallback(() => {
    closedByUsRef.current = true
    clearTimer()
    const socket = socketRef.current
    socketRef.current = null
    if (socket) {
      socket.onclose = null
      socket.close()
    }
    setState('closed')
  }, [clearTimer])

  const reconnectNow = useCallback(() => {
    closedByUsRef.current = false
    retryRef.current = 0
    clearTimer()
    const socket = socketRef.current
    socketRef.current = null
    if (socket) {
      socket.onclose = null
      socket.close()
    }
    connect()
  }, [clearTimer, connect])

  const send = useCallback((data: unknown): boolean => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(data))
    return true
  }, [])

  // Connect on mount; tear everything down on unmount.
  useEffect(() => {
    closedByUsRef.current = false
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return { state, lastMessage, messageCount, send, reconnectNow }
}