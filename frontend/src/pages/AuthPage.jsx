import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { authApi, metaApi, errorMessage } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Alert, Button, Field, Icons, PillInput, inputClass } from '../components/ui.jsx'
import CollegePicker from '../components/CollegePicker.jsx'
import Wordmark from '../components/Wordmark.jsx'

const RESEND_SECONDS = 60

// One page for both flows. mode = 'signup' | 'login'.
export default function AuthPage({ mode }) {
  const isSignup = mode === 'signup'
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/'

  const [sent, setSent] = useState(false) // has a code been requested yet?
  const [form, setForm] = useState({ email: '', full_name: '', display_name: '', branch: '', branch_other: '', admission_year: '' })
  const [college, setCollege] = useState(null)
  const [code, setCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [branches, setBranches] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const thisYear = new Date().getFullYear()
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i)

  useEffect(() => {
    if (!isSignup) return
    metaApi.get().then((m) => setBranches(m.branches)).catch(() => {}) // branch is optional
  }, [isSignup])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  if (user) return <Navigate to="/" replace />

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const email = form.email.trim().toLowerCase()

  function buildSignupPayload() {
    const payload = { email, full_name: form.full_name.trim(), display_name: form.display_name.trim() }
    if (college?.isNew) {
      payload.new_college = { name: college.name.trim(), city: college.city.trim(), ...(college.state?.trim() ? { state: college.state.trim() } : {}) }
    } else if (college) {
      payload.college_id = college.id
    }
    if (form.branch === 'other') payload.branch_other = form.branch_other.trim()
    else if (form.branch) payload.branch_id = Number(form.branch)
    if (form.admission_year) payload.admission_year = Number(form.admission_year)
    return payload
  }

  async function sendCode() {
    if (isSignup && !college) throw new Error('Choose your college, or add it if it is not listed')
    const res = isSignup ? await authApi.signup(buildSignupPayload()) : await authApi.login({ email })
    setNotice(res.message)
    setCooldown(RESEND_SECONDS)
    setSent(true)
  }

  async function run(action) {
    setError('')
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const onSend = (e) => { e?.preventDefault(); return run(sendCode) }

  const onVerify = (e) => {
    e.preventDefault()
    return run(async () => {
      const { token, user: me } = await authApi.verify({ email, code })
      signIn(token, me)
      navigate(redirectTo, { replace: true })
    })
  }

  const resendLabel = cooldown > 0 ? `${cooldown}s` : sent ? 'Resend' : 'Send code'
  const sendButton = (
    <button
      type="button"
      onClick={onSend}
      disabled={busy || cooldown > 0 || !email.includes('@')}
      className="shrink-0 rounded-full bg-brand-100 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-200 disabled:opacity-50"
    >
      {busy && !sent ? '…' : resendLabel}
    </button>
  )

  const codeField = (
    <PillInput
      icon={Icons.keypad}
      placeholder="Verification Code"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      disabled={!sent}
      type={showCode ? 'text' : 'password'}
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      right={
        <button type="button" onClick={() => setShowCode((v) => !v)} className="text-brand-600" aria-label={showCode ? 'Hide code' : 'Show code'}>
          {showCode ? Icons.eyeOff : Icons.eye}
        </button>
      }
    />
  )

  const verifyButton = (
    <Button type="submit" disabled={busy || !sent || code.length !== 6} className="w-full py-3.5 text-lg">
      {busy && sent ? 'Checking…' : 'Verify & Continue'}
    </Button>
  )

  return (
    <div className="mx-auto max-w-sm py-4">
      <div className="mb-8 text-center">
        <Wordmark className="text-5xl" />
      </div>

      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {sent && notice && <Alert kind="info">{notice}</Alert>}

        {!isSignup ? (
          /* ---- Log in: matches the design: email, code, verify ---- */
          <form onSubmit={onVerify} className="space-y-5">
            <PillInput
              icon={Icons.user}
              type="email"
              placeholder="Email"
              autoComplete="email"
              required
              value={form.email}
              onChange={set('email')}
              right={sendButton}
            />
            {codeField}
            {verifyButton}
          </form>
        ) : (
          /* ---- Sign up: details first, then the same code box ---- */
          <form onSubmit={onVerify} className="space-y-4 rounded-3xl border border-white/70 bg-white/80 p-5 shadow-lg backdrop-blur">
            <Field label="College" required>
              <CollegePicker onSelect={(selectedCollege) => { setCollege(selectedCollege); setError('') }} />
            </Field>
            <Field label="College email" required>
              <input type="email" required autoComplete="email" className={inputClass} value={form.email} onChange={set('email')} />
            </Field>
            <Field label="Full name" required hint="Used only so your ID card can be matched when you meet someone. Never shown to others.">
              <input required minLength={2} maxLength={100} autoComplete="name" className={inputClass} value={form.full_name} onChange={set('full_name')} />
            </Field>
            <Field label="Display name" required hint="This is what other students see.">
              <input required minLength={2} maxLength={40} className={inputClass} value={form.display_name} onChange={set('display_name')} />
            </Field>
            <Field label="Branch">
              <select className={inputClass} value={form.branch} onChange={set('branch')}>
                <option value="">Select your branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
                <option value="other">Other (type your own)</option>
              </select>
            </Field>
            {form.branch === 'other' && (
              <input className={inputClass} placeholder="Your branch" required minLength={2} maxLength={60} value={form.branch_other} onChange={set('branch_other')} />
            )}
            <Field label="Year you joined college" hint="We use it to work out your current semester.">
              <select className={inputClass} value={form.admission_year} onChange={set('admission_year')}>
                <option value="">Select year</option>
                {years.map((y) => (<option key={y} value={y}>{y}</option>))}
              </select>
            </Field>

            {!sent ? (
              <Button type="button" onClick={onSend} disabled={busy || !email || !form.full_name || !form.display_name} className="w-full">
                {busy ? 'Sending code…' : 'Send me a code'}
              </Button>
            ) : (
              <div className="space-y-3 border-t border-slate-200 pt-4">
                {codeField}
                {verifyButton}
                <button type="button" onClick={onSend} disabled={busy || cooldown > 0} className="text-xs text-brand-700 underline disabled:text-slate-400 disabled:no-underline">
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            )}
          </form>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-slate-700">
        {isSignup ? (
          <>Already have an account? <Link to="/login" className="font-semibold text-brand-700 underline">Log in</Link></>
        ) : (
          <>Don't have an account? <Link to="/signup" className="font-semibold text-brand-700 underline">Sign Up</Link></>
        )}
      </p>
      <p className="mt-2 text-center text-xs text-slate-500">No password: we email you a 6-digit code each time.</p>
    </div>
  )
}
