import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { itemsApi, errorMessage } from '../services/api.js'
import { STATUS_STYLES, formatPrice } from '../lib/format.js'
import { getImageUrl } from '../lib/imageUrl.js'
import { Alert, Button, PageLoading } from '../components/ui.jsx'

export default function MyListings() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyItemId, setBusyItemId] = useState(null)

  useEffect(() => {
    itemsApi.mine().then((r) => setItems(r.items)).catch((e) => setError(errorMessage(e)))
  }, [])

  async function toggleStatus(item) {
    const status = item.status === 'available' ? 'sold' : 'available'
    setBusyItemId(item.id)
    setActionError('')
    try {
      const { item: updated } = await itemsApi.updateStatus(item.id, status)
      setItems((current) => current.map((listing) => listing.id === item.id ? updated : listing))
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusyItemId(null)
    }
  }

  async function withdrawItem(item) {
    if (!window.confirm('Remove this listing from the marketplace? This cannot be undone.')) return
    setBusyItemId(item.id)
    setActionError('')
    try {
      await itemsApi.remove(item.id)
      setItems((current) => current.map((listing) => listing.id === item.id ? { ...listing, status: 'withdrawn' } : listing))
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusyItemId(null)
    }
  }

  if (error) return <Alert>{error}</Alert>
  if (!items) return <PageLoading />

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My listings</h1>
        <Link to="/sell" className="rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700">Sell an item</Link>
      </div>
      {actionError && <div className="mt-4"><Alert>{actionError}</Alert></div>}
      {items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">You have not listed anything yet.</p>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {items.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <Link to={`/items/${item.id}`} className="block hover:bg-slate-50">
                <div className="aspect-square bg-slate-100">
                  {item.photos[0] && <img src={getImageUrl(item.photos[0])} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="p-3">
                  <div className="truncate font-semibold">{item.title}</div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="font-bold text-brand-700">{formatPrice(item.price)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[item.status] || ''}`}>{item.status}</span>
                  </div>
                </div>
              </Link>
              <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
                {['available', 'sold'].includes(item.status) && (
                  <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" disabled={busyItemId === item.id} onClick={() => toggleStatus(item)}>
                    {busyItemId === item.id ? 'Updating…' : `Mark as ${item.status === 'available' ? 'sold' : 'available'}`}
                  </Button>
                )}
                {item.status === 'available' && (
                  <button type="button" disabled={busyItemId === item.id} onClick={() => withdrawItem(item)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                    Remove listing
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
