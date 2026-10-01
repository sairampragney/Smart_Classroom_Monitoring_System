import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusPill, KeyValue } from '@/components/ui/StatusPill'
import { useSystemStatus } from '@/context/SystemStatusContext'
import { toneForState } from '@/utils/status'

/** Classifiers the project will compare in Phase 8. */
const CANDIDATE_MODELS = [
  'Logistic Regression',
  'Decision Tree',
  'KNN',
  'SVM',
  'Random Forest',
]

export default function MLAnalysis() {
  const { health } = useSystemStatus()
  const mlState = health?.services.ml

  return (
    <>
      <PageHeader
        title="ML Analysis"
        description="Comparative evaluation of lightweight machine learning algorithms for occupancy prediction from temperature, humidity, light and motion."
        action={<StatusPill label="Phase 8" tone="violet" />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ---- Model comparison ---- */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Model Comparison"
            subtitle="Accuracy · Precision · Recall · F1"
            action={<StatusPill label="No results yet" tone="idle" />}
          />
          <CardBody>
            <EmptyState
              title="Metrics appear after training"
              description="Every figure on this page is produced by real evaluation in ml/scripts. No metric, accuracy score or confusion matrix is hardcoded or estimated in advance."
              phase="Phase 8"
            />

            {/* Placeholder table structure - rows render only once real
                results exist, so the UI cannot imply measured performance. */}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-violet-500/15 text-[11px] uppercase tracking-[0.1em] text-fg-muted">
                    <th className="py-2 pr-4 font-semibold">Model</th>
                    <th className="py-2 pr-4 font-semibold">Accuracy</th>
                    <th className="py-2 pr-4 font-semibold">Precision</th>
                    <th className="py-2 pr-4 font-semibold">Recall</th>
                    <th className="py-2 font-semibold">F1</th>
                  </tr>
                </thead>
                <tbody>
                  {CANDIDATE_MODELS.map((name) => (
                    <tr key={name} className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-4 text-fg">{name}</td>
                      <td className="py-2.5 pr-4 font-mono text-fg-muted">—</td>
                      <td className="py-2.5 pr-4 font-mono text-fg-muted">—</td>
                      <td className="py-2.5 pr-4 font-mono text-fg-muted">—</td>
                      <td className="py-2.5 font-mono text-fg-muted">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-fg-muted">
                Model names are the planned candidates. Scores stay blank until
                they are measured.
              </p>
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4">
          {/* ---- Confusion matrix ---- */}
          <Card>
            <CardHeader title="Confusion Matrix" subtitle="Final selected model" />
            <CardBody>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-violet-500/15 bg-violet-500/10 text-center font-mono text-sm">
                {['TN', 'FP', 'FN', 'TP'].map((cell) => (
                  <div key={cell} className="bg-bg-card px-3 py-5">
                    <span className="block text-[10px] text-fg-muted">{cell}</span>
                    <span className="mt-1 block text-fg-muted">—</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-fg-muted">
                Populated after real evaluation in Phase 8.
              </p>
            </CardBody>
          </Card>

          {/* ---- Dataset & model info ---- */}
          <Card>
            <CardHeader title="Dataset & Model" subtitle="Real inputs only" />
            <CardBody className="space-y-1">
              <KeyValue
                label="Model state"
                value={mlState ?? 'NOT_LOADED'}
                tone={toneForState(mlState)}
              />
              <KeyValue label="Dataset" value="—" />
              <KeyValue label="Features" value="T · H · L · PIR" />
              <KeyValue label="Split" value="—" />
              <p className="pt-2 text-xs leading-relaxed text-fg-muted">
                Training uses genuine UCI occupancy data and/or the team's own
                sensor dataset. Data is never invented to fill a table.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}