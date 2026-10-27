import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Wordmark from './Wordmark.jsx'

export const APP_NAME = 'Campustu'

const primaryLinks = [
  { to: '/', label: 'Home', end: true },
  { to: '/kits', label: 'Semester kits' },
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/lost-found', label: 'Lost & Found' },
]

const quickLinks = [
  { to: '/sell', label: 'Sell an item', icon: '＋' },
  { to: '/my-listings', label: 'My listings', icon: '▤' },
  { to: '/wishlist', label: 'Wishlist', icon: '♡' },
  { to: '/lost-found/report', label: 'Report lost / found', icon: '⌖' },
]

const navClass = ({ isActive }) =>
  `site-nav-link ${isActive ? 'site-nav-link-active' : ''}`

function ProfileMark({ user, compact = false }) {
  const size = compact ? 'h-10 w-10' : 'h-9 w-9'
  return user.avatar_url ? (
    <img src={user.avatar_url} alt="" className={`${size} shrink-0 rounded-full border border-brand-200 bg-white object-cover`} />
  ) : (
    <span aria-hidden="true" className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800`}>
      {(user.display_name || 'U').trim().charAt(0).toUpperCase()}
    </span>
  )
}

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const menuRef = useRef(null)
  const mobileToggleRef = useRef(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [logoutError, setLogoutError] = useState('')

  useEffect(() => {
    setMobileOpen(false)
    setMoreOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!moreOpen) return undefined

    const closeOnOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMoreOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMoreOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [moreOpen])

  useEffect(() => {
    if (!mobileOpen) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setMobileOpen(false)
        mobileToggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [mobileOpen])

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
      <header className="site-header sticky top-0 z-40 border-b border-brand-200/80 bg-white/90 shadow-[0_4px_18px_rgba(23,90,109,0.05)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[90rem] items-center gap-3 px-3 py-2.5 sm:px-5 lg:px-8">
          <Link to="/" aria-label="Campustu home" className="shrink-0">
            <span className="wordmark-hover inline-block"><Wordmark className="text-xl sm:text-2xl" /></span>
          </Link>

          {user ? (
            <nav aria-label="Main navigation" className="site-desktop-nav mx-auto hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex">
              {primaryLinks.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                  {item.label}
                </NavLink>
              ))}
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                  onClick={() => setMoreOpen((open) => !open)}
                  className={`site-nav-link ${moreOpen ? 'site-nav-link-active' : ''}`}
                >
                  More <span aria-hidden="true" className={`ml-1 inline-block transition-transform ${moreOpen ? 'rotate-180' : ''}`}>⌄</span>
                </button>
                {moreOpen && (
                  <div role="menu" className="site-more-menu absolute left-1/2 top-full z-50 mt-3 w-64 -translate-x-1/2 rounded-2xl border border-brand-100 bg-white p-2 shadow-xl">
                    {quickLinks.filter((item) => item.to !== '/sell').map((item) => (
                      <Link
                        key={item.to}
                        role="menuitem"
                        to={item.to}
                        onClick={() => setMoreOpen(false)}
                        className="site-more-link"
                      >
                        <span aria-hidden="true" className="site-more-icon">{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    ))}
                    <div className="my-1 border-t border-brand-100" />
                    <Link role="menuitem" to="/profile" onClick={() => setMoreOpen(false)} className="site-more-link">
                      <span aria-hidden="true" className="site-more-icon">◎</span>
                      <span>Profile &amp; settings</span>
                    </Link>
                  </div>
                )}
              </div>
            </nav>
          ) : (
            <nav aria-label="Main navigation" className="ml-auto hidden items-center gap-2 xl:flex">
              <NavLink to="/login" className={navClass}>Log in</NavLink>
              <Link to="/signup" className="site-primary-action">Join your campus</Link>
            </nav>
          )}

          {user && (
            <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
              <Link to="/sell" className="site-primary-action hidden sm:inline-flex">＋ <span>Sell an item</span></Link>
              <Link to="/profile" aria-label="Open your profile" className="site-profile-button">
                <ProfileMark user={user} />
                <span className="hidden min-w-0 text-left leading-tight lg:block">
                  <span className="block max-w-32 truncate text-sm font-semibold text-slate-800">{user.display_name}</span>
                  <span className="block max-w-32 truncate text-[11px] text-slate-500">{user.college?.name || 'Your profile'}</span>
                </span>
              </Link>
              <button type="button" className="site-logout hidden xl:inline-flex" onClick={handleLogout}>Log out</button>
            </div>
          )}

          <button
            type="button"
            ref={mobileToggleRef}
            className="site-menu-toggle xl:hidden"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-site-navigation"
            onClick={() => setMobileOpen((open) => !open)}
          >
            <span className={mobileOpen ? 'site-menu-icon site-menu-icon-open' : 'site-menu-icon'} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>

        {user && (
          <nav aria-label="Main navigation" className="site-tablet-nav mx-auto hidden w-full max-w-[90rem] items-center justify-center gap-1 overflow-x-auto px-5 pb-2 xl:hidden">
            {primaryLinks.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                {item.label}
              </NavLink>
            ))}
            <NavLink to="/my-listings" className={navClass}>My listings</NavLink>
            <NavLink to="/wishlist" className={navClass}>Wishlist</NavLink>
            <NavLink to="/lost-found/report" className={navClass}>Report item</NavLink>
          </nav>
        )}

        {mobileOpen && (
          <div id="mobile-site-navigation" className="site-mobile-panel xl:hidden">
            {user ? (
              <>
                <Link to="/profile" className="site-mobile-account">
                  <ProfileMark user={user} compact />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-slate-800">{user.display_name}</span>
                    <span className="block truncate text-xs text-slate-500">{user.college?.name || 'Profile & settings'}</span>
                  </span>
                  <span aria-hidden="true" className="text-lg text-brand-600">→</span>
                </Link>
                <div className="site-mobile-links">
                  {primaryLinks.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                      {item.label}
                    </NavLink>
                  ))}
                </div>
                <div className="site-mobile-quicklinks">
                  {quickLinks.map((item) => (
                    <Link key={item.to} to={item.to} className="site-mobile-quicklink">
                      <span aria-hidden="true">{item.icon}</span>{item.label}
                    </Link>
                  ))}
                </div>
                <button type="button" className="site-mobile-logout" onClick={handleLogout}>Log out</button>
              </>
            ) : (
              <div className="flex gap-2">
                <NavLink to="/login" className={`${navClass} flex-1 justify-center`}>Log in</NavLink>
                <Link to="/signup" className="site-primary-action flex-1">Join your campus</Link>
              </div>
            )}
          </div>
        )}
        {logoutError && <p role="alert" className="mx-auto max-w-[90rem] px-3 pb-2 text-sm text-red-700 sm:px-5 lg:px-8">{logoutError}</p>}
      </header>
      <main className="mx-auto w-full max-w-[90rem] min-w-0 px-3 py-5 sm:px-5 sm:py-8 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
