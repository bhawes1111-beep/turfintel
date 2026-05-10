import { REPAIRS }               from '../../data/irrigation'
import { mergeRepairs }          from '../operations/repairUtils'
import { SEVERITY_ORDER }        from './severity'
// Phase 5.1a — equipment + serviceLog are passed in by the React caller.

// Reference date anchored to the demo data era (2026-05-09).
// In production with live data, replace with: new Date()
const REF = new Date('2026-05-09T00:00:00')

function daysUntil(dateStr) {
  return Math.ceil((new Date(dateStr) - REF) / 86_400_000)
}

function daysSince(dateStr) {
  return Math.floor((REF - new Date(dateStr)) / 86_400_000)
}

function formatDaysAway(days) {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

function pluralize(n, word) {
  return `${n} ${word}${n !== 1 ? 's' : ''}`
}

function bySeverity(a, b) {
  return (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
}

// ── Equipment awareness ───────────────────────────────────────────────────────

function equipmentItems(mergedLogs, equipment) {
  const items = []

  const overdue = mergedLogs.filter(l => l.status === 'overdue')
  if (overdue.length > 0) {
    items.push({
      id:       'eq-overdue',
      icon:     '⚙️',
      text:     `${pluralize(overdue.length, 'service item')} overdue — schedule immediately`,
      severity: 'critical',
      route:    '/equipment',
    })
  }

  const criticalOpen = mergedLogs.filter(l => l.status === 'open' && l.priority === 'critical')
  if (criticalOpen.length > 0) {
    items.push({
      id:       'eq-critical-open',
      icon:     '⚙️',
      text:     `${pluralize(criticalOpen.length, 'critical service item')} awaiting parts or repair`,
      severity: 'warning',
      route:    '/equipment',
    })
  }

  // Equipment within 25 operating hours of next service threshold
  const approaching = equipment.filter(eq => {
    if (!eq.nextServiceHours || eq.status === 'out-of-service') return false
    const rem = eq.nextServiceHours - eq.hours
    return rem > 0 && rem <= 25
  })
  if (approaching.length > 0) {
    const names = approaching.map(e => e.name).join(', ')
    items.push({
      id:       'eq-threshold',
      icon:     '⚙️',
      text:     `${pluralize(approaching.length, 'unit')} within 25 hrs of service threshold — ${names}`,
      severity: 'caution',
      route:    '/equipment',
    })
  }

  return items.sort(bySeverity)
}

// ── Irrigation awareness ──────────────────────────────────────────────────────

function irrigationItems(mergedRepairs) {
  const items = []
  const open = mergedRepairs.filter(r => r.status !== 'completed')

  // High-priority repairs open for 1+ days
  const staleHigh = open.filter(r => r.priority === 'high' && daysSince(r.dateReported) >= 1)
  if (staleHigh.length > 0) {
    items.push({
      id:       'ir-stale-high',
      icon:     '💧',
      text:     `${pluralize(staleHigh.length, 'high-priority repair')} open 1+ days without resolution`,
      severity: 'warning',
      route:    '/irrigation',
    })
  }

  // Repairs blocked waiting on parts
  const partsBlocked = open.filter(r => r.status === 'parts-needed')
  if (partsBlocked.length > 0) {
    items.push({
      id:       'ir-parts',
      icon:     '💧',
      text:     `${pluralize(partsBlocked.length, 'repair')} blocked — parts not yet received`,
      severity: 'caution',
      route:    '/irrigation',
    })
  }

  return items.sort(bySeverity)
}

// ── Spray awareness ───────────────────────────────────────────────────────────

function sprayItems(calendarEvents) {
  const items = []

  const upcoming = calendarEvents.filter(e => {
    if (e.category !== 'spray' || e.status !== 'scheduled') return false
    const d = daysUntil(e.date)
    return d >= 0 && d <= 7
  })

  const imminent  = upcoming.filter(e => daysUntil(e.date) <= 2)
  const laterWeek = upcoming.filter(e => daysUntil(e.date) > 2)

  if (imminent.length > 0) {
    const label = imminent.length === 1 ? `"${imminent[0].title}"` : pluralize(imminent.length, 'spray application')
    items.push({
      id:       'spray-imminent',
      icon:     '🌿',
      text:     `${label} within 48 hours — verify weather window`,
      severity: 'warning',
      route:    '/spray',
    })
  }

  if (laterWeek.length > 0) {
    items.push({
      id:       'spray-week',
      icon:     '🌿',
      text:     `${pluralize(laterWeek.length, 'spray application')} scheduled later this week`,
      severity: 'info',
      route:    '/spray',
    })
  }

  return items.sort(bySeverity)
}

// ── Scheduling awareness ──────────────────────────────────────────────────────

function schedulingItems(calendarEvents) {
  const items = []
  const notDone = calendarEvents.filter(e => e.status !== 'completed')

  // High-priority events within 48 hours
  const imminentHigh = notDone.filter(e => {
    const d = daysUntil(e.date)
    return d >= 0 && d <= 2 && (e.priority === 'high' || e.priority === 'critical')
  })
  if (imminentHigh.length > 0) {
    const label = imminentHigh.length === 1
      ? `"${imminentHigh[0].title}"`
      : pluralize(imminentHigh.length, 'high-priority event')
    items.push({
      id:       'sched-imminent-high',
      icon:     '📅',
      text:     `${label} within 48 hours`,
      severity: 'warning',
      route:    '/dashboard',
    })
  }

  // Course closures within 7 days — deduplicated by date
  const seenClosureDates = new Set()
  const closures = notDone
    .filter(e => {
      const d = daysUntil(e.date)
      if (d < 0 || d > 7) return false
      if (!(e.notes || '').toLowerCase().includes('course closed')) return false
      if (seenClosureDates.has(e.date)) return false
      seenClosureDates.add(e.date)
      return true
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  if (closures.length > 0) {
    const first  = closures[0]
    const dFirst = daysUntil(first.date)
    items.push({
      id:       'sched-closure',
      icon:     '🚫',
      text:     `Course closure ${formatDaysAway(dFirst)} — ${first.title}`,
      severity: dFirst <= 1 ? 'warning' : 'caution',
      route:    '/dashboard',
    })
  }

  // Full crew deployment (4+ unique staff on same date within 7 days)
  const staffByDate = {}
  notDone
    .filter(e => {
      const d = daysUntil(e.date)
      return d >= 0 && d <= 7 && e.assignedStaff.length > 0
    })
    .forEach(e => {
      if (!staffByDate[e.date]) staffByDate[e.date] = new Set()
      e.assignedStaff.forEach(s => staffByDate[e.date].add(s))
    })

  const heavyDays = Object.entries(staffByDate)
    .filter(([, s]) => s.size >= 4)
    .map(([date, s]) => ({ date, count: s.size }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  if (heavyDays.length > 0) {
    const hd = heavyDays[0]
    const d  = daysUntil(hd.date)
    items.push({
      id:       'sched-crew-load',
      icon:     '👥',
      text:     `Full crew deployment ${formatDaysAway(d)} — ${hd.count} staff across all events`,
      severity: 'caution',
      route:    '/dashboard',
    })
  }

  return items.sort(bySeverity)
}

// ── Public API ────────────────────────────────────────────────────────────────

// Phase 5.1a — accept equipment + serviceLog as parameters (server-of-truth
// from equipmentStore). repairOverrides remains until the Repairs vertical
// migrates.
export function buildAwarenessGroups(state, { equipment = [], serviceLog = [], repairOverrides = {} } = {}) {
  const mergedRepairs = mergeRepairs(REPAIRS, repairOverrides)
  const calEvents     = state.calendarEvents || []

  return [
    { id: 'equipment',  label: 'Equipment',            icon: '⚙️', items: equipmentItems(serviceLog, equipment) },
    { id: 'irrigation', label: 'Irrigation',            icon: '💧', items: irrigationItems(mergedRepairs)        },
    { id: 'spray',      label: 'Spray & Applications',  icon: '🌿', items: sprayItems(calEvents)                 },
    { id: 'scheduling', label: 'Scheduling',             icon: '📅', items: schedulingItems(calEvents)            },
  ].filter(g => g.items.length > 0)
}
