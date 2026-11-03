import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { moderationApi, errorMessage } from '../services/api.js'
import { Alert, PageLoading } from '../components/ui.jsx'
import PageHero from '../components/PageHero.jsx'
import ItemPhoto from '../components/ItemPhoto.jsx'

export default function AdminModeration() {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [duplicateOverrides, setDuplicateOverrides] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyReportId, setBusyReportId] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await moderationApi.reports()
      setReports(result.reports || [])
      setDuplicateOverrides(result.duplicate_overrides || [])
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function takeAction(report, action) {
    const prompts = {
      dismiss: 'Dismiss this report as a false alarm?',
      remove: `Remove "${report.item_title}" and delete its media?`,
      ban: `Permanently ban ${report.target_user_name} and remove this post and its media?`,
    }
    if (!window.confirm(prompts[action])) return
    setBusyReportId(report.id)
    setError('')
    try {
      await moderationApi.act(report.id, action)
      setReports((current) => current.filter((entry) => entry.id !== report.id))
    } catch (requestError) {
      setError(errorMessage(requestError))
      await refresh()
    } finally {
      setBusyReportId(null)
    }
  }

  async function reviewDuplicateOverride(item, action) {
    const prompt = action === 'remove'
      ? `Remove "${item.title}" after reviewing the owner's explanation?`
      : `Clear the review flag for "${item.title}" and keep the post active?`
    if (!window.confirm(prompt)) return
    setBusyReportId(item.id)
    setError('')
    try {
      await moderationApi.reviewDuplicateOverride(item.id, action)
      setDuplicateOverrides((current) => current.filter((entry) => entry.id !== item.id))
    } catch (requestError) {
      setError(errorMessage(requestError))
      await refresh()
    } finally {
      setBusyReportId(null)
    }
  }

  if (user?.role !== 'admin') {
    return <Alert kind="warn">This page is available only to admins.</Alert>
  }

  return (
    <div className="page-enter mx-auto max-w-5xl space-y-6">
      <PageHero
        eyebrow="Safety & trust"
        title="Content moderation"
        description="Review student reports. Removal hides a post immediately and deletes its stored images."
      />
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <PageLoading message="Loading reported posts…" />
      ) : reports.length === 0 && duplicateOverrides.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">There are no pending reports or duplicate overrides.</p>
      ) : (
        <>
          {duplicateOverrides.length > 0 && (
            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Duplicate-warning overrides</h2>
                <p className="text-sm text-slate-600">These posts were published after a high-similarity warning and include the owner’s explanation. Similarity alone does not trigger a flag.</p>
              </div>
              <ul className="space-y-4">
                {duplicateOverrides.map((item) => (
                  <li key={item.id} className="grid gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:grid-cols-[10rem_1fr] sm:p-5">
                    <ItemPhoto src={item.photo_url} alt={item.title} className="h-40 w-full rounded-xl bg-white object-cover sm:h-36" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Owner override · {item.status} · {item.category}</p>
                          <h3 className="mt-1 text-lg font-bold text-slate-900">{item.title}</h3>
                        </div>
                        <time className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</time>
                      </div>
                      <p className="mt-2 text-sm text-slate-700"><strong>Owner:</strong> {item.target_user_name}</p>
                      <p className="mt-2 text-sm text-slate-700"><strong>Explanation:</strong> {item.skip_reason}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" disabled={busyReportId !== null} onClick={() => reviewDuplicateOverride(item, 'dismiss')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                          Clear flag &amp; keep post
                        </button>
                        <button type="button" disabled={busyReportId !== null} onClick={() => reviewDuplicateOverride(item, 'remove')} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-50">
                          Remove post
                        </button>
                        {busyReportId === item.id && <span role="status" className="self-center text-xs text-slate-500">Applying action…</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {reports.length > 0 && <h2 className="text-xl font-bold text-slate-900">User reports</h2>}
          <ul className="space-y-4">
            {reports.map((report) => (
            <li key={report.id} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[10rem_1fr] sm:p-5">
              <ItemPhoto src={report.photo_url} alt={report.item_title} className="h-40 w-full rounded-xl bg-slate-100 object-cover sm:h-36" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-brand-700">{report.item_type.replace('_', ' ')} · {report.item_status}</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">{report.item_title}</h2>
                  </div>
                  <time className="text-xs text-slate-500">{new Date(report.created_at).toLocaleString()}</time>
                </div>
                <p className="mt-2 text-sm text-slate-700"><strong>Reported by {report.reporter_name}:</strong> {report.reason}</p>
                <p className="mt-1 text-xs text-slate-500">Post owner: {report.target_user_name}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={busyReportId !== null} onClick={() => takeAction(report, 'dismiss')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    Dismiss
                  </button>
                  <button type="button" disabled={busyReportId !== null} onClick={() => takeAction(report, 'remove')} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-50">
                    Remove post
                  </button>
                  <button type="button" disabled={busyReportId !== null} onClick={() => takeAction(report, 'ban')} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50">
                    Ban owner & remove post
                  </button>
                  {busyReportId === report.id && <span role="status" className="self-center text-xs text-slate-500">Applying action…</span>}
                </div>
              </div>
            </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
