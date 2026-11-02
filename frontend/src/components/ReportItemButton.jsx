import { useState } from 'react'
import { moderationApi, errorMessage } from '../services/api.js'

export default function ReportItemButton({ itemId, itemType }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await moderationApi.report({ item_id: itemId, item_type: itemType, reason })
      setSent(true)
      setOpen(false)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return <p role="status" className="text-xs font-medium text-emerald-700">Report sent for review</p>
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen((value) => !value); setError('') }}
        aria-expanded={open}
        className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-700"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="mr-1 inline h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 21V4m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0" />
        </svg>
        Report
      </button>
      {open && (
        <form onSubmit={submit} className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <label className="block text-left text-xs font-medium text-slate-700">
            Why are you reporting this post?
            <textarea
              required
              minLength={5}
              maxLength={1000}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" disabled={busy || reason.trim().length < 5} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
