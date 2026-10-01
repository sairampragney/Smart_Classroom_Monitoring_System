import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { StatusPill, KeyValue } from '@/components/ui/StatusPill'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSystemStatus } from '@/context/SystemStatusContext'
import { cn } from '@/utils/cn'

/** Render a metric as a percentage, or '—' when it is genuinely absent. */
function pct(v: number | undefined | null, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${(v * 100).toFixed(digits)}%`
}

export default function MLAnalysis() {
  const { mlInfo, mlPrediction, refreshMl, actionError } = useSystemStatus()

  const models = mlInfo?.all_model_results ?? []
  const selected = mlInfo?.model ?? null
  const ds = mlInfo?.dataset
  const best = models.reduce<(typeof models)[number] | null>(
    (acc, m) => (!acc || m.metrics.f1 > acc.metrics.f1 ? m : acc),
    null,
  )
  const cm = best?.confusion_matrix

  return (
    <>
      <PageHeader
        title="ML Analysis"
        description="Comparative evaluation of lightweight classifiers for sensor-based occupancy prediction. Every number below comes from an actual train/test run."
        action={
          <Button variant="outline" size="sm" onClick={refreshMl}>
            Refresh
          </Button>
        }
      />

      {actionError && (
        <div className="mb-6 rounded-xl border border-status-warn/30 bg-status-warn/10 px-4 py-3">
          <p className="text-sm font-semibold text-status-warn">ML action failed</p>
          <p className="mt-1 text-xs text-fg-muted">{actionError}</p>
        </div>
      )}

      {!mlInfo?.loaded ? (
        <Card>
          <CardBody>
            <EmptyState
              title="ML model not available"
              description={
                mlInfo?.error ??
                'No trained artifact was found. Train it with: .\\backend\\.venv\\Scripts\\python.exe ml\\scripts\\train.py'
              }
              phase="Phase 8"
            />
          </CardBody>
        </Card>
      ) : (
        <>
          {/* ---- Live prediction + selected model ---- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="ML Prediction"
              value={mlPrediction?.prediction ?? null}
              pending={!mlPrediction}
              hint={mlPrediction ? 'Live from sensors' : 'Waiting for sensor data'}
            />
            <StatCard
              label="Confidence"
              value={pct(mlPrediction?.confidence)}
              pending={!mlPrediction || mlPrediction?.confidence == null}
              hint={
                mlPrediction?.confidence == null
                  ? 'Model reports no probability'
                  : 'Real model probability'
              }
            />
            <StatCard label="Deployed Model" value={selected ?? '—'} />
            <StatCard
              label="Test F1"
              value={pct(mlInfo?.metrics?.f1)}
              hint="Selection criterion"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* ---- Model comparison ---- */}
            <Card className="lg:col-span-2">
              <CardHeader
                title="Model Comparison"
                subtitle="Accuracy · Precision · Recall · F1 — measured on a held-out test split"
                action={<StatusPill label={`${models.length} models`} tone="violet" />}
              />
              <CardBody>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-violet-500/15 text-[11px] uppercase tracking-[0.1em] text-fg-muted">
                        <th className="py-2 pr-4 font-semibold">Model</th>
                        <th className="py-2 pr-4 font-semibold">Accuracy</th>
                        <th className="py-2 pr-4 font-semibold">Precision</th>
                        <th className="py-2 pr-4 font-semibold">Recall</th>
                        <th className="py-2 pr-4 font-semibold">F1</th>
                        <th className="py-2 font-semibold">CV F1</th>
                      </tr>
                    </thead>
                    <tbody>
                      {models.map((m) => {
                        const isSelected = m.name === selected
                        return (
                          <tr
                            key={m.name}
                            className={cn(
                              'border-b border-white/[0.04]',
                              isSelected && 'bg-violet/[0.07]',
                            )}
                          >
                            <td className="py-2.5 pr-4 text-fg">
                              {m.name}
                              {isSelected && (
                                <span className="ml-2 rounded-full border border-violet-500/30 bg-violet/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-soft">
                                  Selected
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 pr-4 font-mono">{pct(m.metrics.accuracy, 2)}</td>
                            <td className="py-2.5 pr-4 font-mono">{pct(m.metrics.precision, 2)}</td>
                            <td className="py-2.5 pr-4 font-mono">{pct(m.metrics.recall, 2)}</td>
                            <td className="py-2.5 pr-4 font-mono text-fg">{pct(m.metrics.f1, 2)}</td>
                            <td className="py-2.5 font-mono text-fg-muted">
                              {m.cv_f1_mean.toFixed(4)} ± {m.cv_f1_std.toFixed(4)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-fg-muted">
                  <strong className="text-fg">{selected}</strong> was selected on the
                  highest test F1 for the OCCUPIED class. Accuracy alone is misleading
                  here because 81% of the dataset is EMPTY; ties break on
                  cross-validated F1, then accuracy.
                </p>
              </CardBody>
            </Card>

            {/* ---- Confusion matrix ---- */}
            <Card>
              <CardHeader title="Confusion Matrix" subtitle={selected ?? '—'} />
              <CardBody>
                {cm && cm.length === 2 ? (
                  <>
                    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-violet-500/15 bg-violet-500/10 text-center font-mono">
                      {cm.flat().map((v, i) => (
                        <div key={i} className="bg-bg-card px-3 py-5">
                          <span className="block text-[10px] text-fg-muted">
                            {['TN', 'FP', 'FN', 'TP'][i]}
                          </span>
                          <span className="mt-1 block text-fg">{v}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-fg-muted">
                      Rows = actual, columns = predicted.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-fg-muted">Not available.</p>
                )}
              </CardBody>
            </Card>

            {/* ---- Dataset ---- */}
            <Card>
              <CardHeader title="Dataset" subtitle="Real data, not synthetic" />
              <CardBody className="space-y-1">
                <KeyValue label="Name" value={ds?.name ?? '—'} />
                <KeyValue label="Rows" value={ds?.rows ?? '—'} />
                <KeyValue label="Columns" value={ds?.columns ?? '—'} />
                <KeyValue label="Target" value={ds?.target_column ?? '—'} />
                <KeyValue label="Transform" value={ds?.target_transform ?? '—'} />
                <KeyValue label="Missing" value={ds?.missing_values ?? '—'} />
                <KeyValue label="Duplicates" value={ds?.duplicate_rows ?? '—'} />
                <KeyValue
                  label="Features"
                  value={mlInfo?.feature_names?.join(', ') ?? '—'}
                />
                {ds?.source && (
                  <a
                    href={ds.source}
                    target="_blank"
                    rel="noreferrer"
                    className="block pt-2 text-xs text-violet-soft underline"
                  >
                    Dataset source
                  </a>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </>
  )
}