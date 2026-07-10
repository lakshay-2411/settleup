import { useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAddMember, useUpdateMember } from '@/api/hooks'
import { EmptyState } from '@/components/app/EmptyState'
import { PersonAvatar } from '@/components/app/PersonAvatar'
import { MembershipTimeline } from '@/components/people/MembershipTimeline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Group, Membership } from '@/types'

/**
 * Roster with membership windows — the source of truth for who shares costs
 * on any given date. (Membership timeline visualization lands in P3.)
 */
export default function PeoplePage({ group }: { group: Group }) {
  return (
    <div className="space-y-5 py-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Join and leave dates decide who shares which costs.
        </p>
      </div>

      <AddPersonCard group={group} />

      {group.memberships.length === 0 ? (
        <EmptyState icon={Users} title="Nobody here yet">
          Add each flatmate above with their real move-in date — or import your spreadsheet
          and confirm everyone from there.
        </EmptyState>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {group.memberships.map((m) => (
            <MemberCard key={m.id} membership={m} groupId={group.id} />
          ))}
        </div>
      )}

      {/* the supporting picture: the membership-window rule, made visible */}
      {group.memberships.length > 1 && (
        <MembershipTimeline memberships={group.memberships} />
      )}
    </div>
  )
}

function AddPersonCard({ group }: { group: Group }) {
  const addMember = useAddMember(group.id)
  const [name, setName] = useState('')
  const [joined, setJoined] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await addMember.mutateAsync({ person_name: name.trim(), joined_on: joined })
      toast.success(`${name.trim()} added`)
      setName('')
      setJoined('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the member')
    }
  }

  return (
    <form onSubmit={submit} className="rounded-3xl bg-white p-5 shadow-sm">
      <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
        Add a flatmate
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name — e.g. Aisha"
          className="h-11 min-w-40 flex-1 rounded-xl"
        />
        <Input
          required
          type="date"
          value={joined}
          onChange={(e) => setJoined(e.target.value)}
          className="h-11 w-40 rounded-xl"
          title="Moved in on"
        />
        <Button type="submit" className="h-11 rounded-xl" disabled={addMember.isPending}>
          <UserPlus />
          Add
        </Button>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        The move-in date matters: it decides which expenses they share from day one.
      </p>
    </form>
  )
}

function MemberCard({ membership: m, groupId }: { membership: Membership; groupId: number }) {
  const updateMember = useUpdateMember(groupId)
  const [ending, setEnding] = useState(false)
  const [leftOn, setLeftOn] = useState('')
  const left = !!m.left_on

  async function end(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateMember.mutateAsync({ id: m.id, left_on: leftOn })
      toast.success(`${m.person.name}'s membership ended`)
      setEnding(false)
    } catch {
      toast.error('Could not update the membership')
    }
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm',
        left && 'opacity-60',
      )}
    >
      <PersonAvatar name={m.person.name} size="lg" />
      <div className="min-w-32 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {m.person.name}
          {m.person.is_guest && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              guest
            </span>
          )}
        </p>
        <p className="tnum text-muted-foreground text-xs">
          {m.joined_on} → {m.left_on ?? 'present'}
        </p>
      </div>
      {left ? (
        <span className="text-muted-foreground text-xs font-medium">moved out</span>
      ) : ending ? (
        <form onSubmit={end} className="flex items-center gap-1.5">
          <Input
            type="date"
            required
            min={m.joined_on}
            value={leftOn}
            onChange={(e) => setLeftOn(e.target.value)}
            className="h-9 w-36 rounded-lg text-xs"
          />
          <Button size="sm" className="h-9 rounded-lg" disabled={updateMember.isPending}>
            Confirm
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 rounded-lg"
            onClick={() => setEnding(false)}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-9 rounded-lg text-xs"
          onClick={() => setEnding(true)}
        >
          End membership
        </Button>
      )}
    </div>
  )
}
