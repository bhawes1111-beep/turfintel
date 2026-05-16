// Phase 25B — Operational timeline builder.
//
// Pure transformer that turns the Daily Operations Center's already-built
// snapshots (weather, crew, sprays, equipment, priorities, attention,
// routing) into a chronologically-sorted timeline. Deterministic — same
// inputs produce the same output, no randomness, no clock reads except
// what the caller passes in via context.
//
// INFORMATIONAL ONLY. Never schedules, never mutates anything.
//
// Timeline item shape (per Phase 25B spec):
//
//   {
//     time:       'HH:MM' (24-hour, zero-padded)
//     severity:   'info' | 'warn' | 'high'
//     category:   'weather' | 'crew' | 'spray' | 'equipment' | 'priority' | 'routing'
//     title:      short headline
//     detail:     one-sentence explanation
//     sourceCode: stable identifier for dedupe / future deep-links
//   }

// ── Constants ─────────────────────────────────────────────────────────────

export const TIMELINE_THRESHOLDS = {
  FROST_TEMP_F:        33,
  RAINFALL_24H_INCH:    0.5,
  HIGH_WIND_MPH:       15,
}

// Fixed-time anchors. Stable across renders so the timeline doesn't
// shuffle when transient data changes.
const ANCHOR_FROST_RISK         = '05:30'
const ANCHOR_RAINFALL_OVERNIGHT = '06:30'
const ANCHOR_HIGH_WIND_WINDOW   = '06:45'
const ANCHOR_CREW_DISPATCH      = '06:00'
const ANCHOR_EQUIPMENT_REVIEW   = '09:00'
const ANCHOR_PRIORITY_CHECKPT   = '11:00'
const ANCHOR_AFTERNOON_ROUTING  = '14:00'
const ANCHOR_DEFAULT_EVENT      = '08:00'

const SEV = { INFO: 'info', WARN: 'warn', HIGH: 'high' }
const SEV_ORDER = { high: 2, warn: 1, info: 0 }

// Category presentation order — used as the tertiary sort key so the
// output is fully deterministic.
const CATEGORY_ORDER = ['weather', 'routing', 'crew', 'spray', 'equipment', 'priority']

// ── Time helpers ─────────────────────────────────────────────────────────

const HHMM_RE = /^\d{2}:\d{2}$/

function normalizeHHMM(time) {
  if (typeof time !== 'string') return null
  // Accept 'HH:MM' or 'HH:MM:SS'; reject anything else.
  const m = time.match(/^(\d{2}):(\d{2})(?::\d{2})?$/)
  if (!m) return null
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10)
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

function eventStartTime(ev) {
  return normalizeHHMM(ev?.startTime) ?? ANCHOR_DEFAULT_EVENT
}

// ── Attention / routing index ────────────────────────────────────────────
//
// Build a code → severity lookup so spray + equipment timeline items can
// inherit the worst severity present in the upstream rollups. Decoupled
// from the engines themselves — we read from arrays the page already
// memoizes, never run the engines here.

function buildSeverityIndex(attentionItems, routingItems) {
  const idx = new Map()
  function add(items) {
    if (!Array.isArray(items)) return
    for (const it of items) {
      if (!it?.code) continue
      const prev = idx.get(it.code)
      if (!prev || SEV_ORDER[it.severity] > SEV_ORDER[prev]) {
        idx.set(it.code, it.severity)
      }
    }
  }
  add(attentionItems)
  add(routingItems)
  return idx
}

// Worst severity present among any of the given codes; returns null if
// none of the codes appear.
function worstSeverityFor(idx, codes) {
  if (!Array.isArray(codes)) return null
  let s = null
  for (const c of codes) {
    const v = idx.get(c)
    if (!v) continue
    if (s == null || SEV_ORDER[v] > SEV_ORDER[s]) s = v
  }
  return s
}

// ── Item builders ────────────────────────────────────────────────────────

function pushWeatherItems(out, ctx) {
  const c = ctx.weatherCurrent
  if (!c) return

  if (Number.isFinite(c.currentTemp) && c.currentTemp <= TIMELINE_THRESHOLDS.FROST_TEMP_F) {
    out.push({
      time:       ANCHOR_FROST_RISK,
      severity:   SEV.HIGH,
      category:   'weather',
      title:      `Frost risk active (${Math.round(c.currentTemp)}°F)`,
      detail:     'Surface temps below frost threshold — defer greens work until recovery.',
      sourceCode: 'timeline-frost-risk',
    })
  }
  if (Number.isFinite(c.rainfall24h) && c.rainfall24h >= TIMELINE_THRESHOLDS.RAINFALL_24H_INCH) {
    out.push({
      time:       ANCHOR_RAINFALL_OVERNIGHT,
      severity:   SEV.WARN,
      category:   'weather',
      title:      `${c.rainfall24h.toFixed(2)}″ rainfall overnight`,
      detail:     'Verify cart status and bunker cleanup priority before dispatch.',
      sourceCode: 'timeline-rainfall',
    })
  }
  if (Number.isFinite(c.wind) && c.wind >= TIMELINE_THRESHOLDS.HIGH_WIND_MPH) {
    out.push({
      time:       ANCHOR_HIGH_WIND_WINDOW,
      severity:   SEV.HIGH,
      category:   'weather',
      title:      `High-wind window (${Math.round(c.wind)} mph)`,
      detail:     'Drift risk elevated — reassess any spray operations before start.',
      sourceCode: 'timeline-high-wind',
    })
  }
}

function pushDispatchCheckpoint(out, ctx) {
  // The dispatch checkpoint always renders. Severity bumps when an
  // attention-level signal exists for the morning (frost / crew /
  // equipment OOS / unassigned high-priority).
  const escalations = [
    'frost-crew-conflict',
    'unassigned-crew',
    'equipment-oos',
    'routing-unassigned-high-priority',
    'routing-frost-greens',
  ]
  const sev = worstSeverityFor(ctx.severityIndex, escalations) ?? SEV.INFO

  // Build a compact detail enumerating which signals are present.
  const present = []
  if (ctx.severityIndex.has('frost-crew-conflict') || ctx.severityIndex.has('routing-frost-greens')) present.push('frost')
  if (ctx.severityIndex.has('unassigned-crew')) present.push('unassigned crew')
  if (ctx.severityIndex.has('equipment-oos'))   present.push('equipment OOS')
  if (ctx.severityIndex.has('routing-unassigned-high-priority')) present.push('high-priority unassigned')
  const tag = present.length > 0 ? ` · open issues: ${present.join(', ')}` : ''

  out.push({
    time:       ANCHOR_CREW_DISPATCH,
    severity:   sev,
    category:   'crew',
    title:      'Crew dispatch review',
    detail:     `Confirm assignments, weather, and equipment before crew leaves the shop.${tag}`,
    sourceCode: 'timeline-dispatch-review',
  })
}

function pushSprayItems(out, ctx) {
  const sprays = (ctx.calendarEventsToday ?? []).filter(ev => {
    return String(ev?.category ?? ev?.eventType ?? '').toLowerCase() === 'spray'
  })
  if (sprays.length === 0) return

  // Severity inherits from any wind-related attention/routing signal.
  const sprayCodes = ['wind-spray-conflict', 'routing-wind-spray']
  const inheritedSeverity = worstSeverityFor(ctx.severityIndex, sprayCodes) ?? SEV.INFO

  for (const ev of sprays) {
    const t = eventStartTime(ev)
    const title = ev.title?.trim()
      ? `Spray event: ${ev.title.trim()}`
      : 'Spray event scheduled'
    out.push({
      time:       t,
      severity:   inheritedSeverity,
      category:   'spray',
      title,
      detail:     ev.location?.trim()
        ? `Location: ${ev.location}.`
        : 'Confirm wind, REI, and operator before dispatch.',
      sourceCode: `timeline-spray:${ev.id ?? t}`,
    })
  }
}

function pushHighPriorityEvents(out, ctx) {
  // Calendar events flagged priority='high' get a timeline anchor so they
  // surface even when their category isn't otherwise tracked.
  const highPri = (ctx.calendarEventsToday ?? []).filter(ev => {
    return String(ev?.priority ?? '').toLowerCase() === 'high'
  })
  if (highPri.length === 0) return

  for (const ev of highPri) {
    const t = eventStartTime(ev)
    const staff = Array.isArray(ev.assignedStaff) ? ev.assignedStaff : []
    const unassigned = staff.length === 0
    out.push({
      time:       t,
      severity:   unassigned ? SEV.HIGH : SEV.WARN,
      category:   ev.category === 'spray' ? 'spray' : 'crew',
      title:      `High-priority: ${ev.title?.trim() || 'task'}`,
      detail:     unassigned
        ? 'No staffer assigned — confirm before dispatch.'
        : `Assigned: ${staff.join(', ')}.`,
      sourceCode: `timeline-priority-event:${ev.id ?? t}`,
    })
  }
}

function pushEquipmentReview(out, ctx) {
  const oos       = ctx.equipmentAlerts?.outOfService ?? 0
  const overdue   = ctx.equipmentAlerts?.overdue ?? 0
  const conflicts = ctx.equipmentAlerts?.conflicts ?? 0
  if (oos === 0 && overdue === 0 && conflicts === 0) return

  // Severity scales with what's actually flagged.
  let sev = SEV.INFO
  if (oos > 0)        sev = SEV.HIGH
  else if (overdue > 0 || conflicts > 0) sev = SEV.WARN

  const parts = []
  if (oos > 0)       parts.push(`${oos} out of service`)
  if (overdue > 0)   parts.push(`${overdue} overdue`)
  if (conflicts > 0) parts.push(`${conflicts} reservation conflict${conflicts === 1 ? '' : 's'}`)

  out.push({
    time:       ANCHOR_EQUIPMENT_REVIEW,
    severity:   sev,
    category:   'equipment',
    title:      'Equipment review',
    detail:     `Pre-noon check: ${parts.join(' · ')}.`,
    sourceCode: 'timeline-equipment-review',
  })
}

function pushPriorityCheckpoint(out, ctx) {
  const priorities = Array.isArray(ctx.priorities) ? ctx.priorities : []
  // Only emit when there ARE priorities — the absence of priorities is
  // already surfaced by the attention engine ('no-priorities').
  if (priorities.length === 0) return
  const open = priorities.filter(p => p && !p.done).length
  const done = priorities.length - open
  out.push({
    time:       ANCHOR_PRIORITY_CHECKPT,
    severity:   SEV.INFO,
    category:   'priority',
    title:      'Priority checkpoint',
    detail:     `Mid-day check: ${done} of ${priorities.length} priorit${priorities.length === 1 ? 'y' : 'ies'} complete${open > 0 ? `, ${open} open` : ''}.`,
    sourceCode: 'timeline-priority-checkpoint',
  })
}

function pushAfternoonRouting(out, ctx) {
  // Only emit when routing items actually exist — the afternoon review
  // is a beacon for "something to re-verify"; with nothing flagged it
  // would be noise.
  const routingCount = Array.isArray(ctx.routingItems) ? ctx.routingItems.length : 0
  if (routingCount === 0) return
  // Severity tracks the worst routing item present.
  let sev = SEV.INFO
  for (const it of ctx.routingItems) {
    if (SEV_ORDER[it.severity] > SEV_ORDER[sev]) sev = it.severity
  }
  out.push({
    time:       ANCHOR_AFTERNOON_ROUTING,
    severity:   sev,
    category:   'routing',
    title:      'Afternoon routing review',
    detail:     `Re-verify ${routingCount} routing impact${routingCount === 1 ? '' : 's'} flagged this morning — weather, equipment, crew load.`,
    sourceCode: 'timeline-afternoon-routing',
  })
}

// ── Public entry ────────────────────────────────────────────────────────

/**
 * Build the operational timeline from already-derived snapshots.
 *
 * Input context (all fields optional):
 *   weatherCurrent:        { wind, currentTemp, rainfall24h }
 *   calendarEventsToday:   [{ id, title, category|eventType, priority,
 *                            startTime, location, assignedStaff[] }]
 *   equipmentAlerts:       { outOfService, overdue, conflicts }
 *   priorities:            [{ id, text, done }]
 *   attentionItems:        [{ severity, code, ... }]   (Phase 24B)
 *   routingItems:          [{ severity, code, ... }]   (Phase 25A)
 *
 * Returns a chronologically-sorted array of timeline items. Stable sort:
 * primary by time, secondary by severity descending, tertiary by
 * category presentation order.
 */
export function buildOperationalTimeline(context = {}) {
  const severityIndex = buildSeverityIndex(
    context.attentionItems,
    context.routingItems,
  )
  const ctx = { ...context, severityIndex }
  const out = []

  pushWeatherItems(out, ctx)
  pushDispatchCheckpoint(out, ctx)
  pushSprayItems(out, ctx)
  pushHighPriorityEvents(out, ctx)
  pushEquipmentReview(out, ctx)
  pushPriorityCheckpoint(out, ctx)
  pushAfternoonRouting(out, ctx)

  out.sort((a, b) => {
    if (a.time !== b.time) return a.time < b.time ? -1 : 1
    const sev = (SEV_ORDER[b.severity] ?? -1) - (SEV_ORDER[a.severity] ?? -1)
    if (sev !== 0) return sev
    const ca = CATEGORY_ORDER.indexOf(a.category)
    const cb = CATEGORY_ORDER.indexOf(b.category)
    return (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb)
  })

  return out
}

export { SEV as TIMELINE_SEVERITY, CATEGORY_ORDER }
