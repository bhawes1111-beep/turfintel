import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './Login.module.css'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')

  function handleSignIn(e) {
    e.preventDefault()
    // No auth yet — navigate directly to app.
    // To wire real auth: replace this with your auth provider call.
    navigate('/dashboard')
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
            />
          </div>

          <button type="submit" className={styles.signInBtn}>
            Sign In
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

        {/* Divider */}
        <div className={styles.divider}>
          <span className={styles.dividerLine} />
          <span className={styles.dividerText}>or</span>
          <span className={styles.dividerLine} />
        </div>

        {/* Demo bypass */}
        <button
          type="button"
          className={styles.demoBtn}
          onClick={() => navigate('/dashboard')}
        >
          Continue to Demo Dashboard →
        </button>

      </div>
    </div>
  )
}
