import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SensorSample } from '@/context/SystemStatusContext'
import { EmptyState } from '@/components/ui/EmptyState'

export interface SensorChartProps {
  data: SensorSample[]
  /** Which field of SensorSample to plot. */
  field: 'temperature' | 'humidity' | 'light'
  title: string
  unit: string
  /** Stroke colour; keep within the violet family for consistency. */
  color?: string
  height?: number
}

const COLORS: Record<SensorChartProps['field'], string> = {
  temperature: '#A855F7',
  humidity: '#6366F1',
  light: '#C084FC',
}

/**
 * Real-time line chart driven ONLY by received sensor messages.
 *
 * Notes:
 * - No demo/random data is ever injected. With no readings the chart is
 *   replaced by an explicit empty state.
 * - `null` values (a failed DHT read) are passed through as gaps rather than
 *   being drawn as zero, so the line correctly breaks.
 * - The parent owns a bounded rolling window; this component only renders it.
 */
export function SensorChart({
  data,
  field,
  title,
  unit,
  color,
  height = 200,
}: SensorChartProps) {
  // Only render a line once there is at least one real, non-null point.
  const hasData = data.some((d) => d[field] !== null && d[field] !== undefined)

  if (!hasData) {
    return (
      <EmptyState
        title={`${title} chart`}
        description="Points appear here as real sensor readings arrive over the WebSocket. No placeholder series is drawn."
        className="min-h-[160px]"
      />
    )
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="section-label">{title}</span>
        <span className="font-mono text-[11px] text-fg-muted">{unit}</span>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(139,92,246,0.12)" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v: number) =>
                new Date(v).toLocaleTimeString([], {
                  minute: '2-digit',
                  second: '2-digit',
                })
              }
              tick={{ fill: '#94A3B8', fontSize: 10 }}
              stroke="rgba(139,92,246,0.25)"
              minTickGap={28}
            />
            <YAxis
              tick={{ fill: '#94A3B8', fontSize: 10 }}
              stroke="rgba(139,92,246,0.25)"
              width={44}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                background: '#121022',
                border: '1px solid rgba(139,92,246,0.3)',
                borderRadius: 10,
                fontSize: 12,
              }}
              labelFormatter={(v) =>
                new Date(Number(v)).toLocaleTimeString()
              }
              formatter={(value) => [
                value === null || value === undefined ? 'no data' : `${value} ${unit}`,
                title,
              ]}
            />
            <Line
              type="monotone"
              dataKey={field}
              stroke={color ?? COLORS[field]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}