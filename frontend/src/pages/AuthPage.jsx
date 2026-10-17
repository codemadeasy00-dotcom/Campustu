import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { authApi, metaApi, errorMessage } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Alert, Button, Field, inputClass } from '../components/ui.jsx'

const RESEND_SECONDS = 60

// One page for both flows. mode = 'signup' | 'login'.
export default function AuthPage({ mode }) {
  const isSignup = mode === 'signup'
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/'

  const [step, setStep] = useState('details') // 'details' -> 'code'
  const [form, setForm] = useState({ email: '', full_name: '', display_name: '', branch_id: '', admission_year: '' })
  const [code, setCode] = useState('')
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

  async function sendCode() {
    const email = form.email.trim().toLowerCase()
    const payload = isSignup
      ? {
          email,
          full_name: form.full_name.trim(),
          display_name: form.display_name.trim(),
          ...(form.branch_id ? { branch_id: Number(form.branch_id) } : {}),
          ...(form.admission_year ? { admission_year: Number(form.admission_year) } : {}),
        }
      : { email }
    const res = isSignup ? await authApi.signup(payload) : await authApi.login(payload)
    setNotice(res.message)
    setCooldown(RESEND_SECONDS)
  }

  async function onSubmitDetails(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await sendCode()
      setStep('code')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function onResend() {
    setError('')
    setBusy(true)
    try {
      await sendCode()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function onVerify(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { token, user: me } = await authApi.verify({ email: form.email.trim().toLowerCase(), code })
      signIn(token, me)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">{isSignup ? 'Create your account' : 'Log in'}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {isSignup ? 'No password needed: we email you a 6-digit code.' : 'We will email you a 6-digit code.'}
      </p>

      <div className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {error && <Alert>{error}</Alert>}

        {step === 'details' ? (
          <form onSubmit={onSubmitDetails} className="space-y-4">
            <Field label="Email" required>
              <input type="email" required autoComplete="email" className={inputClass} value={form.email} onChange={set('email')} />
            </Field>

            {isSignup && (
              <>
                <Field label="Full name" required hint="Used only so your ID card can be matched when you meet someone. Never shown to others.">
                  <input required minLength={2} maxLength={100} autoComplete="name" className={inputClass} value={form.full_name} onChange={set('full_name')} />
                </Field>
                <Field label="Display name" required hint="This is what other students see.">
                  <input required minLength={2} maxLength={40} className={inputClass} value={form.display_name} onChange={set('display_name')} />
                </Field>
                <Field label="Branch">
                  <select className={inputClass} value={form.branch_id} onChange={set('branch_id')}>
                    <option value="">{branches.length ? 'Select your branch' : 'Not available yet'}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Year you joined college" hint="We use it to work out your current semester.">
                  <select className={inputClass} value={form.admission_year} onChange={set('admission_year')}>
                    <option value="">Select year</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Sending code…' : 'Send me a code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={onVerify} className="space-y-4">
            {notice && <Alert kind="info">{notice}</Alert>}
            <Field label="6-digit code" required>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                className={`${inputClass} text-center text-xl tracking-[0.5em]`}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
              {busy ? 'Checking…' : 'Verify and continue'}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" className="text-slate-500 underline" onClick={() => { setStep('details'); setCode(''); setError('') }}>
                Use a different email
              </button>
              <button type="button" className="text-indigo-700 underline disabled:text-slate-400 disabled:no-underline" disabled={busy || cooldown > 0} onClick={onResend}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}
      </div>

      <p className="mt-4 text-center text-sm text-slate-600">
        {isSignup ? (
          <>
            Already have an account? <Link to="/login" className="text-indigo-700 underline">Log in</Link>
          </>
        ) : (
          <>
            New here? <Link to="/signup" className="text-indigo-700 underline">Create an account</Link>
          </>
        )}
      </p>
    </div>
  )
}
