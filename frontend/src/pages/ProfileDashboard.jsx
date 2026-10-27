import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, ConfirmDialog, PageLoading, useToast } from '../components/ui.jsx'
import { errorMessage, lostFoundApi } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'

const DELETE_WINDOW_MS = 8 * 60 * 60 * 1000

function deleteTimeRemaining(item, now) {
  const remaining = DELETE_WINDOW_MS - (now - new Date(item.created_at).getTime())
  if (!Number.isFinite(remaining) || remaining <= 0) return null
  const hours = Math.floor(remaining / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)
  return `${hours}h ${minutes}m ${seconds}s`
}

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString()
}

function statusLabel(value) {
  return String(value || 'active').replaceAll('_', ' ')
}

export default function ProfileDashboard() {
  const { user } = useAuth()
  const showToast = useToast()
  const [activeTab, setActiveTab] = useState('listings')
  const [items, setItems] = useState(null)
  const [myClaims, setMyClaims] = useState(null)
  const [pageError, setPageError] = useState('')
  const [actionError, setActionError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [clockNow, setClockNow] = useState(Date.now())
  const [busyItemId, setBusyItemId] = useState(null)
  const [reviewingClaimId, setReviewingClaimId] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [managedClaims, setManagedClaims] = useState([])
  const [claimsLoading, setClaimsLoading] = useState(false)
  const [claimsError, setClaimsError] = useState('')

  async function loadDashboard() {
    setRefreshing(true)
    setPageError('')
    try {
      const [reports, claims] = await Promise.all([
        lostFoundApi.mine(),
        lostFoundApi.myClaims(),
      ])
      setItems(reports.items || [])
      setMyClaims(claims.claims || [])
    } catch (error) {
      setPageError(errorMessage(error))
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  async function openClaims(item) {
    setSelectedItem(item)
    setManagedClaims([])
    setClaimsError('')
    setClaimsLoading(true)
    try {
      const result = await lostFoundApi.claims(item.id)
      setManagedClaims(result.claims || [])
    } catch (error) {
      setClaimsError(errorMessage(error))
    } finally {
      setClaimsLoading(false)
    }
  }

  async function reviewClaim(claim, action) {
    setReviewingClaimId(claim.id)
    setClaimsError('')
    try {
      await lostFoundApi.reviewClaim(selectedItem.id, claim.id, action)
      const result = await lostFoundApi.claims(selectedItem.id)
      setManagedClaims(result.claims || [])
      await loadDashboard()
      showToast(action === 'approve' ? 'Claim approved. The claimant can now view their handover code.' : 'Claim rejected.')
    } catch (error) {
      setClaimsError(errorMessage(error))
    } finally {
      setReviewingClaimId(null)
    }
  }

  async function confirmAction() {
    if (!pendingAction) return
    const { item, action } = pendingAction
    setBusyItemId(item.id)
    setActionError('')
    try {
      if (action === 'delete') {
        await lostFoundApi.remove(item.id)
        showToast('Report permanently deleted.')
      } else {
        await lostFoundApi.setLifecycle(item.id, action)
        showToast(action === 'resolve' ? 'Report marked as returned.' : 'Report closed.')
      }
      setPendingAction(null)
      await loadDashboard()
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setBusyItemId(null)
    }
  }

  if (items === null || myClaims === null) {
    if (pageError) {
      return (
        <div className="space-y-4">
          <Alert>{pageError}</Alert>
          <button type="button" onClick={loadDashboard} className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Try again
          </button>
        </div>
      )
    }
    return <PageLoading message="Loading your dashboard…" />
  }

  const incomingItems = items.filter((item) => Number(item.claim_count) > 0)
  const pendingClaimCount = items.reduce((total, item) => total + (Number(item.pending_claim_count) || 0), 0)

  function renderReport(item) {
    const claimCount = Number(item.claim_count) || 0
    const pendingCount = Number(item.pending_claim_count) || 0
    const remaining = deleteTimeRemaining(item, clockNow)
    const canDelete = remaining !== null && claimCount === 0
    const isBusy = busyItemId === item.id

    return (
      <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {item.photo && <img src={item.photo} alt={item.title} className="h-44 w-full bg-slate-100 object-cover" />}
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
              item.status === 'lost' ? 'bg-red-100 text-red-700' : item.status === 'found' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
            }`}>
              {statusLabel(item.status)}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600">
              {statusLabel(item.lifecycle_status)}
            </span>
          </div>
          <div>
            <h2 className="font-bold text-slate-900">{item.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{item.description}</p>
            <p className="mt-2 text-xs text-slate-500">📍 {item.location_name} · Posted {formatDate(item.created_at)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={() => openClaims(item)} className="col-span-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-100">
              Manage claims ({claimCount}){pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
            </button>
            {item.lifecycle_status === 'active' && (
              <>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setPendingAction({ item, action: 'close' })}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Close post
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setPendingAction({ item, action: 'resolve' })}
                  className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  Mark returned
                </button>
              </>
            )}
            {canDelete && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setPendingAction({ item, action: 'delete' })}
                className="col-span-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Delete permanently · {remaining} left
              </button>
            )}
          </div>
          {!canDelete && (
            <p className="text-center text-xs text-slate-500">
              {claimCount > 0 ? 'Permanent deletion is locked because a claim has been submitted.' : 'Permanent deletion is locked after eight hours.'}
            </p>
          )}
          <Link to="/lost-found" className="inline-block text-xs font-semibold text-brand-700 underline hover:text-brand-900">
            Open Lost &amp; Found to edit this report
          </Link>
        </div>
      </article>
    )
  }

  const tabs = [
    { id: 'listings', label: `My reports (${items.length})` },
    { id: 'incoming', label: `Incoming claims (${pendingClaimCount})` },
    { id: 'submitted', label: `My claims (${myClaims.length})` },
  ]

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 rounded-3xl border border-brand-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-brand-700">{user?.college?.name || 'Your campus'}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Your dashboard, {user?.display_name || 'there'}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Manage Lost &amp; Found reports, review incoming proofs, and track your claim requests.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={loadDashboard} disabled={refreshing} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <Link to="/lost-found/report" className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Report an item
          </Link>
        </div>
      </section>

      {pageError && <Alert>{pageError}</Alert>}
      {actionError && <Alert>{actionError}</Alert>}

      <div role="tablist" aria-label="Profile dashboard sections" className="flex gap-2 overflow-x-auto border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold ${
              activeTab === tab.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'listings' && (
        items.length ? (
          <div className="grid gap-4 sm:grid-cols-2">{items.map(renderReport)}</div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="font-semibold text-slate-800">You have not reported an item yet.</p>
            <Link to="/lost-found/report" className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">Create your first report</Link>
          </div>
        )
      )}

      {activeTab === 'incoming' && (
        incomingItems.length ? (
          <div className="grid gap-4 sm:grid-cols-2">{incomingItems.map(renderReport)}</div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">No one has submitted a claim for your reports yet.</p>
        )
      )}

      {activeTab === 'submitted' && (
        myClaims.length ? (
          <div className="space-y-3">
            {myClaims.map((claim) => (
              <article key={claim.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-semibold text-slate-900">{claim.title}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {claim.item_status} · {claim.location_name} · Submitted {formatDate(claim.created_at)}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{claim.claim_text}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                    claim.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : claim.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'
                  }`}>
                    {statusLabel(claim.status)}
                  </span>
                </div>
                {claim.status === 'approved' && claim.handover_code && (
                  <div className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
                    <span className="block text-[10px] font-bold uppercase text-emerald-800">Your handover code</span>
                    <span className="font-mono text-xl font-bold tracking-widest text-emerald-950">{claim.handover_code}</span>
                    <span className="block text-[10px] text-emerald-800">Show this to the report owner in person.</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">You have not submitted any Lost &amp; Found claims.</p>
        )
      )}

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedItem(null)
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="profile-claims-title" className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h2 id="profile-claims-title" className="text-lg font-bold text-slate-900">Claims for {selectedItem.title}</h2>
                <p className="mt-1 text-xs text-slate-500">Only the report owner can review the proof submitted by claimants.</p>
              </div>
              <button type="button" onClick={() => setSelectedItem(null)} aria-label="Close claims" className="rounded-full px-2 py-1 text-slate-500 hover:bg-slate-100">✕</button>
            </div>
            {claimsError && <Alert>{claimsError}</Alert>}
            {claimsLoading ? (
              <p role="status" className="py-6 text-center text-sm text-slate-500">Loading claims…</p>
            ) : managedClaims.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No claims have been submitted for this report.</p>
            ) : (
              <div className="space-y-3">
                {managedClaims.map((claim) => (
                  <article key={claim.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{claim.claimant_name}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                        claim.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : claim.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'
                      }`}>
                        {statusLabel(claim.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Submitted {formatDate(claim.created_at)}</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{claim.claim_text}</p>
                    {claim.status === 'pending' && (
                      <div className="mt-4 flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={reviewingClaimId === claim.id}
                          onClick={() => reviewClaim(claim, 'reject')}
                          className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={reviewingClaimId === claim.id}
                          onClick={() => reviewClaim(claim, 'approve')}
                          className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                        >
                          {reviewingClaimId === claim.id ? 'Saving…' : 'Approve'}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.action === 'delete' ? 'Permanently delete this report?' : pendingAction?.action === 'resolve' ? 'Mark this report returned?' : 'Close this report?'}
        confirmLabel={pendingAction?.action === 'delete' ? 'Delete report' : pendingAction?.action === 'resolve' ? 'Mark returned' : 'Close report'}
        danger={pendingAction?.action === 'delete'}
        onCancel={() => setPendingAction(null)}
        onConfirm={confirmAction}
      >
        {pendingAction?.action === 'delete'
          ? 'This permanently deletes the report and its claim history. This action cannot be undone.'
          : 'This removes the report from active search, removes its photos, and rejects any pending claims. The report history will remain available to you.'}
      </ConfirmDialog>
    </div>
  )
}
