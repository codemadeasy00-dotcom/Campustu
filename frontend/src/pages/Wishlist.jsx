import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { wishlistApi, errorMessage } from '../services/api.js'
import { STATUS_STYLES, conditionLabel, formatPrice } from '../lib/format.js'
import { getImageUrl } from '../lib/imageUrl.js'
import { Alert, PageLoading } from '../components/ui.jsx'

export default function Wishlist() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    wishlistApi.list().then((r) => setItems(r.items)).catch((e) => setError(errorMessage(e)))
  }, [])

  async function remove(id) {
    setBusyId(id)
    setActionError('')
    try {
      await wishlistApi.remove(id)
      setItems((current) => current.filter((item) => item.id !== id))
    } catch (e) {
      setActionError(errorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <Alert>{error}</Alert>
  if (!items) return <PageLoading />

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My wishlist</h1>
        <Link to="/kits" className="text-sm text-brand-700 underline">Back to kits</Link>
      </div>
      {actionError && <div className="mt-4"><Alert>{actionError}</Alert></div>}

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">
          Nothing saved yet. Browse the <Link to="/marketplace" className="text-brand-700 underline">marketplace</Link> or pick a <Link to="/kits" className="text-brand-700 underline">semester kit</Link>.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white p-3 shadow-sm">
              <Link to={`/items/${item.id}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                {item.photo && <img src={getImageUrl(item.photo)} alt="" className="h-full w-full object-cover" />}
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/items/${item.id}`} className="block truncate font-semibold hover:underline">{item.title}</Link>
                <div className="text-sm font-bold text-brand-700">{formatPrice(item.price)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className={`rounded-full px-2 py-0.5 font-semibold capitalize ${STATUS_STYLES[item.status] || ''}`}>{item.status}</span>
                  <span>{conditionLabel(item.condition)}</span>
                  <span>{item.seller.display_name}</span>
                </div>
              </div>
              <button type="button" disabled={busyId === item.id} onClick={() => remove(item.id)}
                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                {busyId === item.id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
