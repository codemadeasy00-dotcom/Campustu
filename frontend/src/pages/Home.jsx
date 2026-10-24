import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { itemsApi, lostFoundApi, metaApi, errorMessage } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatPrice } from '../lib/format.js'
import { getImageUrl } from '../lib/imageUrl.js'
import { Alert, Button, inputClass } from '../components/ui.jsx'
import Wordmark from '../components/Wordmark.jsx'
import CampusMap from '../components/CampusMap.jsx'

export default function Home() {
  const { user } = useAuth()
  if (!user) return <Welcome />
  return <Dashboard />
}

function Welcome() {
  return (
    <div className="animate-fade-in space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-teal-500 px-6 py-10 text-white shadow-xl sm:px-10 sm:py-14">
        <div aria-hidden="true" className="absolute -right-10 -top-16 h-56 w-56 rounded-full border-[28px] border-white/10" />
        <div className="relative max-w-2xl">
          <Wordmark className="text-4xl !text-white sm:text-5xl" />
          <p className="mt-6 text-sm font-bold uppercase tracking-[0.16em] text-teal-100">Your campus, shared</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-5xl">
            Find what you need.<br />Pass on what you don’t.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/85 sm:text-base">
            Buy and sell useful campus essentials, find course kits, and help reunite lost items with their owners.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/signup" className="rounded-full bg-cream px-6 py-3 text-sm font-bold text-brand-700 shadow transition hover:bg-white">Join your campus</Link>
            <Link to="/login" className="rounded-full border border-white/50 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20">Log in</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Campus features">
        {[
          { icon: '↗', title: 'Marketplace', text: 'Browse essentials listed by students at your college.', href: '/signup' },
          { icon: '⌕', title: 'Lost & found', text: 'Report an item or search for something you misplaced.', href: '/signup' },
          { icon: '▦', title: 'Course kits', text: 'Find recommended supplies for your branch and semester.', href: '/signup' },
        ].map((feature) => (
          <Link key={feature.title} to={feature.href} className="group rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-xl font-bold text-brand-700">{feature.icon}</span>
            <h2 className="mt-4 font-bold text-brand-700">{feature.title}</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">{feature.text}</p>
            <span className="mt-3 inline-block text-xs font-semibold text-brand-700 group-hover:underline">Create an account <span aria-hidden="true">→</span></span>
          </Link>
        ))}
      </section>
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
  const [categories, setCategories] = useState([])
  const [metadataError, setMetadataError] = useState('')
  const [branch, setBranch] = useState(user.branch_id ? String(user.branch_id) : '')
  const [semester, setSemester] = useState(user.current_semester ? String(user.current_semester) : '')
  const [search, setSearch] = useState('')
  const [recent, setRecent] = useState(null) // null = loading, [] = none
  const [recentError, setRecentError] = useState(false)
  const [lostFound, setLostFound] = useState(null)
  const [lostFoundError, setLostFoundError] = useState('')

  useEffect(() => {
    let cancelled = false
    metaApi.get()
      .then((metadata) => {
        if (cancelled) return
        setBranches(metadata.branches)
        setCategories(metadata.categories.filter((category) => category.scope !== 'lost_found'))
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Could not load home page metadata:', error)
          setMetadataError(errorMessage(error))
        }
      })

    if (user.college) {
      itemsApi.list(6)
        .then((result) => {
          if (!cancelled) setRecent(result.items)
        })
        .catch((error) => {
          if (!cancelled) {
            console.error('Could not load recent listings:', error)
            setRecent([])
            setRecentError(true)
          }
        })
      lostFoundApi.list()
        .then((result) => {
          if (!cancelled) setLostFound(result.items)
        })
        .catch((error) => {
          if (!cancelled) {
            console.error('Could not load lost and found posts:', error)
            setLostFound([])
            setLostFoundError(errorMessage(error))
          }
        })
    } else {
      setRecent([])
      setLostFound([])
    }
    return () => {
      cancelled = true
    }
  }, [user.college?.id])

  const mapItems = useMemo(() => [
    ...(recent ?? []).map((item) => ({
      ...item,
      type: 'marketplace',
      locationName: item.preferred_place,
      imageUrl: item.photos[0] ? getImageUrl(item.photos[0]) : null,
    })),
    ...(lostFound ?? []).map((item) => ({
      ...item,
      type: 'lost-found',
      locationName: item.location_name,
      imageUrl: item.photo,
    })),
  ], [recent, lostFound])

  const submitSearch = (event) => {
    event.preventDefault()
    const query = search.trim()
    navigate(query ? `/marketplace?q=${encodeURIComponent(query)}` : '/marketplace')
  }

  return (
    <div className="animate-fade-in space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-teal-500 px-6 py-8 text-white shadow-xl sm:px-8 sm:py-10">
        <div aria-hidden="true" className="absolute -right-10 -top-16 h-56 w-56 rounded-full border-[28px] border-white/10" />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-100">Campus, made easier</p>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight sm:text-4xl">
            Good finds start right here.
          </h1>
          <p className="mt-2 text-sm text-white/85">
            {user.college ? `Discover useful things from students at ${user.college.name}.` : 'Choose your college to explore student listings.'}
          </p>
          <form onSubmit={submitSearch} className="mt-6 flex max-w-xl flex-col gap-2 rounded-2xl border border-white/25 bg-white/15 p-2 backdrop-blur sm:flex-row">
            <label className="sr-only" htmlFor="campus-home-search">Search campus listings</label>
            <input
              id="campus-home-search"
              type="search"
              maxLength={80}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search books, calculators, lab gear…"
              className="min-w-0 flex-1 rounded-xl bg-white px-4 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-brand-200"
            />
            <button type="submit" className="rounded-xl bg-cream px-5 py-3 text-sm font-bold text-brand-700 transition hover:bg-white">Search marketplace</button>
          </form>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/marketplace" className="text-sm font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white">Browse marketplace</Link>
            <Link to="/lost-found" className="text-sm font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white">Open lost &amp; found</Link>
          </div>
        </div>
      </section>

      {metadataError && <Alert>{metadataError}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { title: 'Campus marketplace', text: 'Find useful essentials listed by students.', href: '/marketplace', icon: '↗' },
          { title: 'Lost & found', text: 'Search campus notices and report found items.', href: '/lost-found', icon: '⌕' },
          { title: 'Course kits', text: 'Browse supplies for your branch and semester.', href: '/kits', icon: '▦' },
        ].map((feature) => (
          <Link key={feature.title} to={feature.href} className="group rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-lg font-bold text-brand-700">{feature.icon}</span>
            <h2 className="mt-3 font-bold text-brand-700">{feature.title}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">{feature.text}</p>
          </Link>
        ))}
      </div>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Explore by category</p>
            <h2 className="mt-1 text-lg font-bold text-brand-700">Find the right campus essentials</h2>
          </div>
          <Link to="/marketplace" className="text-xs font-semibold text-brand-700 underline">All listings</Link>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {categories.length > 0 ? categories.slice(0, 6).map((category) => (
            <Link
              key={category.id}
              to={`/marketplace?category_id=${encodeURIComponent(category.id)}`}
              className="shrink-0 rounded-full border border-brand-100 bg-cream px-4 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-200 hover:bg-brand-50"
            >
              {category.name}
            </Link>
          )) : (
            <p className="text-sm text-slate-500">Categories will appear here when available.</p>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Quick kit picker</p>
            <h2 className="mt-1 text-lg font-bold text-brand-700">Choose your course details</h2>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-40 flex-1 text-xs font-medium text-slate-600">Branch
            <select className={`${inputClass} mt-1`} value={branch} onChange={(event) => setBranch(event.target.value)}>
              <option value="">Select branch</option>
              {branches.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          <label className="w-32 text-xs font-medium text-slate-600">Semester
            <select className={`${inputClass} mt-1`} value={semester} onChange={(event) => setSemester(event.target.value)}>
              <option value="">Any</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => <option key={value} value={value}>Sem {value}</option>)}
            </select>
          </label>
          <Button type="button" onClick={() => navigate(`/kits?branch=${encodeURIComponent(branch)}&semester=${encodeURIComponent(semester)}`)}>View kit</Button>
        </div>
      </section>

      <div className="grid gap-6">
        <section>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Recently listed</p>
              <h2 className="mt-1 font-bold text-brand-700">Marketplace finds</h2>
            </div>
            <Link to="/marketplace" className="text-xs font-semibold text-brand-700 underline">Browse all</Link>
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
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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

        <section>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Community notices</p>
              <h2 className="mt-1 font-bold text-brand-700">Lost &amp; found</h2>
            </div>
            <Link to="/lost-found" className="text-xs font-semibold text-brand-700 underline">Open lost &amp; found</Link>
          </div>
          {lostFoundError && <div className="mt-3"><Alert>{lostFoundError}</Alert></div>}
          {lostFound === null ? (
            <p role="status" className="mt-3 rounded-2xl bg-white/80 p-5 text-sm text-slate-500">Loading campus notices…</p>
          ) : lostFound.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-brand-200 bg-white/70 p-5 text-sm text-slate-600">
              {lostFoundError ? 'Could not load lost-and-found posts.' : 'No lost-and-found posts yet.'}
            </p>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {lostFound.slice(0, 4).map((item) => (
                <li key={item.id} className="rounded-2xl border border-white/70 bg-white p-4 shadow-sm">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                    item.status === 'found' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}>{item.status}</span>
                  <h3 className="mt-3 truncate text-sm font-bold text-slate-900">{item.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item.description}</p>
                  <p className="mt-3 truncate text-xs text-slate-500">{item.location_name}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <CampusMap items={mapItems} />
    </div>
  )
}
