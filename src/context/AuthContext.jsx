import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authAPI } from '../api/client'

const AuthContext = createContext(null)

const STORAGE_KEY = 'mab_auth'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const saveAuth = (token, userData) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user: userData }))
    setUser(userData)
  }

  const clearAuth = () => {
    sessionStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const { user: u } = JSON.parse(stored)
        if (u) {
          // Verify token is still valid
          authAPI.me().then(freshUser => {
            setUser(freshUser)
          }).catch(() => {
            clearAuth()
          }).finally(() => setLoading(false))
          return
        }
      } catch {}
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (username, password, workspaceSlug) => {
    const res = await authAPI.login({ username, password, workspaceSlug })
    saveAuth(res.token, res.user)
    return res.user
  }, [])

  const registerWorkspace = useCallback(async (data) => {
    const res = await authAPI.registerWorkspace(data)
    saveAuth(res.token, res.user)
    return res.user
  }, [])

  const logout = useCallback(async () => {
    try { await authAPI.logout() } catch {}
    clearAuth()
  }, [])

  const value = {
    user,
    loading,
    login,
    registerWorkspace,
    logout,
    isAuthenticated: !!user,
    isSuperAdmin: user?.role === 'super_admin',
    isPM: user?.role === 'pm' || user?.role === 'super_admin',
    isMember: user?.role === 'member',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
