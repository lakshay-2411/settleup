// Presentation helpers: humanize anomaly types and before/after diffs so the
// review screens never show raw JSON to the person deciding.

const TITLES: Record<string, string> = {
  EXACT_DUPLICATE: 'Same expense logged twice',
  CONFLICTING_DUPLICATE: 'Two versions of one expense',
  THOUSANDS_SEPARATOR: 'Amount formatting',
  SUB_UNIT_PRECISION: 'Sub-paisa precision',
  NAME_NORMALIZATION: 'Name cleanup',
  NAME_ALIAS_AMBIGUOUS: 'Possible name alias',
  MISSING_PAYER: 'Nobody knows who paid',
  SETTLEMENT_AS_EXPENSE: 'Payment logged as an expense',
  PERCENTAGE_SUM_INVALID: 'Percentages don’t add up to 100',
  FOREIGN_CURRENCY: 'Foreign-currency amounts',
  NEGATIVE_AMOUNT_REFUND: 'Refund (negative amount)',
  NON_MEMBER_PARTICIPANT: 'Person not in the group',
  MISSING_CURRENCY: 'Currency missing',
  AMBIGUOUS_DATE: 'Ambiguous date',
  ZERO_AMOUNT: 'Zero-amount row',
  DEPARTED_MEMBER_IN_SPLIT: 'Includes someone who had left',
  SPLITTYPE_DETAIL_MISMATCH: 'Split type contradicts details',
  OUT_OF_ORDER_ROW: 'Rows out of date order',
}

export function typeTitle(type: string) {
  return TITLES[type] ?? type.replace(/_/g, ' ').toLowerCase()
}

const KEY_LABELS: Record<string, string> = {
  kind: 'type',
  split_type: 'split',
  split_details: 'details',
  superseded_row: 'drop row',
  kept_row: 'keep row',
  create_guest: 'add person',
  window: 'active window',
  alias_of: 'same person as',
  in_roster: 'in roster',
  normalize_as_weights: 'rescale proportionally',
  percentages: 'percentages',
  participants: 'participants',
  dropped: 'remove',
  conversion: 'conversion',
  currencies: 'currencies',
  candidates: 'possible payers',
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.map(fmt).join(', ')
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k} ${fmt(v)}`)
      .join(', ')
  }
  return String(value)
}

/** Before/after rendered as readable "field: old → new" lines, never raw JSON. */
export function DiffRows({
  before,
  after,
}: {
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}) {
  if (!before && !after) return null
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]

  return (
    <dl className="space-y-1 text-sm">
      {keys.map((key) => {
        const b = before?.[key]
        const a = after?.[key]
        const label = KEY_LABELS[key] ?? key.replace(/_/g, ' ')
        return (
          <div key={key} className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-muted-foreground w-32 shrink-0 text-xs font-medium">{label}</dt>
            <dd className="flex flex-wrap items-baseline gap-x-1.5">
              {b !== undefined && a !== undefined && String(b) !== String(a) ? (
                <>
                  <span className="text-red-600/70 line-through decoration-red-300">{fmt(b)}</span>
                  <span className="text-muted-foreground/50">→</span>
                  <span className="text-primary font-semibold">{fmt(a)}</span>
                </>
              ) : a !== undefined ? (
                <span className="text-primary font-semibold">{fmt(a)}</span>
              ) : (
                <span className="text-muted-foreground">{fmt(b)}</span>
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

// Decisions that establish who a person is come first in the flow.
export const PEOPLE_TYPES = ['NON_MEMBER_PARTICIPANT', 'NAME_ALIAS_AMBIGUOUS']
