import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CampusMap from '../components/CampusMap.jsx'
import { Alert, inputClass } from '../components/ui.jsx'
import { lostFoundApi, errorMessage } from '../services/api.js'
import { processAndCompressImage } from '../utils/imageCompressor.js'

const DRAFT_STORAGE_KEY = 'campustu_lost_found_draft_v1'
const MAX_PHOTO_BYTES = 8 * 1024 * 1024
const MAX_PHOTOS = 5
const DEFAULT_CENTER = [18.1678, 73.3364]
const CATEGORIES = [
  'Electronics & Gadgets',
  'Books & Study Materials',
  'Clothing & Accessories',
  'Keys & ID Cards',
  'Bags & Personal Items',
  'Other',
]
const SUBMISSION_STEPS = [
  { id: 'duplicates', label: 'Check nearby reports', detail: 'Looking for a possible duplicate.' },
  { id: 'matching', label: 'Prepare visual matching', detail: 'The image model may take a while to load the first time.' },
  { id: 'publishing', label: 'Upload and publish', detail: 'Uploading your photos and saving the report.' },
]

function localDateTimeValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function emptyForm() {
  return {
    status: 'lost',
    title: '',
    description: '',
    brand: '',
    colour: '',
    category: CATEGORIES[0],
    occurred_at: localDateTimeValue(),
    latitude: null,
    longitude: null,
    radius_meters: 100,
    location_name: '',
    location_note: '',
    where_is_it: 'with_me',
    security_question: '',
    security_answer: '',
  }
}

function readDraft() {
  try {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!saved) return { draft: null, error: '' }
    const parsed = JSON.parse(saved)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { draft: null, error: 'The saved draft is invalid and was not restored.' }
    }
    const draft = emptyForm()
    for (const key of [
      'status', 'title', 'description', 'brand', 'colour', 'category', 'occurred_at',
      'latitude', 'longitude', 'radius_meters', 'location_name', 'location_note', 'where_is_it',
      'security_question',
    ]) {
      if (key in parsed && typeof parsed[key] === 'string') draft[key] = parsed[key]
    }
    if (parsed.status === 'lost' || parsed.status === 'found') draft.status = parsed.status
    else draft.status = 'lost'
    if (CATEGORIES.includes(parsed.category)) draft.category = parsed.category
    if (Number.isFinite(Number(parsed.latitude)) && Number.isFinite(Number(parsed.longitude))) {
      draft.latitude = Number(parsed.latitude)
      draft.longitude = Number(parsed.longitude)
    }
    draft.radius_meters = Math.min(1000, Math.max(50, Number(parsed.radius_meters) || 100))
    if (!['with_me', 'security_desk', 'left_at_spot'].includes(parsed.where_is_it)) {
      draft.where_is_it = 'with_me'
    }
    return { draft, error: '' }
  } catch (error) {
    console.error('Could not read lost-and-found draft:', error)
    return { draft: null, error: 'The saved draft could not be read.' }
  }
}

function draftFields(form) {
  const {
    status, title, description, brand, colour, category, occurred_at, latitude, longitude,
    radius_meters, location_name, location_note, where_is_it, security_question,
  } = form
  return {
    status, title, description, brand, colour, category, occurred_at, latitude, longitude,
    radius_meters, location_name, location_note, where_is_it, security_question,
  }
}

function looksLikeSameItem(left, right) {
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const first = normalize(left)
  const second = normalize(right)
  return first.length >= 4 && second.length >= 4 && (first === second || first.includes(second) || second.includes(first))
}

export default function LostFoundNew() {
  const navigate = useNavigate()
  const [draftState] = useState(readDraft)
  const [form, setForm] = useState(emptyForm)
  const [draftReady, setDraftReady] = useState(false)
  const [showDraftPrompt, setShowDraftPrompt] = useState(Boolean(draftState.draft))
  const [draftError, setDraftError] = useState(draftState.error)
  const [photos, setPhotos] = useState([])
  const [photoPreviews, setPhotoPreviews] = useState([])
  const [processingPhotos, setProcessingPhotos] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState([])
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modelLoading, setModelLoading] = useState(false)
  const [submitStep, setSubmitStep] = useState('')
  const [error, setError] = useState('')
  const [embeddingWarning, setEmbeddingWarning] = useState('')
  const [embeddingSkipped, setEmbeddingSkipped] = useState(false)
  const [postResult, setPostResult] = useState(null)
  const currentSubmitStepIndex = SUBMISSION_STEPS.findIndex((step) => step.id === submitStep)

  useEffect(() => {
    const previews = photos.map((photo) => URL.createObjectURL(photo))
    setPhotoPreviews(previews)
    return () => previews.forEach((preview) => URL.revokeObjectURL(preview))
  }, [photos])

  useEffect(() => {
    if (!draftReady || postResult) return
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftFields(form)))
      setDraftError('')
    } catch (storageError) {
      console.error('Could not save lost-and-found draft:', storageError)
      setDraftError('Draft autosave is unavailable in this browser.')
    }
  }, [draftReady, form, postResult])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setDraftReady(true)
    setDuplicateWarning([])
    setAllowDuplicate(false)
  }

  const handlePhotoChange = async (event) => {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    setError('')
    if (selectedFiles.length === 0) return

    const availableSlots = MAX_PHOTOS - photos.length
    const acceptedFiles = selectedFiles.slice(0, availableSlots)
    const validationErrors = []
    if (selectedFiles.length > availableSlots) {
      validationErrors.push(`You can add up to ${MAX_PHOTOS} photos.`)
    }
    const validFiles = acceptedFiles.filter((file) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        validationErrors.push(`${file.name} must be a JPEG, PNG, or WebP image.`)
        return false
      }
      if (file.size > MAX_PHOTO_BYTES) {
        validationErrors.push(`${file.name} is larger than 8 MB.`)
        return false
      }
      return true
    })
    if (validFiles.length === 0) {
      if (validationErrors.length) setError(validationErrors.join(' '))
      return
    }

    setProcessingPhotos(true)
    try {
      const processed = await Promise.all(validFiles.map((file) => processAndCompressImage(file)))
      const oversized = processed.find((photo) => photo.size > MAX_PHOTO_BYTES)
      if (oversized) throw new Error(`${oversized.name} is still larger than 8 MB after compression.`)
      setPhotos((current) => [...current, ...processed].slice(0, MAX_PHOTOS))
      if (validationErrors.length) setError(validationErrors.join(' '))
    } catch (photoError) {
      console.error('Could not prepare lost-and-found photo:', photoError)
      setError(errorMessage(photoError))
    } finally {
      setProcessingPhotos(false)
    }
  }

  const removePhoto = (index) => {
    setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))
  }

  const clearSavedDraft = () => {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY)
      setDraftError('')
      setShowDraftPrompt(false)
    } catch (storageError) {
      console.error('Could not remove lost-and-found draft:', storageError)
      setDraftError('Could not remove the saved draft from this browser.')
    }
  }

  const restoreDraft = () => {
    if (!draftState.draft) return
    setForm(draftState.draft)
    clearSavedDraft()
    setDraftReady(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setEmbeddingWarning('')
    setEmbeddingSkipped(false)
    if (form.latitude == null || form.longitude == null) {
      setError('Select the approximate item location on the map before publishing.')
      return
    }
    if (form.status === 'found' && !form.where_is_it) {
      setError('Choose where the found item is currently being kept.')
      return
    }

    setIsSubmitting(true)
    try {
      if (!allowDuplicate) {
        setSubmitStep('duplicates')
        const nearby = await lostFoundApi.nearby({
          lat: form.latitude,
          lng: form.longitude,
          radius: 300,
          status: form.status,
        })
        const duplicates = nearby.items.filter((item) =>
          item.category === form.category && looksLikeSameItem(item.title, form.title),
        )
        if (duplicates.length > 0) {
          setDuplicateWarning(duplicates)
          setIsSubmitting(false)
          return
        }
      }

      let embedding = null
      if (photoPreviews.length > 0) {
        setSubmitStep('matching')
        setModelLoading(true)
        try {
          const { getImageEmbedding } = await import('../utils/embedder.js')
          embedding = await getImageEmbedding(photoPreviews[0])
        } catch (modelError) {
          console.error('Could not generate visual embedding:', modelError)
          const message = errorMessage(modelError)
          const fetchFailed = /failed to fetch/i.test(message)
          setEmbeddingWarning(fetchFailed
            ? 'The browser could not download the CLIP image-matching model from Hugging Face. Check your connection or network access to huggingface.co.'
            : `Visual matching is unavailable: ${message}.`)
          setEmbeddingSkipped(true)
        } finally {
          setModelLoading(false)
        }
      } else {
        setEmbeddingSkipped(true)
      }

      setSubmitStep('publishing')
      const payload = new FormData()
      for (const [key, value] of Object.entries(form)) {
        if (value !== '' && value !== null && value !== undefined) {
          payload.append(key, key === 'occurred_at' ? new Date(value).toISOString() : String(value))
        }
      }
      if (form.status === 'lost') {
        payload.set('where_is_it', '')
      } else {
        payload.set('radius_meters', '0')
      }
      if (embedding) payload.append('embedding', JSON.stringify(embedding))
      photos.forEach((photo) => payload.append('photos', photo))

      const result = await lostFoundApi.create(payload)
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY)
      } catch (storageError) {
        console.error('Could not clear saved lost-and-found draft:', storageError)
      }
      setPostResult(result)
    } catch (submitError) {
      console.error('Could not publish lost-and-found post:', submitError)
      setError(errorMessage(submitError))
    } finally {
      setIsSubmitting(false)
      setSubmitStep('')
    }
  }

  if (postResult) {
    return (
      <div className="mx-auto my-8 max-w-3xl rounded-3xl border border-white/70 bg-white/90 p-6 shadow-lg sm:p-8">
        <div className="text-center">
          <span aria-hidden="true" className="text-4xl">✓</span>
          <h1 className="mt-2 text-2xl font-extrabold text-brand-700">Post published</h1>
          <p className="mt-2 text-sm text-slate-600">Your {form.status} item is now visible to students at your college.</p>
          {embeddingWarning && <p role="status" className="mt-3 text-left"><Alert kind="warn">{embeddingWarning} This report was published without visual matching.</Alert></p>}
        </div>
        {postResult.potential_matches?.length > 0 && (
          <section className="mt-6 border-t border-brand-100 pt-5">
            <h2 className="font-bold text-brand-700">Potential visual matches</h2>
            <p className="mt-1 text-xs text-slate-600">Image similarity is only a suggestion. Verify details before taking action.</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {postResult.potential_matches.map((match) => (
                <li key={match.id} className="overflow-hidden rounded-xl border border-brand-100 bg-white">
                  {match.photo && <img src={match.photo} alt="" className="h-36 w-full object-cover" />}
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase text-slate-500">{match.status}</span>
                      <span className="text-xs text-slate-500">{Math.round(match.similarity_score * 100)}% visual similarity</span>
                    </div>
                    <h3 className="mt-2 font-bold text-slate-900">{match.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{match.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="mt-6 flex justify-center">
          <Link to="/lost-found" className="rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white hover:bg-brand-600">
            Back to Lost &amp; Found
          </Link>
        </div>
      </div>
    )
  }

  return (
    <main className="mx-auto my-8 max-w-4xl rounded-3xl border border-white/70 bg-white/90 p-5 shadow-lg backdrop-blur sm:p-8">
      <header className="mb-6 flex flex-col gap-3 border-b border-brand-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/lost-found" className="text-xs font-semibold text-brand-700 underline">← Back to Lost &amp; Found</Link>
          <h1 className="mt-3 text-2xl font-extrabold text-brand-700">Report a lost or found item</h1>
          <p className="mt-1 text-sm text-slate-600">Add accurate details and a map pin to help reunite the item with its owner.</p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          {['lost', 'found'].map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={form.status === status}
              onClick={() => updateForm('status', status)}
              className={`rounded-lg px-4 py-2 text-sm font-bold capitalize ${
                form.status === status ? status === 'lost' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white' : 'text-slate-600'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </header>

      {showDraftPrompt && draftState.draft && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-sky-900">A saved draft is available. Drafts never include photos or security answers.</p>
          <div className="flex gap-2">
            <button type="button" onClick={restoreDraft} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white">Restore draft</button>
            <button type="button" onClick={clearSavedDraft} className="rounded-lg border border-sky-300 px-3 py-2 text-xs font-semibold text-sky-900">Discard</button>
          </div>
        </div>
      )}
      {draftError && <div className="mb-4"><Alert kind="warn">{draftError}</Alert></div>}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {duplicateWarning.length > 0 && (
        <section className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4" aria-labelledby="duplicate-warning-title">
          <h2 id="duplicate-warning-title" className="font-bold text-amber-950">A similar post may already exist nearby</h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {duplicateWarning.map((item) => <li key={item.id}>{item.title} — {item.location_name}</li>)}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => { setAllowDuplicate(true); setDuplicateWarning([]) }} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white">Continue to publishing</button>
            <button type="button" onClick={() => navigate('/lost-found')} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-950">Review Lost &amp; Found feed</button>
          </div>
        </section>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Title *</span>
            <input required minLength={3} maxLength={255} className={inputClass} value={form.title} onChange={(event) => updateForm('title', event.target.value)} placeholder="e.g. Black scientific calculator" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Category *</span>
            <select required className={inputClass} value={form.category} onChange={(event) => updateForm('category', event.target.value)}>
              {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Brand</span>
            <input maxLength={100} className={inputClass} value={form.brand} onChange={(event) => updateForm('brand', event.target.value)} placeholder="Optional" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Colour</span>
            <input maxLength={100} className={inputClass} value={form.colour} onChange={(event) => updateForm('colour', event.target.value)} placeholder="Optional" />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Description *</span>
          <textarea required minLength={5} maxLength={2000} rows={3} className={inputClass} value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Distinguishing marks or details that are not visible in the photo." />
        </label>

        <label className="block max-w-sm">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Date and approximate time *</span>
          <input required type="datetime-local" className={inputClass} value={form.occurred_at} onChange={(event) => updateForm('occurred_at', event.target.value)} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Spot name *</span>
          <input required minLength={2} maxLength={255} className={inputClass} value={form.location_name} onChange={(event) => updateForm('location_name', event.target.value)} placeholder="Building, room, or nearby landmark" />
        </label>

        <section>
          <h2 className="mb-1 text-sm font-semibold text-slate-700">{form.status === 'lost' ? 'Approximate location lost *' : 'Where found *'}</h2>
          <p className="mb-3 text-xs text-slate-500">Click the map, search for a place, or use Recenter me. A pin is required to publish.</p>
          <CampusMap
            center={DEFAULT_CENTER}
            onSelectLocation={(coords) => {
              setForm((current) => ({ ...current, latitude: coords.lat, longitude: coords.lng }))
              setDraftReady(true)
              setDuplicateWarning([])
              setAllowDuplicate(false)
            }}
            selectedCoords={form.latitude == null ? null : { lat: form.latitude, lng: form.longitude }}
            radiusMeters={form.status === 'lost' ? Number(form.radius_meters) : 0}
          />
          {form.latitude != null && (
            <p className="mt-2 text-xs text-slate-500">Pin: {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}</p>
          )}
        </section>

        {form.status === 'lost' && (
          <label className="block max-w-xl">
            <span className="mb-1 block text-sm font-semibold text-slate-700">
              Approximate search radius: <strong className="text-brand-700">{form.radius_meters} metres</strong>
            </span>
            <input type="range" min="50" max="1000" step="50" value={form.radius_meters} onChange={(event) => updateForm('radius_meters', Number(event.target.value))} className="w-full accent-brand-700" />
          </label>
        )}

        {form.status === 'found' && (
          <fieldset className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <legend className="px-1 text-sm font-bold text-emerald-950">Where is the item now? *</legend>
            {[
              ['with_me', 'With me'],
              ['security_desk', 'Submitted to the security desk'],
              ['left_at_spot', 'Left at the spot'],
            ].map(([value, label]) => (
              <label key={value} className="mr-4 inline-flex items-center gap-2 text-sm text-emerald-950">
                <input type="radio" name="where_is_it" value={value} checked={form.where_is_it === value} onChange={() => updateForm('where_is_it', value)} />
                {label}
              </label>
            ))}
            <input maxLength={255} className={inputClass} value={form.location_note} onChange={(event) => updateForm('location_note', event.target.value)} placeholder="Optional handoff or location note" />
          </fieldset>
        )}

        <fieldset className="space-y-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
          <legend className="px-1 text-sm font-bold text-brand-900">Private ownership check (optional)</legend>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Security question</span>
            <input maxLength={255} className={inputClass} value={form.security_question} onChange={(event) => updateForm('security_question', event.target.value)} placeholder="Ask about a detail not shown in the photo" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Expected answer</span>
            <input className={inputClass} value={form.security_answer} onChange={(event) => updateForm('security_answer', event.target.value)} placeholder="Only you should know the answer" />
          </label>
          <p className="text-[11px] text-slate-600">Security answers are not saved in browser drafts or returned in item listings.</p>
        </fieldset>

        <section>
          <label className="block text-sm font-semibold text-slate-700" htmlFor="lost-found-report-photo">Photos <span className="font-normal text-slate-500">(optional, up to {MAX_PHOTOS})</span></label>
          <input id="lost-found-report-photo" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={processingPhotos || isSubmitting || photos.length >= MAX_PHOTOS} onChange={handlePhotoChange} className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-700 disabled:opacity-60" />
          <p className="mt-1 text-xs text-slate-500">
            {processingPhotos ? 'Preparing selected photos…' : `${photos.length} of ${MAX_PHOTOS} photos selected. The first photo is used for visual matching.`}
          </p>
          <p className="mt-1 text-xs text-amber-700">Avoid photos that expose ID numbers or other sensitive personal information.</p>
          {photoPreviews.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-3">
              {photoPreviews.map((preview, index) => (
                <li key={preview} className="relative h-28 w-28 overflow-hidden rounded-xl border border-slate-200">
                  <img src={preview} alt={`Selected item photo ${index + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    disabled={isSubmitting}
                    className="absolute right-1 top-1 rounded-full bg-slate-900/80 px-2 py-1 text-xs font-bold text-white disabled:opacity-60"
                    aria-label={`Remove photo ${index + 1}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-t border-brand-100 pt-4">
          <button type="button" onClick={() => setShowPreview((visible) => !visible)} className="text-sm font-semibold text-brand-700 underline">
            {showPreview ? 'Hide live preview' : 'Show live preview'}
          </button>
          {showPreview && (
            <article className="mt-3 max-w-sm rounded-xl border border-brand-100 bg-white p-4 shadow-sm">
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${form.status === 'lost' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{form.status}</span>
              {photoPreviews[0] && <img src={photoPreviews[0]} alt="" className="mt-3 h-40 w-full rounded-lg object-cover" />}
              <h2 className="mt-3 font-bold text-slate-900">{form.title || 'Untitled item'}</h2>
              <p className="mt-1 text-xs text-slate-600">{form.description || 'No description yet.'}</p>
              <p className="mt-3 text-xs text-slate-500">{form.category}{form.brand ? ` · ${form.brand}` : ''}{form.colour ? ` · ${form.colour}` : ''}</p>
              {form.location_name && <p className="mt-1 text-xs text-slate-500">{form.location_name}</p>}
            </article>
          )}
        </section>

        {modelLoading && (
          <p role="status" aria-live="polite" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
            Loading the AI image-matching model. The first download may take a little while; you can keep this page open.
          </p>
        )}
        {embeddingWarning && <Alert kind="warn">{embeddingWarning} The report can continue publishing without visual matching.</Alert>}
        {isSubmitting && (
          <section role="status" aria-live="polite" aria-label="Publishing progress" className="rounded-xl border border-brand-100 bg-brand-50 p-4">
            <h2 className="font-bold text-brand-900">Publishing your report</h2>
            <ol className="mt-3 space-y-3">
              {SUBMISSION_STEPS.map((step, index) => {
                const skipped = (step.id === 'duplicates' && allowDuplicate)
                  || (step.id === 'matching' && embeddingSkipped && currentSubmitStepIndex > index)
                const complete = currentSubmitStepIndex > index && !skipped
                const active = submitStep === step.id
                return (
                  <li key={step.id} className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      active ? 'animate-pulse bg-brand-700 text-white' : complete ? 'bg-emerald-100 text-emerald-800' : skipped ? 'bg-slate-200 text-slate-600' : 'bg-white text-slate-500'
                    }`}>
                      {active ? '…' : complete ? '✓' : skipped ? '–' : index + 1}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">
                        {step.label}{skipped ? ' — skipped' : ''}
                        {active && <span className="ml-2 font-normal text-brand-700">In progress…</span>}
                      </span>
                      <span className="text-xs text-slate-600">
                        {step.id === 'matching' && skipped && !photos.length
                          ? 'No photo selected.'
                          : step.id === 'matching' && skipped && embeddingWarning
                            ? 'Unavailable; publishing continues without a visual match.'
                            : step.detail}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ol>
          </section>
        )}
        <div className="flex flex-col gap-3 border-t border-brand-100 pt-4 sm:flex-row">
          <button type="submit" disabled={isSubmitting || processingPhotos} className="flex-1 rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60">
            {processingPhotos ? 'Preparing photos…' : isSubmitting ? 'Publishing…' : `Publish ${form.status} item`}
          </button>
          <button type="button" onClick={() => navigate('/lost-found')} disabled={isSubmitting} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
        </div>
      </form>
    </main>
  )
}
