import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import CollegePicker from '../components/CollegePicker.jsx'
import { Alert, ConfirmDialog, PageLoading, useToast } from '../components/ui.jsx'
import { authApi, errorMessage, lostFoundApi } from '../services/api.js'
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

function ProfileAvatar({ user, className = '' }) {
  if (user?.avatar_url) {
    return <img src={user.avatar_url} alt={`${user.display_name || 'Profile'} avatar`} className={`rounded-full bg-white object-cover ${className}`} />
  }
  return (
    <span aria-label={`${user?.display_name || 'User'} profile avatar`} className={`flex items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-sky-100 font-bold text-brand-700 ${className}`}>
      {(user?.display_name || 'U').trim().charAt(0).toUpperCase()}
    </span>
  )
}

export default function ProfileDashboard() {
  const { user, updateUser } = useAuth()
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
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [collegeError, setCollegeError] = useState('')
  const [collegeBusy, setCollegeBusy] = useState(false)
  const [pendingCollege, setPendingCollege] = useState(null)

  async function loadDashboard() {
    if (!user?.college) {
      setItems([])
      setMyClaims([])
      setPageError('')
      setRefreshing(false)
      return
    }
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
  }, [user?.college?.id])

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

  async function uploadAvatar(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAvatarError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarError('Choose a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setAvatarError('Choose an image smaller than 8 MB.')
      return
    }

    const formData = new FormData()
    formData.append('avatar', file)
    setAvatarBusy(true)
    try {
      const result = await authApi.updateAvatar(formData)
      updateUser(result.user)
      showToast('Profile photo updated.')
    } catch (error) {
      setAvatarError(errorMessage(error))
    } finally {
      setAvatarBusy(false)
    }
  }

  async function removeAvatar() {
    setAvatarError('')
    setAvatarBusy(true)
    try {
      const result = await authApi.removeAvatar()
      updateUser(result.user)
      showToast('Profile photo removed.')
    } catch (error) {
      setAvatarError(errorMessage(error))
    } finally {
      setAvatarBusy(false)
    }
  }

  async function saveCollege() {
    if (!pendingCollege) return
    setCollegeBusy(true)
    setCollegeError('')
    try {
      const result = await authApi.setCollege(pendingCollege.id)
      updateUser(result.user)
      setPendingCollege(null)
      showToast('Campus selected. Your dashboard is ready.')
    } catch (error) {
      setCollegeError(errorMessage(error))
    } finally {
      setCollegeBusy(false)
    }
  }

  if (!user?.college) {
    return (
      <div className="relative mx-auto max-w-4xl rounded-3xl border border-brand-100 bg-white shadow-xl shadow-brand-700/10">
        <div className="h-32 rounded-t-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-400 sm:h-40" />
        <section className="px-5 pb-8 sm:px-10">
          <div className="-mt-12 flex flex-col gap-5 sm:-mt-14 sm:flex-row sm:items-end">
            <ProfileAvatar user={user} className="h-24 w-24 border-4 border-white text-3xl shadow-lg sm:h-28 sm:w-28" />
            <div className="pb-1">
              <p className="text-sm font-semibold text-cyan-100">CAMPUSTU · YOUR ACCOUNT</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{user?.display_name || 'Your profile'}</h1>
              <p className="mt-1 text-sm text-slate-500">Choose your campus to finish setting up your dashboard.</p>
            </div>
          </div>
          <div className="mt-8 grid gap-6 border-t border-slate-100 pt-7 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
            <div className="relative z-20">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">One last step</p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">Which campus are you part of?</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Campustu keeps listings and Lost &amp; Found reports within your college community. Select your college to see your dashboard and campus activity.
              </p>
              <div className="mt-5">
                <CollegePicker onSelect={setPendingCollege} />
              </div>
              {collegeError && <div className="mt-4"><Alert>{collegeError}</Alert></div>}
              <p className="mt-3 text-xs leading-5 text-slate-500">Can’t find your college? Choose “I can’t find my college” in the selector to submit it for review.</p>
            </div>
            <aside className="rounded-2xl bg-cream p-5">
              <h3 className="font-semibold text-slate-900">Your profile photo</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">Add a clear photo so other students can recognize your profile. You can change or remove it any time.</p>
              <label className={`mt-4 inline-flex cursor-pointer items-center justify-center rounded-full bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 ${avatarBusy ? 'pointer-events-none opacity-60' : ''}`}>
                {avatarBusy ? 'Uploading…' : user?.avatar_url ? 'Change photo' : 'Add a profile photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={uploadAvatar} disabled={avatarBusy} />
              </label>
              {user?.avatar_url && (
                <button type="button" onClick={removeAvatar} disabled={avatarBusy} className="ml-3 text-sm font-semibold text-slate-600 underline disabled:opacity-50">
                  Remove
                </button>
              )}
              {avatarError && <p role="alert" className="mt-3 text-xs text-red-700">{avatarError}</p>}
              <p className="mt-2 text-xs text-slate-500">JPEG, PNG, or WebP · up to 8 MB</p>
            </aside>
          </div>
        </section>
        <ConfirmDialog
          open={Boolean(pendingCollege)}
          title="Select this campus?"
          confirmLabel={collegeBusy ? 'Saving…' : 'Confirm campus'}
          onCancel={() => setPendingCollege(null)}
          onConfirm={saveCollege}
        >
          Set {pendingCollege?.name} as your Campustu campus? You’ll be able to browse its marketplace and Lost &amp; Found.
        </ConfirmDialog>
      </div>
    )
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
            <button type="button" onClick={() => openClaims(item)} className="col-span-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100">
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
          <Link to="/lost-found" className="inline-block text-xs font-semibold text-brand-700 underline hover:text-brand-600">
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
    <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-brand-200 bg-cream shadow-xl shadow-brand-700/10">
      <section className="relative overflow-hidden bg-gradient-to-r from-brand-700 via-brand-600 to-brand-400 px-5 pb-6 pt-7 text-white sm:px-8 sm:pb-8">
        <div aria-hidden="true" className="absolute -right-10 -top-24 h-72 w-72 rounded-full border-[36px] border-white/5" />
        <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div className="flex items-end gap-4 sm:gap-5">
            <div className="rounded-full bg-white p-1 shadow-xl">
              <ProfileAvatar user={user} className="h-20 w-20 text-2xl sm:h-24 sm:w-24" />
            </div>
            <div className="pb-1">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">Student profile</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{user?.display_name || 'Your dashboard'}</h1>
              <p className="mt-1 text-sm text-white/75">{user?.college?.name}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <label className={`inline-flex cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 ${avatarBusy ? 'pointer-events-none opacity-60' : ''}`}>
              {avatarBusy ? 'Uploading…' : 'Change photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={uploadAvatar} disabled={avatarBusy} />
            </label>
            {user?.avatar_url && (
              <button type="button" onClick={removeAvatar} disabled={avatarBusy} className="rounded-full border border-white/25 px-4 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10 disabled:opacity-50">
                Remove photo
              </button>
            )}
            <Link to="/lost-found/report" className="rounded-full bg-white px-4 py-2.5 text-sm font-bold text-brand-700 shadow-sm transition hover:bg-cyan-50">
              Report an item
            </Link>
          </div>
        </div>
        {(avatarError || actionError || pageError) && (
          <div className="relative mt-5 space-y-2">
            {avatarError && <p role="alert" className="rounded-xl border border-red-200/50 bg-red-950/30 px-3 py-2 text-sm text-white">{avatarError}</p>}
            {actionError && <Alert>{actionError}</Alert>}
            {pageError && <Alert>{pageError}</Alert>}
          </div>
        )}
      </section>

      <div className="space-y-6 bg-cream p-4 sm:p-7">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'My reports', value: items.length, detail: 'Lost & Found posts' },
          { label: 'Incoming claims', value: pendingClaimCount, detail: 'Waiting for your review' },
          { label: 'My claims', value: myClaims.length, detail: 'Requests you submitted' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <span className="text-3xl font-bold tracking-tight text-slate-900">{stat.value}</span>
              <span className="text-right text-xs text-slate-500">{stat.detail}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Your account and campus activity</p>
        <button type="button" onClick={loadDashboard} disabled={refreshing} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
          {refreshing ? 'Refreshing…' : 'Refresh dashboard'}
        </button>
      </div>

      <div role="tablist" aria-label="Profile dashboard sections" className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === tab.id ? 'bg-brand-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
      <ConfirmDialog
        open={Boolean(pendingCollege)}
        title="Select this campus?"
        confirmLabel={collegeBusy ? 'Saving…' : 'Confirm campus'}
        onCancel={() => setPendingCollege(null)}
        onConfirm={saveCollege}
      >
        Set {pendingCollege?.name} as your Campustu campus?
      </ConfirmDialog>
    </div>
  )
}
