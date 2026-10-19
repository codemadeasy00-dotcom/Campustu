import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Wordmark from './Wordmark.jsx'

export const APP_NAME = 'Campustu'

const navClass = ({ isActive }) =>
  `rounded-full px-3 py-1.5 text-sm font-semibold ${isActive ? 'bg-brand-600 text-white' : 'text-brand-700 hover:bg-brand-100'}`

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-brand-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Link to="/" aria-label="Home"><Wordmark className="text-2xl" /></Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {user && (
              <>
                <NavLink to="/kits" className={navClass}>Kits</NavLink>
                <NavLink to="/marketplace" className={navClass}>Marketplace</NavLink>
                <NavLink to="/lost-found" className={navClass}>Lost &amp; Found</NavLink>
              </>
            )}
          </nav>
          {user ? (
            <div className="flex items-center gap-3 text-sm">
              <Link to="/sell" className="rounded-full bg-brand-600 px-3.5 py-1.5 font-semibold text-white shadow hover:bg-brand-700">Sell</Link>
              <div className="text-right leading-tight">
                <Link to="/my-listings" className="font-semibold text-slate-800 hover:underline">
                  {user.display_name}
                  {user.is_trusted && <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Trusted</span>}
                </Link>
                {user.college && <div className="max-w-40 truncate text-xs text-slate-500">{user.college.name}</div>}
              </div>
              <button className="text-xs text-slate-500 underline hover:text-slate-800" onClick={() => { signOut(); navigate('/') }}>
                Log out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <NavLink to="/login" className={navClass}>Log in</NavLink>
              <Link to="/signup" className="rounded-full bg-brand-600 px-3.5 py-1.5 font-semibold text-white shadow hover:bg-brand-700">Sign up</Link>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
