import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { itemsApi, errorMessage } from '../services/api.js'
import { STATUS_STYLES, formatPrice } from '../lib/format.js'
import { Alert, PageLoading } from '../components/ui.jsx'

export default function MyListings() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    itemsApi.mine().then((r) => setItems(r.items)).catch((e) => setError(errorMessage(e)))
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!items) return <PageLoading />

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My listings</h1>
        <Link to="/sell" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">Sell an item</Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">You have not listed anything yet.</p>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={`/items/${item.id}`} className="block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow">
                <div className="aspect-square bg-slate-100">
                  {item.photos[0] && <img src={item.photos[0]} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="p-3">
                  <div className="truncate font-semibold">{item.title}</div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="font-bold text-indigo-700">{formatPrice(item.price)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[item.status] || ''}`}>{item.status}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
