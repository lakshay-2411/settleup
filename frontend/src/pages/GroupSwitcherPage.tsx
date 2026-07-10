import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Home, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { useCreateGroup, useGroups } from '@/api/hooks'
import { useAuth } from '@/auth/AuthContext'
import { EmptyState } from '@/components/app/EmptyState'
import { PersonAvatarStack } from '@/components/app/PersonAvatar'
import { TopBar } from '@/components/shell/TopBar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

/** Landing screen: pick a group (big cards); creation lives in the header. */
export default function GroupSwitcherPage() {
  const { data: groups, isLoading } = useGroups()
  const { user } = useAuth()
  const firstName = (user?.name || user?.email || '').split(/[\s@]/)[0]

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-5xl px-6 pt-10 pb-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Hey{firstName ? ` ${firstName[0].toUpperCase()}${firstName.slice(1)}` : ''} 👋
            </h1>
            <p className="text-muted-foreground mt-1">
              Which group are we settling today?
            </p>
          </div>
          <NewGroupDialog>
            <Button className="rounded-xl">
              <Plus />
              New group
            </Button>
          </NewGroupDialog>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-3xl" />
            ))}
          </div>
        ) : !groups || groups.length === 0 ? (
          <EmptyState
            icon={Home}
            title="No groups yet"
            actions={
              <NewGroupDialog>
                <Button className="rounded-xl">
                  <Plus />
                  Create your first group
                </Button>
              </NewGroupDialog>
            }
          >
            A group holds your flatmates, expenses, and balances — create one, then add
            people or import your spreadsheet.
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups?.map((g, i) => {
              const names = g.memberships.map((m) => m.person.name)
              const active = g.memberships.filter((m) => !m.left_on).length
              return (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3, ease: 'easeOut' }}
                >
                  <Link
                    to={`/groups/${g.id}`}
                    className="group flex h-36 flex-col justify-between rounded-3xl bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <span className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-2xl text-lg font-semibold">
                        {g.name.trim()[0]?.toUpperCase()}
                      </span>
                      <ArrowUpRight className="text-muted-foreground/40 group-hover:text-primary size-5 transition-colors" />
                    </div>
                    <div>
                      <p className="truncate font-semibold tracking-tight">{g.name}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">
                          {names.length === 0
                            ? 'No members yet'
                            : `${active} active · ${g.base_currency}`}
                        </span>
                        {names.length > 0 && <PersonAvatarStack names={names} max={4} />}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

function NewGroupDialog({ children }: { children: React.ReactNode }) {
  const createGroup = useCreateGroup()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      const group = await createGroup.mutateAsync({ name: name.trim() })
      toast.success(`${group.name} created`)
      setOpen(false)
      navigate(`/groups/${group.id}/people`) // next step is always adding people
    } catch {
      toast.error('Could not create the group')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="rounded-3xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>
            Name it after the flat or trip — you’ll add the people next.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hh-name">Name</Label>
            <Input
              id="hh-name"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Koramangala Flat"
              className="h-11 rounded-xl"
            />
          </div>
          <Button
            type="submit"
            disabled={createGroup.isPending || !name.trim()}
            className="h-11 w-full rounded-xl"
          >
            {createGroup.isPending ? 'Creating…' : 'Create group'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
