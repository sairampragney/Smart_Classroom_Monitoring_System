import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { Button } from '@/components/ui/Button'
import { KeyValue } from '@/components/ui/StatusPill'
import { useSystemStatus } from '@/context/SystemStatusContext'
import { toneForState, formatTime, type StatusTone } from '@/utils/status'
import type { ConnectionState, CVState, MLState } from '@/types'

interface Row {
  name: string
  state: string
  detail: string
  tone: StatusTone
}

/** Map real backend state onto the nine components the spec requires. */
function buildRows(
  health: ReturnType<typeof useSystemStatus>['health'],
  wsState: string,
  loading: boolean,
): Row[] {
  const s = health?.services
  const backendUp = Boolean(health) && !loading

  const conn = (v: ConnectionState | undefined): StatusTone => toneForState(v)

  return [
    {
      name: 'Frontend',
      state: 'RUNNING',
      detail: 'React app served by Vite',
      tone: 'ok',
    },
    {
      name: 'Backend',
      state: backendUp ? 'RUNNING' : 'DOWN',
      detail: backendUp ? `Phase ${health?.phase} · v${health?.version}` : 'No health response',
      tone: backendUp ? 'ok' : 'bad',
    },
    {
      name: 'FastAPI',
      state: backendUp ? 'ACTIVE' : 'INACTIVE',
      detail: backendUp ? 'App lifespan running' : 'Not responding',
      tone: backendUp ? 'ok' : 'bad',
    },
    {
      name: 'WebSocket',
      state: wsState.toUpperCase(),
      detail: health ? `${health.websocket_clients} client(s) connected` : 'No backend',
      tone:
        wsState === 'open' ? 'ok' : wsState === 'connecting' ? 'warn' : 'bad',
    },
    {
      name: 'Arduino',
      state: s?.arduino ?? 'UNKNOWN',
      detail: s?.serial_port ? `Port ${s.serial_port}` : 'No serial port bound',
      tone: conn(s?.arduino),
    },
    {
      name: 'Serial',
      state: s?.serial ?? 'UNKNOWN',
      detail: 'pyserial transport',
      tone: conn(s?.serial),
    },
    {
      name: 'Camera',
      state: s?.camera ?? 'UNKNOWN',
      detail: 'Capture device',
      tone: conn(s?.camera),
    },
    {
      name: 'Computer Vision',
      state: (s?.cv ?? 'STOPPED') as CVState,
      detail: 'OpenCV detection pipeline',
      tone: s?.cv === 'RUNNING' ? 'ok' : 'idle',
    },
    {
      name: 'ML Model',
      state: (s?.ml ?? 'NOT_LOADED') as MLState,
      detail: 'scikit-learn estimator',
      tone: s?.ml === 'LOADED' ? 'ok' : 'idle',
    },
  ]
}

export default function System() {
  const { health, healthError, loading, wsState, messageCount, refreshHealth, reconnectWs } =
    useSystemStatus()

  const rows = buildRows(health, wsState, loading)
  const healthyCount = rows.filter((r) => r.tone === 'ok').length

  return (
    <>
      <PageHeader
        title="System"
        description="Live health of every component in the pipeline. Each status is derived from actual runtime state, never assumed."
        action={
          <>
            <StatusPill label={`${healthyCount}/${rows.length} healthy`} tone="violet" />
            <Button variant="outline" size="sm" onClick={refreshHealth}>
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
          <p className="text-sm font-semibold text-status-bad">Backend unreachable</p>
          <p className="mt-1 text-xs text-fg-muted">{healthError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <Card key={row.name} interactive>
            <CardBody className="flex items-center justify-between gap-4 py-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">{row.name}</p>
                <p className="mt-0.5 truncate text-xs text-fg-muted">{row.detail}</p>
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

      {/* ---- Diagnostics ---- */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardBody className="space-y-1">
            <KeyValue label="Backend URL" value={health ? 'http://localhost:8000' : 'unreachable'} />
            <KeyValue label="Runtime mode" value={health?.mode ?? 'UNKNOWN'} />
            <KeyValue label="Uptime" value={health ? `${health.uptime_s.toFixed(1)}s` : '—'} />
            <KeyValue label="Server time" value={formatTime(health?.server_time)} />
            <KeyValue label="WS messages" value={String(messageCount)} />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="section-label">Pipeline</p>
            <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-relaxed text-fg-muted">{`Arduino ──USB──> pyserial ──┐
                            ├──> FastAPI ──WS──> React
Camera ──> OpenCV ─────────┘`}</pre>
            <p className="mt-3 text-xs leading-relaxed text-fg-muted">
              Arduino and CV legs activate in Phases 4 and 6.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  )
}