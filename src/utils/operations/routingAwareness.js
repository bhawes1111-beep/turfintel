// Phase 25A — Crew routing + task-execution awareness engine.
//
// Pure data transformer that complements Phase 24B's attentionEngine.
// Where the attention engine surfaces *operational* signals ("rain +
// carts open"), this layer surfaces *routing* implications scoped to
// today's calendar events ("frost risk + greens work scheduled — pivot
// crew to non-greens tasks").
//
// Output shape mirrors the Phase 22/23/24 warning model so the UI can
// render the items uniformly:
//
//   {
//     severity:    'info' | 'warn' | 'high',
//     code:        stable identifier,
//     title:       short headline,
//     detail:      one-sentence rationale,
//     quickAction?: { label, route }
//   }
//
// INFORMATIONAL ONLY. Never mutates assignments, never reschedules,
// never auto-assigns crew. Same inputs → same outputs. No I/O.

// ── Thresholds (explicit so they're easy to tune) ────────────────────────

export const ROUTING_THRESHOLDS = {
  HIGH_WIND_MPH:               15,
  RAINFALL_24H_INCH:            0.5,
  FROST_TEMP_F:                33,
  CREW_HEAVY_TASKS_PER_PERSON:  4,   // > N tasks on one operator = "heavy"
  OPERATIONAL_WINDOW_START:    '07:00',
  OPERATIONAL_WINDOW_END:      '15:00',
}

const SEV = { INFO: 'info', WARN: 'warn', HIGH: 'high' }
const SEV_ORDER = { high: 2, warn: 1, info: 0 }

// ── Surface keyword detection ───────────────────────────────────────────
//
// Calendar events carry title, location, and tags[] — we match against
// concatenated lowercase text using simple word regexes. Conservative:
// unknown phrasing simply doesn't trigger. No NLP, no fuzzy matching.

const GREENS_RE  = /\bgreens?\b|\bputting\b/i
const BUNKER_RE  = /\bbunker(?:s)?\b/i
const CLEANUP_RE = /\bclean[- ]?up\b|\bdebris\b|\bblow(?:ing)?\b/i

function eventText(ev) {
  if (!ev) return ''
  const parts = [
    ev.title,
    ev.location,
    Array.isArray(ev.tags) ? ev.tags.join(' ') : null,
  ].filter(Boolean)
  return parts.join(' ').toLowerCase()
}

function isGreensEvent(ev)        { return GREENS_RE.test(eventText(ev)) }
function isBunkerOrCleanupEvent(ev) {
  const t = eventText(ev)
  return BUNKER_RE.test(t) || CLEANUP_RE.test(t)
}
function isSprayEvent(ev) {
  return String(ev?.category ?? ev?.eventType ?? '').toLowerCase() === 'spray'
}

// ── Time helpers ─────────────────────────────────────────────────────────

function hhmmLessThan(a, b) {
  // 'HH:MM' string comparison is correct lexicographically since both
  // are zero-padded. Return false when either side is missing.
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (!/^\d{2}:\d{2}/.test(a) || !/^\d{2}:\d{2}/.test(b)) return false
  return a < b
}

// ── Detectors ────────────────────────────────────────────────────────────
//
// Each detector reads the shared `context` and returns either a single
// item or `null`. Detectors never throw; missing inputs return null.

/**
 * Frost risk + any greens work scheduled today.
 * Severity: high — walking/mowing on frosted turf damages crown tissue.
 */
function detectFrostGreensWork(ctx) {
  const temp = ctx.weatherCurrent?.currentTemp
  if (!Number.isFinite(temp) || temp > ROUTING_THRESHOLDS.FROST_TEMP_F) return null
  const greens = (ctx.calendarEventsToday ?? []).filter(isGreensEvent)
  if (greens.length === 0) return null
  return {
    severity: SEV.HIGH,
    code:     'routing-frost-greens',
    title:    `Frost risk (${Math.round(temp)}°F) with ${greens.length} greens task${greens.length === 1 ? '' : 's'} scheduled`,
    detail:   `Pivot greens crew to non-greens work (rough, equipment, shop tasks) until surface temps recover.`,
    quickAction: { label: 'Open Assignments', route: '/crew/assignments' },
  }
}

/**
 * Significant rainfall + bunker/cleanup priority work today.
 * Severity: warn — bunker washouts + post-storm cleanup usually take
 * priority over routine maintenance.
 */
function detectRainBunkerCleanup(ctx) {
  const rain = ctx.weatherCurrent?.rainfall24h
  if (!Number.isFinite(rain) || rain < ROUTING_THRESHOLDS.RAINFALL_24H_INCH) return null
  const events = (ctx.calendarEventsToday ?? []).filter(isBunkerOrCleanupEvent)
  if (events.length === 0) return null
  return {
    severity: SEV.WARN,
    code:     'routing-rain-bunker',
    title:    `${rain.toFixed(2)}″ overnight rain with ${events.length} bunker/cleanup task${events.length === 1 ? '' : 's'}`,
    detail:   `Bunker washouts and storm cleanup are likely higher-priority than the scheduled order. Consider routing crew to cleanup first.`,
    quickAction: { label: 'Open Assignments', route: '/crew/assignments' },
  }
}

/**
 * High wind + any spray operations scheduled.
 * Severity: high — drift risk. Distinct from Phase 24B's wind-spray
 * attention item; this one is framed as a routing pivot.
 */
function detectWindSprayRouting(ctx) {
  const wind = ctx.weatherCurrent?.wind
  if (!Number.isFinite(wind) || wind < ROUTING_THRESHOLDS.HIGH_WIND_MPH) return null
  const sprays = (ctx.calendarEventsToday ?? []).filter(isSprayEvent)
  if (sprays.length === 0) return null
  return {
    severity: SEV.HIGH,
    code:     'routing-wind-spray',
    title:    `Wind ${Math.round(wind)} mph — ${sprays.length} spray task${sprays.length === 1 ? '' : 's'} may need rerouting`,
    detail:   `Defer spray staff to alternate tasks (hand-water, fertilizer, repairs) until wind drops below ${ROUTING_THRESHOLDS.HIGH_WIND_MPH} mph.`,
    quickAction: { label: 'Open Sprays', route: '/spray' },
  }
}

/**
 * Equipment shortages impacting today's assigned work.
 * Severity: warn — count today's events whose equipment[] names match
 * any out-of-service equipment name.
 */
function detectEquipmentShortage(ctx) {
  const oosNames = ctx.oosEquipmentNames
  if (!Array.isArray(oosNames) || oosNames.length === 0) return null
  const oosSet = new Set(oosNames.map(n => String(n ?? '').toLowerCase()).filter(Boolean))
  if (oosSet.size === 0) return null
  let impacted = 0
  for (const ev of ctx.calendarEventsToday ?? []) {
    const list = Array.isArray(ev.equipment) ? ev.equipment : []
    for (const name of list) {
      if (oosSet.has(String(name ?? '').toLowerCase())) { impacted += 1; break }
    }
  }
  if (impacted === 0) return null
  return {
    severity: SEV.WARN,
    code:     'routing-equipment-shortage',
    title:    `${impacted} task${impacted === 1 ? '' : 's'} need equipment that's out of service`,
    detail:   `Out-of-service: ${oosNames.slice(0, 3).join(', ')}${oosNames.length > 3 ? `, +${oosNames.length - 3}` : ''}. Reassign equipment or swap to a substitute.`,
    quickAction: { label: 'Open Equipment', route: '/equipment' },
  }
}

/**
 * High-priority tasks still unassigned for today.
 * Severity: high.
 */
function detectUnassignedHighPriority(ctx) {
  const candidates = (ctx.calendarEventsToday ?? []).filter(ev => {
    if (String(ev?.priority ?? '').toLowerCase() !== 'high') return false
    const staff = Array.isArray(ev?.assignedStaff) ? ev.assignedStaff : []
    return staff.length === 0
  })
  if (candidates.length === 0) return null
  return {
    severity: SEV.HIGH,
    code:     'routing-unassigned-high-priority',
    title:    `${candidates.length} high-priority task${candidates.length === 1 ? '' : 's'} still unassigned`,
    detail:   `Assign before crew dispatch. Examples: ${candidates.slice(0, 2).map(c => c.title || 'untitled').join('; ')}${candidates.length > 2 ? '; …' : ''}.`,
    quickAction: { label: 'Open Assignments', route: '/crew/assignments' },
  }
}

/**
 * Crew imbalance — a single operator is loaded heavy while other tasks
 * remain unassigned. Severity: warn.
 *
 * Counts today's calendar events per `assignedStaff[0]` (primary
 * assignee) and finds the busiest. If their load is above the threshold
 * AND there are still unassigned events today, surface the imbalance.
 */
function detectCrewImbalance(ctx) {
  const events = ctx.calendarEventsToday ?? []
  if (events.length === 0) return null
  const tasksPer = new Map()
  let unassigned = 0
  for (const ev of events) {
    const staff = Array.isArray(ev.assignedStaff) ? ev.assignedStaff : []
    if (staff.length === 0) { unassigned += 1; continue }
    const primary = String(staff[0]).trim()
    if (!primary) continue
    tasksPer.set(primary, (tasksPer.get(primary) ?? 0) + 1)
  }
  if (unassigned === 0) return null
  let heaviestName = null
  let heaviestCount = 0
  for (const [name, count] of tasksPer) {
    if (count > heaviestCount) { heaviestCount = count; heaviestName = name }
  }
  if (heaviestCount <= ROUTING_THRESHOLDS.CREW_HEAVY_TASKS_PER_PERSON) return null
  return {
    severity: SEV.WARN,
    code:     'routing-crew-imbalance',
    title:    `${heaviestName} has ${heaviestCount} tasks while ${unassigned} task${unassigned === 1 ? '' : 's'} ${unassigned === 1 ? 'remains' : 'remain'} unassigned`,
    detail:   `Rebalance the load before morning dispatch — current allocation may delay both branches of work.`,
    quickAction: { label: 'Open Assignments', route: '/crew/assignments' },
  }
}

/**
 * Spray tasks scheduled before the operational window opens.
 * Severity: info — superintendent may want to delay until briefings done.
 */
function detectEarlySpray(ctx) {
  const sprays = (ctx.calendarEventsToday ?? [])
    .filter(isSprayEvent)
    .filter(ev => hhmmLessThan(ev.startTime, ROUTING_THRESHOLDS.OPERATIONAL_WINDOW_START))
  if (sprays.length === 0) return null
  return {
    severity: SEV.INFO,
    code:     'routing-spray-before-window',
    title:    `${sprays.length} spray task${sprays.length === 1 ? '' : 's'} scheduled before ${ROUTING_THRESHOLDS.OPERATIONAL_WINDOW_START}`,
    detail:   `Pre-window applications run before the morning briefing — confirm the operator and PPE plan ahead of time.`,
    quickAction: { label: 'Open Sprays', route: '/spray' },
  }
}

/**
 * Spray tasks scheduled after the operational window closes.
 * Severity: info — afternoon heat / drift concerns.
 */
function detectLateSpray(ctx) {
  const sprays = (ctx.calendarEventsToday ?? [])
    .filter(isSprayEvent)
    .filter(ev => hhmmLessThan(ROUTING_THRESHOLDS.OPERATIONAL_WINDOW_END, ev.startTime))
  if (sprays.length === 0) return null
  return {
    severity: SEV.INFO,
    code:     'routing-spray-after-window',
    title:    `${sprays.length} spray task${sprays.length === 1 ? '' : 's'} scheduled after ${ROUTING_THRESHOLDS.OPERATIONAL_WINDOW_END}`,
    detail:   `Late-afternoon applications run into heat and inversions — re-verify temp/wind closer to start.`,
    quickAction: { label: 'Open Sprays', route: '/spray' },
  }
}

// Detector order — used as a stable secondary sort within the same
// severity bucket so the rendered list doesn't shuffle between renders.
const DETECTORS = [
  detectFrostGreensWork,
  detectWindSprayRouting,
  detectUnassignedHighPriority,
  detectRainBunkerCleanup,
  detectEquipmentShortage,
  detectCrewImbalance,
  detectEarlySpray,
  detectLateSpray,
]

// ── Public entry ────────────────────────────────────────────────────────
//
// Input context shape (all fields optional — missing data yields fewer
// items, never an exception):
//
//   weatherCurrent:        { wind, currentTemp, rainfall24h }
//   calendarEventsToday:   [{ id, title, location, tags[], category,
//                            priority, startTime, assignedStaff[],
//                            equipment[] }, ...]
//   oosEquipmentNames:     string[]  (names of out-of-service equipment)

export function buildRoutingItems(context = {}) {
  const items = []
  for (const detect of DETECTORS) {
    const item = detect(context)
    if (item) items.push(item)
  }
  items.sort((a, b) => (SEV_ORDER[b.severity] ?? -1) - (SEV_ORDER[a.severity] ?? -1))
  return items
}

/** Roll up the highest severity present in a set of items, or null. */
export function highestRoutingSeverity(items) {
  if (!Array.isArray(items) || items.length === 0) return null
  let s = SEV.INFO
  for (const it of items) {
    if (SEV_ORDER[it.severity] > SEV_ORDER[s]) s = it.severity
    if (s === SEV.HIGH) return s
  }
  return s
}

export { SEV as ROUTING_SEVERITY }
