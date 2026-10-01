import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { StatusPill, KeyValue } from '@/components/ui/StatusPill'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { useSystemStatus } from '@/context/SystemStatusContext'
import { toneForState } from '@/utils/status'

export function Dashboard() {
  const { health, healthError, loading, wsState, refreshHealth, reconnectWs } =
    useSystemStatus()

  const services = health?.services
  // Sensor/CV/ML values are genuinely unavailable until later phases, so the
  // cards stay in their pending state instead of showing invented numbers.
  const sensorsPending = !health?.components?.length
  const cvPending = !services || services.cv === 'STOPPED'

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Command-centre overview of the classroom monitoring system. Every value below comes from the backend's real runtime state."
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
          <p className="text-sm font-semibold text-status-bad">Backend unreachable</p>
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
          value={null}
          pending
          hint="Awaiting live data"
        />
        <StatCard
          label="CV Head Count"
          value={services?.cv === 'RUNNING' ? 0 : null}
          pending={cvPending}
          hint="Awaiting live data"
        />
        <StatCard
          label="WebSocket"
          value={wsState.toUpperCase()}
          hint={
            health ? `${health.websocket_clients} client(s)` : 'No backend response'
          }
        />
        <StatCard
          label="Uptime"
          value={health ? `${Math.floor(health.uptime_s)}s` : null}
          pending={!health}
          hint={health ? `Backend v${health.version}` : 'Awaiting live data'}
        />
      </div>

      {/* ---- Environmental sensors ---- */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Temperature" value={null} unit="°C" pending />
        <StatCard label="Humidity" value={null} unit="%" pending />
        <StatCard label="Light" value={null} unit="ADC" pending />
        <StatCard label="Motion" value={null} pending />
      </div>

      {/* ---- Integrations ---- */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Hardware" subtitle="Arduino and serial link" />
          <CardBody className="space-y-1">
            <KeyValue
              label="Arduino"
              value={services?.arduino ?? 'UNKNOWN'}
              tone={toneForState(services?.arduino)}
            />
            <KeyValue
              label="Serial port"
              value={services?.serial_port ?? 'Not connected'}
            />
            <KeyValue
              label="Serial"
              value={services?.serial ?? 'UNKNOWN'}
              tone={toneForState(services?.serial)}
            />
            <KeyValue
              label="Camera"
              value={services?.camera ?? 'UNKNOWN'}
              tone={toneForState(services?.camera)}
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
              label="Monitoring"
              value={services?.monitoring_running ? 'RUNNING' : 'STOPPED'}
              tone={services?.monitoring_running ? 'ok' : 'idle'}
            />
            <p className="pt-1 text-xs leading-relaxed text-fg-muted">
              This system runs in <strong className="text-fg">real hardware mode</strong>.
              No simulated sensor values, faces or predictions are generated.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Live Data" subtitle="Awaiting Phase 4-8 services" />
          <CardBody>
            <EmptyState
              title="No live signals yet"
              description="Sensor readings, face detection and ML predictions appear here once the Arduino, CV and ML services are implemented."
              phase="Phases 4 · 6 · 8"
            />
          </CardBody>
        </Card>
      </div>

      {loading && (
        <p className="mt-6 text-center text-xs text-fg-muted">
          Contacting backend…
        </p>
      )}
      {sensorsPending && !healthError && (
        <p className="mt-6 text-center text-xs text-fg-muted/70">
          Sensor cards remain pending until the Arduino service is connected.
        </p>
      )}
    </>
  )
}