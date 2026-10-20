import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { itemsApi, metaApi, errorMessage } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { STATUS_STYLES, conditionLabel, formatPrice } from '../lib/format.js'
import { getImageUrl } from '../lib/imageUrl.js'
import { Alert, PageLoading } from '../components/ui.jsx'

export default function ItemPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [state, setState] = useState({ item: null, meta: null, error: '' })
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([itemsApi.get(id), metaApi.get()])
      .then(([{ item }, meta]) => !cancelled && setState({ item, meta, error: '' }))
      .catch((e) => !cancelled && setState({ item: null, meta: null, error: errorMessage(e) }))
    return () => {
      cancelled = true
    }
  }, [id])

  if (state.error) return <Alert>{state.error}</Alert>
  if (!state.item) return <PageLoading />

  const { item, meta } = state
  const itemType = meta.item_types.find((t) => t.id === item.item_type_id)
  const category = meta.categories.find((c) => c.id === item.category_id)
  const branch = meta.branches.find((b) => b.id === item.branch_id)
  const isOwner = user && user.id === item.seller.id

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <div className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-white">
          {item.photos[selected] && <img src={getImageUrl(item.photos[selected])} alt={item.title} className="h-full w-full object-contain" />}
        </div>
        {item.photos.length > 1 && (
          <div className="mt-3 flex gap-2">
            {item.photos.map((url, i) => (
              <button key={url} onClick={() => setSelected(i)} className={`h-16 w-16 overflow-hidden rounded-lg border-2 ${i === selected ? 'border-brand-600' : 'border-transparent'}`}>
                <img src={getImageUrl(url)} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[item.status] || ''}`}>{item.status}</span>
        <h1 className="mt-2 text-2xl font-bold">{item.title}</h1>
        <p className="mt-1 text-3xl font-bold text-brand-700">{formatPrice(item.price)}</p>
        <p className="text-xs text-slate-500">Asking price. Pay the seller directly when you meet.</p>

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">Condition</dt><dd>{conditionLabel(item.condition)}</dd>
          {itemType && (<><dt className="text-slate-500">Item type</dt><dd>{itemType.name}</dd></>)}
          {category && (<><dt className="text-slate-500">Category</dt><dd>{category.name}</dd></>)}
          {branch && (<><dt className="text-slate-500">Branch</dt><dd>{branch.name}</dd></>)}
          {item.semester && (<><dt className="text-slate-500">Semester</dt><dd>{item.semester}</dd></>)}
          {item.preferred_place && (<><dt className="text-slate-500">Meet at</dt><dd>{item.preferred_place}</dd></>)}
        </dl>

        {item.description && <p className="mt-5 whitespace-pre-line text-sm text-slate-700">{item.description}</p>}

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="text-slate-500">Seller</div>
          <div className="font-semibold">
            {item.seller.display_name}
            {item.seller.is_trusted ? (
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Trusted</span>
            ) : (
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">New member</span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {item.seller.trust_score === 0
              ? 'No completed handovers yet.'
              : `Completed handovers with ${item.seller.trust_score} different student${item.seller.trust_score === 1 ? '' : 's'}.`}
          </div>
        </div>

        {isOwner && (
          <p className="mt-4 text-sm text-slate-600">
            This is your listing. <Link to="/my-listings" className="text-brand-700 underline">See all your listings</Link>
          </p>
        )}
      </div>
    </div>
  )
}
