import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { adminApi, errorMessage, moderationApi } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Alert, inputClass } from '../components/ui.jsx'
import ItemPhoto from '../components/ItemPhoto.jsx'

const TABS = [
  { id: 'moderation', label: 'Moderation Queue' },
  { id: 'users', label: 'User Management' },
  { id: 'support', label: 'Support Requests' },
  { id: 'colleges', label: 'Add College' },
  { id: 'controls', label: 'System & Safety' },
  { id: 'audit', label: 'Audit Logs' },
]
const ADMIN_SESSION_MS = 30 * 60 * 1000
const ADMIN_PASSWORD_PATTERN = '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{14,128}'

function ModerationQueue({ onError }) {
  const [reports, setReports] = useState([])
  const [overrides, setOverrides] = useState([])
  const [busy, setBusy] = useState('')

  const refresh = useCallback(async () => {
    try {
      const result = await adminApi.reports()
      setReports(result.reports || [])
      setOverrides(result.duplicate_overrides || [])
    } catch (error) {
      onError(errorMessage(error))
    }
  }, [onError])

  useEffect(() => { refresh() }, [refresh])

  async function actOnReport(report, action) {
    const prompts = {
      dismiss: 'Dismiss this report?',
      remove: `Remove "${report.item_title}"?`,
      ban: `Ban ${report.target_user_name} and remove their active listings?`,
    }
    if (!window.confirm(prompts[action])) return
    setBusy(report.id)
    try {
      await adminApi.reviewReport(report.id, action)
      setReports((current) => current.filter((entry) => entry.id !== report.id))
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  async function actOnOverride(item, action) {
    if (!window.confirm(action === 'remove'
      ? `Remove "${item.title}" after reviewing the explanation?`
      : `Clear the review flag and keep "${item.title}" active?`)) return
    setBusy(item.id)
    try {
      await moderationApi.reviewDuplicateOverride(item.id, action)
      setOverrides((current) => current.filter((entry) => entry.id !== item.id))
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-xl font-bold">Student reports</h2>
        {reports.length === 0 ? <p className="border bg-white p-4">No pending reports.</p> : (
          <div className="overflow-x-auto border bg-white">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-teal-900 text-white">
                <tr>{['Reporter', 'Reason', 'Post', 'Owner', 'Actions'].map((title) => <th key={title} className="border p-3">{title}</th>)}</tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-b align-top">
                    <td className="border p-3">{report.reporter_email || report.reporter_name}</td>
                    <td className="border p-3">{report.reason}</td>
                    <td className="border p-3">{report.item_title}<small className="block text-slate-500">{report.item_type}</small></td>
                    <td className="border p-3">{report.target_user_name}</td>
                    <td className="space-x-1 whitespace-nowrap p-3">
                      <button disabled={Boolean(busy)} onClick={() => actOnReport(report, 'dismiss')} className="border px-2 py-1 disabled:opacity-50">Dismiss</button>
                      <button disabled={Boolean(busy)} onClick={() => actOnReport(report, 'remove')} className="border border-amber-700 px-2 py-1 text-amber-900 disabled:opacity-50">Delete Post</button>
                      <button disabled={Boolean(busy)} onClick={() => actOnReport(report, 'ban')} className="border border-red-700 px-2 py-1 text-red-800 disabled:opacity-50">Ban User</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold">Duplicate-warning overrides</h2>
        <p className="mb-3 text-sm">These posts were published with an explanation after a high-similarity warning. Similarity alone does not trigger a flag.</p>
        {overrides.length === 0 ? <p className="border bg-white p-4">No posts are awaiting review.</p> : (
          <ul className="space-y-3">
            {overrides.map((item) => (
              <li key={item.id} className="grid gap-3 border bg-white p-4 sm:grid-cols-[7rem_1fr]">
                <ItemPhoto src={item.photo_url} alt={item.title} className="h-24 w-full object-cover" />
                <div>
                  <h3 className="font-bold">{item.title} · {item.status}</h3>
                  <p className="text-sm">Owner: {item.target_user_name} ({item.target_user_email})</p>
                  <p className="mt-1 text-sm"><strong>Explanation:</strong> {item.skip_reason}</p>
                  <div className="mt-3 flex gap-2">
                    <button disabled={Boolean(busy)} onClick={() => actOnOverride(item, 'dismiss')} className="border px-3 py-1.5">Clear flag &amp; keep post</button>
                    <button disabled={Boolean(busy)} onClick={() => actOnOverride(item, 'remove')} className="border border-red-700 px-3 py-1.5 text-red-800">Remove Post</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          Client-side NSFWJS scores are not trusted as moderation evidence. Image review is not available until screening can be verified server-side.
        </div>
      </section>
    </div>
  )
}

function UserManagement({ onError }) {
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)

  async function searchUsers(event) {
    event.preventDefault()
    setSelected(null)
    try {
      const result = await adminApi.searchUsers(search)
      setUsers(result.users || [])
    } catch (error) {
      onError(errorMessage(error))
    }
  }

  async function showUser(user) {
    try {
      setSelected(await adminApi.user(user.id))
    } catch (error) {
      onError(errorMessage(error))
    }
  }

  async function ban(user) {
    const reason = window.prompt(`Reason for banning ${user.display_name}?`)
    if (!reason || reason.trim().length < 5) return
    if (!window.confirm('Ban this account, revoke sessions, and remove all active listings?')) return
    setBusy(true)
    try {
      await adminApi.banUser(user.id, reason.trim())
      setUsers((current) => current.map((entry) => entry.id === user.id ? { ...entry, status: 'banned' } : entry))
      if (selected?.user.id === user.id) setSelected(null)
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(user, status) {
    const reason = window.prompt(`${status === 'frozen' ? 'Suspension' : 'Reactivation'} reason for ${user.display_name}?`)
    if (!reason || reason.trim().length < 5) return
    setBusy(true)
    try {
      await adminApi.setUserStatus(user.id, status, reason.trim())
      setUsers((current) => current.map((entry) => entry.id === user.id ? { ...entry, status } : entry))
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function unban(user) {
    const reason = window.prompt(`Reason for restoring ${user.display_name}'s account access?`)
    if (!reason || reason.trim().length < 5) return
    const confirmed = window.confirm(
      'Restore account access? The listings removed during the ban and their photos cannot be restored.',
    )
    if (!confirmed) return
    setBusy(true)
    try {
      await adminApi.unbanUser(user.id, reason.trim())
      setUsers((current) => current.map((entry) => entry.id === user.id ? { ...entry, status: 'active' } : entry))
      if (selected?.user.id === user.id) {
        setSelected((current) => ({
          ...current,
          user: { ...current.user, status: 'active', frozen_reason: null },
        }))
      }
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={searchUsers} className="flex flex-col gap-2 sm:flex-row">
        <input required minLength={2} maxLength={120} className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by email or roll number" />
        <button className="border bg-teal-900 px-5 py-2 font-semibold text-white">Search</button>
      </form>
      {users.length > 0 && (
        <div className="overflow-x-auto border bg-white">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-teal-900 text-white"><tr>{['User', 'Roll number', 'College', 'Status', 'Active posts', 'Reports', 'Handovers', 'Actions'].map((title) => <th key={title} className="border p-2">{title}</th>)}</tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b">
                  <td className="border p-2">{user.display_name}<small className="block">{user.email}</small></td>
                  <td className="border p-2">{user.roll_number || '—'}</td>
                  <td className="border p-2">{user.college_name || '—'}</td>
                  <td className="border p-2">{user.status}</td>
                  <td className="border p-2">{user.active_marketplace_listings + user.active_lost_found_listings}</td>
                  <td className="border p-2">{user.reports_received}</td>
                  <td className="border p-2">{user.completed_handovers}</td>
                  <td className="space-x-2 whitespace-nowrap p-2">
                    <button onClick={() => showUser(user)} className="underline">Details</button>
                    {user.role !== 'admin' && user.status !== 'banned' && (
                      <>
                        <button disabled={busy} onClick={() => setStatus(user, user.status === 'frozen' ? 'active' : 'frozen')} className="text-amber-800 underline">
                          {user.status === 'frozen' ? 'Reactivate' : 'Suspend'}
                        </button>
                        <button disabled={busy} onClick={() => ban(user)} className="text-red-700 underline">Ban</button>
                      </>
                    )}
                    {user.role !== 'admin' && user.status === 'banned' && (
                      <button disabled={busy} onClick={() => unban(user)} className="text-teal-900 underline">
                        Unban
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <section className="space-y-3 border bg-white p-4">
          <h2 className="text-lg font-bold">{selected.user.display_name} · Account details</h2>
          <p>{selected.user.email} · {selected.user.roll_number || 'No roll number'} · {selected.user.status}</p>
          {selected.user.frozen_reason && <p className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Account restriction reason:</strong> {selected.user.frozen_reason}</p>}
          <p>Completed handovers: <strong>{selected.user.completed_handovers}</strong></p>
          <div><h3 className="font-semibold">Active marketplace listings</h3>{selected.active_listings.marketplace.map((item) => <p key={item.id}>{item.title} · {item.status}</p>)}</div>
          <div><h3 className="font-semibold">Active Lost &amp; Found posts</h3>{selected.active_listings.lost_found.map((item) => <p key={item.id}>{item.title} · {item.status}</p>)}</div>
          <div><h3 className="font-semibold">Reports received</h3>{selected.reports_received.map((report) => <p key={report.id}>{report.item_title}: {report.reason} · {report.status}</p>)}</div>
        </section>
      )}
      {search && users.length === 0 && <p className="border bg-white p-4">No matching accounts found.</p>}
    </div>
  )
}

function SupportRequests({ onError, onSuccess }) {
  const [requests, setRequests] = useState([])
  const [busy, setBusy] = useState('')
  const [noteDrafts, setNoteDrafts] = useState({})

  const refresh = useCallback(async () => {
    try {
      const result = await adminApi.supportRequests()
      setRequests(result.requests || [])
    } catch (error) {
      onError(errorMessage(error))
    }
  }, [onError])

  useEffect(() => { refresh() }, [refresh])

  async function updateStatus(ticket, status) {
    setBusy(ticket.id)
    try {
      const result = await adminApi.updateSupportRequest(ticket.id, { status })
      setRequests((current) => current.map((entry) => entry.id === ticket.id
        ? { ...entry, ...result.request }
        : entry))
      onSuccess(`Request ${ticket.id} marked ${status.replace('_', ' ')}.`)
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  async function saveNote(ticket) {
    setBusy(ticket.id)
    try {
      const result = await adminApi.updateSupportRequest(ticket.id, {
        status: ticket.status,
        admin_note: (noteDrafts[ticket.id] || '').trim(),
      })
      setRequests((current) => current.map((entry) => entry.id === ticket.id
        ? { ...entry, ...result.request }
        : entry))
      onSuccess(`Internal note saved for request ${ticket.id}.`)
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Student support inbox</h2>
        <p className="mt-1 text-sm text-slate-700">Reply by email. Requests are private to admins and are not exposed through the public API.</p>
      </div>
      {requests.length === 0 ? <p className="border bg-white p-4">No support requests have been submitted.</p> : (
        <ul className="space-y-3">
          {requests.map((ticket) => {
            const subject = `Re: ${ticket.subject} [Campustu support ${ticket.id}]`
            const body = `Hi ${ticket.full_name},\n\nRegarding your Campustu support request ${ticket.id}:\n\n`
            return (
              <li key={ticket.id} className="space-y-3 border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold">{ticket.subject}</h3>
                    <p className="text-sm">{ticket.full_name} · <a className="text-teal-900 underline" href={`mailto:${encodeURIComponent(ticket.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>{ticket.email}</a></p>
                    <p className="text-xs text-slate-600">{ticket.category.replaceAll('_', ' ')} · {new Date(ticket.created_at).toLocaleString()} · Ref {ticket.id}</p>
                  </div>
                  <span className="border px-2 py-1 text-xs font-semibold">{ticket.status.replace('_', ' ')}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{ticket.message}</p>
                {ticket.admin_note && <p className="border-l-2 border-teal-700 pl-3 text-sm text-slate-700"><strong>Internal note:</strong> {ticket.admin_note}</p>}
                <label className="block text-sm font-semibold">
                  Internal note
                  <textarea
                    className={`${inputClass} mt-1 min-h-20`}
                    maxLength={2000}
                    value={noteDrafts[ticket.id] ?? ticket.admin_note ?? ''}
                    onChange={(event) => setNoteDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))}
                    placeholder="Add a private note for other admins"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <a href={`mailto:${encodeURIComponent(ticket.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`} className="border border-teal-800 px-3 py-1.5 text-sm font-semibold text-teal-950">
                    Reply by email
                  </a>
                  <button disabled={busy === ticket.id} onClick={() => saveNote(ticket)} className="border px-3 py-1.5 text-sm disabled:opacity-50">
                    Save internal note
                  </button>
                  {ticket.status !== 'in_progress' && ticket.status !== 'resolved' && (
                    <button disabled={busy === ticket.id} onClick={() => updateStatus(ticket, 'in_progress')} className="border px-3 py-1.5 text-sm disabled:opacity-50">
                      Mark in progress
                    </button>
                  )}
                  {ticket.status !== 'resolved' ? (
                    <button disabled={busy === ticket.id} onClick={() => updateStatus(ticket, 'resolved')} className="border border-teal-800 px-3 py-1.5 text-sm text-teal-950 disabled:opacity-50">
                      Resolve
                    </button>
                  ) : (
                    <button disabled={busy === ticket.id} onClick={() => updateStatus(ticket, 'open')} className="border px-3 py-1.5 text-sm disabled:opacity-50">
                      Reopen
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function AddCollege({ onError, onSuccess }) {
  const [form, setForm] = useState({
    name: '', short_code: '', city: '', state: '', email_domain: '',
    latitude: '', longitude: '', search_radius_meters: '1000',
  })
  const [busy, setBusy] = useState(false)
  const [colleges, setColleges] = useState([])
  const [editingCollege, setEditingCollege] = useState(null)
  const [savingCollege, setSavingCollege] = useState(false)

  useEffect(() => {
    adminApi.colleges().then((result) => setColleges(result.colleges || [])).catch((error) => onError(errorMessage(error)))
  }, [onError])

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const { college } = await adminApi.createCollege({
        ...form,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        search_radius_meters: Number(form.search_radius_meters),
      })
      setColleges((current) => [...current, college].sort((a, b) => a.name.localeCompare(b.name)))
      setForm({ name: '', short_code: '', city: '', state: '', email_domain: '', latitude: '', longitude: '', search_radius_meters: '1000' })
      onSuccess(`Added ${college.name}.`)
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function setCollegeStatus(college, status) {
    const reason = window.prompt(`${status === 'approved' ? 'Approval' : 'Rejection'} reason for ${college.name}?`)
    if (!reason || reason.trim().length < 5) return
    try {
      const result = await adminApi.setCollegeStatus(college.id, status, reason.trim())
      setColleges((current) => current.map((entry) => entry.id === college.id ? result.college : entry))
    } catch (error) {
      onError(errorMessage(error))
    }
  }

  function editCollege(college) {
    setEditingCollege({
      id: college.id,
      name: college.name,
      short_code: college.short_code || '',
      city: college.city,
      state: college.state || '',
      email_domain: college.email_domain || '',
      latitude: college.center_lat == null ? '' : String(college.center_lat),
      longitude: college.center_lng == null ? '' : String(college.center_lng),
      search_radius_meters: String(college.search_radius_meters || 1000),
    })
  }

  async function saveCollege(approve = false) {
    if (!editingCollege) return
    const reason = approve
      ? window.prompt(`Approval reason for ${editingCollege.name}?`)
      : undefined
    if (approve && (!reason || reason.trim().length < 5)) return

    setSavingCollege(true)
    try {
      const { id, ...collegeDetails } = editingCollege
      const result = await adminApi.updateCollege(id, {
        ...collegeDetails,
        latitude: Number(editingCollege.latitude),
        longitude: Number(editingCollege.longitude),
        search_radius_meters: Number(editingCollege.search_radius_meters),
        ...(approve ? { status: 'approved', reason: reason.trim() } : {}),
      })
      setColleges((current) => current.map((entry) => entry.id === id ? result.college : entry))
      setEditingCollege(null)
      onSuccess(approve ? `${result.college.name} updated and approved.` : `${result.college.name} updated.`)
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setSavingCollege(false)
    }
  }

  const fields = [
    ['name', 'College name', 'text'],
    ['short_code', 'Short code', 'text'],
    ['city', 'City', 'text'],
    ['state', 'State', 'text'],
    ['email_domain', 'Email domain (optional, e.g. dbatu.ac.in)', 'text'],
    ['latitude', 'Latitude', 'number'],
    ['longitude', 'Longitude', 'number'],
    ['search_radius_meters', 'Search radius (meters)', 'number'],
  ]

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="grid gap-4 border bg-white p-5 sm:grid-cols-2">
        {fields.map(([key, label, type]) => (
          <label key={key} className="space-y-1 text-sm font-semibold">
            <span>{label}</span>
            <input required={key !== 'state'} type={type} step={type === 'number' && key !== 'search_radius_meters' ? 'any' : undefined} min={key === 'search_radius_meters' ? 100 : undefined} max={key === 'search_radius_meters' ? 50000 : undefined} className={inputClass} value={form[key]} onChange={(event) => update(key, event.target.value)} />
          </label>
        ))}
        <button disabled={busy} className="border bg-teal-900 px-4 py-2 font-semibold text-white disabled:opacity-50 sm:col-span-2">{busy ? 'Adding…' : 'Add approved campus'}</button>
      </form>
      {editingCollege && (
        <form
          className="grid gap-4 border-2 border-teal-800 bg-teal-50 p-5 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            saveCollege(event.nativeEvent.submitter?.value === 'approve')
          }}
        >
          <div className="sm:col-span-2">
            <h2 className="text-lg font-bold">Edit {editingCollege.name}</h2>
            <p className="text-sm text-slate-700">Check the campus details and map center before approving.</p>
          </div>
          {fields.map(([key, label, type]) => (
            <label key={key} className="space-y-1 text-sm font-semibold">
              <span>{label}</span>
              <input
                required={!['state', 'email_domain'].includes(key)}
                type={type}
                step={type === 'number' && key !== 'search_radius_meters' ? 'any' : undefined}
                min={key === 'latitude' ? -90 : key === 'longitude' ? -180 : key === 'search_radius_meters' ? 100 : undefined}
                max={key === 'latitude' ? 90 : key === 'longitude' ? 180 : key === 'search_radius_meters' ? 50000 : undefined}
                className={inputClass}
                value={editingCollege[key]}
                onChange={(event) => setEditingCollege((current) => ({ ...current, [key]: event.target.value }))}
              />
            </label>
          ))}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" value="save" disabled={savingCollege} className="border bg-white px-4 py-2 font-semibold text-teal-950 disabled:opacity-50">
              {savingCollege ? 'Saving…' : 'Save changes'}
            </button>
            {colleges.find((college) => college.id === editingCollege.id)?.status === 'pending' && (
              <button type="submit" value="approve" disabled={savingCollege} className="border bg-teal-900 px-4 py-2 font-semibold text-white disabled:opacity-50">
                Save changes &amp; approve
              </button>
            )}
            <button type="button" disabled={savingCollege} onClick={() => setEditingCollege(null)} className="border bg-white px-4 py-2 disabled:opacity-50">
              Cancel
            </button>
          </div>
        </form>
      )}
      <section>
        <h2 className="mb-2 text-lg font-bold">Campuses ({colleges.length})</h2>
        <ul className="space-y-2">
          {colleges.map((college) => (
            <li key={college.id} className="flex flex-col justify-between gap-2 border bg-white p-3 text-sm sm:flex-row sm:items-center">
              <span>
                {college.name} ({college.short_code || 'no short code'}) · {college.city}
                {college.email_domain ? ` · @${college.email_domain}` : ' · no email-domain restriction'}
                {` · map center ${college.center_lat ?? 'not set'}, ${college.center_lng ?? 'not set'} · ${college.status}`}
              </span>
              <span className="flex gap-2">
                <button type="button" onClick={() => editCollege(college)} className="border px-2 py-1 text-teal-900">Edit</button>
                {college.status === 'pending' && <>
                  <button type="button" onClick={() => setCollegeStatus(college, 'approved')} className="border px-2 py-1 text-teal-900">Approve</button>
                  <button type="button" onClick={() => setCollegeStatus(college, 'rejected')} className="border px-2 py-1 text-red-800">Reject</button>
                </>}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function SystemSafety({ onError }) {
  const [controls, setControls] = useState([])
  const [busy, setBusy] = useState('')

  const refresh = useCallback(async () => {
    try {
      const result = await adminApi.controls()
      setControls(result.controls || [])
    } catch (error) {
      onError(errorMessage(error))
    }
  }, [onError])

  useEffect(() => { refresh() }, [refresh])

  async function toggle(control) {
    setBusy(control.key)
    try {
      const result = await adminApi.updateControl(control.key, !control.enabled)
      setControls((current) => current.map((entry) => entry.key === control.key ? result.control : entry))
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const labels = {
    image_uploads_enabled: ['Image uploads', 'Pause uploads in marketplace, Lost & Found, and profile photos.'],
    marketplace_read_only: ['Marketplace read-only mode', 'Block marketplace changes while keeping browsing available.'],
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">Emergency controls take effect on the backend. Changes are recorded in the immutable audit log.</p>
      {controls.map((control) => {
        const [title, detail] = labels[control.key] || [control.key, control.note]
        const active = control.key === 'image_uploads_enabled' ? control.enabled : !control.enabled
        return (
          <section key={control.key} className="flex flex-col justify-between gap-3 border bg-white p-4 sm:flex-row sm:items-center">
            <div><h2 className="font-bold">{title}</h2><p className="text-sm text-slate-600">{detail}</p><p className="text-xs">Current state: {active ? 'Enabled' : 'Disabled'}</p></div>
            <button disabled={busy === control.key} onClick={() => toggle(control)} className={`border px-4 py-2 font-semibold disabled:opacity-50 ${active ? 'border-red-700 text-red-800' : 'border-teal-800 text-teal-900'}`}>
              {busy === control.key ? 'Saving…' : active ? 'Turn off' : 'Turn on'}
            </button>
          </section>
        )
      })}
    </div>
  )
}

function AuditLogs({ onError }) {
  const [logs, setLogs] = useState([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    adminApi.auditLogs({ limit: 50, offset })
      .then((result) => {
        setLogs(result.logs || [])
        setHasMore((result.logs || []).length === 50)
      })
      .catch((error) => onError(errorMessage(error)))
  }, [offset, onError])

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border bg-white">
        <table className="w-full min-w-[850px] border-collapse text-left text-sm">
          <thead className="bg-teal-900 text-white"><tr>{['Time', 'Administrator', 'Action', 'Target', 'Details', 'IP address'].map((title) => <th key={title} className="border p-2">{title}</th>)}</tr></thead>
          <tbody>{logs.map((log) => <tr key={log.id} className="border-b align-top">
            <td className="border p-2">{new Date(log.created_at).toLocaleString()}</td>
            <td className="border p-2">{log.admin_name}</td>
            <td className="border p-2">{log.action}</td>
            <td className="border p-2">{log.target_type}: {log.target_id}</td>
            <td className="max-w-sm border p-2"><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(log.details)}</pre></td>
            <td className="border p-2">{log.ip_address || '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))} className="border bg-white px-3 py-2 disabled:opacity-50">Newer</button>
        <button disabled={!hasMore} onClick={() => setOffset(offset + 50)} className="border bg-white px-3 py-2 disabled:opacity-50">Older</button>
      </div>
    </div>
  )
}

function AdminPasswordGate({ configured, onUnlocked, onError }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (!configured && password !== confirmation) {
      onError('The passwords do not match.')
      return
    }
    setBusy(true)
    try {
      if (configured) await adminApi.unlock(password)
      else await adminApi.setupPassword(password)
      setPassword('')
      setConfirmation('')
      onUnlocked()
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-lg border-2 border-teal-900 bg-[#fbfaf3] p-5 sm:p-8">
      <h2 className="text-xl font-bold text-teal-950">
        {configured ? 'Unlock admin console' : 'Set your admin password'}
      </h2>
      <p className="mt-2 text-sm text-slate-700">
        {configured
          ? 'Your verified administrator account also needs its private admin password. The console locks again after 30 minutes.'
          : 'Create a separate password used only for admin actions. Use at least 14 characters with uppercase, lowercase, a number, and a symbol.'}
      </p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block space-y-1 text-sm font-semibold">
          <span>{configured ? 'Admin password' : 'New admin password'}</span>
          <input
            required
            type="password"
            autoComplete={configured ? 'current-password' : 'new-password'}
            minLength={configured ? 1 : 14}
            maxLength={128}
            pattern={configured ? undefined : ADMIN_PASSWORD_PATTERN}
            title={configured ? undefined : 'Use at least 14 characters with uppercase, lowercase, a number, and a symbol.'}
            className={inputClass}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {!configured && (
          <label className="block space-y-1 text-sm font-semibold">
            <span>Confirm admin password</span>
            <input
              required
              type="password"
              autoComplete="new-password"
              minLength={14}
              maxLength={128}
              pattern={ADMIN_PASSWORD_PATTERN}
              title="Use at least 14 characters with uppercase, lowercase, a number, and a symbol."
              className={inputClass}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
        )}
        <button disabled={busy} className="w-full border bg-teal-900 px-4 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? 'Please wait…' : configured ? 'Unlock admin console' : 'Set password and continue'}
        </button>
      </form>
    </section>
  )
}

function ChangeAdminPassword({ onError, onSuccess }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await adminApi.changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      onSuccess(result.message)
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="border-t border-teal-200 px-4 py-3">
      <summary className="w-fit cursor-pointer font-semibold text-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
        Change admin password
      </summary>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">
          <span>Current password</span>
          <input required type="password" autoComplete="current-password" className={inputClass} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span>New password (14+ characters)</span>
          <input required type="password" minLength={14} maxLength={128} pattern={ADMIN_PASSWORD_PATTERN} title="Use at least 14 characters with uppercase, lowercase, a number, and a symbol." autoComplete="new-password" className={inputClass} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        </label>
        <button disabled={busy} className="w-fit border bg-teal-900 px-4 py-2 font-semibold text-white disabled:opacity-50 sm:col-span-2">
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </details>
  )
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState('moderation')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [summary, setSummary] = useState(null)
  const [authStatus, setAuthStatus] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    if (user?.role !== 'admin') return
    let active = true
    adminApi.authStatus()
      .then((result) => { if (active) setAuthStatus(result) })
      .catch((requestError) => { if (active) setError(errorMessage(requestError)) })
      .finally(() => { if (active) setAuthLoading(false) })
    return () => { active = false }
  }, [user?.role])

  useEffect(() => {
    if (!authStatus?.unlocked) return
    let active = true
    adminApi.dashboard()
      .then((result) => { if (active) setSummary(result.summary) })
      .catch((requestError) => { if (active) setError(errorMessage(requestError)) })
    return () => { active = false }
  }, [authStatus?.unlocked])

  useEffect(() => {
    if (!authStatus?.unlocked) return undefined
    const timeout = window.setTimeout(() => {
      adminApi.lock().catch((requestError) => {
        console.error('Could not clear the expired admin session cookie:', requestError)
      })
      setAuthStatus((current) => ({ ...current, unlocked: false }))
      setSummary(null)
      setNotice('Admin session expired. Enter your admin password to continue.')
    }, ADMIN_SESSION_MS)
    return () => window.clearTimeout(timeout)
  }, [authStatus?.unlocked])

  const showError = useCallback((message) => {
    setNotice('')
    setError(message)
  }, [])

  const showSuccess = useCallback((message) => {
    setError('')
    setNotice(message)
  }, [])

  function selectTab(nextTab) {
    setTab(nextTab)
    setError('')
    setNotice('')
  }

  function onTabKeyDown(event) {
    const currentIndex = TABS.findIndex((item) => item.id === tab)
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = TABS.length - 1
    else return
    event.preventDefault()
    selectTab(TABS[nextIndex].id)
    document.getElementById(`admin-tab-${TABS[nextIndex].id}`)?.focus()
  }

  async function unlockComplete() {
    setAuthStatus({ password_configured: true, unlocked: true })
    setSummary(null)
    setError('')
    setNotice('')
  }

  async function lockConsole() {
    try {
      await adminApi.lock()
      setAuthStatus((current) => ({ ...current, unlocked: false }))
      setSummary(null)
      setNotice('Admin console locked.')
    } catch (requestError) {
      showError(errorMessage(requestError))
    }
  }

  if (user?.role !== 'admin') return <Navigate to="/" replace />

  return (
    <main className="min-h-screen p-3 sm:p-6">
      <div className="mx-auto max-w-7xl border-2 border-teal-900 bg-[#fbfaf3]">
        <header className="border-b-2 border-teal-900 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-teal-950 sm:text-3xl">Campustu Admin Console</h1>
              <p className="mt-1 text-sm text-slate-700">Administrative actions are permission-checked on the server and written to the audit log.</p>
            </div>
            {authStatus?.unlocked && (
              <button type="button" onClick={lockConsole} className="border border-teal-800 px-3 py-2 text-sm font-semibold text-teal-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
                Lock console
              </button>
            )}
          </div>
          {authStatus?.unlocked && summary && (
            <div aria-label="Admin dashboard shortcuts" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {[
                ['users', 'User management', summary.users],
                ['moderation', 'Pending reports', summary.pending_reports],
                ['support', 'Support requests', summary.support_requests],
                ['moderation', 'Duplicate reviews', summary.duplicate_overrides],
                ['colleges', 'Pending campuses', summary.pending_colleges],
                ['controls', 'Safety controls', 'Open'],
                ['audit', 'Audit history', 'Open'],
              ].map(([destination, label, value]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => selectTab(destination)}
                  className="border border-teal-200 bg-[#fbfaf3] p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                >
                  <span className="block text-xs font-semibold text-slate-600">{label}</span>
                  <span className="mt-1 block text-xl font-bold text-teal-950">{value}</span>
                </button>
              ))}
            </div>
          )}
        </header>
        {error && <div className="m-4" role="alert"><Alert>{error}</Alert></div>}
        {notice && <div role="status" className="m-4 border border-teal-700 bg-teal-50 p-3 text-sm text-teal-950">{notice}</div>}
        {authLoading ? (
          <p role="status" className="p-6">Checking admin access…</p>
        ) : !authStatus ? (
          <p role="status" className="p-6">Could not verify admin password status. Refresh the page to try again.</p>
        ) : !authStatus?.unlocked ? (
          <div className="p-4 sm:p-8">
            <AdminPasswordGate
              configured={Boolean(authStatus?.password_configured)}
              onUnlocked={unlockComplete}
              onError={showError}
            />
          </div>
        ) : (
          <>
            <nav
              aria-label="Admin modules"
              role="tablist"
              onKeyDown={onTabKeyDown}
              className="sticky top-0 z-30 flex overflow-x-auto border-b-2 border-teal-900 bg-teal-50"
            >
              {TABS.map((item) => (
                <button
                  key={item.id}
                  id={`admin-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  aria-controls={`admin-panel-${item.id}`}
                  tabIndex={tab === item.id ? 0 : -1}
                  onClick={() => selectTab(item.id)}
                  className={`shrink-0 rounded-none border-r border-teal-900 px-3 py-3 text-sm font-bold focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-teal-700 sm:px-5 ${tab === item.id ? 'bg-teal-900 text-white' : 'bg-white text-teal-950'}`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            {TABS.map((item) => (
              <div
                key={item.id}
                id={`admin-panel-${item.id}`}
                role="tabpanel"
                aria-labelledby={`admin-tab-${item.id}`}
                tabIndex={0}
                hidden={tab !== item.id}
                className="min-h-96 p-4 focus-visible:outline-2 focus-visible:outline-teal-700 sm:p-6"
              >
                {tab === item.id && item.id === 'moderation' && <ModerationQueue onError={showError} />}
                {tab === item.id && item.id === 'users' && <UserManagement onError={showError} />}
                {tab === item.id && item.id === 'support' && <SupportRequests onError={showError} onSuccess={showSuccess} />}
                {tab === item.id && item.id === 'colleges' && <AddCollege onError={showError} onSuccess={showSuccess} />}
                {tab === item.id && item.id === 'controls' && <SystemSafety onError={showError} />}
                {tab === item.id && item.id === 'audit' && <AuditLogs onError={showError} />}
              </div>
            ))}
            <ChangeAdminPassword onError={showError} onSuccess={showSuccess} />
          </>
        )}
      </div>
    </main>
  )
}
