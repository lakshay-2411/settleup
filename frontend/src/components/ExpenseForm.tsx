import { useMemo, useState } from 'react'
import type { ExpenseInput } from '../api/hooks'
import type { Group, SplitType } from '../types'

/**
 * Expense creation with a split editor that changes shape per split type:
 *   equal      — participant checkboxes
 *   unequal    — exact amount per participant (must sum to the total)
 *   percentage — percent per participant (must sum to 100, validated live)
 *   share      — weight per participant (any positive numbers)
 */
export default function ExpenseForm({
  group,
  onSubmit,
  onClose,
  busy,
  error,
}: {
  group: Group
  onSubmit: (input: ExpenseInput) => void
  onClose: () => void
  busy: boolean
  error: string
}) {
  const memberNames = group.memberships.map((m) => m.person.name)
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [payer, setPayer] = useState(memberNames[0] ?? '')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(group.base_currency)
  const [splitType, setSplitType] = useState<SplitType>('equal')
  const [selected, setSelected] = useState<string[]>(memberNames)
  const [details, setDetails] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')

  function toggle(name: string) {
    setSelected((cur) =>
      cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name],
    )
  }

  const detailSum = useMemo(
    () =>
      selected.reduce((acc, n) => acc + (parseFloat(details[n] ?? '') || 0), 0),
    [selected, details],
  )

  const splitValid = useMemo(() => {
    if (splitType === 'equal') return selected.length > 0
    if (selected.some((n) => !details[n] || isNaN(parseFloat(details[n])))) return false
    if (splitType === 'percentage') return Math.abs(detailSum - 100) < 0.001
    if (splitType === 'unequal') return Math.abs(detailSum - parseFloat(amount || '0')) < 0.001
    return detailSum > 0 // share weights
  }, [splitType, selected, details, detailSum, amount])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      date,
      description,
      payer_name: payer,
      original_amount: amount,
      original_currency: currency,
      split_type: splitType,
      participants: selected,
      split_details:
        splitType === 'equal'
          ? null
          : Object.fromEntries(selected.map((n) => [n, details[n]])),
      notes,
    })
  }

  const unitLabel = { unequal: currency, percentage: '%', share: 'weight' } as const

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-10">
      <form
        onSubmit={submit}
        className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">New expense</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm col-span-2">
            <span className="block text-slate-600 mb-1">Description</span>
            <input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Date</span>
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Paid by</span>
            <select
              value={payer}
              onChange={(e) => setPayer(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
            >
              {memberNames.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Amount</span>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Currency</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
            >
              <option>INR</option>
              <option>USD</option>
            </select>
          </label>
        </div>

        <div>
          <span className="block text-sm text-slate-600 mb-1">Split type</span>
          <div className="flex gap-1">
            {(['equal', 'unequal', 'percentage', 'share'] as SplitType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSplitType(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  splitType === t
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-sm text-slate-600">Participants</span>
          {memberNames.map((n) => (
            <div key={n} className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm flex-1">
                <input
                  type="checkbox"
                  checked={selected.includes(n)}
                  onChange={() => toggle(n)}
                />
                {n}
              </label>
              {splitType !== 'equal' && selected.includes(n) && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="any"
                    value={details[n] ?? ''}
                    onChange={(e) => setDetails({ ...details, [n]: e.target.value })}
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-slate-400 w-12">{unitLabel[splitType]}</span>
                </div>
              )}
            </div>
          ))}
          {splitType === 'percentage' && (
            <p className={`text-xs ${Math.abs(detailSum - 100) < 0.001 ? 'text-green-600' : 'text-red-600'}`}>
              Total: {detailSum.toFixed(1)}% — must be exactly 100%
            </p>
          )}
          {splitType === 'unequal' && (
            <p className={`text-xs ${splitValid ? 'text-green-600' : 'text-red-600'}`}>
              Parts total {detailSum.toFixed(2)} of {amount || '0'} {currency}
            </p>
          )}
        </div>

        <label className="text-sm block">
          <span className="block text-slate-600 mb-1">Notes (optional)</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
          />
        </label>

        <button
          disabled={busy || !splitValid}
          className="w-full rounded-lg bg-indigo-600 text-white py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Add expense'}
        </button>
      </form>
    </div>
  )
}
