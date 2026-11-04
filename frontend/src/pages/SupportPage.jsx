import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supportApi, errorMessage } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Alert, Button, Field, inputClass } from '../components/ui.jsx'

const CATEGORIES = [
  ['account_access', 'I cannot access my account'],
  ['suspension', 'My account is suspended'],
  ['ban_appeal', 'I want to appeal a ban'],
  ['other', 'Other support'],
]

export default function SupportPage() {
  const { user } = useAuth()
  const [form, setForm] = useState({
    email: user?.email || '',
    full_name: user?.display_name || user?.full_name || '',
    category: user?.status === 'frozen' ? 'suspension' : 'account_access',
    subject: '',
    message: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ticketId, setTicketId] = useState('')

  function update(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await supportApi.createRequest(form)
      setTicketId(result.request_id)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-2xl rounded-3xl border border-brand-100 bg-white/95 p-5 shadow-sm sm:p-8">
      <h1 className="text-2xl font-black text-teal-950">Campustu Support</h1>
      <p className="mt-2 text-sm text-slate-700">
        Account locked or suspended? Send a request and we’ll reply to the email address you provide.
        Never include your password or verification code.
      </p>
      {user?.status === 'frozen' && (
        <Alert kind="warn">
          Your account is currently suspended. {user.frozen_reason ? `Reason: ${user.frozen_reason}` : 'Contact support if you believe this is a mistake.'}
        </Alert>
      )}
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      {ticketId ? (
        <div className="mt-5 space-y-3" role="status">
          <Alert kind="info">Your support request was submitted. Save this reference ID: <strong>{ticketId}</strong></Alert>
          <p className="text-sm text-slate-700">We’ll respond to the email you provided. You can return to <Link to="/login" className="font-semibold text-brand-700 underline">login</Link>.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="Email address" required hint="Use the email connected to your Campustu account if you have one.">
            <input required type="email" name="email" autoComplete="email" maxLength={254} className={inputClass} value={form.email} onChange={update} />
          </Field>
          <Field label="Your name" required>
            <input required name="full_name" autoComplete="name" minLength={2} maxLength={100} className={inputClass} value={form.full_name} onChange={update} />
          </Field>
          <Field label="What do you need help with?" required>
            <select required name="category" className={inputClass} value={form.category} onChange={update}>
              {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Subject" required>
            <input required name="subject" minLength={5} maxLength={160} className={inputClass} value={form.subject} onChange={update} />
          </Field>
          <Field label="How can we help?" required hint="Include your account email and relevant details, but never your password or login code.">
            <textarea required name="message" minLength={20} maxLength={5000} rows={6} className={inputClass} value={form.message} onChange={update} />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Sending request…' : 'Send support request'}</Button>
        </form>
      )}
    </section>
  )
}
