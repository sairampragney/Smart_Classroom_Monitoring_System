import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatusPill, KeyValue } from '@/components/ui/StatusPill'
import { Button } from '@/components/ui/Button'
import { CameraViewport } from '@/components/cv/CameraViewport'
import { useSystemStatus } from '@/context/SystemStatusContext'
import { toneForState } from '@/utils/status'

export default function ComputerVision() {
  const { health } = useSystemStatus()
  const services = health?.services
  const cameraOn = services?.camera === 'CONNECTED'
  const detectionRunning = services?.cv === 'RUNNING'

  return (
    <>
      <PageHeader
        title="Computer Vision"
        description="Real-time face detection and visible head count. Bounding boxes are generated from genuine OpenCV detections — never hardcoded."
        action={
          <>
            <StatusPill
              label={cameraOn ? 'Camera Connected' : 'Camera Disconnected'}
              tone={toneForState(services?.camera)}
              pulse={cameraOn}
            />
            <Button disabled={!cameraOn} title={cameraOn ? 'Start detection' : 'Connect a camera first'}>
              ■ STOP DETECTION
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ---- Main camera area ---- */}
        <div className="xl:col-span-2">
          <Card>
            <CardHeader
              title="Live Camera Feed"
              subtitle="Green FACE DETECTED boxes track each visible face"
              action={<StatusPill label="Phase 6" tone="violet" />}
            />
            <CardBody>
              <CameraViewport
                frameUrl={null}
                boxes={[]}
                sourceWidth={null}
                sourceHeight={null}
                detectionRunning={detectionRunning}
              />
            </CardBody>
          </Card>
        </div>

        {/* ---- Detection sidebar ---- */}
        <div className="space-y-4">
          {/* Head count */}
          <Card>
            <CardHeader title="Head Count" subtitle="Currently visible faces" />
            <CardBody className="py-6 text-center">
              <p className="metric-value text-7xl">—</p>
              <p className="mt-2 text-xs uppercase tracking-[0.14em] text-fg-muted">
                {detectionRunning ? 'counting' : 'detection stopped'}
              </p>
              <p className="mx-auto mt-3 max-w-[16rem] text-xs leading-relaxed text-fg-muted/80">
                Not a cumulative visitor counter — it tracks faces visible right now.
              </p>
            </CardBody>
          </Card>

          {/* Status */}
          <Card>
            <CardHeader title="Detection Status" subtitle="Measured, not simulated" />
            <CardBody className="space-y-1">
              <KeyValue
                label="Camera"
                value={services?.camera ?? 'UNKNOWN'}
                tone={toneForState(services?.camera)}
              />
              <KeyValue
                label="Detection"
                value={services?.cv ?? 'STOPPED'}
                tone={detectionRunning ? 'ok' : 'idle'}
              />
              <KeyValue label="FPS" value="—" hint="measured in Phase 6" />
              <KeyValue label="Model" value="—" hint="loaded in Phase 6" />
              <KeyValue label="Tracked faces" value="—" />
            </CardBody>
          </Card>

          {/* Behaviour contract */}
          <Card>
            <CardHeader title="Expected Behaviour" subtitle="Phase 6/7 acceptance criteria" />
            <CardBody>
              <ul className="space-y-2 text-xs leading-relaxed text-fg-muted">
                {[
                  'A new face entering raises the head count.',
                  'A face leaving lowers the head count.',
                  'A moving face keeps its box aligned to it.',
                  'Multiple faces are supported with no fixed cap.',
                  'Boxes are clipped to the visible viewport.',
                ].map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-violet-soft">▸</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}