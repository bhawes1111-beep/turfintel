// Shared password-set form for the invite-accept and password-reset SPA
// pages. Intentionally minimal per the Step 3.3 spec: no animations, no
// wizard, no token persistence outside URL params, no localStorage, no
// optimistic auth.
//
// Token lifecycle in this component:
//   - read from URLSearchParams once on mount, stored in local state
//   - validated immediately via GET /api/auth/token-status
//   - submitted exactly once via POST /api/auth/set-password
//   - cleared from local state right after the submit response, regardless
//     of outcome (defense-in-depth; the URL is the source of truth)
//
// The wrapper (AcceptInvitePage / ResetPasswordPage) decides what happens
// on success via the `onSuccess` callback. Failure messaging is generic.

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import styles from '../Login/Login.module.css'

const PHASE = {
  LOADING:  'loading',
  INVALID:  'invalid',   // missing/unknown/used/expired/revoked/type-mismatch
  READY:    'ready',
  SUBMITTING: 'submitting',
  SUCCESS:  'success',
  ERROR:    'error',
}

export default function SetPasswordForm({
  expectedType,    // 'invite' | 'password_reset' — to render the right copy
  onSuccess,       // ({ user }) => void  (called once after a confirmed 200)
}) {
  const location = useLocation()
  // URLSearchParams is the ONLY source. No fallback, no storage.
  const [token, setToken] = useState(() => {
    const params = new URLSearchParams(location.search)
    return params.get('token') || ''
  })
  // If no token in the URL at mount, start in INVALID directly (not via an
  // effect's setState call — react-hooks/set-state-in-effect would complain,
  // and the value never changes anyway).
  const [phase, setPhase]     = useState(() => token ? PHASE.LOADING : PHASE.INVALID)
  const [emailHint, setEmailHint] = useState(null)   // shown for context, not auth
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [errorMsg, setErrorMsg]   = useState(null)

  // ── Validate the token on mount (exactly once). ────────────────────────
  useEffect(() => {
    if (!token) return   // already INVALID via initializer above
    let ignore = false
    fetch(`/api/auth/token-status?token=${encodeURIComponent(token)}`, {
      credentials: 'same-origin',
    })
      .then(r => r.json().catch(() => ({ valid: false })))
      .then(data => {
        if (ignore) return
        if (data?.valid && (!expectedType || data.type === expectedType)) {
          setEmailHint(data.email ?? null)
          setPhase(PHASE.READY)
        } else {
          setPhase(PHASE.INVALID)
        }
      })
      .catch(() => { if (!ignore) setPhase(PHASE.INVALID) })
    return () => { ignore = true }
  }, [token, expectedType])

  async function handleSubmit(e) {
    e.preventDefault()
    if (phase !== PHASE.READY) return   // double-submit guard
    setErrorMsg(null)
    if (password.length < 8) { setErrorMsg('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setErrorMsg('Passwords do not match.'); return }
    setPhase(PHASE.SUBMITTING)

    // Take the token into a local const so we can clear the state slot
    // immediately after the request settles. Body is built from this local
    // and not stored anywhere else.
    const submitToken = token
    let res, data
    try {
      res  = await fetch('/api/auth/set-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token: submitToken, password }),
      })
      data = await res.json().catch(() => null)
    } catch {
      // Clear sensitive state regardless.
      setPassword(''); setConfirm(''); setToken('')
      setErrorMsg('Could not reach the server. Please try again.')
      setPhase(PHASE.ERROR)
      return
    }
    // Clear sensitive state right after the response, regardless of outcome.
    setPassword(''); setConfirm(''); setToken('')

    if (res.ok && data?.user) {
      setPhase(PHASE.SUCCESS)
      try { onSuccess({ user: data.user }) } catch { /* navigation only */ }
      return
    }
    setErrorMsg(data?.error || 'This link is invalid or has expired.')
    setPhase(PHASE.ERROR)
  }

  // ── Render states ──────────────────────────────────────────────────────
  const isInvite = expectedType === 'invite'
  const heading  = isInvite ? 'Set your password' : 'Reset your password'
  const cta      = isInvite ? 'Set password & sign in' : 'Set new password'

  if (phase === PHASE.LOADING) {
    return <SimpleCard><p className={styles.tagline}>Checking your link…</p></SimpleCard>
  }
  if (phase === PHASE.INVALID) {
    return (
      <SimpleCard>
        <p className={styles.tagline}>This link is invalid or has expired.</p>
        <p className={styles.tagline}>
          {isInvite
            ? 'Ask your administrator to send a new invite.'
            : 'Use Forgot Password on the sign-in page to request a new link.'}
        </p>
      </SimpleCard>
    )
  }
  if (phase === PHASE.SUCCESS) {
    return <SimpleCard><p className={styles.tagline}>Password set. Redirecting…</p></SimpleCard>
  }

  // READY / SUBMITTING / ERROR — form
  const busy = phase === PHASE.SUBMITTING
  return (
    <SimpleCard>
      <p className={styles.tagline}>{heading}</p>
      {emailHint && <p className={styles.tagline}>for <strong>{emailHint}</strong></p>}
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            className={styles.input}
            placeholder="At least 8 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            disabled={busy}
            autoFocus
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            className={styles.input}
            placeholder="Re-enter password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
            disabled={busy}
          />
        </div>
        {errorMsg && <p className={styles.error} role="alert">{errorMsg}</p>}
        <button type="submit" className={styles.signInBtn} disabled={busy}>
          {busy ? 'Working…' : cta}
        </button>
      </form>
    </SimpleCard>
  )
}

// Reuse the Login page's card chrome (background glow, card frame) so this
// stays styling-free new work per the spec.
function SimpleCard({ children }) {
  return (
    <div className={styles.page}>
      <div className={styles.glowBL} aria-hidden="true" />
      <div className={styles.glowTR} aria-hidden="true" />
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <div className={styles.logoMark}>
            <span className={styles.logoT}>T</span><span className={styles.logoP}>P</span>
          </div>
          <div className={styles.wordmark}>
            <div className={styles.wordmarkName}>
              <span className={styles.wordmarkTurf}>TURF</span><span className={styles.wordmarkIntel}>INTEL</span>
            </div>
            <div className={styles.wordmarkPro}>— PRO —</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
