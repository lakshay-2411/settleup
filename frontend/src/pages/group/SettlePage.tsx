import { useState } from 'react'
import { MoveRight, PartyPopper, Scale } from 'lucide-react'
import { motion } from 'motion/react'
import { useBalances, useSettlements, useSimplifiedBalances } from '@/api/hooks'
import { EmptyState } from '@/components/app/EmptyState'
import { Money } from '@/components/app/Money'
import { PersonAvatar } from '@/components/app/PersonAvatar'
import { ReceiptsSheet } from '@/components/settle/ReceiptsSheet'
import { SettleDialog } from '@/components/settle/SettleDialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Group, Person } from '@/types'

export default function SettlePage({ group }: { group: Group }) {
  const { data: balances, isLoading } = useBalances(group.id)
  const { data: transfers } = useSimplifiedBalances(group.id)
  const { data: settlements } = useSettlements(group.id)
  const [receiptsFor, setReceiptsFor] = useState<Person | null>(null)
  const [settle, setSettle] = useState<{ from: string; to: string; amount: string } | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-4 py-4">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <div className="grid gap-2 lg:grid-cols-2">
          <Skeleton className="h-24 rounded-3xl" />
          <Skeleton className="h-24 rounded-3xl" />
        </div>
        <Skeleton className="h-72 w-full rounded-3xl" />
      </div>
    )
  }

  const hasBalances = (balances?.length ?? 0) > 0

  return (
    <div className="space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settle</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          The shortest path to everyone being square.
        </p>
      </div>

      {!hasBalances ? (
        <div className="mx-auto max-w-2xl">
          <EmptyState icon={Scale} title="Nothing to balance yet">
            Add expenses (or import your spreadsheet) and the who-owes-whom picture appears
            here, drillable down to every receipt.
          </EmptyState>
        </div>
      ) : (
        <>
          {/* payments to make */}
          {!transfers || transfers.length === 0 ? (
            <div className="mx-auto max-w-2xl">
              <EmptyState icon={PartyPopper} title="All square">
                Nobody owes anything. Enjoy it while it lasts.
              </EmptyState>
            </div>
          ) : (
            <section>
              <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-widest uppercase">
                {transfers.length} payment{transfers.length === 1 ? '' : 's'} to clear everything
              </h2>
              <div className="grid gap-2 lg:grid-cols-2">
                {transfers.map((t, i) => (
                  <motion.div
                    key={`${t.from.id}-${t.to.id}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.25, ease: 'easeOut' }}
                    className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"
                  >
                    <span className="flex shrink-0 items-center gap-1.5">
                      <PersonAvatar name={t.from.name} size="lg" />
                      <MoveRight className="text-muted-foreground/50 size-4" />
                      <PersonAvatar name={t.to.name} size="lg" />
                    </span>
                    <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                      <span className="text-foreground font-semibold">{t.from.name}</span> pays{' '}
                      <span className="text-foreground font-semibold">{t.to.name}</span>
                    </span>
                    <Money value={t.amount} className="shrink-0 text-lg font-semibold" />
                    <Button
                      size="sm"
                      className="rounded-lg"
                      onClick={() =>
                        setSettle({ from: t.from.name, to: t.to.name, amount: t.amount })
                      }
                    >
                      Settle
                    </Button>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* net positions — quiet reference list, the receipts are one click away */}
          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                Net positions
              </h2>
              <p className="text-muted-foreground text-xs">
                net = paid − share + settled · click a person for the receipts
              </p>
            </div>
            <NetList balances={balances ?? []} onSelect={(p) => setReceiptsFor(p)} />
          </section>

          {/* history */}
          <section>
            <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-widest uppercase">
              Settlements recorded
            </h2>
            {settlements?.length === 0 ? (
              <p className="text-muted-foreground text-sm">None yet.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
                {settlements?.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-0"
                  >
                    <span className="tnum text-muted-foreground shrink-0 text-xs">{s.date}</span>
                    <PersonAvatar name={s.from_person.name} size="xs" />
                    <MoveRight className="text-muted-foreground/40 size-3 shrink-0" />
                    <PersonAvatar name={s.to_person.name} size="xs" />
                    <span className="min-w-0 flex-1 truncate pl-1">
                      <b>{s.from_person.name}</b> paid <b>{s.to_person.name}</b>
                      {s.notes && <span className="text-muted-foreground"> — {s.notes}</span>}
                    </span>
                    <Money value={s.amount_inr} className="font-medium" />
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {receiptsFor && (
        <ReceiptsSheet group={group} person={receiptsFor} onClose={() => setReceiptsFor(null)} />
      )}
      {settle && <SettleDialog group={group} initial={settle} onClose={() => setSettle(null)} />}
    </div>
  )
}

/**
 * The numbers carry the story on their own: a ranked list, green for "gets
 * back", red for "owes", a hairline between the two groups. No bars.
 */
function NetList({
  balances,
  onSelect,
}: {
  balances: Array<{ person: Person; net: string; paid: string; share: string }>
  onSelect: (p: Person) => void
}) {
  const sorted = [...balances].sort((a, b) => Number(b.net) - Number(a.net))
  const firstDebtor = sorted.findIndex((b) => Number(b.net) < 0)

  return (
    <div className="mt-3">
      {sorted.map((b, i) => (
        <div key={b.person.id}>
          {i === firstDebtor && i > 0 && <div className="bg-border my-1.5 h-px" />}
          <button
            onClick={() => onSelect(b.person)}
            className="hover:bg-muted/60 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors"
            title="Show the receipts"
          >
            <PersonAvatar name={b.person.name} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.person.name}</span>
            <Money value={b.net} signed className="tnum shrink-0 text-sm font-semibold" />
          </button>
        </div>
      ))}
    </div>
  )
}
