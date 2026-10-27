import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, LOGOUT_EVENT } from '../services/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    localStorage.removeItem('campustu_token')
    let cancelled = false
    authApi
      .getMe()
      .then(({ user }) => !cancelled && setUser(user))
      .catch((error) => {
        if (error.status !== 401) console.error('Could not restore the signed-in session:', error)
      })
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

  const signIn = useCallback((nextUser) => {
    setUser(nextUser)
  }, [])

  const signOut = useCallback(async () => {
    await authApi.logout()
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
