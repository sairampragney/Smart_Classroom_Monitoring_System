import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusPill } from '@/components/ui/StatusPill'

const COLUMNS = [
  'Timestamp',
  'Temp',
  'Humidity',
  'Light',
  'Motion',
  'Head Count',
  'ML Prediction',
] as const

export default function History() {
  return (
    <>
      <PageHeader
        title="History"
        description="Past monitoring records: sensor values, head count and occupancy prediction with timestamps."
        action={<StatusPill label="Phase 9" tone="violet" />}
      />

      <Card>
        <CardHeader
          title="Monitoring Records"
          subtitle="Persisted by the backend once the History service is implemented"
          action={<StatusPill label="No records yet" tone="idle" />}
        />
        <CardBody>
          <EmptyState
            title="No historical records yet"
            description="Records are written only when real data is flowing from the Arduino and CV services. This table stays empty rather than showing sample rows, so no fabricated history is ever displayed."
            phase="Phase 9"
          />

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead>
                <tr className="border-b border-violet-500/15 text-[11px] uppercase tracking-[0.1em] text-fg-muted">
                  {COLUMNS.map((col) => (
                    <th key={col} className="py-2 pr-4 font-semibold">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="py-6 text-center text-xs text-fg-muted"
                  >
                    No data
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  )
}