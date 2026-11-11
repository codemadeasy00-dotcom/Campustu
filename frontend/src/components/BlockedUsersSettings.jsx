import { useCallback, useEffect, useState } from 'react'
import { Alert } from './ui.jsx'
import { blocksApi, errorMessage } from '../services/api.js'

export default function BlockedUsersSettings() {
  const [blockedUsers, setBlockedUsers] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  const loadBlockedUsers = useCallback(async () => {
    setError('')
    try {
      const { blocked_users: users } = await blocksApi.list()
      setBlockedUsers(users || [])
    } catch (requestError) {
      setError(errorMessage(requestError))
    }
  }, [])

  useEffect(() => {
    loadBlockedUsers()
  }, [loadBlockedUsers])

  async function unblockUser(userId) {
    setBusyId(userId)
    setError('')
    try {
      await blocksApi.unblock(userId)
      setBlockedUsers((users) => users.filter((user) => user.id !== userId))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusyId('')
    }
  }

  return (
    <section aria-labelledby="blocked-users-title" className="surface-panel space-y-3 p-4 sm:p-5">
      <div>
        <h2 id="blocked-users-title" className="font-mono text-lg font-bold text-teal-950">Safety &amp; Privacy</h2>
        <p className="mt-1 text-sm text-slate-600">
          Blocked students cannot see each other’s marketplace listings, needs, Lost &amp; Found posts, barter suggestions, search results, or message threads. They also cannot start or continue reservations, claims, or messages.
        </p>
      </div>
      {error && (
        <div className="space-y-2">
          <Alert>{error}</Alert>
          <button type="button" onClick={loadBlockedUsers} className="text-sm font-semibold text-brand-700 underline">Try again</button>
        </div>
      )}
      {blockedUsers === null ? (
        <p role="status" className="text-sm text-slate-500">Loading blocked users…</p>
      ) : blockedUsers.length === 0 ? (
        <p className="text-sm text-slate-500">You haven’t blocked anyone.</p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {blockedUsers.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <span className="font-semibold text-slate-800">{user.display_name}</span>
              <button
                type="button"
                onClick={() => unblockUser(user.id)}
                disabled={busyId === user.id}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {busyId === user.id ? 'Unblocking…' : 'Unblock'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
