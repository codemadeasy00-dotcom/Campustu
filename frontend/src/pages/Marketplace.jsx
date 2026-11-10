import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { itemsApi, metaApi, searchAlertsApi, errorMessage } from '../services/api.js'
import { CONDITIONS, conditionLabel, formatPrice } from '../lib/format.js'
import { getImageUrl } from '../lib/imageUrl.js'
import { Alert, inputClass } from '../components/ui.jsx'
import PageHero from '../components/PageHero.jsx'
import ItemPhoto from '../components/ItemPhoto.jsx'
import ReportItemButton from '../components/ReportItemButton.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import UserBadges from '../components/UserBadges.jsx'

const PAGE_SIZE = 12

function ListingSkeleton() {
  return (
    <li aria-hidden="true" className="surface-card overflow-hidden">
      <div className="skeleton-shimmer aspect-square" />
      <div className="space-y-2 p-3">
        <div className="skeleton-shimmer h-4 w-3/4 rounded" />
        <div className="skeleton-shimmer h-4 w-1/2 rounded" />
        <div className="skeleton-shimmer h-3 w-2/5 rounded" />
      </div>
    </li>
  )
}

function ListingCard({ item, categoryName, currentUserId }) {
  return (
    <li className="space-y-1">
      <Link
        to={`/items/${item.id}`}
        className="surface-card interactive-card group flex h-full flex-col overflow-hidden"
      >
        <div className="relative aspect-square overflow-hidden bg-slate-100">
          <ItemPhoto
            src={item.photos[0] ? getImageUrl(item.photos[0]) : null}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-brand-700 shadow-sm">
            {formatPrice(item.price)}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-3">
          <h2 className="truncate font-semibold text-slate-900 group-hover:text-brand-700">{item.title}</h2>
          <p className="mt-1 truncate text-xs text-slate-500">{categoryName || 'Campus item'}</p>
          <UserBadges badges={item.seller.badges} className="mt-2" />
          <UserBadges badges={item.badges} className="mt-2" />
          {item.wanted_categories?.length > 0 && (
            <p className="mt-2 line-clamp-1 text-[11px] text-teal-800">Barter for: {item.wanted_categories.join(', ')}</p>
          )}
          <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>{conditionLabel(item.condition)}</span>
            <span className="font-medium text-brand-700">View details <span aria-hidden="true">→</span></span>
          </div>
        </div>
      </Link>
      {currentUserId !== item.seller.id && (
        <div className="flex justify-end px-2">
          <ReportItemButton itemId={item.id} itemType="marketplace" />
        </div>
      )}
    </li>
  )
}

export default function Marketplace() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [metadata, setMetadata] = useState(null)
  const [metadataError, setMetadataError] = useState('')
  const [search, setSearch] = useState(() => searchParams.get('q') || '')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryId, setCategoryId] = useState(() => searchParams.get('category_id') || '')
  const [branchId, setBranchId] = useState(() => searchParams.get('branch_id') || '')
  const [condition, setCondition] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(0)
  const [items, setItems] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [savedSearches, setSavedSearches] = useState([])
  const [savedSearchBusy, setSavedSearchBusy] = useState(false)
  const [savedSearchError, setSavedSearchError] = useState('')
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false)
  const [quietStart, setQuietStart] = useState('22:00')
  const [quietEnd, setQuietEnd] = useState('08:00')
  const [quietTimezone, setQuietTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  const [quietHoursBusy, setQuietHoursBusy] = useState(false)
  const [quietHoursNotice, setQuietHoursNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!user?.id || !user?.college) {
      setSavedSearches([])
      return undefined
    }
    searchAlertsApi.saved()
      .then((result) => {
        if (!cancelled) setSavedSearches(result.searches || [])
      })
      .catch((err) => {
        if (!cancelled) setSavedSearchError(errorMessage(err))
      })
    searchAlertsApi.preferences()
      .then(({ preferences }) => {
        if (cancelled) return
        setQuietHoursEnabled(Boolean(preferences.quiet_start && preferences.quiet_end))
        setQuietTimezone(preferences.timezone || 'UTC')
        if (preferences.quiet_start) setQuietStart(String(preferences.quiet_start).slice(0, 5))
        if (preferences.quiet_end) setQuietEnd(String(preferences.quiet_end).slice(0, 5))
      })
      .catch((err) => {
        if (!cancelled) setSavedSearchError(errorMessage(err))
      })
    return () => { cancelled = true }
  }, [user?.college?.id, user?.id])

  useEffect(() => {
    let cancelled = false
    metaApi.get()
      .then((result) => {
        if (!cancelled) setMetadata(result)
      })
      .catch((err) => {
        if (!cancelled) setMetadataError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    itemsApi.list({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      q: debouncedSearch,
      category_id: categoryId,
      branch_id: branchId,
      condition,
      min_price: minPrice,
      max_price: maxPrice,
      sort,
    })
      .then((result) => {
        if (cancelled) return
        setItems((current) => page === 0 ? result.items : [...current, ...result.items])
        setHasMore(result.has_more)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errorMessage(err))
          if (page === 0) {
            setItems([])
            setHasMore(false)
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedSearch, categoryId, branchId, condition, minPrice, maxPrice, sort, page, refreshKey])

  const categories = metadata?.categories.filter((category) => category.scope !== 'lost_found') ?? []
  const branches = metadata?.branches ?? []
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]))

  const updateFilter = (setter, value) => {
    setter(value)
    setPage(0)
  }

  async function saveSearch() {
    const keyword = search.trim()
    if (keyword.length < 2) return
    setSavedSearchBusy(true)
    setSavedSearchError('')
    try {
      const { search: saved } = await searchAlertsApi.save({
        keyword,
        category_id: categoryId || undefined,
        branch_id: branchId || undefined,
      })
      setSavedSearches((current) => [
        saved,
        ...current.filter((entry) => entry.id !== saved.id),
      ])
    } catch (err) {
      setSavedSearchError(errorMessage(err))
    } finally {
      setSavedSearchBusy(false)
    }
  }

  async function saveQuietHours() {
    setQuietHoursBusy(true)
    setQuietHoursNotice('')
    setSavedSearchError('')
    try {
      await searchAlertsApi.updatePreferences({
        quiet_start: quietHoursEnabled ? quietStart : null,
        quiet_end: quietHoursEnabled ? quietEnd : null,
        timezone: quietTimezone,
      })
      setQuietHoursNotice(
        quietHoursEnabled
          ? 'Quiet hours saved. In-app alerts remain immediate; push alerts pause during this window.'
          : 'Quiet hours are off. Push alerts can arrive at any time.',
      )
    } catch (err) {
      setSavedSearchError(errorMessage(err))
    } finally {
      setQuietHoursBusy(false)
    }
  }

  async function removeSavedSearch(id) {
    setSavedSearchBusy(true)
    setSavedSearchError('')
    try {
      await searchAlertsApi.remove(id)
      setSavedSearches((current) => current.filter((entry) => entry.id !== id))
    } catch (err) {
      setSavedSearchError(errorMessage(err))
    } finally {
      setSavedSearchBusy(false)
    }
  }

  return (
    <div className="page-enter mx-auto max-w-7xl space-y-6">
      <PageHero
        eyebrow="Buy, sell & reuse"
        title="Campus Marketplace"
        description="Find campus essentials from students at your college."
      >
        <Link to="/search" className="inline-flex items-center justify-center rounded-full border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50">Search all campus</Link>
      </PageHero>

      {metadataError && <Alert>{metadataError}</Alert>}
      {savedSearchError && <Alert>{savedSearchError}</Alert>}
      {error && (
        <div>
          <Alert>{error}</Alert>
          <button
            type="button"
            onClick={() => setRefreshKey((current) => current + 1)}
            className="mt-2 text-sm font-semibold text-brand-700 underline"
          >
            Try again
          </button>
        </div>
      )}

      <section aria-label="Marketplace filters" className="surface-panel p-4 sm:p-5">
        <label className="block">
          <span className="sr-only">Search listings</span>
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(0)
            }}
            placeholder="Search titles and descriptions…"
            className={inputClass}
          />
        </label>
        {user?.college && search.trim().length >= 2 && (
          <button
            type="button"
            disabled={savedSearchBusy}
            onClick={saveSearch}
            className="mt-2 text-sm font-semibold text-brand-700 underline disabled:opacity-50"
          >
            {savedSearchBusy ? 'Saving search…' : '＋ Save this search for alerts'}
          </button>
        )}
        {savedSearches.length > 0 && (
          <div className="mt-3 rounded-xl border border-brand-100 bg-white p-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Your search alerts</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {savedSearches.map((saved) => (
                <li key={saved.id} className="flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-800">
                  <span>
                    {saved.keyword}
                    {(saved.category_name || saved.branch_name) && (
                      <span className="ml-1 text-brand-600">
                        · {[saved.category_name, saved.branch_name].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={savedSearchBusy}
                    aria-label={`Remove alert for ${saved.keyword}`}
                    onClick={() => removeSavedSearch(saved.id)}
                    className="font-bold disabled:opacity-50"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 rounded-xl border border-brand-100 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={quietHoursEnabled} onChange={(event) => setQuietHoursEnabled(event.target.checked)} />
              Quiet hours for push alerts
            </label>
            <button type="button" className="text-sm font-semibold text-brand-700 underline" onClick={saveQuietHours} disabled={quietHoursBusy}>
              {quietHoursBusy ? 'Saving…' : 'Save alert preferences'}
            </button>
          </div>
          {quietHoursEnabled && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">
                Start
                <input type="time" value={quietStart} onChange={(event) => setQuietStart(event.target.value)} className={`${inputClass} mt-1`} />
              </label>
              <label className="text-xs font-medium text-slate-600">
                End
                <input type="time" value={quietEnd} onChange={(event) => setQuietEnd(event.target.value)} className={`${inputClass} mt-1`} />
              </label>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <p>Time zone: {quietTimezone}. In-app notifications stay immediate; only push delivery is paused.</p>
            <button type="button" className="font-semibold text-brand-700 underline" onClick={() => setQuietTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')}>
              Use device time zone
            </button>
          </div>
          {quietHoursNotice && <p role="status" className="mt-2 text-xs font-medium text-brand-700">{quietHoursNotice}</p>}
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Filter by category">
          <button
            type="button"
            aria-pressed={!categoryId}
            onClick={() => updateFilter(setCategoryId, '')}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${
              !categoryId ? 'bg-brand-700 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-brand-50'
            }`}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={categoryId === String(category.id)}
              onClick={() => updateFilter(setCategoryId, String(category.id))}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${
                categoryId === String(category.id) ? 'bg-brand-700 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-brand-50'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-medium text-slate-600">
            Branch
            <select value={branchId} onChange={(event) => updateFilter(setBranchId, event.target.value)} className={`${inputClass} mt-1`}>
              <option value="">All branches</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Condition
            <select value={condition} onChange={(event) => updateFilter(setCondition, event.target.value)} className={`${inputClass} mt-1`}>
              <option value="">Any condition</option>
              {CONDITIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Minimum price
            <input type="number" min="0" inputMode="decimal" value={minPrice} onChange={(event) => updateFilter(setMinPrice, event.target.value)} className={`${inputClass} mt-1`} placeholder="₹ Min" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Maximum price
            <input type="number" min="0" inputMode="decimal" value={maxPrice} onChange={(event) => updateFilter(setMaxPrice, event.target.value)} className={`${inputClass} mt-1`} placeholder="₹ Max" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Sort by
            <select value={sort} onChange={(event) => updateFilter(setSort, event.target.value)} className={`${inputClass} mt-1`}>
              <option value="newest">Newest first</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </label>
        </div>
      </section>

      <section aria-busy={loading}>
        {items.length === 0 && loading ? (
          <ul aria-label="Loading marketplace listings" className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => <ListingSkeleton key={index} />)}
          </ul>
        ) : items.length === 0 && !error ? (
          <div className="surface-panel px-6 py-12 text-center">
            <h2 className="font-semibold text-slate-800">No marketplace listings found.</h2>
            <p className="mt-1 text-sm text-slate-500">Try changing your search or filters.</p>
            <Link to="/sell" className="mt-4 inline-flex rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
              Post an item
            </Link>
          </div>
        ) : (
          <>
            {loading && <p role="status" className="mb-3 text-xs text-slate-500">Updating results…</p>}
            <ul className={`stagger-list grid grid-cols-1 min-[400px]:grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>
              {items.map((item) => (
                <ListingCard key={item.id} item={item} categoryName={categoryNames.get(item.category_id)} currentUserId={user?.id} />
              ))}
            </ul>
          </>
        )}
      </section>

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-full border border-brand-200 bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
