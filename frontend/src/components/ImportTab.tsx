import { useState } from 'react'
import {
  useCommitImport,
  useImportBatch,
  useResolveAnomaly,
  useUploadImport,
} from '../api/hooks'
import { apiBase, tokens } from '../api/client'
import type { Group, ImportAnomaly } from '../types'

/**
 * Import wizard: upload → review anomalies → commit → report.
 *
 * The review step is the approval gate: destructive or interpretive changes
 * (deletes, merges, reclassifications, re-splits) sit in "Needs your decision"
 * and nothing is written until each is approved or rejected. Auto-applied
 * normalizations are shown too — surfaced, never silent.
 */
export default function ImportTab({ group }: { group: Group }) {
  const [batchId, setBatchId] = useState<number | null>(null)
  const upload = useUploadImport(group.id)
  const { data: batch } = useImportBatch(batchId)
  const commit = useCommitImport(group.id, batchId)
  const [error, setError] = useState('')

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const b = await upload.mutateAsync(file)
      setBatchId(b.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  if (!batch) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
        <h2 className="font-semibold">Import a spreadsheet export</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Upload the CSV exactly as exported. Every data problem is detected and shown to
          you before anything is written — deletions and changes need your approval.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <label className="inline-block rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 cursor-pointer">
          {upload.isPending ? 'Analyzing…' : 'Choose CSV file'}
          <input type="file" accept=".csv" onChange={onFile} className="hidden" />
        </label>
      </div>
    )
  }

  if (batch.status === 'committed') {
    return <ImportReportView batchId={batch.id} />
  }

  const pending = batch.anomalies.filter((a) => a.status === 'pending_approval')
  const decided = batch.anomalies.filter((a) => a.status === 'approved' || a.status === 'rejected')
  const auto = batch.anomalies.filter((a) => a.status === 'auto_applied')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-3">
        <div className="text-sm">
          <b>{batch.filename}</b> — {batch.total_rows} rows,{' '}
          {batch.anomalies.length} anomalies detected
        </div>
        <button
          onClick={() => commit.mutateAsync().catch((e) => setError(e.message))}
          disabled={pending.length > 0 || commit.isPending}
          className="rounded-lg bg-indigo-600 text-white px-4 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          title={pending.length > 0 ? 'Decide every pending anomaly first' : ''}
        >
          {commit.isPending
            ? 'Committing…'
            : pending.length > 0
              ? `Commit (${pending.length} decisions left)`
              : 'Commit import'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>}

      {pending.length > 0 && (
        <Section title={`Needs your decision (${pending.length})`} tone="amber">
          {pending.map((a) => (
            <AnomalyCard key={a.id} anomaly={a} batchId={batch.id} group={group} decidable />
          ))}
        </Section>
      )}

      {decided.length > 0 && (
        <Section title={`Decided (${decided.length})`} tone="green">
          {decided.map((a) => (
            <AnomalyCard key={a.id} anomaly={a} batchId={batch.id} group={group} />
          ))}
        </Section>
      )}

      <Section title={`Auto-applied normalizations (${auto.length})`} tone="slate">
        {auto.map((a) => (
          <AnomalyCard key={a.id} anomaly={a} batchId={batch.id} group={group} />
        ))}
      </Section>
    </div>
  )
}

function Section({
  title,
  tone,
  children,
}: {
  title: string
  tone: 'amber' | 'green' | 'slate'
  children: React.ReactNode
}) {
  const colors = {
    amber: 'text-amber-800',
    green: 'text-green-800',
    slate: 'text-slate-600',
  }
  return (
    <section>
      <h2 className={`font-semibold mb-2 ${colors[tone]}`}>{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

const decisionBadge: Record<string, string> = {
  auto_applied: 'bg-slate-200 text-slate-600',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

function AnomalyCard({
  anomaly: a,
  batchId,
  group,
  decidable = false,
}: {
  anomaly: ImportAnomaly
  batchId: number
  group: Group
  decidable?: boolean
}) {
  const resolve = useResolveAnomaly(batchId)
  const [payer, setPayer] = useState('')
  const needsPayer = a.anomaly_type === 'MISSING_PAYER'
  const memberNames = group.memberships.map((m) => m.person.name)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs font-semibold">{a.anomaly_type}</span>
        <span className="text-xs text-slate-400">
          row{a.source_row_numbers.length > 1 ? 's' : ''} {a.source_row_numbers.join(', ')}
        </span>
        <span className={`text-xs rounded px-1.5 py-0.5 ${decisionBadge[a.status]}`}>
          {a.status.replace('_', ' ')}
        </span>
        <span className="text-xs text-slate-400">{a.severity}</span>
      </div>
      <p className="text-slate-700">{a.description}</p>
      <p className="text-slate-500 text-xs">
        <b>Policy:</b> {a.policy}
      </p>
      {(a.before_json || a.after_json) && (
        <div className="flex gap-3 text-xs font-mono">
          {a.before_json && (
            <span className="bg-red-50 text-red-800 rounded px-2 py-1">
              before: {JSON.stringify(a.before_json)}
            </span>
          )}
          {a.after_json && (
            <span className="bg-green-50 text-green-800 rounded px-2 py-1">
              after: {JSON.stringify(a.after_json)}
            </span>
          )}
        </div>
      )}

      {decidable && (
        <div className="flex items-center gap-2 pt-1">
          {needsPayer && (
            <select
              value={payer}
              onChange={(e) => setPayer(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="">Who paid?</option>
              {memberNames.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          )}
          <button
            onClick={() =>
              resolve.mutate({
                anomalyId: a.id,
                status: 'approved',
                resolution: needsPayer && payer ? { payer } : undefined,
              })
            }
            disabled={resolve.isPending || (needsPayer && !payer)}
            className="rounded-lg bg-green-600 text-white px-3 py-1 text-xs font-medium hover:bg-green-700 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => resolve.mutate({ anomalyId: a.id, status: 'rejected' })}
            disabled={resolve.isPending}
            className="rounded-lg bg-white border border-slate-300 text-slate-700 px-3 py-1 text-xs font-medium hover:bg-slate-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

function ImportReportView({ batchId }: { batchId: number }) {
  const { data: batch } = useImportBatch(batchId)
  const report = batch?.report_json
  if (!report) return <p className="text-slate-400">Loading report…</p>

  async function download() {
    // Authenticated download of the Markdown report.
    const res = await fetch(`${apiBase}/api/imports/${batchId}/report/?format=md`, {
      headers: { Authorization: `Bearer ${tokens.access}` },
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `import-report-${batchId}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
        <div className="text-sm text-green-900">
          <b>Import committed.</b> {report.total_rows} rows processed,{' '}
          {report.summary.anomalies_detected} anomalies handled (
          {report.summary.anomaly_types} types).
        </div>
        <button
          onClick={download}
          className="rounded-lg bg-green-700 text-white px-4 py-1.5 text-sm font-medium hover:bg-green-800"
        >
          Download report (.md)
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(report.summary.row_outcomes).map(([k, v]) => (
          <div key={k} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
            <div className="text-2xl font-bold">{v}</div>
            <div className="text-xs text-slate-500">{k.replace(/_/g, ' ')}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="font-semibold mb-2">Anomalies — detected, surfaced, handled</h2>
        <div className="space-y-2">
          {report.anomalies.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-4 text-sm">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-mono text-xs font-semibold">{a.type}</span>
                <span className="text-xs text-slate-400">rows {a.rows.join(', ')}</span>
                <span className={`text-xs rounded px-1.5 py-0.5 ${decisionBadge[a.decision]}`}>
                  {a.decision.replace('_', ' ')}
                </span>
              </div>
              <p className="text-slate-700">{a.description}</p>
              <p className="text-slate-500 text-xs mt-1">
                <b>Action:</b> {a.policy}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
