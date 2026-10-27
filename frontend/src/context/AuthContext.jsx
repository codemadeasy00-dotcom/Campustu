import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, tokenStore, LOGOUT_EVENT } from '../services/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // If there is a saved token we must ask the server who it belongs to before showing pages.
  const [loading, setLoading] = useState(Boolean(tokenStore.get()))

  useEffect(() => {
    if (!tokenStore.get()) return
    let cancelled = false
    authApi
      .getMe()
      .then(({ user }) => !cancelled && setUser(user))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  // api.js fires this when the server says the session is no longer valid.
  useEffect(() => {
    const onLogout = () => setUser(null)
    window.addEventListener(LOGOUT_EVENT, onLogout)
    return () => window.removeEventListener(LOGOUT_EVENT, onLogout)
  }, [])

  const signIn = useCallback((token, nextUser) => {
    tokenStore.set(token)
    setUser(nextUser)
  }, [])

  const signOut = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  const updateUser = useCallback((nextUser) => setUser(nextUser), [])

  const value = useMemo(() => ({ user, loading, signIn, signOut, updateUser }), [user, loading, signIn, signOut, updateUser])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
