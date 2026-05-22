// Route guard — requires an authenticated session for the wrapped subtree.
//
// While /api/auth/me is in flight we render nothing (avoids a login-flash for
// already-authenticated users). Unauthenticated users are redirected to
// /login, preserving where they were headed so login can send them back.
//
// An optional `permission` prop additionally requires a specific permission
// (used by /admin). Lacking it redirects to the dashboard rather than login —
// the user is logged in, just not authorized for that area.

import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function RequireAuth({ children, permission = null }) {
  const { isAuthenticated, loading, can } = useAuth()
  const location = useLocation()

  if (loading) return null   // brief: auth check in flight

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (permission && !can(permission)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
