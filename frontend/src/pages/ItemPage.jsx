import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { conversationsApi, deleteItem, itemsApi, metaApi, errorMessage } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { STATUS_STYLES, conditionLabel, formatPrice } from '../lib/format.js'
import { getImageUrl } from '../lib/imageUrl.js'
import ItemPhoto from '../components/ItemPhoto.jsx'
import { Alert, ConfirmDialog, PageLoading, useToast } from '../components/ui.jsx'

export default function ItemPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const showToast = useToast()
  const [state, setState] = useState({ item: null, meta: null, error: '' })
  const [selected, setSelected] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [reservation, setReservation] = useState(null)
  const [reservationLoading, setReservationLoading] = useState(true)
  const [reservationBusy, setReservationBusy] = useState(false)
  const [reservationError, setReservationError] = useState('')
  const [messaging, setMessaging] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([itemsApi.get(id), metaApi.get()])
      .then(([{ item }, meta]) => !cancelled && setState({ item, meta, error: '' }))
      .catch((e) => !cancelled && setState({ item: null, meta: null, error: errorMessage(e) }))
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    setReservation(null)
    setReservationError('')
    setReservationLoading(true)
    itemsApi.reservation(id)
      .then(({ reservation: current }) => {
        if (!cancelled) setReservation(current)
      })
      .catch((error) => {
        if (!cancelled) setReservationError(errorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setReservationLoading(false)
      })
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

  async function handleDelete() {
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteItem(id)
      showToast('Listing deleted successfully.')
      navigate('/')
    } catch (err) {
      setDeleteError(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  async function handleStatusToggle() {
    const status = item.status === 'available' ? 'sold' : 'available'
    setUpdatingStatus(true)
    setStatusError('')
    try {
      const { item: updated } = await itemsApi.updateStatus(id, status)
      setState((current) => ({ ...current, item: updated }))
    } catch (err) {
      setStatusError(errorMessage(err))
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function refreshReservation() {
    const [{ reservation: current }, { item: updated }] = await Promise.all([
      itemsApi.reservation(id),
      itemsApi.get(id),
    ])
    setReservation(current)
    setState((currentState) => ({ ...currentState, item: updated }))
  }

  async function startConversation() {
    setMessaging(true)
    setReservationError('')
    try {
      const { conversation } = await conversationsApi.create({ item_id: id })
      navigate(`/messages/${encodeURIComponent(conversation.id)}`)
    } catch (error) {
      setReservationError(errorMessage(error))
    } finally {
      setMessaging(false)
    }
  }

  async function createReservation() {
    setReservationBusy(true)
    setReservationError('')
    try {
      await itemsApi.reserve(id)
      await refreshReservation()
    } catch (error) {
      setReservationError(errorMessage(error))
    } finally {
      setReservationBusy(false)
    }
  }

  async function updateReservation(action) {
    if (!reservation) return
    setReservationBusy(true)
    setReservationError('')
    try {
      await itemsApi.updateReservation(reservation.id, action)
      await refreshReservation()
    } catch (error) {
      setReservationError(errorMessage(error))
    } finally {
      setReservationBusy(false)
    }
  }

  async function confirmHandover() {
    if (!reservation) return
    setReservationBusy(true)
    setReservationError('')
    try {
      await itemsApi.confirmReservation(reservation.id)
      await refreshReservation()
    } catch (error) {
      setReservationError(errorMessage(error))
    } finally {
      setReservationBusy(false)
    }
  }

  return (
    <div className="animate-fade-in grid gap-8 md:grid-cols-2">
      <div>
        <div className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ItemPhoto
            src={item.photos[selected] ? getImageUrl(item.photos[selected]) : null}
            alt={item.title}
            loading="eager"
            className="h-full w-full object-contain"
          />
        </div>
        {item.photos.length > 1 && (
          <div className="mt-3 flex gap-2">
            {item.photos.map((url, i) => (
              <button key={url} onClick={() => setSelected(i)} className={`h-16 w-16 overflow-hidden rounded-lg border-2 ${i === selected ? 'border-brand-600' : 'border-transparent'}`}>
                <ItemPhoto src={getImageUrl(url)} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
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

        {!isOwner && ['available', 'reserved'].includes(item.status) && (
          <div className="mt-6 space-y-3">
            {reservationError && <Alert>{reservationError}</Alert>}
            <button
              type="button"
              onClick={startConversation}
              disabled={messaging}
              className="inline-flex w-full items-center justify-center rounded-xl border border-brand-200 bg-white px-6 py-3 font-semibold text-brand-800 transition hover:bg-brand-50 disabled:opacity-60"
            >
              {messaging ? 'Opening messages…' : 'Message seller'}
            </button>
            {item.seller.contact_email && (
              <a
                href={`mailto:${item.seller.contact_email}?subject=${encodeURIComponent(`Interested in ${item.title} on Campustu`)}&body=${encodeURIComponent(`Hi ${item.seller.display_name},\n\nI'm interested in your listing "${item.title}" on Campustu. Is it still available?`)}`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Email seller
              </a>
            )}
            {reservationLoading ? (
              <p role="status" className="text-center text-xs text-slate-500">Checking reservation…</p>
            ) : (!reservation || !['requested', 'accepted', 'disputed'].includes(reservation.status)) && item.status === 'available' ? (
              <button
                type="button"
                onClick={createReservation}
                disabled={reservationBusy}
                className="inline-flex w-full items-center justify-center rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-teal-700 disabled:cursor-wait disabled:opacity-60"
              >
                {reservationBusy ? 'Requesting…' : 'Request to reserve'}
              </button>
            ) : null}
          </div>
        )}

        {reservation && (
          <section className="mt-5 space-y-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-slate-900">Reservation</h2>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold capitalize text-brand-800">{reservation.status}</span>
            </div>
            <p className="text-sm text-slate-700">
              {reservation.status === 'requested'
                ? isOwner ? `${reservation.other_user_name} is requesting to reserve this item.` : 'Your request is waiting for the seller.'
                : reservation.status === 'accepted'
                  ? `Reservation accepted at ${formatPrice(reservation.agreed_price)}. Confirm after you meet and complete the handover.`
                  : reservation.status === 'completed'
                    ? 'Both participants confirmed the handover. The sale is complete.'
                    : reservation.status === 'disputed'
                      ? 'The handover needs support review. Contact the other participant through messages.'
                      : 'This reservation is no longer active.'}
            </p>
            {reservation.conversation_id && (
              <button
                type="button"
                onClick={() => navigate(`/messages/${encodeURIComponent(reservation.conversation_id)}`)}
                className="rounded-full border border-brand-200 bg-white px-4 py-2 text-xs font-bold text-brand-800 hover:bg-brand-50"
              >
                Message {reservation.other_user_name}
              </button>
            )}
            {reservation.status === 'requested' && isOwner && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => updateReservation('accept')} disabled={reservationBusy} className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                  {reservationBusy ? 'Saving…' : 'Accept request'}
                </button>
                <button type="button" onClick={() => updateReservation('decline')} disabled={reservationBusy} className="rounded-full border border-red-200 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">
                  Decline
                </button>
              </div>
            )}
            {reservation.status === 'requested' && !isOwner && reservation.buyer_id === user?.id && (
              <button type="button" onClick={() => updateReservation('cancel')} disabled={reservationBusy} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-white disabled:opacity-50">
                Cancel request
              </button>
            )}
            {reservation.status === 'accepted' && !reservation.viewer_confirmed && (
              <button type="button" onClick={confirmHandover} disabled={reservationBusy} className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                {reservationBusy ? 'Confirming…' : 'Confirm handover completed'}
              </button>
            )}
            {reservation.status === 'accepted' && reservation.viewer_confirmed && (
              <p className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-slate-700">
                {reservation.counterpart_confirmed
                  ? 'Both participants confirmed. The sale is complete.'
                  : 'Your confirmation is saved. Waiting for the other participant.'}
              </p>
            )}
          </section>
        )}

        {isOwner && (deleteError || statusError || reservationError) && (
          <div className="mt-4"><Alert>{deleteError || statusError || reservationError}</Alert></div>
        )}
        {isOwner && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p className="text-sm text-slate-600">
              This is your listing. <Link to="/my-listings" className="text-brand-700 underline">See all your listings</Link>
            </p>
            <div className="flex flex-wrap gap-2">
              {['available', 'sold'].includes(item.status) && (
                <button type="button" onClick={handleStatusToggle} disabled={updatingStatus || deleting} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                  {updatingStatus ? 'Updating…' : `Mark as ${item.status === 'available' ? 'sold' : 'available'}`}
                </button>
              )}
              {item.status === 'available' && (
                <button type="button" onClick={() => setConfirmDelete(true)} disabled={deleting || updatingStatus} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {deleting ? 'Removing…' : 'Delete Listing'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Remove this listing?"
        confirmLabel="Remove listing"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          handleDelete()
        }}
      >
        This listing will be removed from the marketplace. This action cannot be undone.
      </ConfirmDialog>
    </div>
  )
}
