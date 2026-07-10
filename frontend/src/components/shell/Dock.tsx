import { NavLink } from 'react-router-dom'
import { Activity, House, Scale, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

const items = [
  { to: '', label: 'Home', icon: House, end: true },
  { to: 'activity', label: 'Activity', icon: Activity },
  { to: 'settle', label: 'Settle', icon: Scale },
  { to: 'people', label: 'People', icon: Users },
]

/** Floating bottom dock — mobile-only navigation; desktop nav lives in the TopBar. */
export function Dock({ groupId }: { groupId: number }) {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 md:hidden">
      <div className="border-border/70 bg-background/90 pointer-events-auto flex items-center gap-1 rounded-full border p-1.5 shadow-lg shadow-black/5 backdrop-blur-md">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={label}
            to={`/groups/${groupId}${to ? `/${to}` : ''}`}
            end={end}
            className="relative rounded-full"
          >
            {({ isActive }) => (
              <span
                className={cn(
                  'relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors sm:px-4',
                  isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="dock-pill"
                    className="bg-primary absolute inset-0 rounded-full"
                    transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
                  />
                )}
                <Icon className="relative size-4" strokeWidth={2} />
                <span className={cn('relative', !isActive && 'hidden sm:inline')}>{label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
