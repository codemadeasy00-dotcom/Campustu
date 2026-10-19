import { useEffect, useState } from 'react'
import { collegesApi, errorMessage } from '../services/api.js'
import { inputClass } from './ui.jsx'

// value: null | { id, name, email_domain } | { isNew: true, name, city, state }
export default function CollegePicker({ value, onChange }) {
  const [query, setQuery] = useState('')
  const [colleges, setColleges] = useState(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(Boolean(value?.isNew))

  useEffect(() => {
    if (adding) return
    const timer = setTimeout(() => {
      collegesApi
        .list(query)
        .then((r) => { setColleges(r.colleges); setError('') })
        .catch((e) => setError(errorMessage(e)))
    }, 300)
    return () => clearTimeout(timer)
  }, [query, adding])

  if (adding) {
    const v = value?.isNew ? value : { isNew: true, name: '', city: '', state: '' }
    const set = (key) => (e) => onChange({ ...v, [key]: e.target.value })
    return (
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white/70 p-3">
        <input className={inputClass} placeholder="College name" value={v.name} onChange={set('name')} maxLength={150} />
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass} placeholder="City" value={v.city} onChange={set('city')} maxLength={80} />
          <input className={inputClass} placeholder="State (optional)" value={v.state} onChange={set('state')} maxLength={80} />
        </div>
        <p className="text-xs text-slate-500">
          New colleges are checked by the site team. Until then, only students of your college can see its listings.
        </p>
        <button type="button" className="text-xs text-brand-700 underline" onClick={() => { setAdding(false); onChange(null) }}>
          Back to the list
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <input className={inputClass} placeholder="Search your college or city" value={query} onChange={(e) => setQuery(e.target.value)} />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white">
        {colleges === null && !error && <p className="p-3 text-xs text-slate-500">Loading colleges…</p>}
        {colleges?.length === 0 && <p className="p-3 text-xs text-slate-500">No college found{query ? ` for "${query}"` : ' yet'}.</p>}
        {colleges?.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={() => onChange(c)}
            className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-brand-50 ${value?.id === c.id ? 'bg-brand-100 font-semibold' : ''}`}
          >
            {c.name}
            <span className="block text-xs font-normal text-slate-500">{c.city}{c.state ? `, ${c.state}` : ''}</span>
          </button>
        ))}
      </div>
      <button type="button" className="text-sm text-brand-700 underline" onClick={() => { setAdding(true); onChange(null) }}>
        My college is not listed
      </button>
      {value?.email_domain && (
        <p className="text-xs text-slate-600">This college requires an email ending in <b>@{value.email_domain}</b>.</p>
      )}
    </div>
  )
}
