/**
 * Presentational helpers for status colouring.
 *
 * Green is reserved for genuinely positive semantics (CONNECTED / RUNNING /
 * FACE DETECTED). Everything else stays in the violet/neutral family so the
 * UI never turns into a rainbow.
 */

export type StatusTone = 'ok' | 'warn' | 'bad' | 'idle' | 'violet'

const TONE_DOT: Record<StatusTone, string> = {
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  bad: 'bg-status-bad',
  idle: 'bg-status-idle',
  violet: 'bg-violet',
}

const TONE_TEXT: Record<StatusTone, string> = {
  ok: 'text-status-ok',
  warn: 'text-status-warn',
  bad: 'text-status-bad',
  idle: 'text-fg-muted',
  violet: 'text-violet-soft',
}

const TONE_CHIP: Record<StatusTone, string> = {
  ok: 'bg-status-ok/10 text-status-ok border-status-ok/25',
  warn: 'bg-status-warn/10 text-status-warn border-status-warn/25',
  bad: 'bg-status-bad/10 text-status-bad border-status-bad/25',
  idle: 'bg-status-idle/10 text-fg-muted border-status-idle/25',
  violet: 'bg-violet/10 text-violet-soft border-violet/25',
}

export const tone = {
  dot: (t: StatusTone) => TONE_DOT[t],
  text: (t: StatusTone) => TONE_TEXT[t],
  chip: (t: StatusTone) => TONE_CHIP[t],
}

/** Map a backend state string to a tone. */
export function toneForState(state: string | null | undefined): StatusTone {
  switch (state) {
    case 'CONNECTED':
    case 'RUNNING':
    case 'LOADED':
    case 'ok':
      return 'ok'
    case 'CONNECTING':
    case 'ERROR':
      return 'bad'
    case 'DISCONNECTED':
    case 'STOPPED':
    case 'NOT_LOADED':
      return 'idle'
    default:
      return 'violet'
  }
}

/** Format an ISO timestamp for display; returns '—' when absent. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString()
}