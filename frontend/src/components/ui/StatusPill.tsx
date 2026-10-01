import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { tone, type StatusTone } from '@/utils/status'

interface StatusPillProps {
  label: string
  tone: StatusTone
  /** Adds a gentle pulsing ring - only appropriate for LIVE states. */
  pulse?: boolean
  className?: string
}

/**
 * Semantic status chip. Green appears only for genuinely positive states.
 */
export function StatusPill({ label, tone: t, pulse = false, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1',
        'text-[11px] font-semibold uppercase tracking-[0.1em]',
        tone.chip(t),
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {pulse && (
          <span
            className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', tone.dot(t))}
          />
        )}
        <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', tone.dot(t))} />
      </span>
      {label}
    </span>
  )
}

interface KeyValueProps {
  label: string
  value: ReactNode
  tone?: StatusTone
  /** Optional secondary line under the value. */
  hint?: string
}

/** Label/value row used in status panels. */
export function KeyValue({ label, value, tone: t, hint }: KeyValueProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="shrink-0 text-sm text-fg-muted">{label}</span>
      <span className="min-w-0 text-right">
        <span className={cn('block font-mono text-sm tabular-nums', t ? tone.text(t) : 'text-fg')}>
          {value}
        </span>
        {hint && <span className="block text-[11px] text-fg-muted">{hint}</span>}
      </span>
    </div>
  )
}