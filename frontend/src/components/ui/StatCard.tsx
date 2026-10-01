import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface StatCardProps {
  label: string
  /** Rendered as a muted em dash when no real value exists yet. */
  value?: string | number | null
  unit?: string
  /** Short status line under the value. */
  hint?: string
  /** Reserved for a per-card accent icon. */
  icon?: ReactNode
  /** True when the value is genuinely unavailable (never a fake zero). */
  pending?: boolean
}

export function StatCard({
  label,
  value,
  unit,
  hint,
  icon,
  pending = false,
}: StatCardProps) {
  const display =
    value === undefined || value === null || value === '' ? '—' : String(value)

  return (
    <div className="glass-card glass-card-hover p-4">
      <div className="flex items-center justify-between">
        <span className="section-label">{label}</span>
        {icon && <span className="text-violet/70">{icon}</span>}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span
          className={cn(
            'metric-value text-3xl',
            pending && 'text-fg-muted/50',
          )}
        >
          {display}
        </span>
        {unit && <span className="text-sm text-fg-muted">{unit}</span>}
      </div>

      <p className="mt-1.5 truncate text-xs text-fg-muted">
        {pending ? 'Awaiting live data' : hint ?? ' '}
      </p>
    </div>
  )
}