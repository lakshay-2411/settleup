import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useGroup } from '../api/hooks'
import BalancesTab from '../components/BalancesTab'
import ExpensesTab from '../components/ExpensesTab'
import ImportTab from '../components/ImportTab'
import MembersTab from '../components/MembersTab'

const tabs = [
  { to: 'expenses', label: 'Expenses' },
  { to: 'balances', label: 'Balances' },
  { to: 'members', label: 'Members' },
  { to: 'import', label: 'Import' },
]

export default function GroupDetailPage() {
  const { groupId } = useParams()
  const id = Number(groupId)
  const { data: group, isLoading } = useGroup(id)

  if (isLoading) return <p className="text-slate-400">Loading…</p>
  if (!group) return <p className="text-red-600">Group not found.</p>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{group.name}</h1>
      <nav className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={`/groups/${id}/${t.to}`}
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium rounded-t-lg ${
                isActive
                  ? 'bg-white border border-b-white border-slate-200 text-indigo-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Navigate to="expenses" replace />} />
        <Route path="expenses" element={<ExpensesTab group={group} />} />
        <Route path="balances" element={<BalancesTab group={group} />} />
        <Route path="members" element={<MembersTab group={group} />} />
        <Route path="import" element={<ImportTab group={group} />} />
      </Routes>
    </div>
  )
}
