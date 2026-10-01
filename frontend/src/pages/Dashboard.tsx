import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { StatusPill, KeyValue } from '@/components/ui/StatusPill'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { useSystemStatus } from '@/context/SystemStatusContext'
import {
  toneForState,
  formatSensorValue,
  formatAge,
  freshnessLabel,
  type Freshness,
} from '@/utils/status'

export function Dashboard() {
  const {
    health,
    healthError,
    wsState,
    connectionState,
    monitoring,
    monitoringRunning,
    serialPort,
    latest,
    lastSensorAt,
    isStale,
    mlInfo,
    mlPrediction,
    refreshHealth,
    reconnectWs,
  } = useSystemStatus()

  const services = health?.services
  const freshness: Freshness =
    lastSensorAt === null ? 'none' : isStale ? 'stale' : 'live'
  const hint =
    freshness === 'none' ? 'No data' : freshness === 'stale' ? 'Last known' : 'Live'

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Command-centre overview. Every value below comes from the backend's real runtime state."
        action={
          <>
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
          <p className="text-sm font-semibold text-status-bad">
            Backend unreachable
          </p>
          <p className="mt-1 text-xs text-fg-muted">{healthError}</p>
          <p className="mt-1 text-xs text-fg-muted">
            Start it with:{' '}
            <code className="font-mono text-violet-soft">
              uvicorn backend.main:app --reload --port 8000
            </code>
          </p>
        </div>
      )}

      {/* ---- Primary signals ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="ML Occupancy"
          value={mlPrediction?.prediction ?? null}
          pending={!mlPrediction}
          hint={
            mlPrediction
              ? `${mlPrediction.model}${mlPrediction.confidence != null ? ` · ${(mlPrediction.confidence * 100).toFixed(0)}%` : ''}`
              : mlInfo?.loaded
                ? 'Waiting for sensor data'
                : 'ML NOT AVAILABLE'
          }
        />
        <StatCard
          label="CV Head Count"
          value={null}
          pending
          hint="Awaiting Phase 6"
        />
        <StatCard
          label="WebSocket"
          value={wsState.toUpperCase()}
          hint={health ? `${health.websocket_clients} client(s)` : 'No backend'}
        />
        <StatCard
          label="Monitoring"
          value={monitoring}
          hint={monitoringRunning ? 'Streaming' : 'Idle'}
        />
      </div>

      {/* ---- Environmental sensors (real values or honest "no data") ---- */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Temperature"
          value={formatSensorValue(latest?.temperature, 1)}
          unit="°C"
          pending={freshness === 'none'}
          hint={hint}
        />
        <StatCard
          label="Humidity"
          value={formatSensorValue(latest?.humidity, 1)}
          unit="%"
          pending={freshness === 'none'}
          hint={hint}
        />
        <StatCard
          label="Light"
          value={latest?.light ?? null}
          unit="ADC"
          pending={freshness === 'none'}
          hint={hint}
        />
        <StatCard
          label="Motion"
          value={
            latest?.motion === null || latest?.motion === undefined
              ? null
              : latest.motion
                ? 'DETECTED'
                : 'Clear'
          }
          pending={freshness === 'none'}
          hint={hint}
        />
      </div>

      <p className="mt-3 text-xs text-fg-muted">
        Data state: {freshnessLabel(freshness)} · last update {formatAge(lastSensorAt)}
      </p>

      {/* ---- Integrations ---- */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Hardware" subtitle="Arduino and serial link" />
          <CardBody className="space-y-1">
            <KeyValue
              label="Arduino"
              value={connectionState}
              tone={toneForState(connectionState)}
            />
            <KeyValue label="Serial port" value={serialPort ?? 'Not connected'} />
            <KeyValue
              label="Serial"
              value={services?.serial ?? 'DISCONNECTED'}
              tone={toneForState(services?.serial)}
            />
            <KeyValue
              label="Monitoring"
              value={monitoring}
              tone={monitoringRunning ? 'ok' : 'idle'}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Runtime mode" subtitle="Data authenticity" />
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-fg-muted">Mode</span>
              <StatusPill
                label={health?.mode ?? 'UNKNOWN'}
                tone={health?.demo_mode ? 'warn' : 'violet'}
              />
            </div>
            <KeyValue
              label="Backend"
              value={health ? 'CONNECTED' : 'UNAVAILABLE'}
              tone={health ? 'ok' : 'bad'}
            />
            <p className="pt-1 text-xs leading-relaxed text-fg-muted">
              Runs in <strong className="text-fg">real hardware mode</strong>. No
              simulated sensor values are generated.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Pending services" subtitle="Later phases" />
          <CardBody>
            <EmptyState
              title="CV and ML not initialized"
              description="Face detection (Phase 6) and machine learning (Phase 8) are not implemented yet. No values are shown for them."
              phase="Phases 6 · 8"
            />
          </CardBody>
        </Card>
      </div>
    </>
  )
}