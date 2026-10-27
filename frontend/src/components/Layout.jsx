import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Wordmark from './Wordmark.jsx'

export const APP_NAME = 'Campustu'

const navClass = ({ isActive }) =>
  `rounded-full px-3 py-1.5 text-sm font-semibold transition duration-200 hover:-translate-y-0.5 ${isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-brand-700 hover:bg-brand-100'}`

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [scrollProgress, setScrollProgress] = useState(0)
  const [logoutError, setLogoutError] = useState('')

  async function handleLogout() {
    setLogoutError('')
    try {
      await signOut()
      navigate('/')
    } catch (error) {
      setLogoutError(error.message || 'Could not log out. Please try again.')
    }
  }

  useEffect(() => {
    const updateScrollProgress = () => {
      const totalScroll = document.documentElement.scrollHeight - document.documentElement.clientHeight
      const currentScroll = window.scrollY
      setScrollProgress(totalScroll > 0 ? (currentScroll / totalScroll) * 100 : 0)
    }

    updateScrollProgress()
    window.addEventListener('scroll', updateScrollProgress, { passive: true })
    window.addEventListener('resize', updateScrollProgress)
    return () => {
      window.removeEventListener('scroll', updateScrollProgress)
      window.removeEventListener('resize', updateScrollProgress)
    }
  }, [])

  return (
    <div className="min-h-screen">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-50 h-1 bg-gradient-to-r from-teal-500 to-teal-300 transition-[width] duration-75"
        style={{ width: `${scrollProgress}%` }}
      />
      <header className="sticky top-0 z-10 border-b border-brand-200/80 bg-white/90 shadow-[0_4px_18px_rgba(23,90,109,0.05)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:gap-x-4 sm:px-5 lg:px-8">
          <Link to="/" aria-label="Home">
            <span className="wordmark-hover inline-block">
              <Wordmark className="text-xl sm:text-2xl" />
            </span>
          </Link>
          <nav aria-label="Main navigation" className="order-3 -mx-1 flex w-[calc(100%+0.5rem)] flex-none gap-1 overflow-x-auto overscroll-x-contain px-1 pb-0.5 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {user && (
              <>
                <NavLink to="/kits" className={`${navClass} shrink-0`}>Kits</NavLink>
                <NavLink to="/marketplace" className={`${navClass} shrink-0`}>Marketplace</NavLink>
                <NavLink to="/lost-found" className={`${navClass} shrink-0`}>Lost &amp; Found</NavLink>
              </>
            )}
          </nav>
          {user ? (
            <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5 text-sm sm:gap-3">
              <Link to="/sell" className="rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-brand-700 sm:px-3.5 sm:text-sm">Sell</Link>
              <Link to="/profile" aria-label="Open your profile" className="flex min-w-0 items-center gap-2 rounded-full p-1 transition hover:bg-brand-50 sm:pr-2">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full border border-brand-200 bg-white object-cover sm:h-9 sm:w-9" />
                ) : (
                  <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 sm:h-9 sm:w-9">
                    {(user.display_name || 'U').trim().charAt(0).toUpperCase()}
                  </span>
                )}<span className="hidden min-w-0 text-right leading-tight sm:block">
                  <span className="block truncate font-semibold text-slate-800 hover:underline">
                    {user.display_name}
                    {user.is_trusted && <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Trusted</span>}
                  </span>
                  {user.college && <span className="block max-w-40 truncate text-xs text-slate-500">{user.college.name}</span>}
                </span>
              </Link>
              <button className="whitespace-nowrap px-1 text-[11px] text-slate-500 underline hover:text-slate-800 sm:text-xs" onClick={handleLogout}>
                Log out
              </button>
            </div>
          ) : (
            <div className="ml-auto flex shrink-0 items-center gap-1.5 text-xs sm:gap-2 sm:text-sm">
              <NavLink to="/login" className={navClass}>Log in</NavLink>
              <Link to="/signup" className="rounded-full bg-brand-600 px-3 py-1.5 font-semibold text-white shadow hover:bg-brand-700 sm:px-3.5">Sign up</Link>
            </div>
          )}
        </div>
        {logoutError && <p role="alert" className="mx-auto max-w-[90rem] px-3 pb-2 text-sm text-red-700 sm:px-5 lg:px-8">{logoutError}</p>}
      </header>
      <main className="mx-auto w-full max-w-[90rem] min-w-0 px-3 py-5 sm:px-5 sm:py-8 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
