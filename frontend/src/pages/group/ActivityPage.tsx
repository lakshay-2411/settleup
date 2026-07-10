import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileUp, Plus, ReceiptText, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteExpense, useExpenses } from '@/api/hooks'
import { EmptyState } from '@/components/app/EmptyState'
import { Money } from '@/components/app/Money'
import { PersonAvatar } from '@/components/app/PersonAvatar'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { categoryIcon } from '@/lib/category'
import { foreign } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Expense, Group } from '@/types'

type Filter = 'all' | 'needs_input' | 'refunds' | 'excluded'

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'needs_input', label: 'Needs input' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'excluded', label: 'Excluded' },
]

const monthOf = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

/** The ledger as a feed: month sections, icon entries, tap for detail. */
export default function ActivityPage({ group }: { group: Group }) {
  const { data: expenses, isLoading } = useExpenses(group.id)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Expense | null>(null)

  const filtered = useMemo(() => {
    const list = expenses ?? []
    switch (filter) {
      case 'needs_input':
        return list.filter((e) => e.status === 'needs_input')
      case 'refunds':
        return list.filter((e) => e.is_refund)
      case 'excluded':
        return list.filter((e) => e.status === 'void' || e.status === 'superseded')
      default:
        return list
    }
  }, [expenses, filter])

  const byMonth = useMemo(() => {
    const map = new Map<string, Expense[]>()
    for (const e of filtered) {
      const key = monthOf(e.date)
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return [...map.entries()]
  }, [filtered])

  const monthTotals = byMonth.map(([month, list]) => ({
    month,
    total: list
      .filter((e) => e.status === 'active')
      .reduce((acc, e) => acc + Number(e.amount_inr), 0),
    count: list.length,
  }))

  return (
    <div className="py-4 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
      <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <Button asChild size="sm" className="rounded-xl">
          <Link to={`/groups/${group.id}/add`}>
            <Plus />
            Add
          </Link>
        </Button>
      </div>

      {/* filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
              filter === key
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground bg-white shadow-sm',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={ReceiptText}
          title={filter === 'all' ? 'The ledger is empty' : 'Nothing here'}
          actions={
            filter === 'all' ? (
              <>
                <Button asChild size="sm" className="rounded-xl">
                  <Link to={`/groups/${group.id}/add`}>
                    <Plus />
                    Add expense
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="rounded-xl">
                  <Link to={`/groups/${group.id}/import`}>
                    <FileUp />
                    Import CSV
                  </Link>
                </Button>
              </>
            ) : undefined
          }
        >
          {filter === 'all'
            ? 'Log the first shared cost, or bring the whole spreadsheet in one go.'
            : 'No expenses match this filter.'}
        </EmptyState>
      )}

      {byMonth.map(([month, list]) => {
        const total = list
          .filter((e) => e.status === 'active')
          .reduce((acc, e) => acc + Number(e.amount_inr), 0)
        return (
          <section key={month}>
            <div className="bg-background/95 sticky top-14 z-10 -mx-1 flex items-baseline justify-between px-1 py-2 backdrop-blur">
              <h2 className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                {month}
              </h2>
              <Money value={total} className="text-muted-foreground text-xs font-medium" />
            </div>
            <div className="space-y-1.5">
              {list.map((e) => (
                <FeedEntry key={e.id} expense={e} onOpen={() => setSelected(e)} />
              ))}
            </div>
          </section>
        )
      })}

      {selected && (
        <ExpenseDetailSheet
          expense={selected}
          groupId={group.id}
          onClose={() => setSelected(null)}
        />
      )}
      </div>

      {/* desktop summary rail */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
            By month
          </p>
          <div className="mt-2 divide-y">
            {monthTotals.map(({ month, total, count }) => (
              <div key={month} className="flex items-baseline justify-between py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{month}</span>
                  <span className="text-muted-foreground text-xs">
                    {count} {count === 1 ? 'entry' : 'entries'}
                  </span>
                </span>
                <Money value={total} className="text-xs font-semibold" />
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}

function FeedEntry({ expense: e, onOpen }: { expense: Expense; onOpen: () => void }) {
  const Icon = categoryIcon(e.description)
  const excluded = e.status === 'void' || e.status === 'superseded'

  return (
    <button
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-sm transition-all hover:-translate-y-px hover:shadow-md',
        excluded && 'opacity-55',
      )}
    >
      <span className="bg-secondary text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
        <Icon className="size-4.5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-medium', excluded && 'line-through')}>
          {e.description}
        </span>
        <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
          {e.payer ? (
            <>
              <PersonAvatar name={e.payer.name} size="xs" />
              {e.payer.name} · {e.split_type}
            </>
          ) : (
            <span className="font-medium text-red-600">needs a payer</span>
          )}
          {e.is_refund && <span className="text-sky-600 font-medium"> · refund</span>}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <Money value={e.amount_inr} className="text-sm font-semibold" />
        {e.original_currency !== 'INR' && (
          <span className="tnum text-muted-foreground text-[11px]">
            {foreign(e.original_amount, e.original_currency)}
          </span>
        )}
      </span>
    </button>
  )
}

function ExpenseDetailSheet({
  expense: e,
  groupId,
  onClose,
}: {
  expense: Expense
  groupId: number
  onClose: () => void
}) {
  const deleteExpense = useDeleteExpense(groupId)
  const Icon = categoryIcon(e.description)

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-w-2xl rounded-t-3xl pb-8">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <span className="bg-secondary text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl">
              <Icon className="size-5" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate">{e.description}</SheetTitle>
              <SheetDescription className="tnum">
                {new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </SheetDescription>
            </div>
            <Money value={e.amount_inr} className="ml-auto shrink-0 text-xl font-semibold" />
          </div>
        </SheetHeader>

        <div className="space-y-4 px-4">
          <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span>
              paid by <b className="text-foreground">{e.payer?.name ?? 'unknown'}</b>
            </span>
            <span>
              split <b className="text-foreground">{e.split_type}</b>
            </span>
            {e.original_currency !== 'INR' && (
              <span>
                original{' '}
                <b className="text-foreground tnum">
                  {foreign(e.original_amount, e.original_currency)} @ {Number(e.fx_rate)}
                </b>
              </span>
            )}
            {e.source_row_number && <span>CSV row {e.source_row_number}</span>}
            {e.status !== 'active' && (
              <span className="font-medium text-amber-600">{e.status.replace('_', ' ')}</span>
            )}
          </div>

          {e.notes && <p className="text-muted-foreground text-sm">“{e.notes}”</p>}

          {e.shares.length > 0 && (
            <div className="rounded-2xl border">
              <p className="text-muted-foreground border-b px-4 py-2 text-xs font-semibold tracking-widest uppercase">
                Split between
              </p>
              <ul className="divide-y">
                {e.shares.map((s) => (
                  <li key={s.id} className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
                    <PersonAvatar name={s.person.name} size="sm" />
                    <span className="text-muted-foreground flex-1">
                      {s.person.name}
                      {s.weight != null && (
                        <span className="text-muted-foreground/60"> · w {Number(s.weight)}</span>
                      )}
                    </span>
                    <Money value={s.share_amount_inr} className="font-medium" />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground rounded-lg hover:text-red-600"
            onClick={() =>
              deleteExpense.mutate(e.id, {
                onSuccess: () => {
                  toast.success('Expense deleted')
                  onClose()
                },
              })
            }
          >
            <Trash2 />
            Delete expense
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
