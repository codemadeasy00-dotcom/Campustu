import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { adminApi, errorMessage, moderationApi } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Alert, inputClass } from '../components/ui.jsx'
import ItemPhoto from '../components/ItemPhoto.jsx'

const TABS = [
  { id: 'moderation', label: 'Moderation Queue' },
  { id: 'users', label: 'User Management' },
  { id: 'colleges', label: 'Add College' },
  { id: 'controls', label: 'System & Safety' },
  { id: 'audit', label: 'Audit Logs' },
]

const ginghamStyle = {
  backgroundColor: '#f9f8ef',
  backgroundImage: 'linear-gradient(rgba(18, 137, 143, .16) 2px, transparent 2px), linear-gradient(90deg, rgba(18, 137, 143, .16) 2px, transparent 2px)',
  backgroundSize: '36px 36px',
}

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

function AddCollege({ onError, onSuccess }) {
  const [form, setForm] = useState({
    name: '', short_code: '', city: '', state: '', email_domain: '',
    latitude: '', longitude: '', search_radius_meters: '1000',
  })
  const [busy, setBusy] = useState(false)
  const [colleges, setColleges] = useState([])

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

  const fields = [
    ['name', 'College name', 'text'],
    ['short_code', 'Short code', 'text'],
    ['city', 'City', 'text'],
    ['state', 'State', 'text'],
    ['email_domain', 'Email domain (example: dbatu.ac.in)', 'text'],
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
      <section>
        <h2 className="mb-2 text-lg font-bold">Campuses ({colleges.length})</h2>
        <ul className="space-y-2">
          {colleges.map((college) => (
            <li key={college.id} className="flex flex-col justify-between gap-2 border bg-white p-3 text-sm sm:flex-row sm:items-center">
              <span>{college.name} ({college.short_code}) · {college.city} · @{college.email_domain} · {college.status}</span>
              {college.status === 'pending' && (
                <span className="flex gap-2">
                  <button type="button" onClick={() => setCollegeStatus(college, 'approved')} className="border px-2 py-1 text-teal-900">Approve</button>
                  <button type="button" onClick={() => setCollegeStatus(college, 'rejected')} className="border px-2 py-1 text-red-800">Reject</button>
                </span>
              )}
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

export default function AdminDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState('moderation')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    adminApi.dashboard().then((result) => setSummary(result.summary)).catch((requestError) => setError(errorMessage(requestError)))
  }, [])

  const showError = useCallback((message) => {
    setNotice('')
    setError(message)
  }, [])

  const showSuccess = useCallback((message) => {
    setError('')
    setNotice(message)
  }, [])

  if (user?.role !== 'admin') return <Navigate to="/" replace />

  return (
    <main className="min-h-full p-3 sm:p-6" style={ginghamStyle}>
      <div className="mx-auto max-w-7xl border-2 border-teal-900 bg-[#fbfaf3]">
        <header className="border-b-2 border-teal-900 bg-white p-5">
          <h1 className="text-2xl font-black text-teal-950 sm:text-3xl">Campustu Admin Console</h1>
          <p className="mt-1 text-sm text-slate-700">Administrative actions are permission-checked on the server and written to the audit log.</p>
          {summary && <p className="mt-3 text-sm font-semibold">Users: {summary.users} · Active: {summary.active_users} · Reports: {summary.pending_reports} · Duplicate reviews: {summary.duplicate_overrides} · Pending campuses: {summary.pending_colleges}</p>}
        </header>
        <nav aria-label="Admin modules" className="flex flex-wrap border-b-2 border-teal-900 bg-teal-50">
          {TABS.map((item) => (
            <button key={item.id} type="button" aria-current={tab === item.id ? 'page' : undefined} onClick={() => { setTab(item.id); setError(''); setNotice('') }} className={`rounded-none border-r border-teal-900 px-3 py-3 text-sm font-bold sm:px-5 ${tab === item.id ? 'bg-teal-900 text-white' : 'bg-white text-teal-950'}`}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="min-h-96 p-4 sm:p-6">
          {error && <div className="mb-4"><Alert>{error}</Alert></div>}
          {notice && <div role="status" className="mb-4 border border-teal-700 bg-teal-50 p-3 text-sm text-teal-950">{notice}</div>}
          {tab === 'moderation' && <ModerationQueue onError={showError} />}
          {tab === 'users' && <UserManagement onError={showError} />}
          {tab === 'colleges' && <AddCollege onError={showError} onSuccess={showSuccess} />}
          {tab === 'controls' && <SystemSafety onError={showError} />}
          {tab === 'audit' && <AuditLogs onError={showError} />}
        </div>
      </div>
    </main>
  )
}
