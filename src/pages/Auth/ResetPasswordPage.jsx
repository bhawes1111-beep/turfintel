// /reset-password?token=...  — Phase 4 Step 3.3
//
// Password-reset flow (decision 2 of Step 3.2 audit): the server does NOT
// issue a session cookie on reset, and it DOES delete the user's prior
// sessions. The page must:
//   - never refresh AuthContext (we have no session to refresh into)
//   - redirect deterministically to /login
//   - pass a one-shot success flag via router state so Login can show a
//     simple toast (no localStorage, no in-memory persistence)
//
// All token state lives in the URL; SetPasswordForm clears its own copy
// after the submit.

import { useNavigate } from 'react-router-dom'
import SetPasswordForm from './SetPasswordForm'

export default function ResetPasswordPage() {
  const navigate = useNavigate()

  function onSuccess() {
    navigate('/login', {
      replace: true,
      state: { resetSuccess: true },
    })
  }

  return <SetPasswordForm expectedType="password_reset" onSuccess={onSuccess} />
}
