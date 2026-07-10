import { useBreakdown } from '@/api/hooks'
import { Money } from '@/components/app/Money'
import { PersonAvatar } from '@/components/app/PersonAvatar'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { foreign } from '@/lib/money'
import type { Group, Person } from '@/types'

/** Rohan's requirement: every line behind one person's number. */
export function ReceiptsSheet({
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
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <PersonAvatar name={person.name} size="sm" />
            {person.name} — the receipts
          </SheetTitle>
          <SheetDescription>
            Every row below adds up to the net position. No magic.
          </SheetDescription>
        </SheetHeader>

        {!bd ? (
          <div className="space-y-3 px-4">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-6 px-4 pb-8">
            <div className="bg-secondary rounded-2xl p-4">
              <p className="text-secondary-foreground/70 text-xs font-medium">Net position</p>
              <Money value={bd.net} signed className="text-2xl font-semibold tracking-tight" />
            </div>

            <Section title="Paid for the group" sign="+">
              {bd.paid.length === 0 && <Empty />}
              {bd.paid.map((p) => (
                <Row
                  key={p.id}
                  date={p.date}
                  label={
                    p.original_currency !== 'INR'
                      ? `${p.description} (${foreign(p.original_amount, p.original_currency)})`
                      : p.description
                  }
                  amount={p.amount_inr}
                />
              ))}
            </Section>

            <Section title="Own shares" sign="−">
              {bd.shares.length === 0 && <Empty />}
              {bd.shares.map((s) => (
                <Row
                  key={s.expense_id}
                  date={s.expense__date}
                  label={`${s.expense__description} (${s.expense__split_type})`}
                  amount={s.share_amount_inr}
                />
              ))}
            </Section>

            <Section title="Settlements" sign="±">
              {bd.settlements_paid.length + bd.settlements_received.length === 0 && <Empty />}
              {bd.settlements_paid.map((s) => (
                <Row
                  key={`p${s.id}`}
                  date={s.date}
                  label={`paid ${s.to_person__name} (+)`}
                  amount={s.amount_inr}
                />
              ))}
              {bd.settlements_received.map((s) => (
                <Row
                  key={`r${s.id}`}
                  date={s.date}
                  label={`received from ${s.from_person__name} (−)`}
                  amount={s.amount_inr}
                />
              ))}
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Section({
  title,
  sign,
  children,
}: {
  title: string
  sign: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-widest uppercase">
        {title} <span className="text-muted-foreground/50">({sign})</span>
      </h3>
      <ul className="divide-y">{children}</ul>
    </section>
  )
}

function Row({ date, label, amount }: { date: string; label: string; amount: string }) {
  return (
    <li className="flex items-baseline gap-2 py-1.5 text-sm">
      <span className="tnum text-muted-foreground shrink-0 text-xs">{date}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Money value={amount} className="text-xs" />
    </li>
  )
}

const Empty = () => <li className="text-muted-foreground py-1 text-xs">nothing</li>
