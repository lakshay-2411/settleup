import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCreateGroup, useGroups } from '../api/hooks'

export default function GroupsPage() {
  const { data: groups, isLoading } = useGroups()
  const createGroup = useCreateGroup()
  const [name, setName] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await createGroup.mutateAsync({ name: name.trim() })
    setName('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Your groups</h1>
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New group name"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            disabled={createGroup.isPending}
            className="rounded-lg bg-indigo-600 text-white px-4 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Create
          </button>
        </form>
      </div>

      {isLoading && <p className="text-slate-400">Loading…</p>}
      {groups && groups.length === 0 && (
        <p className="text-slate-500">No groups yet — create one to get started.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {groups?.map((g) => (
          <Link
            key={g.id}
            to={`/groups/${g.id}`}
            className="block bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:border-indigo-400"
          >
            <div className="font-semibold">{g.name}</div>
            <div className="text-sm text-slate-500 mt-1">
              {g.memberships.length} member{g.memberships.length === 1 ? '' : 's'} ·{' '}
              base {g.base_currency}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
