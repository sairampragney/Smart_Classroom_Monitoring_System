import type { SensorSample } from '@/context/SystemStatusContext'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/utils/cn'

interface MotionTimelineProps {
  data: SensorSample[]
}

/**
 * Discrete motion history strip.
 *
 * Motion is a boolean, so forcing it into a continuous numeric chart would be
 * misleading. Each cell represents one received reading: green = motion,
 * dim = clear, hatched = no data.
 *
 * Reversed so the newest reading is on the right.
 */
export function MotionTimeline({ data }: MotionTimelineProps) {
  if (data.length === 0) {
    return (
      <EmptyState
        title="No motion history"
        description="One cell is added per received sensor reading. Nothing is pre-filled."
        className="min-h-[120px]"
      />
    )
  }

  const cells = [...data].reverse()

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {cells.map((sample, i) => {
          const isMotion = sample.motion === true
          const unknown = sample.motion === null || sample.motion === undefined
          return (
            <span
              key={`${sample.t}-${i}`}
              title={new Date(sample.t).toLocaleTimeString()}
              className={cn(
                'h-7 w-3 rounded-sm border',
                unknown
                  ? 'border-dashed border-white/10 bg-white/[0.02]'
                  : isMotion
                    ? 'border-status-ok/60 bg-status-ok/70'
                    : 'border-violet-500/20 bg-violet/10',
              )}
            />
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[10px] text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-status-ok/60 bg-status-ok/70" />
          Motion
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-violet-500/20 bg-violet/10" />
          Clear
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-white/10 bg-white/[0.02]" />
          No data
        </span>
      </div>
      <p className="mt-2 text-[11px] text-fg-muted">Newest on the right.</p>
    </div>
  )
}