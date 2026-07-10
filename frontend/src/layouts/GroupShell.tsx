import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useGroup } from '@/api/hooks'
import { Dock } from '@/components/shell/Dock'
import { TopBar } from '@/components/shell/TopBar'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import type { Group } from '@/types'
import HomePage from '@/pages/group/HomePage'
import ActivityPage from '@/pages/group/ActivityPage'
import SettlePage from '@/pages/group/SettlePage'
import PeoplePage from '@/pages/group/PeoplePage'
import AddExpenseFlow from '@/pages/group/AddExpenseFlow'
import ImportFlow from '@/pages/group/ImportFlow'

/**
 * The in-group shell: top bar + floating dock + animated screen transitions.
 * Add-expense and Import render OUTSIDE the chrome — they are full-screen
 * journeys, not tabs.
 */
export default function GroupShell() {
  const { groupId } = useParams()
  const id = Number(groupId)
  const { data: group, isLoading } = useGroup(id)
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }
  if (!group) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">Group not found.</p>
        <Button asChild variant="outline">
          <a href="/">Back to groups</a>
        </Button>
      </div>
    )
  }

  const isFullScreenFlow =
    location.pathname.includes('/add') || location.pathname.includes('/import')

  if (isFullScreenFlow) {
    return (
      <Routes>
        <Route path="add" element={<AddExpenseFlow group={group} />} />
        <Route path="import" element={<ImportFlow group={group} />} />
      </Routes>
    )
  }

  return (
    <div className="min-h-screen pb-24 md:pb-10">
      <TopBar group={group} />
      <main className="mx-auto max-w-6xl px-6 pt-2">
        <AnimatedRoutes group={group} />
      </main>
      <Dock groupId={group.id} />
    </div>
  )
}

function AnimatedRoutes({ group }: { group: Group }) {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <Routes location={location}>
          <Route index element={<HomePage group={group} />} />
          <Route path="activity" element={<ActivityPage group={group} />} />
          <Route path="settle" element={<SettlePage group={group} />} />
          <Route path="people" element={<PeoplePage group={group} />} />
          <Route path="*" element={<Navigate to={`/groups/${group.id}`} replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}
