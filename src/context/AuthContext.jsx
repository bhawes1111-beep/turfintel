// Auth context — current user + permissions, backed by httpOnly session cookie.
//
// On mount, calls GET /api/auth/me (the cookie rides along automatically).
// login()/logout() hit the auth endpoints and refresh the user. The session
// token is NEVER read in JS — it lives only in the httpOnly cookie, so this
// provider holds only the public user projection the server returns.
//
// Permission checks go through can()/the permissions map, never raw roles.

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { permissionsFor } from '../utils/auth/permissions'

const AuthContext = createContext(null)

async function postJson(url, body) {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',   // send/receive the session cookie
  })
  let data = null
  try { data = await res.json() } catch { /* empty body ok */ }
  return { ok: res.ok, status: res.status, data }
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
      const data = await res.json().catch(() => ({ user: null }))
      setUser(data?.user ?? null)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Resolve the session once on mount. The setState calls happen inside the
  // async resolution (after the fetch settles), not synchronously in render.
  useEffect(() => {
    let ignore = false
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(res => res.json().catch(() => ({ user: null })))
      .then(data => { if (!ignore) setUser(data?.user ?? null) })
      .catch(() => { if (!ignore) setUser(null) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [])

  const login = useCallback(async (email, password) => {
    const { ok, data } = await postJson('/api/auth/login', { email, password })
    if (ok && data?.user) { setUser(data.user); return { ok: true } }
    return { ok: false, error: data?.error || 'Login failed' }
  }, [])

  const logout = useCallback(async () => {
    await postJson('/api/auth/logout')
    setUser(null)
  }, [])

  // Permissions: trust the server-resolved map when present, else derive from
  // the role as a fallback (keeps a single source of truth either way).
  const permissions = user
    ? (user.permissions ?? permissionsFor(user))
    : {}

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    permissions,
    can: (perm) => permissions[perm] === true,
    login,
    logout,
    refresh,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
