import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Activity, Check, ChevronsUpDown, House, LogOut, Plus, Scale, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { useAuth } from '@/auth/AuthContext'
import { useGroups } from '@/api/hooks'
import { PersonAvatar } from '@/components/app/PersonAvatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { Group } from '@/types'

const navItems = [
  { to: '', label: 'Home', icon: House, end: true },
  { to: 'activity', label: 'Activity', icon: Activity },
  { to: 'settle', label: 'Settle', icon: Scale },
  { to: 'people', label: 'People', icon: Users },
]

function BrandDot() {
  return (
    <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold">
      ₹
    </span>
  )
}

/** Desktop-first app bar: brand + group switcher left, nav center, account right. */
export function TopBar({ group }: { group?: Group }) {
  const { user, logout } = useAuth()
  const { data: groups } = useGroups()
  const navigate = useNavigate()

  return (
    <header className="bg-background/85 border-border/60 sticky top-0 z-30 border-b backdrop-blur-md">
      <div className="mx-auto flex h-15 max-w-6xl items-center justify-between gap-4 px-6">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link to="/" className="flex items-center gap-2">
            <BrandDot />
            {!group && <span className="text-[15px] font-semibold tracking-tight">SettleUp</span>}
          </Link>

          {group && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-9 max-w-56 gap-1.5 px-2.5 font-semibold tracking-tight"
                >
                  <span className="truncate">{group.name}</span>
                  <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Groups</DropdownMenuLabel>
                {groups?.map((g) => (
                  <DropdownMenuItem key={g.id} onClick={() => navigate(`/groups/${g.id}`)}>
                    <span className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-md text-xs font-semibold">
                      {g.name.trim()[0]?.toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                    {g.id === group.id && <Check className="text-primary size-4" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/')}>
                  <Plus className="size-4" />
                  New group
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* main nav — desktop, sliding pill */}
        {group && (
          <nav className="bg-muted hidden items-center gap-0.5 rounded-full p-1 md:flex">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={label}
                to={`/groups/${group.id}${to ? `/${to}` : ''}`}
                end={end}
                className="relative rounded-full"
              >
                {({ isActive }) => (
                  <span
                    className={cn(
                      'relative flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="topnav-pill"
                        className="bg-primary absolute inset-0 rounded-full"
                        transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
                      />
                    )}
                    <Icon className="relative size-4" strokeWidth={2} />
                    <span className="relative">{label}</span>
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full">
            <PersonAvatar name={user?.name || user?.email || '?'} size="md" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="truncate">{user?.name || user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} variant="destructive">
              <LogOut className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
