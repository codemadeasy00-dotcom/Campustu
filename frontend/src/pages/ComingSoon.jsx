import { Link } from 'react-router-dom'

export default function ComingSoon({ title, children }) {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-lg backdrop-blur">
      <h1 className="text-2xl font-bold text-brand-700">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{children}</p>
      <p className="mt-1 text-xs text-slate-500">This part is not built yet.</p>
      <Link to="/" className="mt-5 inline-block text-sm font-semibold text-brand-700 underline">Back home</Link>
    </div>
  )
}
