import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOperations } from '../../utils/operations/OperationsContext'
import { useEquipmentData } from '../../utils/equipment/equipmentStore'
import { useRepairsData } from '../../utils/repairs/repairsStore'
import { SPRAY_RECORDS } from '../../data/spray'
import { SEVERITY_TOKENS, SEVERITY_ORDER } from '../../utils/intelligence/severity'
import { EmptyState } from '../../components/shared/EmptyState'
import styles from './ActionQueue.module.css'

// ── Route mapping ─────────────────────────────────────────────────────────────

const MODULE_ROUTES = {
  spray:      '/spray',
  irrigation: '/irrigation',
  equipment:  '/equipment',
  disease:    '/disease',
  inventory:  '/inventory',
  nutrition:  '/plant-nutrition',
  weather:    '/dashboard',
  alerts:     '/dashboard',
}

function getRoute(module) {
  return MODULE_ROUTES[module] ?? '/dashboard'
}

// ── Module metadata ───────────────────────────────────────────────────────────

const MODULE_ICONS = {
  disease:    '🔬',
  inventory:  '📦',
  spray:      '🌿',
  equipment:  '⚙️',
  nutrition:  '🌱',
  weather:    '🌤️',
  irrigation: '💧',
}

const MODULE_LABELS = {
  disease:    'Disease',
  inventory:  'Inventory',
  spray:      'Spray',
  equipment:  'Equipment',
  nutrition:  'Nutrition',
  weather:    'Weather',
  irrigation: 'Irrigation',
}

// ── Severity helpers ──────────────────────────────────────────────────────────

function alertToSeverity(priority) {
  if (priority === 'critical' || priority === 'high') return 'critical'
  if (priority === 'medium') return 'warning'
  if (priority === 'low')    return 'caution'
  return 'info'
}

function repairToSeverity(repair) {
  if (repair.priority === 'high')   return 'critical'
  if (repair.priority === 'medium') return 'warning'
  return 'caution'
}

function serviceToSeverity(log) {
  return log.priority === 'critical' ? 'critical' : 'warning'
}

// ── Date formatting ───────────────────────────────────────────────────────────
// Returns a short display string. Passes non-ISO strings (e.g. "May 6") through unchanged.

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function slugToTitle(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// ── Queue builders ────────────────────────────────────────────────────────────

function fromAlerts(alerts) {
  return alerts
    .filter(a => a.status !== 'resolved')
    .map(a => ({
      id:        `aq-alert-${a.id}`,
      title:     a.title,
      module:    a.module,
      severity:  alertToSeverity(a.priority),
      context:   a.message,
      timestamp: a.date,
      icon:      MODULE_ICONS[a.module] ?? '📋',
    }))
}

function fromRepairs(repairs = []) {
  return repairs
    .filter(r => r.status !== 'completed')
    .map(r => ({
      id:        `aq-ir-${r.repairId}`,
      title:     `${slugToTitle(r.issueType)} — ${r.area}`,
      module:    'irrigation',
      severity:  repairToSeverity(r),
      context:   r.description,
      timestamp: fmtDate(r.dateReported),
      icon:      '💧',
    }))
}

function fromServiceLog(logs = []) {
  return logs
    .filter(l => l.status === 'overdue' || (l.status === 'open' && l.priority === 'critical'))
    .map(l => ({
      id:        `aq-svc-${l.id}`,
      title:     `${l.serviceType} — ${l.equipmentName}`,
      module:    'equipment',
      severity:  serviceToSeverity(l),
      context:   l.notes || `${l.serviceType} service required`,
      timestamp: fmtDate(l.date),
      icon:      '⚙️',
    }))
}

function fromSpray() {
  return SPRAY_RECORDS
    .filter(r => r.status === 'pending-review')
    .map(r => ({
      id:        `aq-spray-${r.id}`,
      title:     `${r.products.map(p => p.name).join(' + ')} — ${r.area}`,
      module:    'spray',
      severity:  'warning',
      context:   'Application pending review',
      timestamp: fmtDate(r.date),
      icon:      '🌿',
    }))
}

// ── Aggregate + dedupe + sort ─────────────────────────────────────────────────

// Phase 5.1c: every domain is server-of-truth — both serviceLog and
// repairs are now parameters from their respective stores.
function buildQueue(alerts, { serviceLog = [], repairs = [] } = {}) {
  const seen = new Set()
  return [
    ...fromAlerts(alerts),
    ...fromRepairs(repairs),
    ...fromServiceLog(serviceLog),
    ...fromSpray(),
  ]
    .filter(item => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    .sort((a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
    )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ActionQueue() {
  const { state }      = useOperations()
  const { serviceLog } = useEquipmentData()
  const { repairs }    = useRepairsData()
  const navigate       = useNavigate()

  const items = useMemo(
    () => buildQueue(state.alerts, { serviceLog, repairs }),
    [state.alerts, serviceLog, repairs],
  )

  if (items.length === 0) {
    return (
      <EmptyState
        compact
        title="No action required."
        description="Items needing attention will appear here as they arise."
      />
    )
  }

  return (
    <div className={styles.aqList}>
      {items.map(item => {
        const meta        = SEVERITY_TOKENS[item.severity] ?? SEVERITY_TOKENS.info
        const moduleLabel = MODULE_LABELS[item.module] ?? item.module
        return (
          <button
            key={item.id}
            className={styles.aqItem}
            style={{ borderLeftColor: meta.color }}
            onClick={() => navigate(getRoute(item.module))}
          >
            <span className={styles.aqIcon}>{item.icon}</span>

            <div className={styles.aqBody}>
              <p className={styles.aqTitle}>{item.title}</p>
              {item.context && (
                <p className={styles.aqContext}>{item.context}</p>
              )}
            </div>

            <div className={styles.aqMeta}>
              <span
                className={styles.aqModuleTag}
                style={{
                  background: meta.bg,
                  color:      meta.color,
                  border:     `1px solid ${meta.border}`,
                }}
              >
                {moduleLabel}
              </span>
              {item.timestamp && (
                <span className={styles.aqTimestamp}>{item.timestamp}</span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
