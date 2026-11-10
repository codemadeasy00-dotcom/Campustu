import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, itemsApi, metaApi, needsApi } from '../services/api.js'
import { Alert, inputClass } from '../components/ui.jsx'
import PageHero from '../components/PageHero.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { trackUserSearch } from '../services/searchTracker.js'

const requestDurations = [6, 12, 24, 72, 168]
const primaryActionClass = 'inline-flex items-center justify-center rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50'
const secondaryActionClass = 'inline-flex items-center justify-center rounded-full border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50'

function RequestCard({ request }) {
  return (
    <Link
      to={`/needs/${request.id}`}
      className="surface-card interactive-card block p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{request.title}</h2>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
          {request.status === 'open' ? `${request.response_count} responses` : request.status}
        </span>
      </div>
      <p className="mt-2 line-clamp-3 text-sm text-slate-600">{request.description}</p>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{request.category_name || 'Any category'}</span>
        <span>{request.branch_name || 'Campus-wide'}</span>
        <span>By {request.owner_name}</span>
      </div>
    </Link>
  )
}

export default function NeedBoard() {
  const { id: requestId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [metadata, setMetadata] = useState({ categories: [], branches: [] })
  const [requests, setRequests] = useState([])
  const [detail, setDetail] = useState(null)
  const [responses, setResponses] = useState([])
  const [myListings, setMyListings] = useState([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [showMine, setShowMine] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [metadataError, setMetadataError] = useState('')
  const [listingsError, setListingsError] = useState('')
  const [notice, setNotice] = useState('')
  const [createFields, setCreateFields] = useState({
    title: '',
    description: '',
    category_id: '',
    branch_id: user?.branch_id ? String(user.branch_id) : '',
    expires_in_hours: '24',
  })
  const [responseFields, setResponseFields] = useState({
    offer_type: 'listing',
    item_id: '',
    message: '',
  })

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (requestId) {
        const result = await needsApi.get(requestId)
        setDetail(result.request)
        setResponses(result.responses || [])
        return
      }
      const result = await needsApi.list({
        q: debouncedSearch.trim(),
        category_id: categoryId,
        branch_id: branchId,
        mine: showMine ? 'true' : 'false',
      })
      setRequests(result.requests || [])
      if (debouncedSearch.trim().length >= 2 && !showMine) {
        trackUserSearch(debouncedSearch, { category_id: categoryId, branch_id: branchId })
          .catch((trackingError) => console.error('Could not automatically track Need Board search:', trackingError))
      }
    } catch (err) {
      setError(errorMessage(err))
      setDetail(null)
      setResponses([])
    } finally {
      setLoading(false)
    }
  }, [requestId, debouncedSearch, categoryId, branchId, showMine])

  useEffect(() => {
    let cancelled = false
    metaApi.get()
      .then((result) => {
        if (!cancelled) setMetadata(result)
      })
      .catch((err) => {
        if (!cancelled) setMetadataError(errorMessage(err))
      })
    if (requestId) {
      setListingsError('')
      itemsApi.mine()
        .then((result) => {
          if (!cancelled) setMyListings((result.items || []).filter((item) => item.status === 'available'))
        })
        .catch((err) => {
          if (!cancelled) {
            setListingsError(errorMessage(err))
            console.error('Could not load listings for campus request responses:', err)
          }
        })
    }
    return () => { cancelled = true }
  }, [user?.id, requestId])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 350)
    return () => window.clearTimeout(timeout)
  }, [search])

  const isOwner = detail?.user_id === user?.id
  const canRespond = detail?.status === 'open' && !isOwner && !detail?.has_responded
  const categories = useMemo(
    () => (metadata.categories || []).filter((category) => category.scope !== 'lost_found'),
    [metadata.categories],
  )

  const submitCreate = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await needsApi.create({
        ...createFields,
        category_id: createFields.category_id || undefined,
        branch_id: createFields.branch_id || undefined,
        expires_in_hours: Number(createFields.expires_in_hours),
      })
      setCreateOpen(false)
      setCreateFields({
        title: '',
        description: '',
        category_id: '',
        branch_id: user?.branch_id ? String(user.branch_id) : '',
        expires_in_hours: '24',
      })
      navigate(`/needs/${result.request.id}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const submitResponse = async (event) => {
    event.preventDefault()
    if (!detail) return
    setBusy(true)
    setError('')
    try {
      await needsApi.respond(detail.id, {
        ...responseFields,
        item_id: responseFields.offer_type === 'listing' ? responseFields.item_id : undefined,
      })
      setResponseFields((current) => ({ ...current, message: '' }))
      setNotice('Your response was sent privately to the requester.')
      await loadRequests()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const updateStatus = async (status) => {
    if (!detail) return
    setBusy(true)
    setError('')
    try {
      await needsApi.updateStatus(detail.id, status)
      await loadRequests()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHero
        eyebrow="Campus exchange"
        title={requestId ? 'Campus request' : 'Need Board'}
        description="Post what you need, or help a campus neighbor with an available listing or a non-binding loan offer."
      >
        {requestId
          ? <Link to="/needs" className={secondaryActionClass}>All requests</Link>
          : <button type="button" className={primaryActionClass} onClick={() => setCreateOpen((open) => !open)}>
              {createOpen ? 'Cancel request' : 'Post a need'}
            </button>}
      </PageHero>

      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      {metadataError && <div className="mt-4"><Alert>{metadataError}</Alert></div>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      {createOpen && !requestId && (
        <form onSubmit={submitCreate} className="surface-card mt-5 grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            What do you need?
            <input
              className={`${inputClass} mt-1`}
              required
              minLength={3}
              maxLength={120}
              value={createFields.title}
              onChange={(event) => setCreateFields((current) => ({ ...current, title: event.target.value }))}
              placeholder="e.g. Looking for a lab coat this week"
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Details
            <textarea
              className={`${inputClass} mt-1 min-h-24`}
              maxLength={1000}
              value={createFields.description}
              onChange={(event) => setCreateFields((current) => ({ ...current, description: event.target.value }))}
              placeholder="Add size, timing, or other useful details"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Category
            <select className={`${inputClass} mt-1`} value={createFields.category_id} onChange={(event) => setCreateFields((current) => ({ ...current, category_id: event.target.value }))}>
              <option value="">Any category</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Branch
            <select className={`${inputClass} mt-1`} value={createFields.branch_id} onChange={(event) => setCreateFields((current) => ({ ...current, branch_id: event.target.value }))}>
              <option value="">Campus-wide</option>
              {(metadata.branches || []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Keep request open
            <select className={`${inputClass} mt-1`} value={createFields.expires_in_hours} onChange={(event) => setCreateFields((current) => ({ ...current, expires_in_hours: event.target.value }))}>
              {requestDurations.map((hours) => <option key={hours} value={hours}>{hours < 24 ? `${hours} hours` : `${hours / 24} days`}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className={`${primaryActionClass} w-full sm:w-auto`} disabled={busy}>
              {busy ? 'Posting…' : 'Post request'}
            </button>
          </div>
          <p className="text-xs text-slate-500 sm:col-span-2">
            Responses are visible only to you. Loan offers are non-binding; formal borrowing agreements are not part of this version.
          </p>
        </form>
      )}

      {requestId && detail && (
        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="surface-card p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{detail.category_name || 'Campus-wide need'}</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">{detail.title}</h2>
              </div>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold capitalize text-brand-700">{detail.status}</span>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-slate-700">{detail.description || 'No extra details provided.'}</p>
            <p className="mt-5 text-xs text-slate-500">
              Posted by {detail.owner_name} · {detail.branch_name || 'Any branch'} · Expires {new Date(detail.expires_at).toLocaleString()}
            </p>

            {isOwner && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <h3 className="font-semibold text-slate-900">Private responses ({responses.length})</h3>
                {responses.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">Responses from other students will appear here.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {responses.map((response) => (
                      <li key={response.id} className="rounded-xl bg-slate-50 p-4">
                        <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold text-slate-800">
                          <span>{response.responder_name}</span>
                          <span className="text-xs font-medium capitalize text-brand-700">
                            {response.offer_type === 'loan_offer' ? 'Non-binding loan offer' : 'Listing offer'}
                          </span>
                        </div>
                        {response.item_title && <Link className="mt-1 inline-block text-sm text-brand-700 underline" to={`/items/${response.item_id}`}>{response.item_title}</Link>}
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{response.message}</p>
                        <p className="mt-2 text-[11px] text-slate-400">{new Date(response.created_at).toLocaleString()}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            {canRespond && (
              <form onSubmit={submitResponse} className="surface-card space-y-3 p-4">
                <h3 className="font-semibold text-slate-900">Offer to help</h3>
                <label className="block text-sm font-medium text-slate-700">
                  Offer type
                  <select className={`${inputClass} mt-1`} value={responseFields.offer_type} onChange={(event) => setResponseFields((current) => ({ ...current, offer_type: event.target.value, item_id: '' }))}>
                    <option value="listing">Share an available listing</option>
                    <option value="loan_offer">Non-binding loan offer</option>
                  </select>
                </label>
                {responseFields.offer_type === 'listing' && (
                  <label className="block text-sm font-medium text-slate-700">
                    Your listing
                    <select className={`${inputClass} mt-1`} required value={responseFields.item_id} onChange={(event) => setResponseFields((current) => ({ ...current, item_id: event.target.value }))}>
                      <option value="">Select an available listing</option>
                      {myListings.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                    </select>
                    {listingsError
                      ? <span role="alert" className="mt-1 block text-xs text-red-700">{listingsError}</span>
                      : myListings.length === 0 && <span className="mt-1 block text-xs text-slate-500">No available listings. <Link className="text-brand-700 underline" to="/sell">Post an item</Link> first, or choose a loan offer.</span>}
                  </label>
                )}
                <label className="block text-sm font-medium text-slate-700">
                  Message
                  <textarea className={`${inputClass} mt-1 min-h-24`} required maxLength={500} value={responseFields.message} onChange={(event) => setResponseFields((current) => ({ ...current, message: event.target.value }))} placeholder="Share details with the requester" />
                </label>
                <button className={`${primaryActionClass} w-full`} type="submit" disabled={busy || (responseFields.offer_type === 'listing' && myListings.length === 0)}>
                  {busy ? 'Sending…' : 'Send private response'}
                </button>
                <p className="text-xs text-slate-500">A loan offer is only an expression of interest, not a confirmed agreement.</p>
              </form>
            )}
            {detail?.has_responded && !isOwner && (
              <div className="surface-card p-4 text-sm text-slate-600">You have already responded to this request.</div>
            )}
            {isOwner && detail.status === 'open' && (
              <div className="surface-card space-y-2 p-4">
                <h3 className="font-semibold text-slate-900">Manage request</h3>
                <button type="button" className={`${secondaryActionClass} w-full`} disabled={busy} onClick={() => updateStatus('fulfilled')}>Mark as fulfilled</button>
                <button type="button" className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" disabled={busy} onClick={() => updateStatus('closed')}>Close request</button>
              </div>
            )}
          </aside>
        </section>
      )}

      {!requestId && (
        <>
          <section className="surface-card mt-5 grid gap-3 p-4 sm:grid-cols-4">
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Search needs
              <input className={`${inputClass} mt-1`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search campus requests" />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                When automatic alerts are enabled, searches are used for future marketplace and Need Board alerts.{' '}
                <Link to="/marketplace" className="font-semibold text-brand-700 underline">Manage alert settings</Link>.
              </span>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Category
              <select className={`${inputClass} mt-1`} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">All categories</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Branch
              <select className={`${inputClass} mt-1`} value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                <option value="">All branches</option>
                {(metadata.branches || []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            <div className="sm:col-span-4">
              <button type="button" className="text-sm font-semibold text-brand-700 underline underline-offset-2" onClick={() => setShowMine((value) => !value)}>
                {showMine ? 'Showing my requests · Show campus feed' : 'Show my requests'}
              </button>
            </div>
          </section>
          {loading ? (
            <p className="py-12 text-center text-sm text-slate-500">Loading campus requests…</p>
          ) : requests.length ? (
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {requests.map((request) => <li key={request.id}><RequestCard request={request} /></li>)}
            </ul>
          ) : (
            <div className="surface-card mt-5 p-8 text-center">
              <h2 className="font-semibold text-slate-900">No matching requests yet</h2>
              <p className="mt-1 text-sm text-slate-500">Post a need so students on your campus can respond.</p>
            </div>
          )}
        </>
      )}

      {requestId && loading && !detail && <p className="py-12 text-center text-sm text-slate-500">Loading request…</p>}
      {requestId && !loading && !detail && !error && <div className="surface-card mt-5 p-8 text-center text-sm text-slate-600">This campus request is unavailable.</div>}
    </div>
  )
}
