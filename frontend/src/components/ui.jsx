export const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-100'

export function Field({ label, hint, required, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-brand-600 text-white shadow-md hover:bg-brand-700 disabled:bg-brand-400/60 disabled:shadow-none',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50',
  }
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Alert({ kind = 'error', children }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
  }
  return <div className={`rounded-xl border px-3 py-2 text-sm ${styles[kind]}`}>{children}</div>
}

export function PageLoading({ message = 'Loading…' }) {
  return (
    <div className="py-16 text-center text-sm text-slate-600">
      <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
      {message}
      <div className="mt-1 text-xs">The first request can take up to a minute while the free server wakes up.</div>
    </div>
  )
}

// ---- the rounded "pill" input from the design: round icon on the left, optional action on the right ----
const iconProps = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
export const Icons = {
  user: (
    <svg {...iconProps}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>
  ),
  keypad: (
    <svg {...iconProps}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M12 16h.01" /></svg>
  ),
  eye: (
    <svg {...iconProps}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
  ),
  eyeOff: (
    <svg {...iconProps}><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.6A17 17 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4-.9M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
  ),
}

export function PillInput({ icon, right, ...inputProps }) {
  return (
    <div className="flex items-center gap-3 rounded-full border-b-4 border-slate-300/80 bg-white/95 py-2 pl-2 pr-3 shadow-md focus-within:ring-2 focus-within:ring-brand-400">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">{icon}</span>
      <input className="min-w-0 flex-1 bg-transparent py-1 text-sm text-slate-800 outline-none placeholder:text-slate-500 disabled:text-slate-400" {...inputProps} />
      {right}
    </div>
  )
}
