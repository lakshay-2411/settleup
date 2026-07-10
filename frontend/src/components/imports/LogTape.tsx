import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ImportAnomaly } from '@/types'
import { typeTitle } from './anomalyPresentation'

/* ------------------------------------------------------------------ */
/* One-line renderings: every log entry is kind · diff · rows.        */
/* ------------------------------------------------------------------ */

const KIND: Record<string, string> = {
  THOUSANDS_SEPARATOR: 'amount format',
  SUB_UNIT_PRECISION: 'rounding',
  NAME_NORMALIZATION: 'name cleanup',
  AMBIGUOUS_DATE: 'date',
  FOREIGN_CURRENCY: 'currency',
  NEGATIVE_AMOUNT_REFUND: 'refund',
  ZERO_AMOUNT: 'zero amount',
  SPLITTYPE_DETAIL_MISMATCH: 'split conflict',
  OUT_OF_ORDER_ROW: 'row order',
  EXACT_DUPLICATE: 'duplicate',
  CONFLICTING_DUPLICATE: 'duplicate',
  SETTLEMENT_AS_EXPENSE: 'settlement',
  MISSING_PAYER: 'payer',
  PERCENTAGE_SUM_INVALID: 'percentages',
  MISSING_CURRENCY: 'currency',
  NON_MEMBER_PARTICIPANT: 'person',
  NAME_ALIAS_AMBIGUOUS: 'alias',
  DEPARTED_MEMBER_IN_SPLIT: 'membership',
}

function Old({ children }: { children: ReactNode }) {
  return <span className="text-red-700/80 line-through decoration-red-300">{children}</span>
}
function New({ children }: { children: ReactNode }) {
  return <span className="text-primary font-semibold">{children}</span>
}
function Arrow() {
  return <span className="text-muted-foreground/50 px-1">→</span>
}

/** Compact diff line per anomaly type — plain-language, values in mono. */
function diffLine(a: ImportAnomaly): ReactNode {
  const before = (a.before_json ?? {}) as Record<string, unknown>
  const after = (a.after_json ?? {}) as Record<string, unknown>
  const res = (a.resolution_json ?? {}) as Record<string, unknown>
  const rejected = a.status === 'rejected'

  switch (a.anomaly_type) {
    case 'THOUSANDS_SEPARATOR':
    case 'SUB_UNIT_PRECISION':
      return (
        <span className="font-mono text-xs">
          <Old>{String(before.amount)}</Old>
          <Arrow />
          <New>{String(after.amount)}</New>
        </span>
      )
    case 'NAME_NORMALIZATION':
      return (
        <span className="font-mono text-xs">
          <Old>{String(before.name)}</Old>
          <Arrow />
          <New>{String(after.name)}</New>
        </span>
      )
    case 'AMBIGUOUS_DATE':
      if (rejected) return <>kept the literal reading <New>{String(before.date)}</New></>
      return (
        <span className="font-mono text-xs">
          <Old>{String(before.date)}</Old>
          <Arrow />
          <New>{String(after.date)}</New>
        </span>
      )
    case 'FOREIGN_CURRENCY':
      return (
        <>
          <span className="font-mono text-xs">
            {(before.currencies as string[])?.join(', ')}
            <Arrow />
            <New>INR @ 83.00</New>
          </span>{' '}
          <span className="text-muted-foreground">· originals kept</span>
        </>
      )
    case 'NEGATIVE_AMOUNT_REFUND':
      return <>negative amount kept as an intentional refund</>
    case 'ZERO_AMOUNT':
      return <>₹0 row parked as void — visible, never counted</>
    case 'SPLITTYPE_DETAIL_MISMATCH':
      return <>stray weights ignored — split_type wins</>
    case 'OUT_OF_ORDER_ROW':
      return <>file order ≠ date order — display sorts by date</>
    case 'EXACT_DUPLICATE':
      return rejected ? (
        <>both rows kept as real expenses</>
      ) : (
        <>
          row <New>{String(after.kept_row)}</New> kept · row{' '}
          <Old>{String(after.superseded_row)}</Old> superseded
        </>
      )
    case 'CONFLICTING_DUPLICATE':
      return rejected ? (
        <>both rows kept as real expenses</>
      ) : (
        <>
          row <New>{String((res.kept_row as number) ?? after.kept_row)}</New> wins · row{' '}
          <Old>{String(after.superseded_row)}</Old> superseded
        </>
      )
    case 'SETTLEMENT_AS_EXPENSE':
      return rejected ? (
        <>kept as a two-person expense</>
      ) : (
        <>
          reclassified: <New>{String(after.from)} paid {String(after.to)}</New>
        </>
      )
    case 'MISSING_PAYER':
      return res.payer ? (
        <>
          payer set to <New>{String(res.payer)}</New>
        </>
      ) : (
        <>held — excluded from balances until a payer is known</>
      )
    case 'PERCENTAGE_SUM_INVALID':
      return rejected ? (
        <>held — percentages still don’t add up</>
      ) : (
        <>
          <span className="font-mono text-xs"><Old>{String(before.sum)}%</Old><Arrow /><New>rescaled proportionally</New></span>
        </>
      )
    case 'MISSING_CURRENCY':
      return rejected ? <>held — currency still unknown</> : <>currency set to <New>INR</New></>
    case 'NON_MEMBER_PARTICIPANT': {
      const name = String(after.create_guest ?? '')
      if (rejected) return <><Old>{name}</Old> — removed from splits, re-divided</>
      const window = (after.window as [string, string]) ?? ['—', '—']
      const joined = String(res.joined_on ?? window[0])
      const left = res.left_on === null ? 'present' : String(res.left_on ?? window[1] ?? 'present')
      return (
        <>
          <New>{name}</New> · {String(res.role ?? 'guest')} ·{' '}
          <span className="font-mono text-xs">{joined}<Arrow />{left}</span>
        </>
      )
    }
    case 'NAME_ALIAS_AMBIGUOUS':
      return rejected ? (
        <><New>{String(before.name)}</New> — a separate person</>
      ) : (
        <>
          <span className="font-mono text-xs">{String(before.name)}<Arrow /><New>{String(after.alias_of)}</New></span>
        </>
      )
    case 'DEPARTED_MEMBER_IN_SPLIT':
      return rejected ? (
        <>split kept exactly as the file listed it</>
      ) : (
        <>
          dropped <Old>{(after.dropped as string[])?.join(', ')}</Old> — re-split among{' '}
          <New>{(after.participants as string[])?.join(', ')}</New>
        </>
      )
    default:
      return <>{typeTitle(a.anomaly_type)}</>
  }
}

function rowsLabel(a: ImportAnomaly) {
  const rows = a.source_row_numbers
  if (rows.length === 1) return `row ${rows[0]}`
  if (rows.length <= 3) return `rows ${rows.join(', ')}`
  return `${rows.length} rows`
}

/* ------------------------------------------------------------------ */

function TapeRow({ anomaly: a, decision }: { anomaly: ImportAnomaly; decision?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-dashed py-1.5 text-[13px] last:border-0">
      {decision ? (
        <span
          className={cn(
            'w-28 shrink-0 text-[11px] font-semibold',
            a.status === 'approved' ? 'text-primary' : 'text-rose-700',
          )}
        >
          {a.status === 'approved' ? '✓ approved' : '✗ rejected'}
        </span>
      ) : (
        <span className="text-muted-foreground w-28 shrink-0 text-[11px] font-semibold">
          {KIND[a.anomaly_type] ?? 'fix'}
        </span>
      )}
      <span className="min-w-0 flex-1">{diffLine(a)}</span>
      <span className="text-muted-foreground/70 tnum shrink-0 text-[10.5px]">{rowsLabel(a)}</span>
    </div>
  )
}

/**
 * The import log as a receipt tape: one dashed-rule line per entry —
 * kind · diff · rows. Auto-fixes and the user's decisions share one card.
 */
export function LogTape({
  auto,
  decided,
}: {
  auto: ImportAnomaly[]
  decided: ImportAnomaly[]
}) {
  if (auto.length === 0 && decided.length === 0) return null

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      {auto.length > 0 && (
        <>
          <p className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-widest uppercase">
            <Sparkles className="text-primary size-3.5" />
            Fixed for you — {auto.length} normalization{auto.length === 1 ? '' : 's'}
          </p>
          <div className="mt-2">
            {auto.map((a) => (
              <TapeRow key={a.id} anomaly={a} />
            ))}
          </div>
        </>
      )}

      {auto.length > 0 && decided.length > 0 && <div className="bg-border my-4 h-px" />}

      {decided.length > 0 && (
        <>
          <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
            Your decisions — {decided.length} so far
          </p>
          <div className="mt-2">
            {decided.map((a) => (
              <TapeRow key={a.id} anomaly={a} decision />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
