import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { StatusPill, KeyValue } from '@/components/ui/StatusPill'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSystemStatus } from '@/context/SystemStatusContext'
import { toneForState } from '@/utils/status'

export default function LiveMonitoring() {
  const { health } = useSystemStatus()
  const services = health?.services
  const connected = services?.arduino === 'CONNECTED'

  return (
    <>
      <PageHeader
        title="Live Monitoring"
        description="Real-time Arduino sensor telemetry. RUN PROGRAM starts serial monitoring in the backend — it does not upload firmware."
        action={
          <>
            <StatusPill
              label={connected ? 'Arduino Connected' : 'Arduino Disconnected'}
              tone={toneForState(services?.arduino)}
              pulse={connected}
            />
            {/* Disabled until the Arduino is genuinely connected. */}
            <Button size="md" disabled={!connected} title={connected ? 'Start monitoring' : 'Connect an Arduino first'}>
              ▶ RUN PROGRAM
            </Button>
          </>
        }
      />

      {/* ---- Sensor cards ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Temperature" value={null} unit="°C" pending />
        <StatCard label="Humidity" value={null} unit="%" pending />
        <StatCard label="Light" value={null} unit="ADC" pending />
        <StatCard label="Motion" value={null} pending />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ---- Charts ---- */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Real-time Charts"
            subtitle="Temperature, humidity, light and motion over time"
            action={<StatusPill label="Phase 5" tone="violet" />}
          />
          <CardBody>
            <EmptyState
              title="Charts appear once monitoring starts"
              description="The chart series is rendered from live WebSocket sensor messages. No placeholder or sample series is drawn, so an empty chart is never mistaken for real telemetry."
              phase="Phase 5"
            />
          </CardBody>
        </Card>

        {/* ---- Connection panel ---- */}
        <Card>
          <CardHeader title="Connection" subtitle="Backend device state" />
          <CardBody className="space-y-1">
            <KeyValue
              label="Arduino"
              value={services?.arduino ?? 'UNKNOWN'}
              tone={toneForState(services?.arduino)}
            />
            <KeyValue label="Serial port" value={services?.serial_port ?? '—'} />
            <KeyValue
              label="Serial"
              value={services?.serial ?? 'UNKNOWN'}
              tone={toneForState(services?.serial)}
            />
            <KeyValue
              label="Monitoring"
              value={services?.monitoring_running ? 'RUNNING' : 'STOPPED'}
              tone={services?.monitoring_running ? 'ok' : 'idle'}
            />
            <KeyValue
              label="Last update"
              value={services?.monitoring_running ? 'streaming' : 'no data'}
              tone={services?.monitoring_running ? 'ok' : 'idle'}
            />

            <div className="mt-4 rounded-lg border border-violet-500/15 bg-violet/[0.04] p-3">
              <p className="text-xs font-semibold text-fg">Reconnection</p>
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                Unplugging the Arduino flips the state to DISCONNECTED over the
                WebSocket with no page refresh. Plugging it back in triggers
                automatic reconnection.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  )
}