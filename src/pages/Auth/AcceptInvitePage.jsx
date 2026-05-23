// /accept-invite?token=...  — Phase 4 Step 3.3
//
// Invite-accept flow (decision 1 of Step 3.2 audit): on a confirmed
// successful set-password response, the server has already issued a
// session cookie. We refresh AuthContext to pick it up, then redirect
// deterministically to /dashboard. RequireAuth gates /dashboard, so a
// failed refresh (cookie missing for any reason) bounces back to /login —
// safe by construction.

import { useNavigate } from 'react-router-dom'
import SetPasswordForm from './SetPasswordForm'
import { useAuth } from '../../context/AuthContext'

export default function AcceptInvitePage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()

  async function onSuccess() {
    // Invite flow assumes the server-issued cookie is already present
    // (Set-Cookie on the /api/auth/set-password response). Refresh resolves
    // /api/auth/me with the new cookie and populates AuthContext, so
    // /dashboard renders the right user immediately.
    await refresh()
    navigate('/dashboard', { replace: true })
  }

  return <SetPasswordForm expectedType="invite" onSuccess={onSuccess} />
}
