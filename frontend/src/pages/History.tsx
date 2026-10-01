import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusPill } from '@/components/ui/StatusPill'
import { Button } from '@/components/ui/Button'
import { getHistory } from '@/services/api'
import {
  formatConfidence,
  formatHeadCount,
  formatHumidity,
  formatLight,
  formatMotion,
  formatPrediction,
  formatTemperature,
  formatTimestamp,
} from '@/utils/historyFormat'
import type { HistoryRecord } from '@/types'

const COLUMNS = [
  'Timestamp', 'Temp', 'Humidity', 'Light', 'Motion', 'Head Count', 'ML',
] as const

const LIMIT = 100

export default function History() {
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const data = await getHistory(LIMIT, signal)
      setRecords(data.records)
      setTotal(data.total_rows)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setRecords([])
      setError(
        err instanceof Error ? err.message : 'History unavailable',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return (
    <>
      <PageHeader
        title="History"
        description="Persisted monitoring records: sensor values, visible head count and ML occupancy prediction, with timestamps."
        action={
          <>
            {total > 0 && (
              <StatusPill label={`${total} stored`} tone="violet" />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader
          title="Monitoring Records"
          subtitle={`Most recent ${LIMIT} · newest first`}
        />
        <CardBody>
          {error ? (
            <EmptyState
              title="History unavailable"
              description={error}
              phase="Backend offline"
            />
          ) : loading ? (
            <p className="py-10 text-center text-sm text-fg-muted">
              Loading history…
            </p>
          ) : records.length === 0 ? (
            <EmptyState
              title="NO HISTORY AVAILABLE"
              description="Records appear here once the backend recorder captures real sensor, CV or ML state. Nothing is inserted by this page."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-violet-500/15 text-[11px] uppercase tracking-[0.1em] text-fg-muted">
                    {COLUMNS.map((c) => (
                      <th key={c} className="py-2 pr-4 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-white/[0.04] font-mono text-[13px]"
                    >
                      <td className="py-2.5 pr-4 text-fg-muted">
                        {formatTimestamp(r.ts)}
                      </td>
                      <td className="py-2.5 pr-4 text-fg">
                        {formatTemperature(r.temperature)}
                      </td>
                      <td className="py-2.5 pr-4 text-fg">
                        {formatHumidity(r.humidity)}
                      </td>
                      <td className="py-2.5 pr-4 text-fg">
                        {formatLight(r.light)}
                      </td>
                      <td className="py-2.5 pr-4 text-fg">
                        {formatMotion(r.motion)}
                      </td>
                      <td className="py-2.5 pr-4 text-fg">
                        {formatHeadCount(r.head_count)}
                      </td>
                      <td className="py-2.5 text-fg">
                        {formatPrediction(r.ml_prediction)}
                        {r.ml_confidence != null && (
                          <span className="ml-1.5 text-fg-muted">
                            {formatConfidence(r.ml_confidence)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-fg-muted">
                Showing {records.length} of {total} stored record(s). “--” means
                the value was genuinely unavailable, not zero.
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  )
}