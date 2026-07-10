import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUp, ShieldCheck, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { useCommitImport, useImportBatch, useUploadImport } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Group } from '@/types'
import { PEOPLE_TYPES } from '@/components/imports/anomalyPresentation'
import { LogTape } from '@/components/imports/LogTape'
import { CommitStep } from '@/components/imports/CommitStep'
import { PeopleStep } from '@/components/imports/PeopleStep'
import { ProgressRail } from '@/components/imports/ProgressRail'
import type { JourneyStep } from '@/components/imports/ProgressRail'
import { ReportStep } from '@/components/imports/ReportStep'
import { ScanScreen } from '@/components/imports/ScanScreen'
import { TriageDeck } from '@/components/imports/TriageDeck'

const MIN_SCAN_MS = 2600 // let the scan read as a scan, even when the API is instant

/**
 * The import journey — a full-screen flow outside the app shell:
 * Upload → Scan → People → Review → Commit → Report.
 * Nothing is written until commit; people decisions come first because the
 * dates they carry decide what the review step can catch.
 */
export default function ImportFlow({ group }: { group: Group }) {
  const navigate = useNavigate()
  const upload = useUploadImport(group.id)
  const [batchId, setBatchId] = useState<number | null>(null)
  const { data: batch } = useImportBatch(batchId)
  const commit = useCommitImport(group.id, batchId)
  const [scanning, setScanning] = useState(false)
  const [filename, setFilename] = useState('')
  const scanStart = useRef(0)

  async function onFile(file: File) {
    setFilename(file.name)
    setScanning(true)
    scanStart.current = Date.now()
    try {
      const b = await upload.mutateAsync(file)
      // hold the scan on screen long enough to read
      const remaining = Math.max(0, MIN_SCAN_MS - (Date.now() - scanStart.current))
      setTimeout(() => {
        setBatchId(b.id)
        setScanning(false)
        toast.success(`${b.total_rows} rows read — ${b.anomalies.length} findings`)
      }, remaining)
    } catch (err) {
      setScanning(false)
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  const anomalies = batch?.anomalies ?? []
  const pending = anomalies.filter((a) => a.status === 'pending_approval')
  const peoplePending = pending.filter((a) => PEOPLE_TYPES.includes(a.anomaly_type))
  const rowPending = pending.filter((a) => !PEOPLE_TYPES.includes(a.anomaly_type))
  const peopleDecided = anomalies.filter(
    (a) => PEOPLE_TYPES.includes(a.anomaly_type) && a.status !== 'pending_approval',
  )
  const rowDecided = anomalies.filter(
    (a) =>
      !PEOPLE_TYPES.includes(a.anomaly_type) &&
      (a.status === 'approved' || a.status === 'rejected'),
  )
  const auto = anomalies.filter((a) => a.status === 'auto_applied')

  const step: JourneyStep = scanning
    ? 'Scan'
    : !batch
      ? 'Upload'
      : batch.status === 'committed'
        ? 'Report'
        : peoplePending.length > 0
          ? 'People'
          : rowPending.length > 0
            ? 'Review'
            : 'Commit'

  async function doCommit() {
    try {
      await commit.mutateAsync()
      toast.success('Import committed — balances are live')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Commit failed')
    }
  }

  return (
    <div className="min-h-screen">
      {/* flow header */}
      <header className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg text-xs font-bold">
            ₹
          </span>
          Import into {group.name}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => navigate(`/groups/${group.id}`)}
          title="Exit — the batch stays right where you left it"
        >
          <X />
        </Button>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-6 pt-4 pb-16 lg:grid-cols-[180px_minmax(0,1fr)]">
        <div className="lg:pt-10">
          <ProgressRail current={step} />
        </div>

        <main className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {step === 'Upload' && <UploadScreen onFile={onFile} />}
              {step === 'Scan' && <ScanScreen filename={filename} />}
              {step === 'People' && batch && (
                <PeopleStep people={peoplePending} decided={peopleDecided} batchId={batch.id} />
              )}
              {step === 'Review' && batch && (
                <TriageDeck
                  pending={rowPending}
                  totalCount={rowPending.length + rowDecided.length}
                  batchId={batch.id}
                />
              )}
              {step === 'Commit' && batch && (
                <CommitStep batch={batch} onCommit={doCommit} committing={commit.isPending} />
              )}
              {step === 'Report' && batch && <ReportStep batch={batch} group={group} />}
            </motion.div>
          </AnimatePresence>

          {/* the transparency tape — always visible during review steps */}
          {(step === 'People' || step === 'Review' || step === 'Commit') && (
            <div className="mt-10">
              <LogTape auto={auto} decided={[...peopleDecided, ...rowDecided]} />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function UploadScreen({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-3xl border-2 border-dashed py-24 text-center transition-colors',
        dragging ? 'border-primary bg-secondary/60' : 'border-border bg-white/60',
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) onFile(file)
      }}
    >
      <motion.span
        animate={dragging ? { scale: 1.1 } : { scale: 1 }}
        className="bg-secondary text-primary rounded-3xl p-5"
      >
        <FileUp className="size-8" strokeWidth={1.6} />
      </motion.span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        Drop the spreadsheet export here
      </h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        Exactly as exported — messy is fine. Duplicates, missing payers, dollar amounts,
        people who moved out: everything is detected and shown to you first.
      </p>
      <Button className="mt-6 h-11 rounded-xl px-6" onClick={() => inputRef.current?.click()}>
        Choose CSV file
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <p className="text-muted-foreground mt-5 flex items-center gap-1.5 text-xs">
        <ShieldCheck className="text-primary size-3.5" />
        Nothing touches your balances until you approve every change.
      </p>
    </div>
  )
}
