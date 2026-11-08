import { useEffect, useMemo, useState } from 'react'
import { fetchCrewWorkBoardLogins } from '../../../utils/crew/crewStore'
import styles from '../Employees.module.css'

function parseSqlDate(value) {
  if (!value) return null
  const parsed = new Date(String(value).endsWith('Z') ? value : `${value}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDateTime(value) {
  const parsed = parseSqlDate(value)
  if (!parsed) return value || '—'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(parsed)
}

function isToday(value) {
  const parsed = parseSqlDate(value)
  if (!parsed) return false
  const now = new Date()
  return parsed.getFullYear() === now.getFullYear()
    && parsed.getMonth() === now.getMonth()
    && parsed.getDate() === now.getDate()
}

export default function WorkBoardLogins() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchCrewWorkBoardLogins({ limit: 250 })
      setRows(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    fetchCrewWorkBoardLogins({ limit: 250 })
      .then(data => {
        if (!cancelled) setRows(Array.isArray(data) ? data : [])
      })
      .catch(err => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return rows
    return rows.filter(row => row.employeeName?.toLowerCase().includes(query))
  }, [rows, search])

  const employeeCount = new Set(rows.map(row => row.employeeId)).size
  const todayCount = rows.filter(row => isToday(row.loggedInAt)).length

  return (
    <div className={styles.loginActivityRoot}>
      <div className={styles.loginActivityHeader}>
        <div>
          <h3>Work Board Logins</h3>
          <p>Successful employee PIN logins are saved here automatically.</p>
        </div>
        <button type="button" className={styles.btnSecondary} onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className={styles.loginActivityStats}>
        <div><strong>{todayCount}</strong><span>Logins today</span></div>
        <div><strong>{employeeCount}</strong><span>Employees recorded</span></div>
        <div><strong>{rows.length}</strong><span>Recent logins</span></div>
      </div>

      <input
        type="search"
        className={styles.search}
        placeholder="Search employee login history…"
        value={search}
        onChange={event => setSearch(event.target.value)}
      />

      {error && <p className={styles.loginActivityError}>{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className={styles.empty}>No Work Board logins match this view.</p>
      )}
      <div className={styles.loginActivityList}>
        {filtered.map(row => (
          <article key={row.id} className={styles.loginActivityRow}>
            <div>
              <strong>{row.employeeName}</strong>
              <span>{formatDateTime(row.loggedInAt)}</span>
            </div>
            <span className={row.usedDefaultPin ? styles.pinDefaultBadge : styles.pinPersonalBadge}>
              {row.usedDefaultPin ? 'Default 2026' : 'Personal PIN'}
            </span>
          </article>
        ))}
      </div>
    </div>
  )
}
