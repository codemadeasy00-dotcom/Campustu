import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { kitsApi, metaApi, wishlistApi, errorMessage } from '../services/api.js'
import { conditionLabel, formatPrice } from '../lib/format.js'
import { getImageUrl } from '../lib/imageUrl.js'
import { Alert, Button, inputClass } from '../components/ui.jsx'
import PageHero from '../components/PageHero.jsx'

function KitSkeleton() {
  return (
    <ul aria-label="Loading semester kit" className="space-y-3">
      {Array.from({ length: 4 }, (_, index) => (
        <li key={index} aria-hidden="true" className="surface-card flex items-center gap-4 p-4">
          <div className="skeleton-shimmer h-16 w-16 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton-shimmer h-4 w-2/5 rounded" />
            <div className="skeleton-shimmer h-3 w-1/3 rounded" />
            <div className="skeleton-shimmer h-3 w-3/5 rounded" />
          </div>
        </li>
      ))}
    </ul>
  )
}

// The Home page sends students here as /kits?branch=<branch id>&semester=<1-8>.
export default function Kits() {
  const [params, setParams] = useSearchParams()
  const branch = params.get('branch') || ''
  const semester = params.get('semester') || ''
  const semesterValid = /^[1-8]$/.test(semester)

  const [meta, setMeta] = useState(null)
  const [kit, setKit] = useState(null) // null = not loaded
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [choice, setChoice] = useState({}) // item_type_id -> chosen listing id
  const [included, setIncluded] = useState(new Set()) // item_type_ids that "Add all" will save
  const [expanded, setExpanded] = useState(new Set()) // item types whose other listings are shown
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(null)

  useEffect(() => {
    metaApi.get().then(setMeta).catch(() => {})
  }, [])

  useEffect(() => {
    setSaved(null)
    setSaveError('')
    if (!semesterValid) {
      setKit(null)
      setError('')
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setError('')
    kitsApi.get({ semester, branch_id: branch })
      .then((data) => {
        if (cancelled) return
        setKit(data)
        // Default: the cheapest listing of every item type that has one. Optional items start unticked.
        const nextChoice = {}
        const nextIncluded = new Set()
        data.items.forEach((item) => {
          if (item.listings.length) {
            nextChoice[item.item_type_id] = item.listings[0].id
            if (!item.is_optional) nextIncluded.add(item.item_type_id)
          }
        })
        setChoice(nextChoice)
        setIncluded(nextIncluded)
        setExpanded(new Set())
      })
      .catch((e) => { if (!cancelled) { setKit(null); setError(errorMessage(e)) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [branch, semester, semesterValid])

  function setParam(key, value) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }

  const picked = useMemo(() => {
    if (!kit) return []
    return kit.items
      .filter((item) => included.has(item.item_type_id) && choice[item.item_type_id])
      .map((item) => item.listings.find((l) => l.id === choice[item.item_type_id]))
      .filter(Boolean)
  }, [kit, included, choice])
  const total = picked.reduce((sum, l) => sum + l.price, 0)

  const toggle = (setter, id) => setter((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  async function addAll() {
    setSaving(true)
    setSaveError('')
    setSaved(null)
    try {
      setSaved(await wishlistApi.add(picked.map((l) => l.id)))
    } catch (e) {
      setSaveError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const branchName = meta?.branches.find((b) => String(b.id) === branch)?.name
  const available = kit ? kit.items.filter((i) => i.listings.length).length : 0

  return (
    <div className="page-enter space-y-5">
      <PageHero
        eyebrow="Plan your semester"
        title="Semester kits"
        description="Choose your branch and semester to see what you need, with second-hand options available at your college."
      />

      <div className="surface-panel flex flex-wrap items-end gap-3 p-4 sm:p-5">
        <label className="min-w-40 flex-1 text-xs font-medium text-slate-600">Branch
          <select className={`${inputClass} mt-1`} value={branch} onChange={(e) => setParam('branch', e.target.value)}>
            <option value="">Select branch</option>
            {(meta?.branches || []).map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </select>
        </label>
        <label className="w-36 text-xs font-medium text-slate-600">Semester
          <select className={`${inputClass} mt-1`} value={semester} onChange={(e) => setParam('semester', e.target.value)}>
            <option value="">Select semester</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (<option key={s} value={s}>Semester {s}</option>))}
          </select>
        </label>
      </div>

      {!semesterValid && <Alert kind="info">Choose a semester to see its kit.</Alert>}
      {semesterValid && !branch && <Alert kind="info">Choose your branch too. Until then you only see items needed by every branch.</Alert>}
      {error && <Alert>{error}</Alert>}
      {loading && <KitSkeleton />}

      {!loading && kit && kit.items.length === 0 && (
        <div className="surface-panel p-8 text-center text-sm text-slate-600">
          No kit has been set up for {branchName ? `${branchName}, ` : ''}semester {semester} yet.
        </div>
      )}

      {!loading && kit && kit.items.length > 0 && (
        <>
          <p className="text-sm text-slate-600">
            {branchName ? `${branchName} · ` : ''}Semester {semester}: {available} of {kit.items.length} item types have a listing available right now.
          </p>

          <ul className="stagger-list space-y-3">
            {kit.items.map((item) => {
              const chosen = item.listings.find((l) => l.id === choice[item.item_type_id])
              const isOpen = expanded.has(item.item_type_id)
              return (
                <li key={item.item_type_id} className="surface-card interactive-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">
                        {item.name}
                        {item.quantity > 1 && <span className="ml-2 text-xs font-medium text-slate-500">need {item.quantity}</span>}
                        {item.is_optional && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Optional</span>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {item.available_count === 0 ? 'No listings yet' : `${item.available_count} listing${item.available_count === 1 ? '' : 's'} available`}
                      </div>
                    </div>
                    {chosen && (
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={included.has(item.item_type_id)} onChange={() => toggle(setIncluded, item.item_type_id)} />
                        Include in "Add all"
                      </label>
                    )}
                  </div>

                  {chosen && (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {chosen.photo && <img src={getImageUrl(chosen.photo)} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link to={`/items/${chosen.id}`} className="block truncate text-sm font-semibold text-brand-700 hover:underline">{chosen.title}</Link>
                        <div className="text-sm font-bold">{formatPrice(chosen.price)}</div>
                        <div className="text-xs text-slate-600">
                          {conditionLabel(chosen.condition)} · {chosen.seller.display_name}
                          {chosen.seller.is_trusted && <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">Trusted</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {item.listings.length > 1 && (
                    <div className="mt-2">
                      <button type="button" onClick={() => toggle(setExpanded, item.item_type_id)} className="text-xs font-semibold text-brand-700 underline">
                        {isOpen ? 'Hide other listings' : `Choose another (${item.listings.length - 1} more)`}
                      </button>
                      {isOpen && (
                        <ul className="mt-2 space-y-1.5">
                          {item.listings.map((l) => (
                            <li key={l.id}>
                              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                                <input type="radio" name={`pick-${item.item_type_id}`} checked={choice[item.item_type_id] === l.id}
                                  onChange={() => setChoice((current) => ({ ...current, [item.item_type_id]: l.id }))} />
                                <span className="min-w-0 flex-1 truncate">{l.title}</span>
                                <span className="text-xs text-slate-500">{conditionLabel(l.condition)}</span>
                                <span className="font-semibold">{formatPrice(l.price)}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                      {isOpen && item.available_count > item.listings.length && (
                        <p className="mt-1.5 text-xs text-slate-500">
                          Showing the cheapest {item.listings.length} of {item.available_count}. See the rest in the <Link to="/marketplace" className="underline">marketplace</Link>.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="surface-panel sticky bottom-3 p-4">
            {saveError && <div className="mb-3"><Alert>{saveError}</Alert></div>}
            {saved && (
              <div className="mb-3">
                <Alert kind="info">
                  Saved {saved.added} to your wishlist
                  {saved.already_saved ? `, ${saved.already_saved} were already there` : ''}
                  {saved.skipped ? `, ${saved.skipped} are no longer available` : ''}.{' '}
                  <Link to="/wishlist" className="font-semibold underline">View wishlist</Link>
                </Alert>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <span className="font-semibold">{picked.length}</span> item{picked.length === 1 ? '' : 's'} selected
                {picked.length > 0 && <> · about <span className="font-bold text-brand-700">{formatPrice(total)}</span></>}
                <div className="text-xs text-slate-500">Asking prices. You agree the final price with each seller.</div>
              </div>
              <Button type="button" onClick={addAll} disabled={saving || picked.length === 0}>
                {saving ? 'Saving…' : 'Add all available to wishlist'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
