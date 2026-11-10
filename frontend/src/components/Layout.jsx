import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { lostFoundApi, searchAlertsApi } from '../services/api.js'
import { useToast } from './ui.jsx'
import Wordmark from './Wordmark.jsx'
import { SHARE_QR_OPEN_EVENT } from './ShareQRWidget.jsx'

export const APP_NAME = 'Campustu'

const primaryLinks = [
  { to: '/', label: 'Home', end: true },
  { to: '/kits', label: 'Semester kits' },
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/lost-found', label: 'Lost & Found' },
  { to: '/messages', label: 'Messages' },
]

const quickLinks = [
  { to: '/sell', label: 'Sell an item', icon: '＋' },
  { to: '/my-listings', label: 'My listings', icon: '▤' },
  { to: '/wishlist', label: 'Wishlist', icon: '♡' },
  { to: '/lost-found/report', label: 'Report lost / found', icon: '⌖' },
  { to: '/barter', label: 'Barter loops', icon: '↻' },
  { to: '/achievements', label: 'Achievements', icon: '🏆' },
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
  const showToast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const showMobileQr = location.pathname === '/signup' || location.pathname === '/login'
  const menuRef = useRef(null)
  const notificationsRef = useRef(null)
  const mobileToggleRef = useRef(null)
  const notifiedClaimIdsRef = useRef(new Set())
  const notifiedMatchIdsRef = useRef(new Set())
  const notifiedSearchIdsRef = useRef(new Set())
  const [mobileOpen, setMobileOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [claimNotifications, setClaimNotifications] = useState([])
  const [matchNotifications, setMatchNotifications] = useState([])
  const [searchNotifications, setSearchNotifications] = useState([])
  const [unreadClaimCount, setUnreadClaimCount] = useState(0)
  const [unreadMatchCount, setUnreadMatchCount] = useState(0)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [logoutError, setLogoutError] = useState('')

  useEffect(() => {
    setMobileOpen(false)
    setMoreOpen(false)
    setNotificationsOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!user?.id || !user?.college) {
      setClaimNotifications([])
      setMatchNotifications([])
      setSearchNotifications([])
      setUnreadClaimCount(0)
      setUnreadMatchCount(0)
      return undefined
    }

    let cancelled = false
    let requestPending = false
    const storageKey = `campustu:seen-claims:${user.id}:${user.college.id}`
    const matchStorageKey = `campustu:seen-match-scans:${user.id}:${user.college.id}`
    notifiedClaimIdsRef.current = new Set()
    notifiedMatchIdsRef.current = new Set()
    notifiedSearchIdsRef.current = new Set()
    setClaimNotifications([])
    setMatchNotifications([])
    setUnreadClaimCount(0)
    setUnreadMatchCount(0)

    const refreshClaimNotifications = async () => {
      if (cancelled || requestPending) return
      requestPending = true
      try {
        const [result, searchResult] = await Promise.all([
          lostFoundApi.notifications(),
          searchAlertsApi.notifications(),
        ])
        if (cancelled) return

        const notifications = result.notifications || []
        const matchNotices = result.match_notifications || []
        const searchNotices = searchResult.notifications || []
        const newSearchNotices = searchNotices.filter(
          (notice) => !notice.is_read && !notifiedSearchIdsRef.current.has(notice.id),
        )
        if (newSearchNotices.length) {
          showToast(
            `${newSearchNotices.length} new saved-search match${newSearchNotices.length === 1 ? '' : 'es'} found. Tap the bell to review.`,
          )
          newSearchNotices.forEach((notice) => notifiedSearchIdsRef.current.add(notice.id))
        }
        setSearchNotifications(searchNotices)
        let savedIds = []
        let savedMatchIds = []
        try {
          const parsedIds = JSON.parse(localStorage.getItem(storageKey) || '[]')
          if (Array.isArray(parsedIds)) {
            savedIds = parsedIds.filter((id) => typeof id === 'string')
          }
        } catch (error) {
          console.error('Could not read seen claim notifications:', error)
        }
        try {
          const parsedIds = JSON.parse(localStorage.getItem(matchStorageKey) || '[]')
          if (Array.isArray(parsedIds)) {
            savedMatchIds = parsedIds.filter((id) => typeof id === 'string')
          }
        } catch (error) {
          console.error('Could not read seen visual-match notifications:', error)
        }
        const seenIds = new Set(savedIds)
        const seenMatchIds = new Set(savedMatchIds)
        const newClaims = notifications.filter((claim) => !seenIds.has(claim.id))
        const newMatchNotices = matchNotices.filter((notice) => !seenMatchIds.has(notice.id))
        const claimsToAnnounce = newClaims.filter((claim) => !notifiedClaimIdsRef.current.has(claim.id))
        const matchesToAnnounce = newMatchNotices.filter((notice) => !notifiedMatchIdsRef.current.has(notice.id))
        if (claimsToAnnounce.length) {
          showToast(`${claimsToAnnounce.length} new claim${claimsToAnnounce.length === 1 ? '' : 's'} received. Tap the bell to review.`)
          claimsToAnnounce.forEach((claim) => notifiedClaimIdsRef.current.add(claim.id))
        }
        if (matchesToAnnounce.length) {
          showToast(`${matchesToAnnounce.length} high-similarity Lost & Found match${matchesToAnnounce.length === 1 ? '' : 'es'} found. Your post remains active; tap the bell to review.`)
          matchesToAnnounce.forEach((notice) => notifiedMatchIdsRef.current.add(notice.id))
        }

        setUnreadClaimCount(newClaims.length)
        setUnreadMatchCount(newMatchNotices.length)
        setClaimNotifications(notifications.map((claim) => ({
          id: claim.id,
          itemId: claim.item_id,
          title: claim.title,
          claimantName: claim.claimant_name,
          createdAt: claim.created_at,
        })))
        setMatchNotifications(matchNotices.map((notice) => ({
          id: notice.id,
          itemId: notice.item_id,
          itemTitle: notice.item_title,
          matchedItemTitle: notice.matched_item_title,
          similarityScore: Number(notice.similarity_score),
          createdAt: notice.created_at,
        })))
      } catch (error) {
        if (!cancelled) console.error('Could not refresh claim notifications:', error)
      } finally {
        requestPending = false
      }
    }

    refreshClaimNotifications()
    const timer = window.setInterval(refreshClaimNotifications, 30_000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshClaimNotifications()
    }
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('campustu:lost-found-match', refreshClaimNotifications)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('campustu:lost-found-match', refreshClaimNotifications)
    }
  }, [showToast, user?.college?.id, user?.id])

  useEffect(() => {
    if (!notificationsOpen) return undefined
    const closeOnOutsideClick = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false)
      }
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setNotificationsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [notificationsOpen])

  const unreadSearchCount = searchNotifications.filter((item) => !item.is_read).length
  const pendingClaimTotal = unreadClaimCount + unreadMatchCount + unreadSearchCount
  const markNotificationsSeen = () => {
    setNotificationsOpen((open) => !open)
    if (notificationsOpen || !user?.id || !user?.college?.id) return
    searchAlertsApi.markRead()
      .then(() => setSearchNotifications((current) => current.map((item) => ({ ...item, is_read: true }))))
      .catch((error) => console.error('Could not mark saved-search notifications as read:', error))
    const storageKey = `campustu:seen-claims:${user.id}:${user.college.id}`
    const seenIds = new Set(claimNotifications.map((item) => item.id))
    const seenMatchIds = new Set(matchNotifications.map((item) => item.id))
    try {
      const savedIds = JSON.parse(localStorage.getItem(storageKey) || '[]')
      if (Array.isArray(savedIds)) {
        savedIds.forEach((id) => {
          if (typeof id === 'string') seenIds.add(id)
        })
      }
      localStorage.setItem(storageKey, JSON.stringify([...seenIds].slice(-500)))
      const matchStorageKey = `campustu:seen-match-scans:${user.id}:${user.college.id}`
      const savedMatchIds = JSON.parse(localStorage.getItem(matchStorageKey) || '[]')
      if (Array.isArray(savedMatchIds)) {
        savedMatchIds.forEach((id) => {
          if (typeof id === 'string') seenMatchIds.add(id)
        })
      }
      localStorage.setItem(matchStorageKey, JSON.stringify([...seenMatchIds].slice(-500)))
      setUnreadClaimCount(0)
      setUnreadMatchCount(0)
    } catch (error) {
      console.error('Could not save seen claim notifications:', error)
    }
  }

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

  function openShareQr() {
    setMobileOpen(false)
    window.dispatchEvent(new Event(SHARE_QR_OPEN_EVENT))
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
                    {user.role === 'admin' && (
                      <Link role="menuitem" to="/admin" onClick={() => setMoreOpen(false)} className="site-more-link">
                        <span aria-hidden="true" className="site-more-icon">⚑</span>
                        <span>Admin console</span>
                      </Link>
                    )}
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
              <Link to="/sell" className="site-primary-action hidden lg:inline-flex">＋ <span>Sell an item</span></Link>
              <div className="relative" ref={notificationsRef}>
                <button
                  type="button"
                  aria-label={pendingClaimTotal ? `${pendingClaimTotal} unread notifications` : 'Notifications'}
                  aria-expanded={notificationsOpen}
                  aria-haspopup="dialog"
                  onClick={markNotificationsSeen}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full border border-brand-200 bg-white text-brand-800 transition hover:bg-brand-50"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4" />
                  </svg>
                  {pendingClaimTotal > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                      {pendingClaimTotal > 99 ? '99+' : pendingClaimTotal}
                    </span>
                  )}
                </button>
                {notificationsOpen && (
                  <section
                    role="dialog"
                    aria-label="Notifications"
                    className="absolute right-0 top-full z-[70] mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-xl"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">Notifications</h2>
                        <p className="text-xs text-slate-500">
                          {claimNotifications.length} claim{claimNotifications.length === 1 ? '' : 's'} · {matchNotifications.length} visual-match notice{matchNotifications.length === 1 ? '' : 's'} · {searchNotifications.length} search alert{searchNotifications.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <span aria-hidden="true" className="text-lg">🔔</span>
                    </div>
                    {claimNotifications.length || matchNotifications.length || searchNotifications.length ? (
                      <ul className="max-h-72 overflow-y-auto p-2">
                        {searchNotifications.map((item) => (
                          <li key={item.id}>
                            <Link
                              to={item.item_id ? `/items/${encodeURIComponent(item.item_id)}` : '/marketplace'}
                              onClick={() => setNotificationsOpen(false)}
                              className={`block rounded-xl px-3 py-3 transition hover:bg-brand-50 ${item.is_read ? '' : 'bg-brand-50/60'}`}
                            >
                              <span className="block text-sm font-semibold text-slate-800">{item.title}</span>
                              <span className="mt-1 block text-xs text-slate-500">
                                {item.message} · {new Date(item.created_at).toLocaleString()}
                              </span>
                            </Link>
                          </li>
                        ))}
                        {claimNotifications.map((item) => (
                          <li key={item.id}>
                            <Link
                              to={`/profile?tab=incoming&item=${encodeURIComponent(item.itemId)}`}
                              onClick={() => setNotificationsOpen(false)}
                              className="block rounded-xl px-3 py-3 transition hover:bg-brand-50"
                            >
                              <span className="block text-sm font-semibold text-slate-800">{item.title}</span>
                              <span className="mt-1 block text-xs text-slate-500">
                                New claim from {item.claimantName} · {new Date(item.createdAt).toLocaleString()}
                              </span>
                            </Link>
                          </li>
                        ))}
                        {matchNotifications.map((item) => (
                          <li key={item.id}>
                            <Link
                              to="/lost-found?mine=1"
                              onClick={() => setNotificationsOpen(false)}
                              className="block rounded-xl px-3 py-3 transition hover:bg-brand-50"
                            >
                              <span className="block text-sm font-semibold text-slate-800">A highly similar post was found</span>
                              <span className="mt-1 block text-xs text-slate-500">
                                Your post “{item.itemTitle}” matched “{item.matchedItemTitle}” at {Math.round(item.similarityScore * 100)}%. It remains active; please review · {new Date(item.createdAt).toLocaleString()}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-4 py-6 text-center text-sm text-slate-500">You’re all caught up. New claims, match notices, and saved-search alerts will appear here.</p>
                    )}
                    <Link
                      to="/profile?tab=incoming"
                      onClick={() => setNotificationsOpen(false)}
                      className="block border-t border-slate-100 px-4 py-3 text-center text-xs font-bold text-brand-700 hover:bg-brand-50"
                    >
                      Review incoming claims
                    </Link>
                  </section>
                )}
              </div>
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
            {user.role === 'admin' && <NavLink to="/admin" className={navClass}>Admin</NavLink>}
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
                  {showMobileQr && (
                    <button
                      type="button"
                      className="site-mobile-quicklink"
                      onClick={openShareQr}
                    >
                      <span aria-hidden="true">▦</span>Share with QR
                    </button>
                  )}
                  {user.role === 'admin' && (
                    <Link to="/admin" className="site-mobile-quicklink">
                      <span aria-hidden="true">⚑</span>Admin console
                    </Link>
                  )}
                </div>
                <button type="button" className="site-mobile-logout" onClick={handleLogout}>Log out</button>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <NavLink to="/login" className={`${navClass} flex-1 justify-center`}>Log in</NavLink>
                  <Link to="/signup" className="site-primary-action flex-1">Join your campus</Link>
                </div>
                {showMobileQr && (
                  <button type="button" className="site-mobile-quicklink mt-2 w-full" onClick={openShareQr}>
                    <span aria-hidden="true">▦</span>Share with QR
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {logoutError && <p role="alert" className="mx-auto max-w-[90rem] px-3 pb-2 text-sm text-red-700 sm:px-5 lg:px-8">{logoutError}</p>}
      </header>
      <main className="mx-auto w-full max-w-[90rem] min-w-0 px-3 py-5 sm:px-5 sm:py-8 lg:px-8">
        {user?.status === 'frozen' && (
          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <p>
              <strong>Your account is suspended.</strong>{' '}
              {user.frozen_reason || 'Some account actions are unavailable while this is reviewed.'}
            </p>
            <Link to="/support" className="shrink-0 font-semibold underline">Contact support</Link>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}
