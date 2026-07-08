import { useState } from 'react'
import {
  useBalances,
  useBreakdown,
  useCreateSettlement,
  useSettlements,
  useSimplifiedBalances,
} from '../api/hooks'
import type { Group, Person } from '../types'

const inr = (v: string | number) =>
  `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

/**
 * Three answers on one page:
 *  - "who pays whom" (simplified min-cash-flow) — one number per person
 *  - per-person net positions
 *  - click any person -> full drill-down of the rows behind their number
 * Plus settle-up, pre-fillable from a suggested transfer.
 */
export default function BalancesTab({ group }: { group: Group }) {
  const { data: balances } = useBalances(group.id)
  const { data: transfers } = useSimplifiedBalances(group.id)
  const { data: settlements } = useSettlements(group.id)
  const [selected, setSelected] = useState<Person | null>(null)
  const [settleForm, setSettleForm] = useState<{ from: string; to: string; amount: string } | null>(null)

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-semibold mb-2">Who pays whom</h2>
        {transfers && transfers.length === 0 && (
          <p className="text-slate-500 text-sm">All settled — nobody owes anything.</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {transfers?.map((t, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-3 text-sm"
            >
              <span>
                <b>{t.from.name}</b> pays <b>{t.to.name}</b>
              </span>
              <span className="flex items-center gap-3">
                <span className="font-semibold">{inr(t.amount)}</span>
                <button
                  onClick={() =>
                    setSettleForm({ from: t.from.name, to: t.to.name, amount: t.amount })
                  }
                  className="text-xs rounded-lg bg-indigo-50 text-indigo-700 px-2 py-1 hover:bg-indigo-100"
                >
                  Settle
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Net positions</h2>
        <p className="text-xs text-slate-400 mb-2">
          net = paid − own share + settlements paid − settlements received. Click a row for
          the exact expenses behind the number.
        </p>
        <table className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">Person</th>
              <th className="px-4 py-2 text-right">Paid</th>
              <th className="px-4 py-2 text-right">Share</th>
              <th className="px-4 py-2 text-right">Settled</th>
              <th className="px-4 py-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {balances?.map((b) => (
              <tr
                key={b.person.id}
                onClick={() => setSelected(b.person)}
                className="border-t border-slate-100 cursor-pointer hover:bg-indigo-50"
              >
                <td className="px-4 py-2 font-medium">
                  {b.person.name}
                  {b.person.is_guest && (
                    <span className="ml-2 text-xs bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
                      guest
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">{inr(b.paid)}</td>
                <td className="px-4 py-2 text-right">{inr(b.share)}</td>
                <td className="px-4 py-2 text-right">
                  {inr(Number(b.settled_out) - Number(b.settled_in))}
                </td>
                <td
                  className={`px-4 py-2 text-right font-semibold ${
                    Number(b.net) > 0
                      ? 'text-green-700'
                      : Number(b.net) < 0
                        ? 'text-red-700'
                        : ''
                  }`}
                >
                  {inr(b.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Settlements recorded</h2>
        {settlements && settlements.length === 0 && (
          <p className="text-slate-500 text-sm">None yet.</p>
        )}
        <div className="space-y-1">
          {settlements?.map((s) => (
            <div key={s.id} className="text-sm text-slate-600 bg-white rounded-lg border border-slate-200 px-4 py-2">
              {s.date}: <b>{s.from_person.name}</b> paid <b>{s.to_person.name}</b>{' '}
              {inr(s.amount_inr)}
              {s.notes && <span className="text-slate-400"> — {s.notes}</span>}
            </div>
          ))}
        </div>
      </section>

      {selected && (
        <BreakdownDrawer group={group} person={selected} onClose={() => setSelected(null)} />
      )}
      {settleForm && (
        <SettleModal
          group={group}
          initial={settleForm}
          onClose={() => setSettleForm(null)}
        />
      )}
    </div>
  )
}

function BreakdownDrawer({
  group,
  person,
  onClose,
}: {
  group: Group
  person: Person
  onClose: () => void
}) {
  const { data: bd } = useBreakdown(group.id, person.id)

  return (
    <div className="fixed inset-0 bg-black/30 flex justify-end z-10" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md h-full overflow-y-auto p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{person.name} — breakdown</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        {!bd ? (
          <p className="text-slate-400">Loading…</p>
        ) : (
          <>
            <p className="text-sm bg-slate-100 rounded-lg p-3">
              Net position: <b>{inr(bd.net)}</b>
              <span className="block text-xs text-slate-500 mt-1">
                Every row below contributes to this number — no magic.
              </span>
            </p>

            <section>
              <h3 className="text-sm font-semibold text-green-700 mb-1">
                Paid for the group (+)
              </h3>
              {bd.paid.length === 0 && <p className="text-xs text-slate-400">nothing</p>}
              {bd.paid.map((p) => (
                <div key={p.id} className="flex justify-between text-sm py-0.5">
                  <span className="text-slate-600">
                    {p.date} {p.description}
                    {p.original_currency !== 'INR' && (
                      <span className="text-xs text-slate-400">
                        {' '}
                        ({p.original_amount} {p.original_currency})
                      </span>
                    )}
                  </span>
                  <span>{inr(p.amount_inr)}</span>
                </div>
              ))}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-red-700 mb-1">Own shares (−)</h3>
              {bd.shares.map((s) => (
                <div key={s.expense_id} className="flex justify-between text-sm py-0.5">
                  <span className="text-slate-600">
                    {s.expense__date} {s.expense__description}
                    <span className="text-xs text-slate-400"> ({s.expense__split_type})</span>
                  </span>
                  <span>{inr(s.share_amount_inr)}</span>
                </div>
              ))}
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-1">Settlements</h3>
              {bd.settlements_paid.length + bd.settlements_received.length === 0 && (
                <p className="text-xs text-slate-400">none</p>
              )}
              {bd.settlements_paid.map((s) => (
                <div key={`p${s.id}`} className="flex justify-between text-sm py-0.5">
                  <span className="text-slate-600">
                    {s.date} paid {s.to_person__name} (+)
                  </span>
                  <span>{inr(s.amount_inr)}</span>
                </div>
              ))}
              {bd.settlements_received.map((s) => (
                <div key={`r${s.id}`} className="flex justify-between text-sm py-0.5">
                  <span className="text-slate-600">
                    {s.date} received from {s.from_person__name} (−)
                  </span>
                  <span>{inr(s.amount_inr)}</span>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function SettleModal({
  group,
  initial,
  onClose,
}: {
  group: Group
  initial: { from: string; to: string; amount: string }
  onClose: () => void
}) {
  const createSettlement = useCreateSettlement(group.id)
  const memberNames = group.memberships.map((m) => m.person.name)
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [amount, setAmount] = useState(initial.amount)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await createSettlement.mutateAsync({
        date,
        from_person_name: from,
        to_person_name: to,
        original_amount: amount,
        original_currency: 'INR',
        notes,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-10">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Record payment</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>
            <span className="block text-slate-600 mb-1">From</span>
            <select value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
              {memberNames.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label>
            <span className="block text-slate-600 mb-1">To</span>
            <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">
              {memberNames.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label>
            <span className="block text-slate-600 mb-1">Amount (INR)</span>
            <input required type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
          </label>
          <label>
            <span className="block text-slate-600 mb-1">Date</span>
            <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="col-span-2">
            <span className="block text-slate-600 mb-1">Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5" />
          </label>
        </div>
        <button
          disabled={createSettlement.isPending}
          className="w-full rounded-lg bg-indigo-600 text-white py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {createSettlement.isPending ? 'Saving…' : 'Record payment'}
        </button>
      </form>
    </div>
  )
}
