import { SPRAY_RECORDS }    from '../../data/spray'
import { REPAIRS }           from '../../data/irrigation'
import { SERVICE_LOG }       from '../../data/equipment'
import { DASHBOARD_ALERTS }  from '../../data/dashboardAlerts'
import { ACTIVITY_TYPE, ACTIVITY_MODULE, createActivity } from './activitySchemas'
import { mergeRepairs }      from '../operations/repairUtils'
import { mergeServiceLogs } from '../operations/equipmentUtils'

// ── Severity helpers ──────────────────────────────────────────────────────────

function sprayStatusSeverity(status) {
  if (status === 'pending-review') return 'warning'
  if (status === 'in-progress')   return 'caution'
  return 'info'
}

function repairSeverity(repair) {
  if (repair.status === 'completed') return 'good'
  if (repair.priority === 'high')    return 'critical'
  if (repair.priority === 'medium')  return 'warning'
  return 'info'
}

function serviceSeverity(log) {
  if (log.status === 'completed') return 'good'
  if (log.status === 'overdue')   return 'warning'
  if (log.priority === 'critical') return 'critical'
  if (log.priority === 'high')    return 'warning'
  return 'info'
}

function alertSeverity(priority) {
  if (priority === 'critical' || priority === 'high') return 'critical'
  if (priority === 'medium') return 'warning'
  return 'info'
}

// ── Date helpers ──────────────────────────────────────────────────────────────

// Converts "May 6" style display dates (from DASHBOARD_ALERTS) to ISO timestamps.
// Assumes the current season year (2026).
const MONTH_MAP = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4,  Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}
function parseAlertDate(dateStr) {
  if (!dateStr) return new Date().toISOString()
  const [mon, day] = dateStr.split(' ')
  const m = MONTH_MAP[mon]
  if (m == null) return new Date().toISOString()
  return new Date(2026, m, parseInt(day, 10)).toISOString()
}

// Capitalizes each word in a hyphenated slug: "broken-head" → "Broken Head"
function slugToTitle(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// ── Builders ──────────────────────────────────────────────────────────────────

export function buildFromSprayRecords(records = SPRAY_RECORDS) {
  return records.map(r => createActivity({
    id:          `act-spray-${r.id}`,
    type:        ACTIVITY_TYPE.SPRAY_APPLICATION,
    module:      ACTIVITY_MODULE.SPRAY,
    title:       r.products.map(p => p.name).join(' + '),
    description: `${r.area} · ${r.applicator}${r.targetPest ? ` · ${r.targetPest}` : ''}`,
    timestamp:   new Date(r.date).toISOString(),
    severity:    sprayStatusSeverity(r.status),
    metadata: {
      status:     r.status,
      area:       r.area,
      applicator: r.applicator,
      products:   r.products.map(p => p.name),
      sourceId:   r.id,
    },
    relatedIds: [r.id],
  }))
}

export function buildFromIrrigationRepairs(repairs = REPAIRS) {
  return repairs.map(r => createActivity({
    id:          `act-ir-${r.repairId}`,
    type:        ACTIVITY_TYPE.IRRIGATION_REPAIR,
    module:      ACTIVITY_MODULE.IRRIGATION,
    title:       `${slugToTitle(r.issueType)} — ${r.area}`,
    description: r.description,
    timestamp:   new Date(r.dateCompleted ?? r.dateReported).toISOString(),
    severity:    repairSeverity(r),
    metadata: {
      status:     r.status,
      priority:   r.priority,
      area:       r.area,
      assignedTo: r.assignedTo,
      sourceId:   r.repairId,
    },
    relatedIds: [r.repairId],
  }))
}

export function buildFromMaintenanceLogs(logs = SERVICE_LOG) {
  return logs.map(l => createActivity({
    id:          `act-svc-${l.id}`,
    type:        ACTIVITY_TYPE.EQUIPMENT_SERVICE,
    module:      ACTIVITY_MODULE.EQUIPMENT,
    title:       `${l.serviceType} — ${l.equipmentName}`,
    description: l.notes || `${l.serviceType} service on ${l.equipmentName}`,
    timestamp:   new Date(l.completedDate ?? l.date).toISOString(),
    severity:    serviceSeverity(l),
    metadata: {
      status:      l.status,
      priority:    l.priority,
      technician:  l.technician,
      cost:        l.cost,
      equipmentId: l.equipmentId,
      sourceId:    l.id,
    },
    relatedIds: [l.id, l.equipmentId],
  }))
}

export function buildFromAlerts(alerts = DASHBOARD_ALERTS) {
  return alerts.map(a => createActivity({
    id:          `act-alert-${a.id}`,
    type:        ACTIVITY_TYPE.ALERT,
    module:      ACTIVITY_MODULE.ALERTS,
    title:       a.title,
    description: a.message,
    timestamp:   parseAlertDate(a.date),
    severity:    alertSeverity(a.priority),
    metadata: {
      status:      a.status,
      priority:    a.priority,
      alertModule: a.module,
      course:      a.course,
      sourceId:    a.id,
    },
    relatedIds: [a.id],
  }))
}

// ── Aggregate ─────────────────────────────────────────────────────────────────

export function aggregateAll(repairOverrides = {}, equipmentOverrides = {}) {
  const repairs = mergeRepairs(REPAIRS, repairOverrides)
  const logs    = mergeServiceLogs(SERVICE_LOG, equipmentOverrides)
  const seen = new Set()
  return [
    ...buildFromSprayRecords(),
    ...buildFromIrrigationRepairs(repairs),
    ...buildFromMaintenanceLogs(logs),
    ...buildFromAlerts(),
  ]
    .filter(a => {
      if (seen.has(a.id)) return false
      seen.add(a.id)
      return true
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}
