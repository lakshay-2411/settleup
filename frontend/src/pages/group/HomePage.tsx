import { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, FileUp, MoveRight, Plus, Scale, TrendingUp, Wallet } from 'lucide-react'
import { motion } from 'motion/react'
import { useBalances, useExpenses, useSimplifiedBalances } from '@/api/hooks'
import { CountUpMoney } from '@/components/app/CountUp'
import { EmptyState } from '@/components/app/EmptyState'
import { Money } from '@/components/app/Money'
import { PersonAvatar } from '@/components/app/PersonAvatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { categoryIcon } from '@/lib/category'
import { inrCompact } from '@/lib/money'
import type { Group } from '@/types'

// recharts is heavy; keep it out of the main bundle.
const SpendingChart = lazy(() => import('@/components/home/SpendingChart'))

export default function HomePage({ group }: { group: Group }) {
  const { data: balances, isLoading: loadingBalances } = useBalances(group.id)
  const { data: expenses, isLoading: loadingExpenses } = useExpenses(group.id)
  const { data: transfers } = useSimplifiedBalances(group.id)

  if (loadingBalances || loadingExpenses) {
    return (
      <div className="space-y-4 py-4">
        <Skeleton className="h-48 w-full rounded-3xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-3xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      </div>
    )
  }

  const hasData = (expenses?.length ?? 0) > 0

  if (!hasData) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10">
        <EmptyState
          icon={Wallet}
          title={`Let’s set up ${group.name}`}
          actions={
            <>
              <Button asChild className="rounded-xl">
                <Link to={`/groups/${group.id}/people`}>Add flatmates</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl">
                <Link to={`/groups/${group.id}/import`}>
                  <FileUp />
                  Import CSV
                </Link>
              </Button>
            </>
          }
        >
          Start either way: add your flatmates with their move-in dates, or import your
          existing spreadsheet — everyone found in the file is proposed to you for approval.
        </EmptyState>
      </div>
    )
  }

  const outstanding = balances?.reduce((a, b) => a + Math.max(0, Number(b.net)), 0) ?? 0
  const totalSpent = balances?.reduce((a, b) => a + Number(b.paid), 0) ?? 0
  const biggest = transfers?.[0]
  const rest = transfers?.slice(1, 5) ?? []
  const recent = [...(expenses ?? [])]
    .filter((e) => e.status === 'active')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)

  return (
    <div className="space-y-4 py-4">
      {/* wide hero banner */}
      <motion.section
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="bg-primary relative overflow-hidden rounded-3xl px-8 py-8 text-white shadow-lg shadow-primary/20"
      >
        <div className="pointer-events-none absolute -top-32 right-24 size-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 -bottom-24 size-64 rounded-full bg-white/5 blur-2xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-white/70">Unsettled right now</p>
            <p className="mt-1 text-5xl font-semibold tracking-tight">
              <CountUpMoney value={outstanding} />
            </p>
            <p className="mt-2 text-sm text-white/70">
              {outstanding === 0
                ? 'All square — nothing owed.'
                : `${transfers?.length ?? 0} payment${(transfers?.length ?? 0) === 1 ? '' : 's'} would clear everything · ${inrCompact(totalSpent)} spent so far`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              variant="secondary"
              className="h-11 rounded-xl bg-white px-5 font-semibold text-primary hover:bg-white/90"
            >
              <Link to={`/groups/${group.id}/add`}>
                <Plus />
                Add expense
              </Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              className="h-11 rounded-xl bg-white/15 px-5 text-white hover:bg-white/25"
            >
              <Link to={`/groups/${group.id}/settle`}>
                <Scale />
                Settle up
              </Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              className="h-11 rounded-xl bg-white/15 px-5 text-white hover:bg-white/25"
            >
              <Link to={`/groups/${group.id}/import`}>
                <FileUp />
                Import
              </Link>
            </Button>
          </div>
        </div>
      </motion.section>

      {/* chart + debts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-3xl bg-white p-6 shadow-sm lg:col-span-2">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase">
            <TrendingUp className="size-3.5" />
            Spending by month
          </p>
          <div className="mt-4 h-56">
            <Suspense fallback={<Skeleton className="h-full w-full rounded-xl" />}>
              <SpendingChart expenses={expenses ?? []} />
            </Suspense>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          {biggest && (
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                Biggest debt
              </p>
              <div className="mt-3 flex items-center gap-2">
                <PersonAvatar name={biggest.from.name} size="lg" />
                <MoveRight className="text-muted-foreground/50 size-4 shrink-0" />
                <PersonAvatar name={biggest.to.name} size="lg" />
                <span className="min-w-0 flex-1" />
                <Button asChild size="sm" className="rounded-lg">
                  <Link to={`/groups/${group.id}/settle`}>Settle</Link>
                </Button>
              </div>
              <p className="mt-3 truncate text-sm">
                <b>{biggest.from.name}</b> owes <b>{biggest.to.name}</b>
              </p>
              <Money value={biggest.amount} className="text-2xl font-semibold tracking-tight" />
            </div>
          )}

          {rest.length > 0 && (
            <div className="flex-1 rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                Also owed
              </p>
              <div className="mt-2 divide-y">
                {rest.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 py-2">
                    <PersonAvatar name={t.from.name} size="xs" />
                    <MoveRight className="text-muted-foreground/40 size-3 shrink-0" />
                    <PersonAvatar name={t.to.name} size="xs" />
                    <span className="text-muted-foreground min-w-0 flex-1 truncate pl-1 text-xs">
                      {t.from.name} → {t.to.name}
                    </span>
                    <Money value={t.amount} className="text-xs font-semibold" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* recent activity */}
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
            Recent
          </p>
          <Button asChild variant="ghost" size="sm" className="text-primary -my-1 h-7 rounded-lg">
            <Link to={`/groups/${group.id}/activity`}>
              See all
              <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="mt-2 grid gap-x-10 sm:grid-cols-2">
          {recent.map((e) => {
            const Icon = categoryIcon(e.description)
            return (
              <div key={e.id} className="flex items-center gap-3 border-b py-2.5 last:border-0 sm:nth-last-2:border-0">
                <span className="bg-secondary text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
                  <Icon className="size-4" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{e.description}</span>
                  <span className="text-muted-foreground text-xs">
                    {e.payer?.name ?? 'unknown'} ·{' '}
                    {new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </span>
                <Money value={e.amount_inr} className="text-sm font-semibold" />
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
