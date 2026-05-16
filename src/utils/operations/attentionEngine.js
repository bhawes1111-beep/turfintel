// Phase 24B — Operations: attention-rollup engine.
//
// Pure data transformer. Takes the snapshot the Daily Operations Center
// already builds from its existing stores (weather / crew / spray /
// equipment / local priorities) and returns a flat array of attention
// items the UI renders uniformly.
//
// Shape matches the Phase 22/23 warning model so the UI can reuse the
// same severity vocabulary and stripe palette:
//
//   {
//     severity: 'info' | 'warn' | 'high',
//     code:     stable identifier,
//     title:    short headline
//     detail:   one-sentence explanation
//     action?:  { label: string, route: string }   // optional deep link
//   }
//
// No React, no fetch, no I/O. Same inputs → same outputs.

// ── Thresholds (conservative, explicit) ──────────────────────────────────
//
// All thresholds live up top so they're easy to tune without spelunking
// the detectors. Each maps 1:1 to a spec bullet.

export const THRESHOLDS = {
  HIGH_WIND_MPH:           15,
  RAINFALL_24H_INCH:        0.5,
  FROST_TEMP_F:            33,
  UNASSIGNED_FRACTION:      1 / 3,   // unassigned ≥ ⌈active × 1/3⌉ → warn
}

const SEV = { INFO: 'info', WARN: 'warn', HIGH: 'high' }
const SEV_ORDER = { high: 2, warn: 1, info: 0 }

// ── Detectors ────────────────────────────────────────────────────────────
//
// Each detector reads the shared `context` and returns either a single
// attention item or `null`. Detectors never throw; missing inputs simply
// return null.

/**
 * High wind + planned sprays today.
 * Severity: high (drift risk on active spray day).
 */
function detectWindVsSpray(ctx) {
  const wind = ctx.weather?.current?.wind
  const todaySprays = ctx.spraySchedule?.todayCount ?? 0
  if (!Number.isFinite(wind) || wind < THRESHOLDS.HIGH_WIND_MPH) return null
  if (todaySprays === 0) return null
  return {
    severity: SEV.HIGH,
    code:     'wind-spray-conflict',
    title:    `Wind ${Math.round(wind)} mph with ${todaySprays} planned spray${todaySprays === 1 ? '' : 's'} today`,
    detail:   `Drift risk is elevated above ${THRESHOLDS.HIGH_WIND_MPH} mph. Reassess spray windows before dispatch.`,
    action:   { label: 'Open Sprays', route: '/spray' },
  }
}

/**
 * Significant rainfall + cart status still Open.
 * Severity: warn (turf/cart-traffic risk).
 */
function detectRainVsCarts(ctx) {
  const rain = ctx.weather?.current?.rainfall24h
  if (!Number.isFinite(rain) || rain < THRESHOLDS.RAINFALL_24H_INCH) return null
  if (ctx.cartStatus !== 'open') return null
  return {
    severity: SEV.WARN,
    code:     'rain-carts-open',
    title:    `${rain.toFixed(2)}″ of rain in last 24h with carts Open`,
    detail:   'Course conditions may warrant Cart-path only or Walking only — verify before cart dispatch.',
  }
}

/**
 * Frost-risk temperature + crew/tasks scheduled.
 * Severity: high (mowing/walking on frosted turf damages crown tissue).
 */
function detectFrostVsCrew(ctx) {
  const temp = ctx.weather?.current?.currentTemp
  const scheduled = ctx.crewSnapshot?.scheduled ?? 0
  const tasks     = ctx.crewSnapshot?.assignments ?? 0
  if (!Number.isFinite(temp) || temp > THRESHOLDS.FROST_TEMP_F) return null
  if (scheduled === 0 && tasks === 0) return null
  return {
    severity: SEV.HIGH,
    code:     'frost-crew-conflict',
    title:    `Frost risk (${Math.round(temp)}°F) with ${scheduled} crew scheduled`,
    detail:   `Walking/mowing on frosted turf damages crown tissue. Delay dispatch until surface temps recover.`,
    action:   { label: 'Open Assignments', route: '/crew/assignments' },
  }
}

/**
 * Unassigned crew count above the warn threshold.
 * Severity: warn.
 */
function detectUnassignedCrew(ctx) {
  const unassigned = ctx.crewSnapshot?.unassigned ?? 0
  const active     = ctx.crewSnapshot?.activeTotal ?? 0
  if (active <= 0) return null
  const threshold = Math.max(1, Math.ceil(active * THRESHOLDS.UNASSIGNED_FRACTION))
  if (unassigned < threshold) return null
  return {
    severity: SEV.WARN,
    code:     'unassigned-crew',
    title:    `${unassigned} of ${active} crew unassigned`,
    detail:   `Threshold is ≥ ${threshold} (1/3 of active crew). Open Assignments to slot remaining staff.`,
    action:   { label: 'Open Assignments', route: '/crew/assignments' },
  }
}

/**
 * Equipment currently out of service.
 * Severity: high.
 */
function detectOutOfService(ctx) {
  const oos = ctx.equipmentAlerts?.outOfService ?? 0
  if (oos <= 0) return null
  return {
    severity: SEV.HIGH,
    code:     'equipment-oos',
    title:    `${oos} piece${oos === 1 ? '' : 's'} of equipment out of service`,
    detail:   'Out-of-service equipment cannot be reserved. Review maintenance status before crew dispatch.',
    action:   { label: 'Open Equipment', route: '/equipment' },
  }
}

/**
 * Overdue equipment maintenance (nextServiceDate < today).
 * Severity: warn.
 */
function detectOverdueMaintenance(ctx) {
  const overdue = ctx.equipmentAlerts?.overdue ?? 0
  if (overdue <= 0) return null
  return {
    severity: SEV.WARN,
    code:     'maintenance-overdue',
    title:    `${overdue} piece${overdue === 1 ? '' : 's'} of equipment past scheduled service`,
    detail:   'Past-due service dates suggest deferred maintenance — verify safety before assignment.',
    action:   { label: 'Open Equipment', route: '/equipment' },
  }
}

/**
 * Equipment reservation conflicts (same equipment + same date with 2+ rows).
 * Severity: warn.
 */
function detectReservationConflicts(ctx) {
  const conflicts = ctx.equipmentAlerts?.conflicts ?? 0
  if (conflicts <= 0) return null
  return {
    severity: SEV.WARN,
    code:     'reservation-conflicts',
    title:    `${conflicts} equipment reservation conflict${conflicts === 1 ? '' : 's'}`,
    detail:   'Same piece of equipment reserved by two or more tasks on the same date. Resolve before dispatch.',
    action:   { label: 'Open Assignments', route: '/crew/assignments' },
  }
}

/**
 * Pending spray records (status='pending' or 'planned').
 * Severity: info — not a fire, but a tidy-up nudge.
 */
function detectPendingSprays(ctx) {
  const pending = ctx.spraySchedule?.pending ?? 0
  if (pending <= 0) return null
  return {
    severity: SEV.INFO,
    code:     'pending-sprays',
    title:    `${pending} pending spray record${pending === 1 ? '' : 's'}`,
    detail:   'Pending applications haven\'t been committed. Confirm and commit, or reschedule.',
    action:   { label: 'Open Sprays', route: '/spray' },
  }
}

/**
 * No operational priorities set for this morning.
 * Severity: info — light nudge toward intentional planning.
 */
function detectNoPriorities(ctx) {
  const count = ctx.priorityCount ?? 0
  if (count > 0) return null
  return {
    severity: SEV.INFO,
    code:     'no-priorities',
    title:    'No operational priorities set for today',
    detail:   'Add a few priorities below to anchor the morning briefing.',
  }
}

// Detector order — used as the secondary sort within the same severity
// bucket so the rendered list is stable across renders.
const DETECTORS = [
  detectWindVsSpray,
  detectFrostVsCrew,
  detectOutOfService,
  detectRainVsCarts,
  detectUnassignedCrew,
  detectOverdueMaintenance,
  detectReservationConflicts,
  detectPendingSprays,
  detectNoPriorities,
]

// ── Public entry ────────────────────────────────────────────────────────
//
// Input context shape (all fields optional — missing data yields fewer
// items, never an exception):
//
//   weather:           { current: { wind, currentTemp, rainfall24h } }
//   crewSnapshot:      { scheduled, assignments, unassigned, activeTotal }
//   spraySchedule:     { todayCount, pending }
//   equipmentAlerts:   { outOfService, overdue, conflicts }
//   cartStatus:        'open' | 'cart-path-only' | 'walking-only' | 'closed'
//   priorityCount:     number

export function buildAttentionItems(context = {}) {
  const items = []
  for (const detect of DETECTORS) {
    const item = detect(context)
    if (item) items.push(item)
  }
  // Stable sort: highest severity first, then by detector order
  // (preserved via Array.prototype.sort being stable in V8 / modern JS).
  items.sort((a, b) => (SEV_ORDER[b.severity] ?? -1) - (SEV_ORDER[a.severity] ?? -1))
  return items
}

/** Roll up the highest severity present in a set of items, or null. */
export function highestAttentionSeverity(items) {
  if (!Array.isArray(items) || items.length === 0) return null
  let s = SEV.INFO
  for (const it of items) {
    if (SEV_ORDER[it.severity] > SEV_ORDER[s]) s = it.severity
    if (s === SEV.HIGH) return s
  }
  return s
}

export { SEV as SEVERITY }
