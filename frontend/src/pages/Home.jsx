import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { itemsApi, metaApi } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatPrice } from '../lib/format.js'
import { getImageUrl } from '../lib/imageUrl.js'
import { Button, inputClass } from '../components/ui.jsx'
import Wordmark from '../components/Wordmark.jsx'

export default function Home() {
  const { user } = useAuth()
  if (!user) return <Welcome />
  return <Dashboard />
}

function Welcome() {
  return (
    <div className="py-10 text-center">
      <Wordmark className="text-6xl" />
      <p className="mx-auto mt-6 max-w-md text-lg font-semibold text-brand-700">Buy &amp; sell campus basics. Find lost gear.</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        Second-hand drafters, calculators and lab coats from students at your own college, and a place to find what you lost.
      </p>
      <div className="mt-7 flex justify-center gap-3">
        <Link to="/signup" className="rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-700">Create an account</Link>
        <Link to="/login" className="rounded-full border border-brand-200 bg-white px-6 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">Log in</Link>
      </div>
    </div>
  )
}

function ListingSkeleton() {
  return (
    <li aria-hidden="true" className="animate-pulse overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm">
      <div className="aspect-square bg-slate-200" />
      <div className="space-y-2 p-2.5">
        <div className="h-4 w-3/4 rounded bg-slate-200" />
        <div className="h-4 w-1/2 rounded bg-slate-200" />
      </div>
    </li>
  )
}

function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [branches, setBranches] = useState([])
  const [branch, setBranch] = useState(user.branch_id ? String(user.branch_id) : '')
  const [semester, setSemester] = useState(user.current_semester ? String(user.current_semester) : '')
  const [recent, setRecent] = useState(null) // null = loading, [] = none
  const [recentError, setRecentError] = useState(false)

  useEffect(() => {
    metaApi.get().then((m) => setBranches(m.branches)).catch(() => {})
    if (user.college) {
      itemsApi.list(6).then((r) => setRecent(r.items)).catch(() => { setRecent([]); setRecentError(true) })
    } else {
      setRecent([])
    }
  }, [user.college])

  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-brand-600 px-6 py-8 text-white shadow-lg">
        <h1 className="text-2xl font-bold sm:text-3xl">Buy &amp; Sell Campus Basics <span className="opacity-60">|</span> Find Lost Gear</h1>
        <p className="mt-1 text-sm text-brand-100">{user.college ? `Showing students of ${user.college.name}` : 'Choose your college to see listings'}</p>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-md backdrop-blur">
        <h2 className="font-bold text-brand-700">Quick kit picker</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-40 flex-1 text-xs font-medium text-slate-600">Branch
            <select className={`${inputClass} mt-1`} value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">Select branch</option>
              {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </label>
          <label className="w-32 text-xs font-medium text-slate-600">Semester
            <select className={`${inputClass} mt-1`} value={semester} onChange={(e) => setSemester(e.target.value)}>
              <option value="">Any</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (<option key={s} value={s}>Sem {s}</option>))}
            </select>
          </label>
          <Button type="button" onClick={() => navigate(`/kits?branch=${branch}&semester=${semester}`)}>View Kit</Button>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-5">
        <section className="md:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-brand-700">Recent marketplace listings</h2>
            <Link to="/my-listings" className="text-xs text-brand-700 underline">My listings</Link>
          </div>
          {recent === null ? (
            <ul aria-label="Loading recent listings" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => <ListingSkeleton key={index} />)}
            </ul>
          ) : recent.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-brand-200 bg-white/70 p-6 text-center text-sm text-slate-600">
              {recentError ? 'Could not load listings.' : 'Nothing listed at your college yet.'}
              <div className="mt-3"><Link to="/sell" className="font-semibold text-brand-700 underline">List the first item</Link></div>
            </div>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {recent.map((item) => (
                <li key={item.id}>
                  <Link to={`/items/${item.id}`} className="block overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm hover:shadow-md">
                    <div className="aspect-square bg-slate-100">{item.photos[0] && <img src={getImageUrl(item.photos[0])} alt="" className="h-full w-full object-cover" />}</div>
                    <div className="p-2.5">
                      <div className="truncate text-sm font-semibold">{item.title}</div>
                      <div className="text-sm font-bold text-brand-700">{formatPrice(item.price)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="md:col-span-2">
          <h2 className="font-bold text-brand-700">Lost &amp; found map</h2>
          <div className="mt-3 flex aspect-square items-center justify-center rounded-2xl border border-dashed border-brand-200 bg-white/70 p-6 text-center text-sm text-slate-600">
            The map of items found around your campus is not built yet.
          </div>
        </section>
      </div>
    </div>
  )
}
