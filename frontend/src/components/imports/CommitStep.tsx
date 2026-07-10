import { CheckCheck, ShieldCheck, Sparkles, X } from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import type { ImportBatch } from '@/types'

/** The last gate: what was decided, and the one button that writes it all. */
export function CommitStep({
  batch,
  onCommit,
  committing,
}: {
  batch: ImportBatch
  onCommit: () => void
  committing: boolean
}) {
  const approved = batch.anomalies.filter((a) => a.status === 'approved').length
  const rejected = batch.anomalies.filter((a) => a.status === 'rejected').length
  const auto = batch.anomalies.filter((a) => a.status === 'auto_applied').length

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col items-center py-14 text-center"
    >
      <span className="bg-secondary text-primary rounded-3xl p-5">
        <ShieldCheck className="size-8" strokeWidth={1.6} />
      </span>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">Ready to commit</h2>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        Every decision is in. Nothing has touched your balances yet — committing writes the
        expenses, settlements, and people below in one transaction.
      </p>

      <div className="mt-8 grid w-full max-w-md grid-cols-3 gap-3">
        <Stat icon={<CheckCheck className="size-4 text-emerald-600" />} label="approved" value={approved} />
        <Stat icon={<X className="size-4 text-red-500" />} label="rejected" value={rejected} />
        <Stat icon={<Sparkles className="size-4 text-sky-600" />} label="auto-fixed" value={auto} />
      </div>

      <Button
        className="mt-8 h-12 rounded-xl px-10 text-[15px]"
        onClick={onCommit}
        disabled={committing}
      >
        {committing ? 'Committing…' : `Commit ${batch.total_rows} rows`}
      </Button>
    </motion.div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-center gap-1.5">{icon}</div>
      <p className="tnum mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  )
}
