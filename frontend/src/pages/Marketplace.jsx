import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { itemsApi, metaApi, errorMessage } from '../services/api.js'
import { CONDITIONS, conditionLabel, formatPrice } from '../lib/format.js'
import { getImageUrl } from '../lib/imageUrl.js'
import { Alert, inputClass } from '../components/ui.jsx'

const PAGE_SIZE = 12

function ListingSkeleton() {
  return (
    <li aria-hidden="true" className="animate-pulse overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm">
      <div className="aspect-square bg-slate-200" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-3/4 rounded bg-slate-200" />
        <div className="h-4 w-1/2 rounded bg-slate-200" />
        <div className="h-3 w-2/5 rounded bg-slate-100" />
      </div>
    </li>
  )
}

function ListingCard({ item, categoryName }) {
  return (
    <li>
      <Link
        to={`/items/${item.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md"
      >
        <div className="relative aspect-square overflow-hidden bg-slate-100">
          {item.photos[0] && (
            <img
              src={getImageUrl(item.photos[0])}
              alt={item.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          )}
          <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-brand-700 shadow-sm">
            {formatPrice(item.price)}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-3">
          <h2 className="truncate font-semibold text-slate-900 group-hover:text-brand-700">{item.title}</h2>
          <p className="mt-1 truncate text-xs text-slate-500">{categoryName || 'Campus item'}</p>
          <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>{conditionLabel(item.condition)}</span>
            <span className="font-medium text-brand-700">View details <span aria-hidden="true">→</span></span>
          </div>
        </div>
      </Link>
    </li>
  )
}

export default function Marketplace() {
  const [metadata, setMetadata] = useState(null)
  const [metadataError, setMetadataError] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
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
  }, [debouncedSearch, categoryId, condition, minPrice, maxPrice, sort, page, refreshKey])

  const categories = metadata?.categories.filter((category) => category.scope !== 'lost_found') ?? []
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]))

  const updateFilter = (setter, value) => {
    setter(value)
    setPage(0)
  }

  return (
    <div className="animate-fade-in mx-auto max-w-7xl space-y-6">
      <section className="rounded-3xl bg-gradient-to-r from-brand-700 to-brand-600 px-6 py-8 text-white shadow-lg sm:px-8">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Campus Marketplace</h1>
        <p className="mt-2 max-w-2xl text-sm text-brand-100 sm:text-base">
          Find campus essentials from students at your college.
        </p>
      </section>

      {metadataError && <Alert>{metadataError}</Alert>}
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

      <section aria-label="Marketplace filters" className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm backdrop-blur">
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

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <ul aria-label="Loading marketplace listings" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => <ListingSkeleton key={index} />)}
          </ul>
        ) : items.length === 0 && !error ? (
          <div className="rounded-2xl border border-dashed border-brand-200 bg-white/80 px-6 py-12 text-center">
            <h2 className="font-semibold text-slate-800">No marketplace listings found.</h2>
            <p className="mt-1 text-sm text-slate-500">Try changing your search or filters.</p>
            <Link to="/sell" className="mt-4 inline-flex rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
              Post an item
            </Link>
          </div>
        ) : (
          <>
            {loading && <p role="status" className="mb-3 text-xs text-slate-500">Updating results…</p>}
            <ul className={`grid grid-cols-2 gap-4 transition-opacity sm:grid-cols-3 lg:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>
              {items.map((item) => (
                <ListingCard key={item.id} item={item} categoryName={categoryNames.get(item.category_id)} />
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
