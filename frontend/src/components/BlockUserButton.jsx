import { useState } from 'react'
import { blocksApi, errorMessage } from '../services/api.js'
import { ConfirmDialog, useToast } from './ui.jsx'

export default function BlockUserButton({ userId, userName, currentUserId, onBlocked, className = '' }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const showToast = useToast()

  if (!userId || userId === currentUserId) return null

  async function blockUser() {
    setBusy(true)
    setError('')
    try {
      await blocksApi.block(userId)
      setConfirmOpen(false)
      showToast(`${userName || 'User'} blocked. Their content is hidden from you.`)
      onBlocked?.(userId)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={className}>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
        >
          Block user
        </button>
        {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={`Block ${userName || 'this user'}?`}
        confirmLabel={busy ? 'Blocking…' : 'Block user'}
        danger
        onCancel={() => !busy && setConfirmOpen(false)}
        onConfirm={blockUser}
      >
        Their marketplace listings and requests will be hidden from each other, and conversations will stop. Pending marketplace reservations and Lost &amp; Found claims between you will be canceled. You can unblock them later in Profile under Safety &amp; Privacy.
      </ConfirmDialog>
    </>
  )
}
