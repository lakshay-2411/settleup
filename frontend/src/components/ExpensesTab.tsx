import { useState } from 'react'
import { useCreateExpense, useDeleteExpense, useExpenses } from '../api/hooks'
import type { ExpenseInput } from '../api/hooks'
import type { Expense, Group } from '../types'
import ExpenseForm from './ExpenseForm'

const statusStyle: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  needs_input: 'bg-red-100 text-red-800',
  void: 'bg-slate-200 text-slate-600',
  superseded: 'bg-slate-200 text-slate-600 line-through',
  pending_approval: 'bg-amber-100 text-amber-800',
}

function Money({ e }: { e: Expense }) {
  const inr = `₹${Number(e.amount_inr).toLocaleString('en-IN')}`
  if (e.original_currency === 'INR') return <span>{inr}</span>
  // Foreign-currency rows always show the original next to the conversion.
  return (
    <span>
      {inr}{' '}
      <span className="text-xs text-slate-400">
        (${Number(e.original_amount)} @ {Number(e.fx_rate)})
      </span>
    </span>
  )
}

export default function ExpensesTab({ group }: { group: Group }) {
  const { data: expenses, isLoading } = useExpenses(group.id)
  const createExpense = useCreateExpense(group.id)
  const deleteExpense = useDeleteExpense(group.id)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function submit(input: ExpenseInput) {
    setError('')
    try {
      await createExpense.mutateAsync(input)
      setShowForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-indigo-600 text-white px-4 py-1.5 text-sm font-medium hover:bg-indigo-700"
        >
          + Add expense
        </button>
      </div>

      {isLoading && <p className="text-slate-400">Loading…</p>}
      {expenses && expenses.length === 0 && (
        <p className="text-slate-500">No expenses yet — add one or import a CSV.</p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {expenses?.map((e) => (
          <div key={e.id} className="border-b border-slate-100 last:border-0">
            <button
              onClick={() => setExpanded(expanded === e.id ? null : e.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50"
            >
              <span className="text-slate-400 w-24 shrink-0">{e.date}</span>
              <span className="font-medium flex-1">
                {e.description}
                {e.is_refund && (
                  <span className="ml-2 text-xs bg-blue-100 text-blue-800 rounded px-1.5 py-0.5">
                    refund
                  </span>
                )}
              </span>
              <span className="text-slate-500 w-28 shrink-0">
                {e.payer ? e.payer.name : <em className="text-red-500">unknown</em>}
              </span>
              <span className="w-44 shrink-0 text-right">
                <Money e={e} />
              </span>
              <span
                className={`text-xs rounded px-1.5 py-0.5 shrink-0 ${statusStyle[e.status]}`}
              >
                {e.status}
              </span>
            </button>
            {expanded === e.id && (
              <div className="px-4 pb-3 text-sm bg-slate-50">
                <div className="flex flex-wrap gap-x-8 gap-y-1 py-2">
                  <span className="text-slate-500">
                    split: <b>{e.split_type}</b>
                  </span>
                  {e.source_row_number && (
                    <span className="text-slate-500">imported from CSV row {e.source_row_number}</span>
                  )}
                  {e.notes && <span className="text-slate-500">note: {e.notes}</span>}
                </div>
                {e.shares.length > 0 && (
                  <table className="text-xs w-full max-w-sm">
                    <tbody>
                      {e.shares.map((s) => (
                        <tr key={s.id}>
                          <td className="py-0.5 text-slate-600">{s.person.name}</td>
                          <td className="py-0.5 text-right">
                            ₹{Number(s.share_amount_inr).toLocaleString('en-IN')}
                          </td>
                          {s.weight && (
                            <td className="py-0.5 text-slate-400 pl-3">w={Number(s.weight)}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <button
                  onClick={() => deleteExpense.mutate(e.id)}
                  className="mt-2 text-xs text-slate-400 hover:text-red-600"
                >
                  Delete expense
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showForm && (
        <ExpenseForm
          group={group}
          onSubmit={submit}
          onClose={() => setShowForm(false)}
          busy={createExpense.isPending}
          error={error}
        />
      )}
    </div>
  )
}
