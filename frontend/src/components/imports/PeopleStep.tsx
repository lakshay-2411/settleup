import { useState } from 'react'
import { Check, UserRound, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useResolveAnomaly } from '@/api/hooks'
import { PersonAvatar } from '@/components/app/PersonAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { ImportAnomaly } from '@/types'

/**
 * "Who are these people?" — one card per unknown person. The join/leave dates
 * entered here decide which expenses each person can share; the data checks
 * re-run against them before the review step.
 */
export function PeopleStep({
  people,
  decided,
  batchId,
}: {
  people: ImportAnomaly[]
  decided: ImportAnomaly[]
  batchId: number
}) {
  const total = people.length + decided.length

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Who are these people?</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            They’re in the file but not in the group. The dates you set decide which expenses
            they can share.
          </p>
        </div>
        <span className="text-muted-foreground tnum text-sm">
          {decided.length}/{total} confirmed
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {people.map((a, i) => (
          <PersonCard key={a.id} anomaly={a} batchId={batchId} index={i} />
        ))}
        {decided.map((a) => (
          <ConfirmedCard key={a.id} anomaly={a} />
        ))}
      </div>
    </div>
  )
}

function PersonCard({
  anomaly: a,
  batchId,
  index,
}: {
  anomaly: ImportAnomaly
  batchId: number
  index: number
}) {
  const resolve = useResolveAnomaly(batchId)
  const isAlias = a.anomaly_type === 'NAME_ALIAS_AMBIGUOUS'
  const name = isAlias
    ? String(a.before_json?.name ?? '')
    : String(a.after_json?.create_guest ?? '')
  const defaultWindow = (a.after_json?.window as [string | null, string | null]) ?? [null, null]

  // Default to member: most people in a household export are flatmates
  // (trip visitors like Dev/Kabir get toggled to guest by hand).
  const [role, setRole] = useState<'member' | 'guest'>('member')
  const [joined, setJoined] = useState(defaultWindow[0] ?? '')
  // Blank matches the member default ("blank = still here"); toggling to guest
  // pre-fills the last appearance date, back to member clears it.
  const [left, setLeft] = useState('')

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: 'easeOut' }}
      className="rounded-3xl bg-white p-5 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <PersonAvatar name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold tracking-tight">{name}</p>
          <p className="text-muted-foreground text-xs">
            appears on row{a.source_row_numbers.length > 1 ? 's' : ''}{' '}
            {a.source_row_numbers.slice(0, 6).join(', ')}
            {a.source_row_numbers.length > 6 && '…'}
          </p>
        </div>
      </div>

      {isAlias ? (
        <AliasBody anomaly={a} resolve={resolve} />
      ) : (
        <>
          <div className="mt-4 space-y-2.5">
            <Tabs
              value={role}
              onValueChange={(v) => {
                const r = v as 'member' | 'guest'
                setRole(r)
                setLeft(r === 'member' ? '' : (defaultWindow[1] ?? ''))
              }}
            >
              <TabsList className="w-full rounded-xl">
                <TabsTrigger value="member" className="flex-1 rounded-lg">
                  Member
                </TabsTrigger>
                <TabsTrigger value="guest" className="flex-1 rounded-lg">
                  Guest
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-muted-foreground text-[11px] font-medium">
                Joined
                <Input
                  type="date"
                  value={joined}
                  onChange={(e) => setJoined(e.target.value)}
                  className="mt-0.5 h-9 rounded-lg text-xs"
                />
              </label>
              <label className="text-muted-foreground text-[11px] font-medium">
                Left <span className="font-normal opacity-60">(blank = here)</span>
                <Input
                  type="date"
                  value={left}
                  min={joined || undefined}
                  onChange={(e) => setLeft(e.target.value)}
                  className="mt-0.5 h-9 rounded-lg text-xs"
                />
              </label>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              className="h-9 flex-1 rounded-xl"
              disabled={resolve.isPending || !joined}
              onClick={() =>
                resolve.mutate({
                  anomalyId: a.id,
                  status: 'approved',
                  resolution: { role, joined_on: joined || null, left_on: left || null },
                })
              }
            >
              <Check />
              Add as {role}
            </Button>
            <Button
              variant="ghost"
              className="text-muted-foreground h-9 rounded-xl"
              disabled={resolve.isPending}
              title="Remove them from these splits and re-divide among the rest"
              onClick={() => resolve.mutate({ anomalyId: a.id, status: 'rejected' })}
            >
              <X />
            </Button>
          </div>
        </>
      )}
    </motion.div>
  )
}

function AliasBody({
  anomaly: a,
  resolve,
}: {
  anomaly: ImportAnomaly
  resolve: ReturnType<typeof useResolveAnomaly>
}) {
  const canonical = String(a.after_json?.alias_of ?? '')
  return (
    <>
      <p className="text-muted-foreground mt-3 text-sm">
        Looks like <b className="text-foreground">{canonical}</b> with a surname initial — but
        could be a different person.
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          className="h-9 flex-1 rounded-xl"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ anomalyId: a.id, status: 'approved' })}
        >
          <Check />
          Same as {canonical}
        </Button>
        <Button
          variant="outline"
          className="h-9 rounded-xl"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ anomalyId: a.id, status: 'rejected' })}
        >
          Different person
        </Button>
      </div>
    </>
  )
}

function ConfirmedCard({ anomaly: a }: { anomaly: ImportAnomaly }) {
  const isAlias = a.anomaly_type === 'NAME_ALIAS_AMBIGUOUS'
  const name = isAlias
    ? String(a.before_json?.name ?? '')
    : String(a.after_json?.create_guest ?? '')
  const res = (a.resolution_json ?? {}) as { role?: string; joined_on?: string; left_on?: string }
  const rejected = a.status === 'rejected'

  return (
    <motion.div
      layout
      className={cn(
        'flex items-center gap-3 rounded-3xl border border-dashed p-4',
        rejected ? 'opacity-55' : 'border-primary/30 bg-primary/5',
      )}
    >
      <PersonAvatar name={name} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="text-muted-foreground text-xs">
          {rejected
            ? isAlias
              ? 'separate person'
              : 'removed from splits'
            : isAlias
              ? `same as ${a.after_json?.alias_of}`
              : `${res.role ?? 'guest'} · ${res.joined_on ?? '—'} → ${res.left_on ?? 'present'}`}
        </p>
      </div>
      <span
        className={cn(
          'flex size-6 items-center justify-center rounded-full',
          rejected ? 'bg-muted text-muted-foreground' : 'bg-primary text-white',
        )}
      >
        {rejected ? <UserRound className="size-3.5" /> : <Check className="size-3.5" />}
      </span>
    </motion.div>
  )
}
