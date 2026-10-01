import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface EmptyStateProps {
  title: string
  description: string
  /** Names the phase that will implement this - keeps placeholders honest. */
  phase?: string
  icon?: ReactNode
  className?: string
}

/**
 * Explicit "not implemented yet" panel.
 *
 * Used wherever functionality belongs to a later phase. It NEVER renders
 * placeholder numbers that could be mistaken for live readings.
 */
export function EmptyState({ title, description, phase, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed',
        'border-violet-500/20 bg-violet/[0.03] px-6 py-10 text-center',
        className,
      )}
    >
      {icon && <div className="mb-3 text-violet/60">{icon}</div>}
      <p className="text-sm font-semibold text-fg">{title}</p>
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-fg-muted">{description}</p>
      {phase && (
        <span className="mt-4 rounded-full border border-violet-500/25 bg-violet/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-soft">
          {phase}
        </span>
      )}
    </div>
  )
}