import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { campusSearchApi, errorMessage, searchAlertsApi } from '../services/api.js'
import { Alert, inputClass } from '../components/ui.jsx'
import PageHero from '../components/PageHero.jsx'

const secondaryActionClass = 'inline-flex items-center justify-center rounded-full border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50'
const primaryActionClass = 'inline-flex items-center justify-center rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50'

const typeLabels = {
  listing: 'Marketplace',
  lost_found: 'Lost & Found',
  need: 'Need Board',
}

export default function CampusSearch() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [term, setTerm] = useState(() => searchParams.get('q') || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const nextTerm = searchParams.get('q') || ''
    setTerm(nextTerm)
    if (nextTerm.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')
    campusSearchApi.search(nextTerm.trim())
      .then((result) => {
        if (!cancelled) setResults(result.results || [])
      })
      .catch((err) => {
        if (!cancelled) {
          setResults([])
          setError(errorMessage(err))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [searchParams])

  const submitSearch = (event) => {
    event.preventDefault()
    setNotice('')
    const q = term.trim()
    if (q.length < 2) {
      setError('Enter at least 2 characters to search.')
      return
    }
    setSearchParams({ q })
  }

  const saveSearch = async () => {
    const keyword = searchParams.get('q')?.trim()
    if (!keyword) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await searchAlertsApi.save({ keyword })
      setNotice(`Saved "${keyword}". You will receive a notice when a matching marketplace item or campus request is posted.`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHero
        eyebrow="One search, campus-wide"
        title="Search campus"
        description="Find available marketplace items, active lost-and-found reports, and open student requests from your college."
        children={searchParams.get('q') ? <button className={secondaryActionClass} type="button" disabled={saving} onClick={saveSearch}>{saving ? 'Saving…' : 'Save search alert'}</button> : null}
      />
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      <form className="surface-card mt-5 flex flex-col gap-3 p-4 sm:flex-row" onSubmit={submitSearch}>
        <label className="sr-only" htmlFor="campus-search-term">Search items, reports, and requests</label>
        <input id="campus-search-term" className={inputClass} value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Try “calculator”, “ID card”, or “lab coat”" />
        <button className={`${primaryActionClass} shrink-0`} type="submit">Search campus</button>
      </form>

      {loading && <p className="py-10 text-center text-sm text-slate-500">Searching your campus…</p>}
      {!loading && searchParams.get('q') && results.length > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">Results for “{searchParams.get('q')}”</h2>
            <p className="text-sm text-slate-500">{results.length} results across campus</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((result) => (
              <li key={`${result.result_type}-${result.id}`}>
                <Link
                  to={result.result_type === 'lost_found'
                    ? `/lost-found?search=${encodeURIComponent(result.title)}`
                    : result.href}
                  className="surface-card interactive-card block h-full p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-slate-900">{result.title}</h3>
                    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700">{typeLabels[result.result_type]}</span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm text-slate-600">{result.description || 'No additional details.'}</p>
                  <p className="mt-3 text-xs text-slate-500">
                    {[result.category_name, result.branch_name, result.owner_name].filter(Boolean).join(' · ')}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    {result.price !== null && <span className="text-sm font-bold text-brand-700">₹{Number(result.price).toLocaleString('en-IN')}</span>}
                    <span className="ml-auto text-xs font-semibold text-brand-700">Open result <span aria-hidden="true">→</span></span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!loading && searchParams.get('q') && results.length === 0 && !error && (
        <div className="surface-card mt-6 p-8 text-center">
          <h2 className="font-semibold text-slate-900">No matching campus results yet</h2>
          <p className="mt-1 text-sm text-slate-500">Save this search to get an in-app alert when a matching listing or request appears.</p>
        </div>
      )}
      {!searchParams.get('q') && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {Object.entries(typeLabels).map(([type, label]) => (
            <div key={type} className="surface-card p-4">
              <p className="text-sm font-semibold text-slate-900">{label}</p>
              <p className="mt-1 text-xs text-slate-500">
                {type === 'listing' ? 'Available items posted by your campus.' : type === 'lost_found' ? 'Active reports with resolved items excluded.' : 'Open needs posted by students at your college.'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
