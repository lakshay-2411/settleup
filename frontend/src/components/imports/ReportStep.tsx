import { Link } from 'react-router-dom'
import { CheckCircle2, Download } from 'lucide-react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { apiBase, tokens } from '@/api/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Group, ImportBatch } from '@/types'
import { typeTitle } from './anomalyPresentation'

const decisionStyle: Record<string, string> = {
  auto_applied: 'bg-muted text-muted-foreground',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

/** The story of the import — and the report file the assignment asks for. */
export function ReportStep({ batch, group }: { batch: ImportBatch; group: Group }) {
  const report = batch.report_json
  if (!report) return null

  async function download() {
    try {
      // Authenticated download of the PDF report (?format=md also exists).
      const res = await fetch(`${apiBase}/api/imports/${batch.id}/report/?format=pdf`, {
        headers: { Authorization: `Bearer ${tokens.access}` },
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `import-report-${batch.id}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Could not download the report')
    }
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex flex-col items-center py-8 text-center"
      >
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', bounce: 0.5, delay: 0.15 }}
          className="rounded-full bg-emerald-100 p-4 text-emerald-600"
        >
          <CheckCircle2 className="size-9" strokeWidth={1.8} />
        </motion.span>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight">Import complete</h2>
        <p className="text-muted-foreground mt-1 max-w-md text-sm">
          {report.total_rows} rows processed · {report.summary.anomalies_detected} anomalies
          detected across {report.summary.anomaly_types} types — every one surfaced and
          handled.
        </p>
        <div className="mt-5 flex gap-2">
          <Button className="rounded-xl" onClick={download}>
            <Download />
            Download report (PDF)
          </Button>
          <Button asChild variant="outline" className="rounded-xl">
            <Link to={`/groups/${group.id}`}>Back to {group.name}</Link>
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(report.summary.row_outcomes).map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-white p-4 text-center shadow-sm">
            <p className="tnum text-2xl font-semibold tracking-tight">{v}</p>
            <p className="text-muted-foreground text-xs">{k.replace(/_/g, ' ')}</p>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-widest uppercase">
          Everything that was found — and what happened to it
        </h3>
        <div className="space-y-2">
          {report.anomalies.map((a) => (
            <div key={a.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{typeTitle(a.type)}</span>
                <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">
                  {a.type}
                </span>
                <span className="text-muted-foreground text-xs">rows {a.rows.join(', ')}</span>
                <span
                  className={cn(
                    'ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium',
                    decisionStyle[a.decision],
                  )}
                >
                  {a.decision.replace('_', ' ')}
                </span>
              </div>
              <p className="mt-1.5 text-sm">{a.description}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                <b>Action:</b> {a.policy}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
