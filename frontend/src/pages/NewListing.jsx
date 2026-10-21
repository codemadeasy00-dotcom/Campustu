import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { itemsApi, metaApi, errorMessage } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { CONDITIONS } from '../lib/format.js'
import { Alert, Button, Field, PageLoading, inputClass } from '../components/ui.jsx'
import { processAndCompressImage } from '../utils/imageCompressor.js'

const MAX_PHOTOS = 5
const MAX_PHOTO_BYTES = 8 * 1024 * 1024 // same limit as the server

export default function NewListing() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [meta, setMeta] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState({
    title: '', item_type_id: '', category_id: '', condition: 'good', price: '',
    description: '', branch_id: '', semester: '', preferred_place: '', share_email: false,
  })
  const [photos, setPhotos] = useState([]) // [{ file, url }]
  const [processingPhotos, setProcessingPhotos] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    metaApi.get().then(setMeta).catch((e) => setLoadError(errorMessage(e)))
  }, [])

  // Free the preview image memory when the page closes.
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) return <Alert>{loadError}</Alert>
  if (!meta) return <PageLoading message="Loading seller workspace…" />

  const frozen = user.status !== 'active'
  const categories = meta.categories.filter((c) => c.scope !== 'lost_found')
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const listingSelection = form.item_type_id
    ? `type:${form.item_type_id}`
    : form.category_id
      ? `category:${form.category_id}`
      : ''

  function setListingSelection(e) {
    const [kind, id] = e.target.value.split(':')
    setForm((f) => ({
      ...f,
      category_id: kind === 'category' ? id : '',
      item_type_id: kind === 'type' ? id : '',
    }))
  }

  async function addPhotos(e) {
    setError('')
    const chosen = Array.from(e.target.files || [])
    e.target.value = '' // lets the same file be picked again later
    const room = MAX_PHOTOS - photos.length
    const next = []
    for (const file of chosen.slice(0, room)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError(`${file.name} must be a JPEG, PNG or WebP image.`); continue }
      if (file.size > MAX_PHOTO_BYTES) { setError(`${file.name} is larger than 8 MB.`); continue }
      next.push(file)
    }
    if (chosen.length > room) setError(`You can add at most ${MAX_PHOTOS} photos.`)
    if (!next.length) return

    setProcessingPhotos(true)
    try {
      const processed = await Promise.all(next.map((file) => processAndCompressImage(file)))
      const oversizedIndex = processed.findIndex((file) => file.size > MAX_PHOTO_BYTES)
      if (oversizedIndex !== -1) throw new Error(`${next[oversizedIndex].name} is still larger than 8 MB after compression.`)
      setPhotos((p) => [...p, ...processed.map((file) => ({ file, url: URL.createObjectURL(file) }))])
    } catch (err) {
      setError(err.message || 'Could not process the selected photos.')
    } finally {
      setProcessingPhotos(false)
    }
  }

  function removePhoto(index) {
    setPhotos((p) => {
      URL.revokeObjectURL(p[index].url)
      return p.filter((_, i) => i !== index)
    })
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (processingPhotos) return setError('Wait for photo processing to finish.')
    if (photos.length < 1) return setError('Add at least one photo.')
    if (!form.item_type_id && !form.category_id) return setError('Choose an item type or a category.')

    const data = new FormData()
    for (const [key, value] of Object.entries(form)) {
      if (value !== '') data.append(key, value)
    }
    if (form.item_type_id) data.delete('category_id') // the item type decides the category
    photos.forEach((p) => data.append('photos', p.file))

    setBusy(true)
    try {
      const { item } = await itemsApi.create(data)
      navigate(`/items/${item.id}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="animate-fade-in mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-brand-700">Sell an item</h1>
      <p className="mt-1 text-sm text-slate-600">
        Visible to students of {user.college?.name || 'your college'}. They pay you directly when you meet; this site never handles money.
      </p>

      <div className="mt-4 space-y-3">
        {frozen && <Alert kind="warn">Your account is frozen pending admin review, so you cannot list items right now.</Alert>}
        {!user.is_trusted && !frozen && (
          <Alert kind="info">New accounts have a price limit and a cap on active listings. Complete handovers to become a trusted member.</Alert>
        )}
        {categories.length === 0 && meta.item_types.length === 0 && (
          <Alert kind="warn">The site admin has not added categories yet, so listing is not possible.</Alert>
        )}
      </div>

      <form onSubmit={onSubmit} className="mt-5 space-y-4 rounded-3xl border border-white/70 bg-white/85 p-5 shadow-md backdrop-blur">
        {error && <Alert>{error}</Alert>}

        <Field label="Title" required>
          <input required minLength={3} maxLength={120} className={inputClass} value={form.title} onChange={set('title')} placeholder="e.g. Mini drafter, used for one semester" />
        </Field>

        <Field label="Category / kit item" required hint="Choose a specific kit item to include it in matching semester kits, or choose a category for another item.">
          <select className={inputClass} value={listingSelection} onChange={setListingSelection} required>
            <option value="">Select category or kit item</option>
            {categories.map((category) => {
              const itemTypes = meta.item_types.filter((itemType) => itemType.category_id === category.id)
              return (
                <optgroup key={category.id} label={category.name}>
                  <option value={`category:${category.id}`}>Other {category.name.toLowerCase()} item</option>
                  {itemTypes.map((itemType) => (
                    <option key={itemType.id} value={`type:${itemType.id}`}>{itemType.name} (kit item)</option>
                  ))}
                </optgroup>
              )
            })}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Condition" required>
            <select className={inputClass} value={form.condition} onChange={set('condition')}>
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Asking price (₹)" required hint="You and the buyer can still agree a different price when you meet.">
            <input type="number" required min="0" max="100000" step="0.01" inputMode="decimal" className={inputClass} value={form.price} onChange={set('price')} />
          </Field>
        </div>

        <Field label="Description">
          <textarea rows={3} maxLength={2000} className={inputClass} value={form.description} onChange={set('description')} placeholder="Brand, what is included, any damage…" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Branch">
            <select className={inputClass} value={form.branch_id} onChange={set('branch_id')}>
              <option value="">Any branch</option>
              {meta.branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Semester">
            <select className={inputClass} value={form.semester} onChange={set('semester')}>
              <option value="">Any</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Preferred meeting place" hint="A public place on your campus.">
            <input maxLength={120} className={inputClass} value={form.preferred_place} onChange={set('preferred_place')} placeholder="e.g. main gate" />
          </Field>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <input
              type="checkbox"
              checked={form.share_email}
              onChange={(event) => setForm((current) => ({ ...current, share_email: event.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block font-medium text-slate-700">Share my verified email on this listing</span>
              <span className="mt-0.5 block text-xs text-slate-500">Other students at your college can use it to contact you. Your email stays private unless you select this.</span>
            </span>
          </label>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Photos <span className="text-red-600">*</span> <span className="font-normal text-slate-500">(1 to {MAX_PHOTOS}, up to 8 MB each)</span>
          </span>
          <div className="flex flex-wrap gap-3">
            {photos.map((p, i) => (
              <div key={p.url} className="relative h-24 w-24 overflow-hidden rounded-lg border border-slate-200">
                <img src={p.url} alt={`Selected photo ${i + 1}`} className="h-full w-full object-cover" />
                <button type="button" onClick={() => removePhoto(i)} className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white" aria-label={`Remove photo ${i + 1}`}>
                  ✕
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className={`flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-center text-xs text-slate-500 ${processingPhotos ? 'cursor-wait opacity-60' : 'cursor-pointer hover:border-brand-400'}`}>
                {processingPhotos ? 'Processing…' : '+ Add photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={addPhotos} disabled={processingPhotos} />
              </label>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">Photos are resized and location metadata is removed before upload.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || frozen || processingPhotos}>{processingPhotos ? 'Processing photos…' : busy ? 'Uploading…' : 'List item'}</Button>
          <Link to="/" className="text-sm text-slate-500 underline">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
