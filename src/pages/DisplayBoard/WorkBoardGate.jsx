import { useEffect, useState } from 'react'
import DisplayBoard from './DisplayBoard'
import { useSelectedCourseId } from '../../utils/courses/courseStore'
import styles from './WorkBoardGate.module.css'

async function fetchJson(url, init) {
  const response = await fetch(url, { credentials: 'same-origin', ...init })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Unable to open the Work Board')
  return data
}

export default function WorkBoardGate() {
  const courseId = useSelectedCourseId()
  const [session, setSession] = useState(null)
  const [employees, setEmployees] = useState([])
  const [employeeId, setEmployeeId] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const query = `?courseId=${encodeURIComponent(courseId)}`
    fetchJson(`/api/work-board/session${query}`)
      .then(async current => ({
        current,
        roster: current.authenticated
          ? null
          : await fetchJson(`/api/work-board/employees${query}`),
      }))
      .then(({ current, roster }) => {
        if (cancelled) return
        setSession(current)
        if (roster) setEmployees(Array.isArray(roster) ? roster : [])
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setSession({ authenticated: false })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [courseId])

  async function unlock(event) {
    event.preventDefault()
    if (!employeeId || !/^\d{4}$/.test(pin)) {
      setError('Select your name and enter your 4-digit PIN.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const current = await fetchJson('/api/work-board/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, employeeId, pin }),
      })
      setPin('')
      setSession(current)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function lockBoard() {
    setBusy(true)
    try {
      await fetchJson('/api/work-board/logout', { method: 'POST' })
    } catch { /* clearing the local view still returns to the PIN screen */ }
    setSession({ authenticated: false })
    setEmployeeId('')
    setPin('')
    try {
      const roster = await fetchJson(`/api/work-board/employees?courseId=${encodeURIComponent(courseId)}`)
      setEmployees(Array.isArray(roster) ? roster : [])
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  if (loading) {
    return <div className={styles.statusPage} role="status">Opening Work Board…</div>
  }

  if (session?.authenticated) {
    return (
      <DisplayBoard
        boardMode
        onLock={session.mode === 'employee' ? lockBoard : undefined}
        workBoardViewerName={session.employee?.name ?? ''}
      />
    )
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="work-board-title">
        <img className={styles.logo} src="/logo-full.png" alt="TurfIntel Pro" />
        <div className={styles.headingBlock}>
          <p className={styles.eyebrow}>Crew Access</p>
          <h1 id="work-board-title">Open Work Board</h1>
          <p>Select your name and enter your employee PIN.</p>
        </div>

        <form className={styles.form} onSubmit={unlock}>
          <label htmlFor="work-board-employee">Employee</label>
          <select
            id="work-board-employee"
            value={employeeId}
            onChange={event => setEmployeeId(event.target.value)}
            disabled={busy}
            autoFocus
          >
            <option value="">Select your name</option>
            {employees.map(employee => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>

          <label htmlFor="work-board-pin">4-digit PIN</label>
          <input
            id="work-board-pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="current-password"
            value={pin}
            onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            disabled={busy}
          />

          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" disabled={busy || !employeeId || pin.length !== 4}>
            {busy ? 'Opening…' : 'Open Work Board'}
          </button>
        </form>
      </section>
    </main>
  )
}
