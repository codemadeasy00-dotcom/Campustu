import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export const APP_NAME = 'Campustu'

const navClass = ({ isActive }) =>
  `rounded-md px-2 py-1 text-sm font-medium ${isActive ? 'text-indigo-700' : 'text-slate-600 hover:text-slate-900'}`

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link to="/" className="text-lg font-bold text-indigo-700">
            {APP_NAME}
          </Link>
          <nav className="flex flex-1 items-center gap-2">
            {user && (
              <>
                <NavLink to="/sell" className={navClass}>
                  Sell an item
                </NavLink>
                <NavLink to="/my-listings" className={navClass}>
                  My listings
                </NavLink>
              </>
            )}
          </nav>
          {user ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-600">
                {user.display_name}
                {user.is_trusted && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    Trusted
                  </span>
                )}
              </span>
              <button
                className="text-slate-500 underline hover:text-slate-800"
                onClick={() => {
                  signOut()
                  navigate('/')
                }}
              >
                Log out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <NavLink to="/login" className={navClass}>
                Log in
              </NavLink>
              <Link to="/signup" className="rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700">
                Sign up
              </Link>
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
