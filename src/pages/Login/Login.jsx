import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import styles from './Login.module.css'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isAuthenticated, loading } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [busy, setBusy]         = useState(false)

  // One-shot notice after a successful password reset (passed via router
  // state from ResetPasswordPage). We clear it from history immediately so
  // a refresh doesn't keep showing the message. The state value never
  // changes after mount — it's strictly read at render time.
  const [resetNotice] = useState(() => !!location.state?.resetSuccess)
  useEffect(() => {
    if (location.state?.resetSuccess) {
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Forgot-password inline panel — Phase 4 Step 3.3. Minimal: a single
  // email field + a generic confirmation regardless of email existence.
  const [forgotOpen, setForgotOpen]   = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotBusy, setForgotBusy]   = useState(false)
  const [forgotSent, setForgotSent]   = useState(false)

  // Already logged in → bounce into the app (where they were headed, or /).
  const dest = location.state?.from || '/dashboard'
  useEffect(() => {
    if (!loading && isAuthenticated) navigate(dest, { replace: true })
  }, [loading, isAuthenticated, navigate, dest])

  async function handleSignIn(e) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) { setError('Enter your email and password'); return }
    setBusy(true)
    const res = await login(email.trim(), password)
    setBusy(false)
    if (res.ok) navigate(dest, { replace: true })
    else setError(res.error || 'Login failed')
  }

  async function handleForgotSubmit(e) {
    e.preventDefault()
    if (forgotBusy) return
    setForgotBusy(true)
    // Always show the generic confirmation regardless of server response —
    // the API is enumeration-safe and returns 200 either way. We treat
    // network errors the same to keep behavior uniform.
    try {
      await fetch('/api/auth/reset-request', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body:    JSON.stringify({ email: forgotEmail.trim() }),
      })
    } catch { /* generic-by-design */ }
    setForgotEmail('')
    setForgotBusy(false)
    setForgotSent(true)
  }

  return (
    <div className={styles.page}>

      {/* Background glow layers */}
      <div className={styles.glowBL} aria-hidden="true" />
      <div className={styles.glowTR} aria-hidden="true" />

      <div className={styles.card}>

        {/* Logo */}
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

        {/* Tagline */}
        <p className={styles.tagline}>Agronomics operations platform</p>

        {/* Post-reset success notice (one-shot via router state). */}
        {resetNotice && (
          <p className={styles.tagline} role="status">
            Password updated. Sign in with your new password.
          </p>
        )}

        {/* Sign In form */}
        <form className={styles.form} onSubmit={handleSignIn} noValidate>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className={styles.input}
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              disabled={busy}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className={styles.input}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <button type="submit" className={styles.signInBtn} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Forgot password — inline panel toggle */}
        {!forgotOpen && !forgotSent && (
          <button
            type="button"
            className={styles.forgotBtn}
            onClick={() => setForgotOpen(true)}
          >
            Forgot Password?
          </button>
        )}

        {forgotOpen && !forgotSent && (
          <form className={styles.form} onSubmit={handleForgotSubmit} noValidate>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="forgot-email">Email for reset link</label>
              <input
                id="forgot-email"
                type="email"
                className={styles.input}
                placeholder="you@example.com"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                autoComplete="email"
                disabled={forgotBusy}
                autoFocus
              />
            </div>
            <button type="submit" className={styles.signInBtn} disabled={forgotBusy || !forgotEmail.trim()}>
              {forgotBusy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        {forgotSent && (
          <p className={styles.tagline} role="status">
            If that email is registered, a reset link has been sent.
          </p>
        )}

      </div>
    </div>
  )
}
