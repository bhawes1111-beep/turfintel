// Phase 29 — Operational Command Layer.
//
// Pure-function compose layer that integrates the already-built
// intelligence outputs (Phase 28A agronomic, 28B spray window, 28C
// irrigation) plus calendar / sprays / equipment / crew / weather and
// emits a single prioritized, severity-ordered command surface for the
// top-of-dashboard panel.
//
// Operational rules (strictly):
//   - No autonomous task creation. No autonomous scheduling.
//   - Every priority carries a `why` string built from the underlying
//     numeric inputs.
//   - When a subsystem has no data, its rows surface as
//     `kind: 'unknown'` rather than fabricated alarms.
//   - Severity vocabulary maps to the canonical 5-level model in
//     src/utils/intelligence/severity.js — no parallel vocabulary.
//
// Same pattern as agronomicIntelligence.js, sprayWindowIntel.js,
// irrigationIntel.js: no React, no fetching, no global state.

import { SEVERITY } from '../intelligence/severity.js'

// ── Time / date helpers ───────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000
const DAY_MS  = 24 * HOUR_MS

function toMs(value) {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : null
  }
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

// Returns YYYY-MM-DD at the spray-record level.
function sprayDate(s) {
  return typeof s?.date === 'string' ? s.date.slice(0, 10) : null
}

// Combine spray date + endTime/startTime → epoch ms.
function sprayStartMs(spray) {
  if (!spray?.date) return null
  const time = spray.startTime || spray.endTime || '00:00'
  const ms = Date.parse(`${spray.date}T${time}:00`)
  return Number.isFinite(ms) ? ms : null
}

function sprayEndMs(spray) {
  if (!spray?.date) return null
  const time = spray.endTime || spray.startTime || '23:59'
  const ms = Date.parse(`${spray.date}T${time}:00`)
  return Number.isFinite(ms) ? ms : null
}

// ── Priority shape + helpers ──────────────────────────────────────────────
//
// Each priority is { id, severity, sourceSystem, title, why,
//                    recommendedAction?, route?, _score }.
// `_score` is the internal tiebreaker — lower = higher priority.

const SEVERITY_RANK = {
  [SEVERITY.CRITICAL]: 0,
  [SEVERITY.WARNING]:  1,
  [SEVERITY.CAUTION]:  2,
  [SEVERITY.INFO]:     3,
  [SEVERITY.GOOD]:     4,
}

function makePriority({ id, severity, sourceSystem, title, why, recommendedAction = null, route = null, _scoreOffset = 0 }) {
  return {
    id,
    severity,
    sourceSystem,
    title,
    why,
    recommendedAction,
    route,
    _score: (SEVERITY_RANK[severity] ?? 9) * 10 + _scoreOffset,
  }
}

// ── Subsystem priority builders ───────────────────────────────────────────
// Each builder returns an array of priorities (possibly empty). All
// inputs are optional — missing inputs return [] without complaint.

// 1. Spray-window vs planned spray today.
function buildSprayWindowPriorities({ sprayWindow, sprays, now }) {
  const out = []
  if (!sprayWindow) return out
  const today = isoDate(now)
  const plannedToday = (sprays ?? []).filter(s =>
    sprayDate(s) === today && s.status !== 'cancelled' && s.status !== 'completed',
  )
  if (plannedToday.length === 0) return out

  for (const s of plannedToday) {
    const name = s.applicationName || s.products?.[0]?.name || 'planned spray'
    const area = s.area ? ` on ${s.area}` : ''
    if (sprayWindow.current?.rating === 'poor') {
      const topReason = sprayWindow.current.reasons?.[0]?.why ?? 'multiple axes outside ideal range'
      out.push(makePriority({
        id: `spraywindow-poor-${s.id}`,
        severity: SEVERITY.WARNING,
        sourceSystem: 'spray-window',
        title: `Spray window POOR — ${name}${area} planned today`,
        why: `Current rating poor: ${topReason}`,
        recommendedAction: 'Consider delaying — review Spray Window card',
        route: '/spray',
      }))
    } else if (sprayWindow.current?.rating === 'caution') {
      const topReason = sprayWindow.current.reasons?.[0]?.why ?? 'one axis outside ideal range'
      out.push(makePriority({
        id: `spraywindow-caution-${s.id}`,
        severity: SEVERITY.CAUTION,
        sourceSystem: 'spray-window',
        title: `Spray window CAUTION — ${name}${area} planned today`,
        why: topReason,
        recommendedAction: 'Confirm conditions before mixing',
        route: '/spray',
      }))
    }
    // Rain risk that already exists in sprayWindow.rainRisks — surface it
    // as its own priority so the user doesn't have to open the card.
    const matchingRain = (sprayWindow.rainRisks ?? []).find(r => r.sprayId === s.id)
    if (matchingRain) {
      const firstItem = matchingRain.items?.[0]
      if (firstItem) {
        out.push(makePriority({
          id: `rainfast-${s.id}`,
          severity: SEVERITY.WARNING,
          sourceSystem: 'spray-window',
          title: `Forecast rain threatens ${firstItem.productName} rainfast window`,
          why: firstItem.why,
          recommendedAction: 'Confirm spray ends >' + firstItem.rainfastHours + 'h before rainfall begins',
          route: '/spray',
        }))
      }
    }
  }
  return out
}

// 2. Agronomic — active REI, group rotation conflicts vs. planned spray today.
function buildAgronomicPriorities({ agronomic, sprays, labelsByItemId, now }) {
  const out = []
  if (!agronomic) return out
  const today = isoDate(now)

  // Active REI windows in effect right now.
  for (const r of agronomic.activeREI ?? []) {
    if (r.endsAt <= now) continue
    const hoursLeft = Math.max(0, Math.round(r.hoursRemaining))
    out.push(makePriority({
      id: `rei-${r.sprayId}`,
      severity: hoursLeft <= 1 ? SEVERITY.CAUTION : SEVERITY.WARNING,
      sourceSystem: 'agronomic',
      title: `REI active${r.area ? ` on ${r.area}` : ''} — ${hoursLeft}h remaining`,
      why: r.why,
      recommendedAction: hoursLeft > 0 ? 'No early entry without PPE' : null,
      route: '/spray',
    }))
  }

  // Group-rotation HIGH severity, if planning to spray that group today.
  const plannedToday = (sprays ?? []).filter(s => sprayDate(s) === today)
  if (plannedToday.length > 0) {
    const codesToday = new Set()
    for (const s of plannedToday) {
      for (const p of s.products ?? []) {
        const label = p.inventoryItemId ? labelsByItemId?.[p.inventoryItemId] : null
        if (!label) continue
        for (const key of ['fracGroup', 'hracGroup', 'iracGroup']) {
          const raw = label[key]
          if (typeof raw === 'string' && raw.trim()) {
            for (const code of raw.split(/[,/\s]+/).filter(Boolean)) {
              codesToday.add(`${key.toUpperCase().slice(0,4)}-${code.toUpperCase()}`)
            }
          }
        }
      }
    }
    for (const w of agronomic.groupRotation ?? []) {
      const key = `${w.type}-${String(w.code).toUpperCase()}`
      if (codesToday.has(key)) {
        out.push(makePriority({
          id: `rotation-${w.type}-${w.code}-${w.area ?? 'any'}`,
          severity: w.severity === 'high' ? SEVERITY.WARNING : SEVERITY.CAUTION,
          sourceSystem: 'agronomic',
          title: `Planned spray extends ${w.type} ${w.code} rotation${w.area ? ` on ${w.area}` : ''}`,
          why: w.why,
          recommendedAction: 'Consider a rotation partner — review Agronomic Intelligence',
          route: '/spray',
        }))
      }
    }
  }
  return out
}

// 3. Irrigation — saturation, overlap, deficit building, wilt high.
function buildIrrigationPriorities({ irrigation }) {
  const out = []
  if (!irrigation) return out
  if (irrigation.saturation) {
    out.push(makePriority({
      id: 'irrigation-saturation',
      severity: SEVERITY.WARNING,
      sourceSystem: 'irrigation',
      title: 'Soil saturation — hold irrigation cycles',
      why: irrigation.saturation.message ?? 'Recent heavy rainfall',
      recommendedAction: irrigation.saturation.recommendedAction ?? null,
      route: '/irrigation',
    }))
  }
  if (irrigation.overlap) {
    out.push(makePriority({
      id: 'irrigation-overlap',
      severity: SEVERITY.CAUTION,
      sourceSystem: 'irrigation',
      title: 'Irrigation overlap risk tonight',
      why: irrigation.overlap.why,
      recommendedAction: 'Reduce or skip tonight\'s cycle',
      route: '/irrigation',
    }))
  }
  if (irrigation.consecutive?.kind === 'known' &&
      irrigation.consecutive.streakDays >= 3) {
    out.push(makePriority({
      id: 'irrigation-deficit',
      severity: SEVERITY.CAUTION,
      sourceSystem: 'irrigation',
      title: `Deficit building — ${irrigation.consecutive.streakDays} consecutive days`,
      why: irrigation.consecutive.why,
      route: '/irrigation',
    }))
  }
  if (irrigation.wilt?.rating === 'high') {
    out.push(makePriority({
      id: 'irrigation-wilt-high',
      severity: SEVERITY.WARNING,
      sourceSystem: 'irrigation',
      title: 'Elevated afternoon wilt risk',
      why: irrigation.wilt.why,
      recommendedAction: 'Stage syringe equipment for midday',
      route: '/irrigation',
    }))
  } else if (irrigation.wilt?.rating === 'elevated') {
    out.push(makePriority({
      id: 'irrigation-wilt-elevated',
      severity: SEVERITY.CAUTION,
      sourceSystem: 'irrigation',
      title: 'Possible afternoon wilt — monitor',
      why: irrigation.wilt.why,
      route: '/irrigation',
    }))
  }
  return out
}

// 4. Weather/operations — frost, soaking rainfall, runoff-risk.
function buildWeatherPriorities({ weather, irrigation }) {
  const out = []
  if (!weather) return out
  const todayDay = weather.forecast?.[0]
  if (todayDay?.low != null && todayDay.low <= 36) {
    out.push(makePriority({
      id: 'weather-frost',
      severity: todayDay.low <= 32 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
      sourceSystem: 'weather',
      title: `Frost risk — low ${todayDay.low}°F`,
      why: `Forecast low ${todayDay.low}°F${todayDay.low <= 32 ? ' (freezing)' : ' (near-freezing)'}`,
      recommendedAction: 'Delay mowing until dew/frost lifts',
      route: '/dashboard',
    }))
  }

  // Cart restriction suggestion when 24h rainfall is soaking/runoff.
  const rainClass = irrigation?.rainfall24hClass
  if (rainClass?.category === 'soaking' || rainClass?.category === 'runoffRisk') {
    out.push(makePriority({
      id: 'weather-cart-restrict',
      severity: rainClass.category === 'runoffRisk' ? SEVERITY.WARNING : SEVERITY.CAUTION,
      sourceSystem: 'weather',
      title: `Cart restriction recommended (${rainClass.category === 'runoffRisk' ? 'runoff risk' : 'soaking'})`,
      why: rainClass.why,
      recommendedAction: 'Path-only carts; reassess after surface firms',
      route: '/dashboard',
    }))
  }

  // Forecast rain >0.5" today/tonight → ops impact.
  if (todayDay?.rainfall != null && todayDay.rainfall >= 0.5) {
    out.push(makePriority({
      id: 'weather-rain-ops',
      severity: SEVERITY.CAUTION,
      sourceSystem: 'weather',
      title: `Heavy rainfall forecast — ${todayDay.rainfall.toFixed(2)}"`,
      why: `Rainfall likely impacts bunker prep, fairway mowing, and routing`,
      recommendedAction: 'Reprioritize indoor tasks; pre-stage drainage equipment',
      route: '/dashboard',
    }))
  }
  return out
}

// 5. Cross-system: spray planned today × forecast rain.
function buildSprayRainConflict({ sprays, weather, now }) {
  const out = []
  if (!weather || !sprays) return out
  const today = isoDate(now)
  const plannedToday = sprays.filter(s =>
    sprayDate(s) === today && s.status !== 'cancelled' && s.status !== 'completed',
  )
  const rain = weather.forecast?.[0]?.rainfall ?? 0
  if (plannedToday.length === 0 || rain < 0.15) return out
  // One combined priority per area (or one if no area).
  const byArea = new Map()
  for (const s of plannedToday) {
    const key = s.area ?? '__none__'
    if (!byArea.has(key)) byArea.set(key, [])
    byArea.get(key).push(s)
  }
  for (const [area, list] of byArea) {
    const areaLabel = area === '__none__' ? '' : ` on ${area}`
    out.push(makePriority({
      id: `sprayrain-${area}`,
      severity: SEVERITY.WARNING,
      sourceSystem: 'cross',
      title: `Rain risk threatens planned spray window${areaLabel}`,
      why: `${list.length} planned spray${list.length === 1 ? '' : 's'} today + ${rain.toFixed(2)}" forecast rain`,
      recommendedAction: 'Move up the application or postpone',
      route: '/spray',
    }))
  }
  return out
}

// 6. Calendar × weather (mowing/bunker prep vs. heavy rain).
function buildCalendarWeatherConflict({ calendarEvents, weather, now }) {
  const out = []
  if (!Array.isArray(calendarEvents) || calendarEvents.length === 0) return out
  if (!weather) return out
  const today = isoDate(now)
  const rain = weather.forecast?.[0]?.rainfall ?? 0
  if (rain < 0.5) return out
  // Calendar events today whose category looks rain-sensitive.
  const sensitive = /mow|bunker|topdress|aer|verticut|sand/i
  for (const ev of calendarEvents) {
    if (!ev?.date) continue
    if (ev.date.slice(0, 10) !== today) continue
    if (ev.status === 'cancelled' || ev.status === 'completed') continue
    const blob = `${ev.title || ''} ${ev.category || ''} ${ev.type || ''}`
    if (!sensitive.test(blob)) continue
    out.push(makePriority({
      id: `calrain-${ev.id}`,
      severity: SEVERITY.CAUTION,
      sourceSystem: 'cross',
      title: `Heavy rainfall may delay ${ev.title || ev.category || 'planned task'}`,
      why: `${rain.toFixed(2)}" forecast today vs. ${ev.title || ev.category || 'task'} scheduled`,
      route: '/dashboard',
    }))
  }
  return out
}

// Build an index of calendarEventId → ISO date for assignment/
// reservation lookups. Real-world TurfIntel data links assignments
// and reservations to calendar events via calendarEventId rather
// than carrying a date field. When the calendar isn't loaded the
// index is empty and the dependent builders honestly emit nothing.
function buildEventDateIndex(calendarEvents) {
  const idx = new Map()
  for (const ev of calendarEvents ?? []) {
    if (ev?.id && typeof ev.date === 'string') {
      idx.set(ev.id, ev.date.slice(0, 10))
    }
  }
  return idx
}

// 7. Equipment — double-booked reservations today.
// Date is resolved via the linked calendar event (assignments do not
// carry a date field). If the calendar isn't loaded, all reservations
// fall through to a `date` / `start_date` fallback (test-friendly) and
// otherwise the builder honestly emits nothing.
function buildEquipmentPriorities({ equipmentReservations, eventDateById, now }) {
  const out = []
  if (!Array.isArray(equipmentReservations) || equipmentReservations.length === 0) return out
  const today = isoDate(now)
  const todayRes = equipmentReservations.filter(r => {
    if (!r) return false
    const linkedDate = r.calendarEventId ? eventDateById.get(r.calendarEventId) : null
    const fallbackDate = r.date || r.start_date || r.startDate
    const dateStr = linkedDate || fallbackDate
    return typeof dateStr === 'string' && dateStr.slice(0, 10) === today
  })
  // Group by equipmentId; flag any equipmentId reserved by 2+ assignments today.
  const byEquip = new Map()
  for (const r of todayRes) {
    const eq = r.equipmentId || r.equipment_id
    if (!eq) continue
    if (!byEquip.has(eq)) byEquip.set(eq, [])
    byEquip.get(eq).push(r)
  }
  for (const [eq, list] of byEquip) {
    if (list.length < 2) continue
    out.push(makePriority({
      id: `equipdouble-${eq}`,
      severity: SEVERITY.WARNING,
      sourceSystem: 'equipment',
      title: `Equipment double-booked today (${list.length} reservations)`,
      why: `${list.length} reservations on the same unit (id ${eq})`,
      recommendedAction: 'Reassign or stagger reservation times',
      route: '/equipment',
    }))
  }
  return out
}

// 8. Crew / labor — load awareness when assignments exist.
// Date is resolved via the linked calendar event (see above).
function buildCrewPriorities({ crewAssignments, eventDateById, now }) {
  const out = []
  if (!Array.isArray(crewAssignments) || crewAssignments.length === 0) return out
  const today = isoDate(now)
  const todayAssign = crewAssignments.filter(a => {
    if (!a) return false
    const linkedDate = a.calendarEventId ? eventDateById.get(a.calendarEventId) : null
    const fallbackDate = a.date || a.start_date || a.startDate
    const dateStr = linkedDate || fallbackDate
    return typeof dateStr === 'string' && dateStr.slice(0, 10) === today
  })
  if (todayAssign.length === 0) return out
  // Count assignments per employee to find anyone clearly over-assigned.
  const byEmp = new Map()
  for (const a of todayAssign) {
    const emp = a.employeeId || a.employee_id || a.crewEmployeeId
    if (!emp) continue
    byEmp.set(emp, (byEmp.get(emp) ?? 0) + 1)
  }
  for (const [emp, count] of byEmp) {
    if (count >= 4) {
      out.push(makePriority({
        id: `crewload-${emp}`,
        severity: SEVERITY.CAUTION,
        sourceSystem: 'crew',
        title: `Heavy assignment load (${count} tasks)`,
        why: `Employee ${emp} has ${count} assignments today`,
        recommendedAction: 'Rebalance assignments',
        route: '/dashboard',
      }))
    }
  }
  return out
}

// ── Morning Readiness summary ─────────────────────────────────────────────
// Compact capsule for the panel header. Each field is null when its
// inputs are missing.

export function computeMorningReadiness({ weather, sprayWindow, irrigation, crewAssignments, sprays, calendarEvents, now }) {
  const today = isoDate(now)
  const todayDay = weather?.forecast?.[0]
  const frostRisk = todayDay?.low != null && todayDay.low <= 36
    ? (todayDay.low <= 32 ? 'critical' : 'warning')
    : null
  const heavyRain = todayDay?.rainfall != null && todayDay.rainfall >= 0.5

  // Mowing pressure: dew spread + frost + rain
  let mowing = 'normal'
  if (frostRisk) mowing = 'delayed'
  else if (heavyRain) mowing = 'delayed'

  // Spray viability: from Phase 28B
  let spray = 'unknown'
  if (sprayWindow?.current?.rating === 'ideal' || sprayWindow?.current?.rating === 'acceptable') spray = 'favorable'
  else if (sprayWindow?.current?.rating === 'caution') spray = 'caution'
  else if (sprayWindow?.current?.rating === 'poor') spray = 'poor'

  // Irrigation pressure: from Phase 28C — high if wilt elevated/high or deficit ≥3d
  let irrigationPressure = 'normal'
  if (irrigation?.wilt?.rating === 'high' ||
      (irrigation?.consecutive?.kind === 'known' && irrigation.consecutive.streakDays >= 3)) {
    irrigationPressure = 'elevated'
  } else if (irrigation?.wilt?.rating === 'elevated') {
    irrigationPressure = 'caution'
  }

  // Labor load — resolve assignment date via the linked calendar event
  // (assignments don't carry a date field directly). Falls back to a
  // direct `date` field for test inputs.
  const eventDateById = buildEventDateIndex(calendarEvents)
  const todayAssignments = (crewAssignments ?? []).filter(a => {
    const linkedDate = a?.calendarEventId ? eventDateById.get(a.calendarEventId) : null
    const fallbackDate = a?.date || a?.start_date || a?.startDate
    const dateStr = linkedDate || fallbackDate
    return typeof dateStr === 'string' && dateStr.slice(0, 10) === today
  }).length
  const labor = todayAssignments === 0 ? 'unknown' : (todayAssignments < 4 ? 'light' : todayAssignments < 12 ? 'moderate' : 'heavy')

  // Cart restriction suggestion
  const cart = (irrigation?.rainfall24hClass?.category === 'soaking' ||
                irrigation?.rainfall24hClass?.category === 'runoffRisk')
    ? 'path-only'
    : 'normal'

  return {
    frostRisk,
    mowing,
    spray,
    irrigationPressure,
    cart,
    labor,
    plannedSprays: (sprays ?? []).filter(s => sprayDate(s) === today).length,
  }
}

// ── Next 12 hours timeline ─────────────────────────────────────────────────
// Compact ordered list of weather periods + planned spray windows +
// rain-affected calendar events. NWS forecast is per-period, so we
// faithfully report whatever windows it gives us rather than fake hourly.

export function computeNextTwelveHours({ weather, sprays, calendarEvents, now }) {
  const out = []
  const horizon = now + 12 * HOUR_MS
  const todayIso = isoDate(now)

  // Planned spray time windows today/tomorrow.
  for (const s of sprays ?? []) {
    const start = sprayStartMs(s)
    if (start == null) continue
    if (start < now || start > horizon) continue
    out.push({
      id: `t-spray-${s.id}`,
      kind: 'spray',
      atMs: start,
      label: s.applicationName || s.products?.[0]?.name || 'Spray',
      sub: s.area ? `${s.area}` : '',
    })
  }

  // Calendar events today whose times fall inside the window.
  for (const ev of calendarEvents ?? []) {
    if (!ev?.date) continue
    if (ev.date.slice(0, 10) !== todayIso) continue
    // Calendar events are date-only in our schema; place at start of day for ordering.
    const ms = Date.parse(`${ev.date.slice(0,10)}T${ev.startTime || '08:00'}:00`)
    if (!Number.isFinite(ms) || ms < now || ms > horizon) continue
    if (ev.status === 'cancelled') continue
    out.push({
      id: `t-cal-${ev.id}`,
      kind: 'calendar',
      atMs: ms,
      label: ev.title || ev.category || 'Calendar event',
      sub: ev.category || '',
    })
  }

  // Weather forecast period that overlaps the next 12h.
  const fc = weather?.forecast?.[0]
  if (fc) {
    out.push({
      id: 't-weather-today',
      kind: 'weather',
      atMs: now,  // anchor at "now"
      label: `${fc.day || 'Today'} — ${fc.high ? `${fc.high}°F high` : ''}`.trim(),
      sub: fc.rainfall > 0.05 ? `${fc.rainfall.toFixed(2)}" rain` : 'no measurable rain',
    })
  }

  out.sort((a, b) => a.atMs - b.atMs)
  return out
}

// ── Top-level compose ─────────────────────────────────────────────────────

/**
 * One-shot compute used by the OperationalCommand top-of-dashboard panel.
 *
 * @param {Object} input
 * @param {Object} [input.weather]              — { current, forecast }
 * @param {Array}  [input.sprays]
 * @param {Array}  [input.labels]               — saved labels (used for rotation matching)
 * @param {Object} [input.agronomic]            — Phase 28A output
 * @param {Object} [input.sprayWindow]          — Phase 28B output
 * @param {Object} [input.irrigation]           — Phase 28C output
 * @param {Array}  [input.equipmentReservations]
 * @param {Array}  [input.crewAssignments]
 * @param {Array}  [input.calendarEvents]
 * @param {number} [input.now]
 * @returns {{
 *   priorities: Array,
 *   readiness:  Object,
 *   timeline:   Array,
 *   sourceCoverage: Object,
 * }}
 */
export function composeOperationalPriorities({
  weather,
  sprays,
  labels,
  agronomic,
  sprayWindow,
  irrigation,
  equipmentReservations,
  crewAssignments,
  calendarEvents,
  now,
} = {}) {
  const clock = now ?? Date.now()
  const labelsByItemId = {}
  for (const l of labels ?? []) {
    if (l?.inventoryItemId) labelsByItemId[l.inventoryItemId] = l
  }

  const eventDateById = buildEventDateIndex(calendarEvents)

  const all = [
    ...buildSprayWindowPriorities({ sprayWindow, sprays, now: clock }),
    ...buildAgronomicPriorities({ agronomic, sprays, labelsByItemId, now: clock }),
    ...buildIrrigationPriorities({ irrigation }),
    ...buildWeatherPriorities({ weather, irrigation }),
    ...buildSprayRainConflict({ sprays, weather, now: clock }),
    ...buildCalendarWeatherConflict({ calendarEvents, weather, now: clock }),
    ...buildEquipmentPriorities({ equipmentReservations, eventDateById, now: clock }),
    ...buildCrewPriorities({ crewAssignments, eventDateById, now: clock }),
  ]

  // De-duplicate by id (cross-builders may produce the same id) and
  // sort by severity rank then internal score.
  const byId = new Map()
  for (const p of all) {
    const existing = byId.get(p.id)
    if (!existing || p._score < existing._score) byId.set(p.id, p)
  }
  const priorities = [...byId.values()].sort((a, b) => a._score - b._score)

  const readiness = computeMorningReadiness({
    weather, sprayWindow, irrigation, crewAssignments, sprays, calendarEvents, now: clock,
  })

  const timeline = computeNextTwelveHours({
    weather, sprays, calendarEvents, now: clock,
  })

  // Source coverage — which subsystems have data, which don't.
  const sourceCoverage = {
    weather:    !!weather?.current || (weather?.forecast?.length ?? 0) > 0,
    sprays:     (sprays?.length ?? 0) > 0,
    labels:     (labels?.length ?? 0) > 0,
    agronomic:  !!agronomic,
    sprayWindow:!!sprayWindow,
    irrigation: !!irrigation,
    equipment:  (equipmentReservations?.length ?? 0) > 0,
    crew:       (crewAssignments?.length ?? 0) > 0,
    calendar:   (calendarEvents?.length ?? 0) > 0,
  }

  return { priorities, readiness, timeline, sourceCoverage }
}
