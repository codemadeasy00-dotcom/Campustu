import { createContext, useContext, useEffect, useRef, useState } from 'react'
import React from 'react';
import Wordmark from './Wordmark';

const ToastContext = createContext(null)

export default function LogoLoader({ message = "Loading..." }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {/* Flipping Logo */}
      <div className="animate-logo-flip mb-4 scale-110">
        <Wordmark />
      </div>

      {/* Subtitle Message */}
      <p className="text-gray-600 font-medium text-sm animate-pulse">
        {message}
      </p>
      
      <p className="text-xs text-gray-400 mt-1 max-w-xs">
        The first request can take up to a minute while the free server wakes up.
      </p>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!message) return undefined
    const timeout = window.setTimeout(() => setMessage(''), 3500)
    return () => window.clearTimeout(timeout)
  }, [message])

  return (
    <ToastContext.Provider value={setMessage}>
      {children}
      {message && (
        <div role="status" className="fixed right-4 top-4 z-[100] max-w-sm rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg">
          {message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const showToast = useContext(ToastContext)
  if (!showToast) throw new Error('useToast must be used inside ToastProvider')
  return showToast
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  const cancelButtonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    cancelButtonRef.current?.focus()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-bold text-slate-900">{title}</h2>
        <div className="mt-2 text-sm text-slate-600">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-full px-4 py-2 text-sm font-semibold text-white ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

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
