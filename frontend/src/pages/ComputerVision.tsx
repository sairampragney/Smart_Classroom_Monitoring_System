import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatusPill, KeyValue } from '@/components/ui/StatusPill'
import { Button } from '@/components/ui/Button'
import { CameraViewport } from '@/components/cv/CameraViewport'
import { useSystemStatus } from '@/context/SystemStatusContext'
import { formatAge, toneForState } from '@/utils/status'

export default function ComputerVision() {
  const {
    cvStatus,
    faces,
    faceCount,
    cvFps,
    cvDetector,
    cvFrameWidth,
    cvFrameHeight,
    lastDetectionAt,
    cvError,
    cvPending,
    cvStreamUrl,
    startCv,
    stopCv,
    actionError,
  } = useSystemStatus()

  // Real backend state only - never assumed from "the page is open".
  const detectionState = cvStatus?.cv ?? 'STOPPED'
  const cameraState = cvStatus?.camera ?? 'DISCONNECTED'
  const detectionRunning = detectionState === 'RUNNING'
  const cameraConnected = cameraState === 'CONNECTED'
  const workerRunning = cvStatus?.worker_running ?? false

  const fpsText =
    typeof cvFps === 'number' && Number.isFinite(cvFps) ? cvFps.toFixed(1) : '--'

  // Show '--' rather than a misleading 0 before any detection has happened.
  const showCount = detectionRunning || lastDetectionAt !== null

  return (
    <>
      <PageHeader
        title="Computer Vision"
        description="Real-time face detection and visible head count. Boxes come from genuine OpenCV detections; the video is the backend's own camera pipeline."
        action={
          detectionRunning || workerRunning ? (
            <Button variant="outline" onClick={() => void stopCv()}>
              ■ STOP DETECTION
            </Button>
          ) : (
            <Button onClick={() => void startCv()}>▶ START DETECTION</Button>
          )
        }
      />

      {actionError && (
        <div className="mb-6 rounded-xl border border-status-warn/30 bg-status-warn/10 px-4 py-3">
          <p className="text-sm font-semibold text-status-warn">
            Detection action failed
          </p>
          <p className="mt-1 text-xs text-fg-muted">{actionError}</p>
        </div>
      )}

      {cvError && (
        <div className="mb-6 rounded-xl border border-status-bad/30 bg-status-bad/10 px-4 py-3">
          <p className="text-sm font-semibold text-status-bad">Camera error</p>
          <p className="mt-1 text-xs text-fg-muted">{cvError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ---- Main camera panel ---- */}
        <div className="xl:col-span-2">
          <Card>
            <CardHeader
              title="Live Camera Feed"
              subtitle="Green FACE DETECTED boxes track each visible face"
              action={
                <StatusPill
                  label={detectionRunning ? 'Running' : 'Stopped'}
                  tone={detectionRunning ? 'ok' : 'idle'}
                  pulse={detectionRunning}
                />
              }
            />
            <CardBody>
              <CameraViewport
                streamUrl={cvStreamUrl}
                boxes={faces}
                sourceWidth={cvFrameWidth}
                sourceHeight={cvFrameHeight}
                detectionRunning={detectionRunning}
                cameraConnected={cameraConnected}
                emptyTitle={cameraConnected ? 'No video yet' : 'Camera unavailable'}
                emptyHint={
                  cameraConnected
                    ? 'The camera is connected; start detection to see frames.'
                    : 'Unable to access the configured camera. Check that no other app holds it, or set CAMERA_INDEX in backend/.env.'
                }
              />
            </CardBody>
          </Card>
        </div>

        {/* ---- Information panel ---- */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Head Count" subtitle="Faces visible right now" />
            <CardBody className="py-6 text-center">
              <p className="metric-value text-7xl text-fg">
                {showCount ? faceCount : '--'}
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.14em] text-fg-muted">
                {detectionRunning
                  ? 'counting'
                  : detectionState === 'ERROR'
                    ? 'detection error'
                    : 'detection stopped'}
              </p>
              {detectionRunning && faceCount === 0 && (
                <p className="mt-3 text-xs text-fg-muted/80">No faces detected</p>
              )}
              <p className="mx-auto mt-3 max-w-[16rem] text-xs leading-relaxed text-fg-muted/80">
                Not a cumulative visitor counter — it tracks faces visible in the
                current frame.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Detection Status" subtitle="Measured, not simulated" />
            <CardBody className="space-y-1">
              <KeyValue
                label="Camera"
                value={cameraState}
                tone={toneForState(cameraState)}
              />
              <KeyValue
                label="Detection"
                value={detectionState}
                tone={detectionRunning ? 'ok' : cvPending ? 'warn' : 'idle'}
              />
              <KeyValue label="FPS" value={fpsText} />
              <KeyValue label="Model" value={cvDetector} />
              <KeyValue
                label="Source"
                value={
                  cvFrameWidth && cvFrameHeight
                    ? `${cvFrameWidth}×${cvFrameHeight}`
                    : '--'
                }
              />
              <KeyValue label="Frames" value={cvStatus?.frames_processed ?? 0} />
              <KeyValue
                label="Last detection"
                value={formatAge(lastDetectionAt)}
                tone={lastDetectionAt === null ? 'idle' : 'ok'}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}