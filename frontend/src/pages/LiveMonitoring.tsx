import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { StatusPill, KeyValue } from '@/components/ui/StatusPill'
import { Button } from '@/components/ui/Button'
import { SensorChart } from '@/components/charts/SensorChart'
import { MotionTimeline } from '@/components/charts/MotionTimeline'
import { useSystemStatus } from '@/context/SystemStatusContext'
import { config } from '@/config/env'
import {
  toneForState,
  formatAge,
  formatSensorValue,
  freshnessLabel,
  type Freshness,
} from '@/utils/status'

const WS_LABEL: Record<string, string> = {
  open: 'Connected',
  connecting: 'Connecting',
  closed: 'Disconnected',
  error: 'Error',
}

export default function LiveMonitoring() {
  const {
    connectionState,
    monitoring,
    monitoringRunning,
    serialPort,
    latest,
    lastSensorAt,
    history,
    isStale,
    wsState,
    health,
    healthError,
    startMonitoring,
    stopMonitoring,
    actionPending,
    actionError,
  } = useSystemStatus()

  const connected = connectionState === 'CONNECTED'
  const freshness: Freshness =
    lastSensorAt === null ? 'none' : isStale ? 'stale' : 'live'

  // RUN PROGRAM is enabled only when the board is genuinely connected.
  // It starts the computer-side pipeline; it never uploads firmware.
  const canRun = connected && !monitoringRunning && !actionPending

  const hint =
    freshness === 'none'
      ? 'No data'
      : freshness === 'stale'
        ? 'Last known value'
        : 'Live'

  return (
    <>
      <PageHeader
        title="Live Monitoring"
        description="Real-time Arduino sensor telemetry. RUN PROGRAM starts computer-side monitoring — it does not upload firmware."
        action={
          <>
            <StatusPill
              label={connected ? 'Arduino Connected' : 'Arduino Disconnected'}
              tone={toneForState(connectionState)}
              pulse={connected}
            />
            {monitoringRunning ? (
              <Button
                variant="outline"
                onClick={() => void stopMonitoring()}
                disabled={actionPending}
              >
                {actionPending ? 'Stopping…' : '■ STOP MONITORING'}
              </Button>
            ) : (
              <Button
                onClick={() => void startMonitoring()}
                disabled={!canRun}
                title={connected ? 'Start monitoring' : 'Connect an Arduino first'}
              >
                {actionPending ? 'Starting…' : '▶ RUN PROGRAM'}
              </Button>
            )}
          </>
        }
      />

      {/* Backend unreachable is shown differently from Arduino disconnected */}
      {healthError && (
        <div className="mb-6 rounded-xl border border-status-bad/30 bg-status-bad/10 px-4 py-3">
          <p className="text-sm font-semibold text-status-bad">Backend unavailable</p>
          <p className="mt-1 text-xs text-fg-muted">{healthError}</p>
          <p className="mt-1 text-xs text-fg-muted">
            Start it with:{' '}
            <code className="font-mono text-violet-soft">
              uvicorn backend.main:app --reload --port 8000
            </code>
          </p>
        </div>
      )}

      {actionError && (
        <div className="mb-6 rounded-xl border border-status-warn/30 bg-status-warn/10 px-4 py-3">
          <p className="text-sm font-semibold text-status-warn">
            Monitoring action failed
          </p>
          <p className="mt-1 text-xs text-fg-muted">{actionError}</p>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusPill
          label={`Data: ${freshnessLabel(freshness)}`}
          tone={freshness === 'live' ? 'ok' : freshness === 'stale' ? 'warn' : 'idle'}
          pulse={freshness === 'live'}
        />
        <span className="text-xs text-fg-muted">
          Last update: {formatAge(lastSensorAt)}
          {latest?.err ? ` · firmware reported ${latest.err}` : ''}
        </span>
      </div>

      {/* ---- Sensor cards (real values, or an honest "no data") ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ---- Charts: real data only ---- */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Real-time Charts"
            subtitle={`Rolling window · ${history.length} reading(s)`}
            action={
              <StatusPill
                label={freshnessLabel(freshness)}
                tone={freshness === 'live' ? 'ok' : 'idle'}
              />
            }
          />
          <CardBody className="space-y-5">
            <SensorChart
              data={history}
              field="temperature"
              title="Temperature"
              unit="°C"
            />
            <SensorChart
              data={history}
              field="humidity"
              title="Humidity"
              unit="%RH"
            />
            <SensorChart data={history} field="light" title="Light" unit="ADC" />
          </CardBody>
        </Card>

        <div className="space-y-4">
          {/* Motion is boolean, so it gets a state strip, not a line chart */}
          <Card>
            <CardHeader title="Motion History" subtitle="HC-SR501 PIR" />
            <CardBody>
              <MotionTimeline data={history} />
            </CardBody>
          </Card>

          {/* ---- Connection panel: real backend state ---- */}
          <Card>
            <CardHeader title="Connection" subtitle="Real backend state" />
            <CardBody className="space-y-1">
              <KeyValue
                label="Backend"
                value={health ? 'CONNECTED' : 'UNAVAILABLE'}
                tone={health ? 'ok' : 'bad'}
              />
              <KeyValue
                label="WebSocket"
                value={WS_LABEL[wsState] ?? wsState}
                tone={
                  wsState === 'open'
                    ? 'ok'
                    : wsState === 'connecting'
                      ? 'warn'
                      : 'bad'
                }
              />
              <KeyValue
                label="Arduino"
                value={connectionState}
                tone={toneForState(connectionState)}
              />
              <KeyValue label="Serial port" value={serialPort ?? 'Not connected'} />
              <KeyValue
                label="Monitoring"
                value={monitoring}
                tone={monitoringRunning ? 'ok' : 'idle'}
              />
              <KeyValue
                label="Stale after"
                value={`${config.staleAfterMs / 1000}s`}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}