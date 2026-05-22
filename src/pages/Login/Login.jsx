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

        {/* Forgot password */}
        <button
          type="button"
          className={styles.forgotBtn}
          onClick={() => {/* password reset flow — coming soon */}}
        >
          Forgot Password?
        </button>

      </div>
    </div>
  )
}
