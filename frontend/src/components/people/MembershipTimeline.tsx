import { useMemo } from 'react'
import { motion } from 'motion/react'
import { PersonAvatar } from '@/components/app/PersonAvatar'
import { cn } from '@/lib/utils'
import { personColor } from '@/lib/person'
import type { Membership, Person } from '@/types'

type StoryEvent = {
  date: string // ISO
  kind: 'founding' | 'join' | 'guest' | 'leave'
  people: Person[]
  guestDays?: number
}

const DAY_MS = 86_400_000

function listNames(people: Person[]) {
  const names = people.map((p) => p.name)
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function shortDate(iso: string, withYear = false) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

/**
 * "Who lived here when" as the flat's story: a vertical feed of the moments
 * membership changed — move-ins, guest visits, move-outs — ending at today.
 * Same rule, told as events: an expense only splits among people active on
 * its date.
 */
export function MembershipTimeline({ memberships }: { memberships: Membership[] }) {
  const events = useMemo<StoryEvent[]>(() => {
    const out: StoryEvent[] = []

    for (const m of memberships) {
      if (m.person.is_guest) {
        const end = m.left_on ?? new Date().toISOString().slice(0, 10)
        const days =
          Math.round(
            (new Date(end + 'T00:00:00').getTime() -
              new Date(m.joined_on + 'T00:00:00').getTime()) /
              DAY_MS,
          ) + 1
        out.push({ date: m.joined_on, kind: 'guest', people: [m.person], guestDays: days })
      } else {
        out.push({ date: m.joined_on, kind: 'join', people: [m.person] })
        if (m.left_on) out.push({ date: m.left_on, kind: 'leave', people: [m.person] })
      }
    }

    // joins first on equal dates, so "moves in" reads before "moves out"
    const kindOrder = { join: 0, guest: 1, leave: 2 } as Record<string, number>
    out.sort((a, b) => a.date.localeCompare(b.date) || kindOrder[a.kind] - kindOrder[b.kind])

    // merge same-day member joins into one event; the earliest becomes the founding
    const merged: StoryEvent[] = []
    for (const e of out) {
      const last = merged[merged.length - 1]
      if (e.kind === 'join' && last?.kind === 'join' && last.date === e.date) {
        last.people.push(...e.people)
      } else {
        merged.push({ ...e, people: [...e.people] })
      }
    }
    if (merged[0]?.kind === 'join' && merged[0].people.length > 1) {
      merged[0].kind = 'founding'
    }
    return merged
  }, [memberships])

  const active = memberships.filter((m) => !m.left_on).map((m) => m.person)

  if (events.length === 0) return null

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
          Who lived here when
        </p>
        <p className="text-muted-foreground text-xs">
          expenses only split among people active on the date
        </p>
      </div>

      <div className="relative mt-5 pl-6">
        {/* the spine */}
        <span className="bg-border absolute top-1.5 bottom-1.5 left-[7px] w-0.5 rounded-full" />

        <div className="space-y-5">
          {events.map((e, i) => (
            <Event key={`${e.date}-${e.kind}-${e.people[0]?.id}`} event={e} index={i} first={i === 0} />
          ))}

          {/* today */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: events.length * 0.07, duration: 0.3, ease: 'easeOut' }}
            className="relative"
          >
            <span className="bg-primary ring-background absolute top-0.5 -left-6 size-4 rounded-full ring-4" />
            <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
              Today
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span>
                <b>{active.length} active</b>
                {active.length > 0 && <> — {listNames(active)}</>}
              </span>
              <AvatarCluster people={active} />
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

function Event({ event: e, index, first }: { event: StoryEvent; index: number; first: boolean }) {
  const person = e.people[0]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.3, ease: 'easeOut' }}
      className="relative"
    >
      {/* the dot: person-colored; departures are hollow */}
      {e.kind === 'leave' ? (
        <span className="ring-background border-border absolute top-0.5 -left-6 flex size-4 items-center justify-center rounded-full border-2 bg-white ring-4">
          <span className={cn('size-1.5 rounded-full opacity-50', personColor(person.name))} />
        </span>
      ) : (
        <span
          className={cn(
            'ring-background absolute top-0.5 -left-6 size-4 rounded-full ring-4',
            personColor(person.name),
          )}
        />
      )}

      <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
        {shortDate(e.date, first)}
      </p>

      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {e.kind === 'founding' && (
          <span>
            <b>The flat begins</b> — {listNames(e.people)} move in
          </span>
        )}
        {e.kind === 'join' && (
          <span>
            <b>{listNames(e.people)}</b> {e.people.length > 1 ? 'move' : 'moves'} in
          </span>
        )}
        {e.kind === 'guest' && (
          <span>
            <b>{person.name}</b> {e.guestDays === 1 ? 'joins for a single day' : 'arrives as a guest'}
          </span>
        )}
        {e.kind === 'leave' && (
          <span>
            <b>{person.name}</b> moves out
          </span>
        )}

        {e.kind === 'guest' && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            guest · {e.guestDays === 1 ? '1 day' : `${e.guestDays} days`}
          </span>
        )}
        {e.kind === 'leave' && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
            left
          </span>
        )}
        {e.kind === 'join' && !first && (
          <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold">
            joined
          </span>
        )}

        <AvatarCluster people={e.people} />
      </p>

      {/* the rule, spelled out where it bites */}
      {e.kind === 'leave' && (
        <p className="text-muted-foreground mt-0.5 text-xs">
          nothing dated after this can charge {person.name}
        </p>
      )}
      {e.kind === 'join' && !first && (
        <p className="text-muted-foreground mt-0.5 text-xs">
          shares nothing dated before this
        </p>
      )}
      {e.kind === 'guest' && e.guestDays === 1 && (
        <p className="text-muted-foreground mt-0.5 text-xs">
          shares only that day’s expenses
        </p>
      )}
    </motion.div>
  )
}

function AvatarCluster({ people }: { people: Person[] }) {
  if (people.length === 0) return null
  return (
    <span className="inline-flex items-center">
      {people.map((p, i) => (
        <PersonAvatar
          key={p.id}
          name={p.name}
          size="sm"
          className={cn('ring-2 ring-white', i > 0 && '-ml-1.5')}
        />
      ))}
    </span>
  )
}
