import { useState } from 'react'
import { useAddMember, useUpdateMember } from '../api/hooks'
import type { Group } from '../types'

/**
 * Roster with membership windows — the source of truth for who shares costs
 * on any given date. Ending a membership (left_on) removes the person from
 * splits after that date without touching history.
 */
export default function MembersTab({ group }: { group: Group }) {
  const addMember = useAddMember(group.id)
  const updateMember = useUpdateMember(group.id)
  const [name, setName] = useState('')
  const [joined, setJoined] = useState('')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await addMember.mutateAsync({ person_name: name.trim(), joined_on: joined })
      setName('')
      setJoined('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member')
    }
  }

  async function endMembership(id: number) {
    const left = prompt('Last day of membership (YYYY-MM-DD):')
    if (left) await updateMember.mutateAsync({ id, left_on: left })
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2 bg-white rounded-xl border border-slate-200 p-4">
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Joined on</span>
          <input
            required
            type="date"
            value={joined}
            onChange={(e) => setJoined(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5"
          />
        </label>
        <button
          disabled={addMember.isPending}
          className="rounded-lg bg-indigo-600 text-white px-4 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          Add member
        </button>
        {error && <p className="text-sm text-red-600 w-full">{error}</p>}
      </form>

      <table className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden text-sm">
        <thead className="bg-slate-100 text-left text-slate-600">
          <tr>
            <th className="px-4 py-2">Person</th>
            <th className="px-4 py-2">Role</th>
            <th className="px-4 py-2">Joined</th>
            <th className="px-4 py-2">Left</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {group.memberships.map((m) => (
            <tr key={m.id} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium">
                {m.person.name}
                {m.person.is_guest && (
                  <span className="ml-2 text-xs bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
                    guest
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-slate-500">{m.role}</td>
              <td className="px-4 py-2">{m.joined_on}</td>
              <td className="px-4 py-2">{m.left_on ?? '—'}</td>
              <td className="px-4 py-2 text-right">
                {!m.left_on && (
                  <button
                    onClick={() => endMembership(m.id)}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    End membership
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
