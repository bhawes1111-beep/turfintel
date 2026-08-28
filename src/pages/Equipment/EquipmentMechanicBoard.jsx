import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchEquipmentBoardState } from '../../utils/equipment/equipmentIssueStore'
import styles from './EquipmentMechanicBoard.module.css'

const OPEN_SERVICE_STATUSES = new Set(['open', 'scheduled', 'in-progress', 'in_progress', 'pending'])
const DOWN_STATUSES = new Set(['out-of-service', 'out_of_service', 'needs-maintenance', 'needs_maintenance', 'down'])

function priorityRank(value) {
  return { critical: 0, high: 1, routine: 2, low: 3 }[value] ?? 4
}

function displayPriority(value) {
  if (!value) return 'Routine'
  return String(value).replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function ticketStageLabel(value, status) {
  const stage = String(value || '').toLowerCase()
  const labels = {
    needs_service:  'Needs service',
    parts_ordered:  'Parts ordered',
    being_repaired: 'Being repaired',
    resolved:       'Resolved',
  }
  if (labels[stage]) return labels[stage]
  if (String(status || '').toLowerCase() === 'completed') return 'Resolved'
  return 'Needs service'
}

function serviceSignal(eq) {
  const hours = Number(eq.hours)
  const next = Number(eq.nextServiceHours)
  if (!Number.isFinite(hours) || !Number.isFinite(next) || next <= 0) return null
  const remaining = next - hours
  if (remaining <= 0) return { tone: 'critical', label: `${Math.abs(remaining)} hrs overdue` }
  if (remaining <= 25) return { tone: 'warn', label: `${remaining} hrs to service` }
  return null
}

function buildServiceItems(equipment, serviceLog) {
  const openLogs = (serviceLog ?? [])
    .filter(log => OPEN_SERVICE_STATUSES.has(String(log.status ?? '').toLowerCase()))
    .map(log => ({
      id:          `log-${log.id}`,
      equipmentId: log.equipmentId,
      title:       log.equipmentName ?? 'Equipment',
      subtitle:    log.serviceType ?? 'Service needed',
      detail:      log.notes || log.technician || log.date || '',
      stage:       ticketStageLabel(log.ticketStage, log.status),
      priority:    log.priority ?? 'routine',
      tone:        log.priority === 'critical' ? 'critical' : log.priority === 'high' ? 'warn' : 'normal',
    }))

  const loggedEquipmentIds = new Set(openLogs.map(item => item.equipmentId).filter(Boolean))
  const dueItems = (equipment ?? [])
    .filter(eq => !loggedEquipmentIds.has(eq.id))
    .map(eq => ({ eq, signal: serviceSignal(eq) }))
    .filter(item => item.signal)
    .map(({ eq, signal }) => ({
      id:       `due-${eq.id}`,
      title:    eq.name,
      subtitle: signal.label,
      detail:   eq.category ?? '',
      priority: signal.tone === 'critical' ? 'critical' : 'high',
      tone:     signal.tone,
    }))

  return [...openLogs, ...dueItems].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
}

function IssueCard({ title, subtitle, detail, meta, tone = 'normal' }) {
  return (
    <article className={styles.item} data-tone={tone}>
      <div>
        <h3>{title}</h3>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {detail && <p className={styles.detail}>{detail}</p>}
      </div>
      {meta && <span className={styles.badge}>{meta}</span>}
    </article>
  )
}

export default function EquipmentMechanicBoard() {
  const [state, setState] = useState({ equipment: [], serviceLog: [], issues: [], loading: true, error: null })

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const data = await fetchEquipmentBoardState()
        if (alive) setState({ ...data, loading: false, error: null })
      } catch (err) {
        if (alive) setState(prev => ({ ...prev, loading: false, error: err.message }))
      }
    }
    load()
    const timer = setInterval(load, 60000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const serviceItems = useMemo(
    () => buildServiceItems(state.equipment, state.serviceLog),
    [state.equipment, state.serviceLog],
  )
  const approvedIssues = useMemo(
    () => (state.issues ?? []).filter(issue => issue.status === 'approved')
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)),
    [state.issues],
  )
  const downEquipment = useMemo(
    () => (state.equipment ?? []).filter(eq => DOWN_STATUSES.has(String(eq.status ?? '').toLowerCase())),
    [state.equipment],
  )
  const totalNotices = serviceItems.length + approvedIssues.length + downEquipment.length

  return (
    <main className={styles.board}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Equipment</p>
          <h1>Mechanic Board</h1>
          <p className={styles.subhead}>Approved issues and service items for the shop.</p>
        </div>
        <nav className={styles.actions} aria-label="Equipment board links">
          <Link to="/display-board/board">Assignments</Link>
          <Link to="/equipment/report-issue">Report Issue</Link>
        </nav>
      </header>

      <section className={styles.stats} aria-label="Mechanic board summary">
        <div><strong>{serviceItems.length}</strong><span>Service</span></div>
        <div><strong>{approvedIssues.length}</strong><span>Approved Issues</span></div>
        <div><strong>{downEquipment.length}</strong><span>Down Units</span></div>
        <div><strong>{totalNotices}</strong><span>Total Notices</span></div>
      </section>

      {state.error && <p className={styles.error}>Could not load equipment board. {state.error}</p>}
      {state.loading && <p className={styles.empty}>Loading equipment board...</p>}

      {!state.loading && totalNotices === 0 && (
        <section className={styles.emptyPanel}>
          <h2>Nothing approved for the shop.</h2>
          <p>Service reminders and approved staff reports will show here.</p>
        </section>
      )}

      <section className={styles.grid}>
        <div className={styles.column}>
          <h2>Service Needed</h2>
          {serviceItems.length === 0 ? (
            <p className={styles.empty}>No service items due.</p>
          ) : serviceItems.map(item => (
            <IssueCard
              key={item.id}
              title={item.title}
              subtitle={item.subtitle}
              detail={item.detail}
              meta={item.stage || displayPriority(item.priority)}
              tone={item.tone}
            />
          ))}
        </div>

        <div className={styles.column}>
          <h2>Approved Staff Issues</h2>
          {approvedIssues.length === 0 ? (
            <p className={styles.empty}>No approved staff issues.</p>
          ) : approvedIssues.map(issue => (
            <IssueCard
              key={issue.id}
              title={issue.equipmentName}
              subtitle={issue.issueType}
              detail={issue.description}
              meta={displayPriority(issue.priority)}
              tone={issue.priority === 'critical' ? 'critical' : issue.priority === 'high' ? 'warn' : 'normal'}
            />
          ))}
        </div>

        <div className={styles.column}>
          <h2>Out of Service</h2>
          {downEquipment.length === 0 ? (
            <p className={styles.empty}>No units marked down.</p>
          ) : downEquipment.map(eq => (
            <IssueCard
              key={eq.id}
              title={eq.name}
              subtitle={eq.category}
              detail={eq.notes}
              meta={eq.status?.replace(/-/g, ' ')}
              tone="critical"
            />
          ))}
        </div>
      </section>
    </main>
  )
}
