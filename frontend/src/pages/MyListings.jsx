import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { itemsApi, errorMessage } from '../services/api.js'
import { STATUS_STYLES, formatPrice } from '../lib/format.js'
import { getImageUrl } from '../lib/imageUrl.js'
import { Alert, ConfirmDialog, PageLoading, useToast } from '../components/ui.jsx'

export default function MyListings() {
  const showToast = useToast()
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyItemId, setBusyItemId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

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
      showToast(`Listing marked ${status}.`)
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusyItemId(null)
    }
  }

  // The server deletes the listing for good, or (if chats/reservations/reports point at it) hides it
  // and erases its photos. Either way it should leave this page.
  async function deleteItem(item) {
    setBusyItemId(item.id)
    setActionError('')
    try {
      await itemsApi.remove(item.id)
      setItems((current) => current.filter((listing) => listing.id !== item.id))
      showToast('Listing deleted successfully.')
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
                  </div>
                </div>
              </Link>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  item.status === 'available'
                    ? 'bg-emerald-100 text-emerald-800'
                    : item.status === 'sold'
                      ? 'bg-amber-100 text-amber-800'
                      : STATUS_STYLES[item.status] || 'bg-slate-100 text-slate-700'
                }`}>
                  {item.status === 'available' ? 'Available' : item.status === 'sold' ? 'Sold' : item.status}
                </span>
                <div className="flex items-center gap-1.5">
                  {['available', 'sold'].includes(item.status) && (
                    <button type="button" disabled={busyItemId === item.id} onClick={() => toggleStatus(item)} className="rounded px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50">
                      {busyItemId === item.id ? 'Updating…' : item.status === 'sold' ? 'Available' : 'Sold'}
                    </button>
                  )}
                  {['available', 'withdrawn'].includes(item.status) && (
                      <button type="button" disabled={busyItemId === item.id} onClick={() => setPendingDelete(item)} className="rounded px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this listing?"
        confirmLabel="Delete listing"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const item = pendingDelete
          setPendingDelete(null)
          if (item) deleteItem(item)
        }}
      >
        This will delete the listing and its photos. This action cannot be undone.
      </ConfirmDialog>
    </div>
  )
}
