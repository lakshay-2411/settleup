import { useEffect, useState } from 'react'
import { AlertTriangle, Check, CheckCheck, Info, LayoutList, Layers, OctagonAlert, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { useResolveAnomaly } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ImportAnomaly } from '@/types'
import { DiffRows, typeTitle } from './anomalyPresentation'

const severityIcon = {
  info: <Info className="size-4 text-sky-600" />,
  warning: <AlertTriangle className="size-4 text-amber-600" />,
  blocking: <OctagonAlert className="size-4 text-red-600" />,
}

/**
 * The review step: anomalies triaged one card at a time — approve flies right,
 * reject flies left. Keyboard: A approve, R reject. A list mode and
 * "approve all" exist for speed; missing-payer cards demand their input.
 */
export function TriageDeck({
  pending,
  totalCount,
  batchId,
}: {
  pending: ImportAnomaly[]
  totalCount: number
  batchId: number
}) {
  const resolve = useResolveAnomaly(batchId)
  const [mode, setMode] = useState<'deck' | 'list'>('deck')
  const [exitDir, setExitDir] = useState<1 | -1>(1)
  const [bulkBusy, setBulkBusy] = useState(false)

  const current = pending[0]
  const doneCount = totalCount - pending.length
  const bulkApprovable = pending.filter((a) => a.anomaly_type !== 'MISSING_PAYER')

  function decide(a: ImportAnomaly, status: 'approved' | 'rejected', resolution?: Record<string, unknown>) {
    setExitDir(status === 'approved' ? 1 : -1)
    resolve.mutate({ anomalyId: a.id, status, resolution })
  }

  async function approveAll() {
    setBulkBusy(true)
    try {
      for (const a of bulkApprovable) {
        await resolve.mutateAsync({ anomalyId: a.id, status: 'approved' })
      }
      toast.success(`${bulkApprovable.length} proposals approved`)
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Review the findings</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Approve applies the proposal · Reject keeps the file as written.
            <span className="hidden sm:inline">
              {' '}
              Keyboard: <Kbd>A</Kbd> approve, <Kbd>R</Kbd> reject.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {bulkApprovable.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={approveAll}
              disabled={bulkBusy}
            >
              <CheckCheck />
              {bulkBusy ? 'Approving…' : `Approve all (${bulkApprovable.length})`}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground rounded-xl"
            onClick={() => setMode(mode === 'deck' ? 'list' : 'deck')}
          >
            {mode === 'deck' ? <LayoutList /> : <Layers />}
            {mode === 'deck' ? 'List' : 'Deck'}
          </Button>
        </div>
      </div>

      {/* progress */}
      <div className="mt-4 flex items-center gap-3">
        <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
          <motion.div
            animate={{ width: `${(doneCount / Math.max(1, totalCount)) * 100}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="bg-primary h-full rounded-full"
          />
        </div>
        <span className="text-muted-foreground tnum text-xs whitespace-nowrap">
          {doneCount}/{totalCount} decided
        </span>
      </div>

      {mode === 'deck' ? (
        <div className="relative mt-6 min-h-96">
          {/* peeking next cards */}
          {pending.slice(1, 3).map((a, i) => (
            <div
              key={a.id}
              className="absolute inset-x-0 top-0 rounded-3xl bg-white shadow-sm"
              style={{
                transform: `translateY(${(i + 1) * 10}px) scale(${1 - (i + 1) * 0.025})`,
                zIndex: 2 - i,
                height: '100%',
                opacity: 0.6 - i * 0.25,
              }}
            />
          ))}
          <AnimatePresence mode="popLayout">
            {current && (
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: exitDir * 420, rotate: exitDir * 6 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="relative z-10"
              >
                <TriageCard anomaly={current} onDecide={decide} busy={resolve.isPending} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {pending.map((a) => (
            <ListCard key={a.id} anomaly={a} onDecide={decide} busy={resolve.isPending} />
          ))}
        </div>
      )}
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-muted text-foreground rounded-md border px-1.5 py-0.5 font-mono text-[10px]">
      {children}
    </kbd>
  )
}

function TriageCard({
  anomaly: a,
  onDecide,
  busy,
}: {
  anomaly: ImportAnomaly
  onDecide: (a: ImportAnomaly, s: 'approved' | 'rejected', r?: Record<string, unknown>) => void
  busy: boolean
}) {
  const needsPayer = a.anomaly_type === 'MISSING_PAYER'
  const [payer, setPayer] = useState('')
  const candidates = (a.after_json?.candidates as string[] | undefined) ?? []
  const canApprove = !busy && (!needsPayer || !!payer)

  // Keyboard triage — disabled while typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key.toLowerCase() === 'a' && canApprove) {
        onDecide(a, 'approved', needsPayer && payer ? { payer } : undefined)
      }
      if (e.key.toLowerCase() === 'r' && !busy) {
        onDecide(a, 'rejected')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [a, busy, canApprove, needsPayer, payer, onDecide])

  return (
    <div className="rounded-3xl bg-white p-6 shadow-md sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        {severityIcon[a.severity]}
        <h3 className="text-lg font-semibold tracking-tight">{typeTitle(a.anomaly_type)}</h3>
        <span className="bg-muted text-muted-foreground ml-auto rounded-md px-2 py-1 font-mono text-[10px]">
          {a.anomaly_type} · row{a.source_row_numbers.length > 1 ? 's' : ''}{' '}
          {a.source_row_numbers.join(', ')}
        </span>
      </div>

      <p className="mt-3 text-[15px] leading-relaxed">{a.description}</p>

      {(a.before_json || a.after_json) && (
        <div className="bg-muted/60 mt-4 rounded-2xl p-4">
          <DiffRows before={a.before_json} after={a.after_json} />
        </div>
      )}

      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{a.policy}</p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {needsPayer && (
          <Select value={payer} onValueChange={setPayer}>
            <SelectTrigger className="h-11 w-44 rounded-xl">
              <SelectValue placeholder="Who paid?" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          className="h-11 flex-1 rounded-xl sm:flex-none sm:px-8"
          disabled={!canApprove}
          onClick={() => onDecide(a, 'approved', needsPayer && payer ? { payer } : undefined)}
        >
          <Check />
          Approve
        </Button>
        <Button
          variant="outline"
          className="h-11 rounded-xl sm:px-6"
          disabled={busy}
          onClick={() => onDecide(a, 'rejected')}
        >
          <X />
          Reject
        </Button>
      </div>
    </div>
  )
}

function ListCard({
  anomaly: a,
  onDecide,
  busy,
}: {
  anomaly: ImportAnomaly
  onDecide: (a: ImportAnomaly, s: 'approved' | 'rejected', r?: Record<string, unknown>) => void
  busy: boolean
}) {
  const needsPayer = a.anomaly_type === 'MISSING_PAYER'
  const [payer, setPayer] = useState('')
  const candidates = (a.after_json?.candidates as string[] | undefined) ?? []

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {severityIcon[a.severity]}
          <span className="text-sm font-semibold">{typeTitle(a.anomaly_type)}</span>
          <span className="text-muted-foreground text-xs">
            row{a.source_row_numbers.length > 1 ? 's' : ''} {a.source_row_numbers.join(', ')}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{a.description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {needsPayer && (
          <Select value={payer} onValueChange={setPayer}>
            <SelectTrigger size="sm" className="w-36 rounded-lg">
              <SelectValue placeholder="Who paid?" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          size="sm"
          className="rounded-lg"
          disabled={busy || (needsPayer && !payer)}
          onClick={() => onDecide(a, 'approved', needsPayer && payer ? { payer } : undefined)}
        >
          <Check />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg"
          disabled={busy}
          onClick={() => onDecide(a, 'rejected')}
        >
          <X />
        </Button>
      </div>
    </div>
  )
}
