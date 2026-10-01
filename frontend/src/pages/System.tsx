import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatusPill, KeyValue } from '@/components/ui/StatusPill'
import { Button } from '@/components/ui/Button'
import { useSystemStatus } from '@/context/SystemStatusContext'
import { formatTime } from '@/utils/status'
import {
  buildSystemRows,
  overallStatus,
  type SystemRow,
} from '@/utils/systemStatus'

/**
 * How often this page re-reads /health while it is mounted.
 *
 * The shared WebSocket already streams Arduino/CV/ML *changes* instantly, but
 * a few things exist only in the health snapshot: the database probe, the
 * measured CV FPS and the loaded model name. A 2 s poll keeps those honest
 * without opening any new socket - the page reuses the one shared WebSocket.
 */
const HEALTH_POLL_MS = 2000

export default function System() {
  const {
    health,
    healthError,
    loading,
    wsState,
    messageCount,
    cvStatus,
    arduino,
    refreshHealth,
    reconnectWs,
  } = useSystemStatus()

  // Local tick so the "last poll" line stays honest between updates.
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now())

  useEffect(() => {
    const id = setInterval(() => {
      refreshHealth()
      setLastRefresh(Date.now())
    }, HEALTH_POLL_MS)
    return () => clearInterval(id)
  }, [refreshHealth])

  const rows = useMemo<SystemRow[]>(
    () =>
      buildSystemRows({
        services: health?.services ?? null,
        loading,
        wsState,
        // useWebSocket schedules a backoff retry after any close, so a closed
        // socket is reported as an in-progress reconnect, not a dead link.
        wsRetrying: wsState === 'closed',
        cvFramesProcessed: cvStatus?.frames_processed ?? 0,
        liveConnection: arduino
          ? {
              arduino: arduino.arduino,
              serial: arduino.serial,
              serial_port: arduino.serial_port,
            }
          : null,
      }),
    [health?.services, loading, wsState, cvStatus?.frames_processed, arduino],
  )

  const overall = overallStatus(rows)
  const okCount = rows.filter((r) => r.tone === 'ok').length
  const db = health?.services.database

  return (
    <>
      <PageHeader
        title="System"
        description="Live health of every component. Each status is derived from real runtime state — nothing here is hardcoded."
        action={
          <>
            <StatusPill label={overall.state} tone={overall.tone} />
            <StatusPill
              label={`${okCount}/${rows.length} healthy`}
              tone="violet"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refreshHealth()
                setLastRefresh(Date.now())
              }}
            >
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={reconnectWs}>
              Reconnect WS
            </Button>
          </>
        }
      />

      {healthError && (
        <div className="mb-6 rounded-xl border border-status-bad/30 bg-status-bad/10 px-4 py-3">
          <p className="text-sm font-semibold text-status-bad">
            Backend unreachable
          </p>
          <p className="mt-1 text-xs text-fg-muted">{healthError}</p>
          <p className="mt-2 text-xs text-fg-muted">
            Component states below are marked NOT_AVAILABLE because they cannot
            be verified while the backend is down.
          </p>
        </div>
      )}

      {/* ---- System overview ---- */}
      <Card className="mb-4">
        <CardHeader
          title="System Overview"
          subtitle="Overall local application status"
        />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.1em] text-fg-muted">
              Overall
            </p>
            <p className="mt-1">
              <StatusPill
                label={overall.state}
                tone={overall.tone}
                pulse={overall.tone === 'ok'}
              />
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.1em] text-fg-muted">
              Active components
            </p>
            <p className="mt-1 font-mono text-sm text-fg">
              {okCount} of {rows.length}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.1em] text-fg-muted">
              Last health poll
            </p>
            <p className="mt-1 font-mono text-sm text-fg">
              {new Date(lastRefresh).toLocaleTimeString()}
            </p>
          </div>
        </CardBody>
      </Card>

      {/* ---- Component health ---- */}
      <p className="section-label">Component Health</p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <Card key={row.name} interactive>
            <CardBody className="flex items-center justify-between gap-4 py-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">{row.name}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                  {row.detail}
                </p>
              </div>
              <StatusPill
                label={row.state}
                tone={row.tone}
                pulse={row.tone === 'ok'}
                className="shrink-0"
              />
            </CardBody>
          </Card>
        ))}
      </div>


      {/* ---- Technical details ---- */}
      <p className="section-label mt-8">Technical Details</p>
      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Runtime" />
          <CardBody className="space-y-1">
            <KeyValue label="Mode" value={health?.mode ?? '—'} />
            <KeyValue
              label="Version"
              value={health ? `v${health.version} · Phase ${health.phase}` : '—'}
            />
            <KeyValue
              label="Uptime"
              value={health ? `${health.uptime_s.toFixed(1)}s` : '—'}
            />
            <KeyValue label="Server time" value={formatTime(health?.server_time)} />
            <KeyValue label="WS messages" value={String(messageCount)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Hardware & Pipelines" />
          <CardBody className="space-y-1">
            <KeyValue
              label="Serial port"
              value={arduino?.serial_port ?? health?.services.serial_port ?? '—'}
            />
            <KeyValue label="CV detector" value={cvStatus?.detector ?? '—'} />
            <KeyValue
              label="CV FPS"
              // Rendered only when the backend actually measured it.
              value={
                health?.services.cv_fps != null
                  ? health.services.cv_fps.toFixed(2)
                  : '—'
              }
            />
            <KeyValue
              label="Head count"
              value={health?.services.head_count ?? '—'}
            />
            <KeyValue label="ML model" value={health?.services.ml_model ?? '—'} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="History Database" />
          <CardBody className="space-y-1">
            <KeyValue
              label="Status"
              value={db?.status ?? 'NOT_AVAILABLE'}
              tone={
                db?.status === 'READY'
                  ? 'ok'
                  : db?.status === 'ERROR'
                    ? 'bad'
                    : 'idle'
              }
            />
            <KeyValue label="Stored records" value={db ? String(db.rows) : '—'} />
            <KeyValue
              label="Latest record"
              value={
                db?.last_record_ts
                  ? new Date(db.last_record_ts).toLocaleString()
                  : '—'
              }
            />
            {db?.error && (
              <p className="pt-2 text-xs text-status-bad">{db.error}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Data Flow" />
          <CardBody>
            <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-fg-muted">{`Arduino ──USB──> pyserial ──┐
                            ├──> FastAPI ──WS──> React
Camera ──> OpenCV ──────────┘
                              └──> SQLite history`}</pre>
            <p className="mt-3 text-xs leading-relaxed text-fg-muted">
              A disconnected component turns only itself unhealthy — the rest of
              the pipeline keeps running. States are pushed over the shared
              WebSocket; this page additionally re-reads /health every 2 s so
              database and FPS values stay current.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
