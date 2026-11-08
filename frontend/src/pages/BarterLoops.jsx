import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, itemsApi } from '../services/api.js'
import { Alert, PageLoading } from '../components/ui.jsx'
import PageHero from '../components/PageHero.jsx'

export default function BarterLoops() {
  const [cycles, setCycles] = useState(null)
  const [error, setError] = useState('')
  const [limited, setLimited] = useState(false)

  useEffect(() => {
    let cancelled = false
    itemsApi.barterLoops()
      .then((result) => {
        if (!cancelled) setCycles(result.cycles || [])
        if (!cancelled) setLimited(Boolean(result.limited))
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="page-enter mx-auto max-w-5xl space-y-6">
      <PageHero
        eyebrow="Community exchange"
        title="Barter loops"
        description="Find up-to-five-person campus listing loops whose wanted categories connect."
      />
      <Alert kind="info">
        These are suggestions, not trade agreements. Every participant must review the listings and coordinate directly; Campustu does not reserve items or guarantee a match.
      </Alert>
      {limited && <Alert kind="warn">The search reached its result or processing limit. These are some matches, not a complete list.</Alert>}
      {error && <Alert>{error}</Alert>}
      {!cycles && !error ? <PageLoading message="Looking for compatible listings…" /> : null}
      {cycles?.length === 0 && (
        <section className="surface-panel p-6 text-center">
          <h2 className="font-bold text-slate-800">No barter loops found yet.</h2>
          <p className="mt-2 text-sm text-slate-600">Add categories you would accept in exchange when publishing a listing to help discover a loop.</p>
          <Link to="/sell" className="mt-4 inline-flex rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white">
            Add a marketplace listing
          </Link>
        </section>
      )}
      {cycles?.map((cycle, cycleIndex) => (
        <section key={`${cycleIndex}-${cycle.map((item) => item.id).join('-')}`} className="surface-panel p-4 sm:p-6">
          <h2 className="font-bold text-brand-900">{cycle.length}-person potential exchange</h2>
          <ol className="mt-4 grid gap-3 md:grid-cols-3">
            {cycle.map((item, index) => {
              const nextItem = cycle[(index + 1) % cycle.length]
              const desired = item.wanted_categories.filter((category) => category === nextItem.category_name)
              return (
                <li key={item.id} className="rounded-xl border border-brand-100 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.seller_name} offers</p>
                  <Link to={`/items/${encodeURIComponent(item.id)}`} className="mt-1 block font-bold text-brand-800 underline">
                    {item.title}
                  </Link>
                  <p className="mt-1 text-xs text-slate-600">{item.category_name}</p>
                  <p className="mt-3 text-xs text-slate-600">
                    Wants: {item.wanted_categories.length ? item.wanted_categories.join(', ') : 'No categories specified'}
                  </p>
                  <p className="mt-3 border-t border-brand-100 pt-2 text-xs font-semibold text-teal-800">
                    → {nextItem.seller_name} has a {desired[0] || nextItem.category_name} listing
                  </p>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
