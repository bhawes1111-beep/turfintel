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

// Area normalization for cross-system routing matches.
// Worker exposes sprays with both `area` (string — first area's name, legacy)
// and `areas: [{name, acreage}]` (full list). Calendar events use `location`.
// Normalize: lowercase, collapse whitespace, strip punctuation, strip trailing
// 's' so "greens"/"green"/"GREENS " all collide.
function normalizeAreaKey(s) {
  if (s == null) return null
  const t = String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.endsWith('s') ? t.slice(0, -1) : t
}

// Pull every area name a spray touches, normalized + deduped.
function sprayAreaKeys(spray) {
  const out = new Set()
  const k1 = normalizeAreaKey(spray?.area)
  if (k1) out.add(k1)
  for (const a of spray?.areas ?? []) {
    const k = normalizeAreaKey(a?.name ?? a?.area_name ?? a)
    if (k) out.add(k)
  }
  return out
}

// Same for a calendar event — location is the primary field, but title
// sometimes carries the area when location is blank ("Mow greens 1-9").
function calendarEventAreaKey(ev) {
  return normalizeAreaKey(ev?.location) ?? normalizeAreaKey(ev?.area)
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
function buildWeatherPriorities({ weather, irrigation, calendarEvents, now }) {
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

  // Forecast rain >0.5" today/tonight → ops impact. Enriched in Phase 29.1
  // to name the actual rain-sensitive calendar events today, falling back
  // to the generic phrasing when the calendar isn't loaded.
  if (todayDay?.rainfall != null && todayDay.rainfall >= 0.5) {
    const today = isoDate(now ?? Date.now())
    const sensitive = /mow|bunker|topdress|aer|verticut|sand|roll/i
    const named = (calendarEvents ?? [])
      .filter(ev => ev?.date && ev.date.slice(0, 10) === today &&
        ev.status !== 'cancelled' && ev.status !== 'completed' &&
        sensitive.test(`${ev.title || ''} ${ev.category || ''} ${ev.type || ''}`))
      .map(ev => ev.title || ev.category)
      .filter(Boolean)
      .slice(0, 3)
    const why = named.length > 0
      ? `Rainfall likely impacts: ${named.join(', ')}`
      : `Rainfall likely impacts bunker prep, fairway mowing, and routing`
    out.push(makePriority({
      id: 'weather-rain-ops',
      severity: SEVERITY.CAUTION,
      sourceSystem: 'weather',
      title: `Heavy rainfall forecast — ${todayDay.rainfall.toFixed(2)}"`,
      why,
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

// 9. Routing conflicts — same area touched by two operations today.
// Cross-checks today's planned sprays against today's calendar events
// (mow / handwater / topdress / aerate / verticut / bunker) when they
// land on the same normalized area name. Honest by design: with no
// calendar events loaded, builder emits nothing.
function buildRoutingConflicts({ sprays, calendarEvents, now }) {
  const out = []
  if (!Array.isArray(sprays) || !Array.isArray(calendarEvents)) return out
  const today = isoDate(now)
  const plannedSprays = sprays.filter(s =>
    sprayDate(s) === today && s.status !== 'cancelled' && s.status !== 'completed',
  )
  if (plannedSprays.length === 0) return out

  const opRegex = /mow|handwater|hand water|topdress|aer|verticut|verti cut|bunker|rake|roll/i
  const todayOps = calendarEvents.filter(ev => {
    if (!ev?.date) return false
    if (ev.date.slice(0, 10) !== today) return false
    if (ev.status === 'cancelled' || ev.status === 'completed') return false
    const blob = `${ev.title || ''} ${ev.category || ''} ${ev.type || ''}`
    return opRegex.test(blob) && calendarEventAreaKey(ev) != null
  })
  if (todayOps.length === 0) return out

  const seen = new Set()  // de-dup per (spray, areaKey) pair
  for (const s of plannedSprays) {
    const sprayKeys = sprayAreaKeys(s)
    if (sprayKeys.size === 0) continue
    for (const ev of todayOps) {
      const evKey = calendarEventAreaKey(ev)
      if (!evKey || !sprayKeys.has(evKey)) continue
      const dedup = `${s.id}|${evKey}`
      if (seen.has(dedup)) continue
      seen.add(dedup)
      const name = s.applicationName || s.products?.[0]?.name || 'planned spray'
      const opLabel = ev.title || ev.category || 'planned task'
      out.push(makePriority({
        id: `routing-${s.id}-${ev.id}`,
        severity: SEVERITY.CAUTION,
        sourceSystem: 'routing',
        title: `Routing conflict on ${ev.location || evKey} — ${name} vs ${opLabel}`,
        why: `Spray "${name}" and calendar event "${opLabel}" both target ${ev.location || evKey} today`,
        recommendedAction: 'Sequence the operations or move one to a different day',
        route: '/spray',
      }))
    }
  }
  return out
}

// 10. REI × routing — active REI window covers an area that has work
// scheduled there in today's calendar.
function buildREIRoutingConflicts({ agronomic, calendarEvents, now }) {
  const out = []
  if (!agronomic || !Array.isArray(calendarEvents)) return out
  const today = isoDate(now)
  const reis = (agronomic.activeREI ?? []).filter(r => r.endsAt > now)
  if (reis.length === 0) return out
  const todayCalendarOps = calendarEvents.filter(ev => {
    if (!ev?.date) return false
    if (ev.date.slice(0, 10) !== today) return false
    if (ev.status === 'cancelled' || ev.status === 'completed') return false
    return calendarEventAreaKey(ev) != null
  })
  if (todayCalendarOps.length === 0) return out

  for (const r of reis) {
    const reiKey = normalizeAreaKey(r.area)
    if (!reiKey) continue
    for (const ev of todayCalendarOps) {
      const evKey = calendarEventAreaKey(ev)
      if (evKey !== reiKey) continue

      // Time gate: only warn when the scheduled time actually overlaps the
      // REI window. Calendar events are usually date-only in this schema,
      // so when startTime is absent we treat the time as UNKNOWN — we still
      // surface the warning (most real conflicts are timeless here) but say
      // so honestly rather than implying a hard overlap.
      const hasTime = typeof ev.startTime === 'string' && /^\d{1,2}:\d{2}/.test(ev.startTime)
      let timingNote
      if (hasTime) {
        const startMs = Date.parse(`${ev.date.slice(0, 10)}T${ev.startTime}:00`)
        // Skip cleanly when the event starts after the REI has already lifted.
        if (Number.isFinite(startMs) && startMs >= r.endsAt) continue
        timingNote = `scheduled ${ev.startTime}, within the REI window`
      } else {
        timingNote = 'scheduled time unconfirmed — verify it clears the REI window'
      }

      const hoursLeft = Math.max(0, Math.round(r.hoursRemaining))
      out.push(makePriority({
        id: `rei-routing-${r.sprayId}-${ev.id}`,
        severity: SEVERITY.WARNING,
        sourceSystem: 'cross',
        title: `REI on ${ev.location || reiKey} conflicts with "${ev.title || ev.category || 'planned task'}"`,
        why: `Active REI (${hoursLeft}h remaining) blocks early entry on ${ev.location || reiKey} where work is scheduled today — ${timingNote}`,
        recommendedAction: 'Delay the operation until REI expires or assign a different area',
        route: '/spray',
      }))
    }
  }
  return out
}

// 11. Equipment maintenance — reserved unit is out-of-service or has
// an overdue service-log row. Augments buildEquipmentPriorities, which
// only handled same-day double-booking.
function buildEquipmentMaintenancePriorities({ equipmentReservations, eventDateById, equipment, serviceLog, now }) {
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
  if (todayRes.length === 0) return out

  const equipmentById = new Map()
  for (const eq of equipment ?? []) {
    const id = eq?.id ?? eq?.equipmentId
    if (id != null) equipmentById.set(String(id), eq)
  }

  // Service-log rows that flag a unit as currently unavailable: status
  // 'overdue' OR open + critical priority OR explicit out-of-service.
  const blockersByEquip = new Map()
  for (const log of serviceLog ?? []) {
    if (!log) continue
    const eqId = log.equipmentId || log.equipment_id
    if (eqId == null) continue
    const blocking = log.status === 'overdue'
      || (log.status === 'open' && log.priority === 'critical')
      || log.status === 'out-of-service'
      || log.status === 'out_of_service'
    if (!blocking) continue
    if (!blockersByEquip.has(String(eqId))) blockersByEquip.set(String(eqId), [])
    blockersByEquip.get(String(eqId)).push(log)
  }

  const seen = new Set()
  for (const r of todayRes) {
    const eqId = String(r.equipmentId || r.equipment_id || '')
    if (!eqId) continue
    const eq = equipmentById.get(eqId)
    const explicitOut = eq && (eq.status === 'out-of-service' || eq.status === 'out_of_service' || eq.status === 'maintenance')
    const blockers = blockersByEquip.get(eqId)
    if (!explicitOut && !blockers) continue
    const dedup = `equip-maint-${eqId}`
    if (seen.has(dedup)) continue
    seen.add(dedup)

    const eqName = eq?.name || r.equipmentName || `unit ${eqId}`
    const whyParts = []
    if (explicitOut) whyParts.push(`marked ${eq.status}`)
    if (blockers?.length) whyParts.push(`${blockers.length} blocking service-log row${blockers.length === 1 ? '' : 's'}`)
    out.push(makePriority({
      id: dedup,
      severity: SEVERITY.WARNING,
      sourceSystem: 'equipment',
      title: `Reserved equipment unavailable — ${eqName}`,
      why: `${eqName} is reserved today but ${whyParts.join(' and ')}`,
      recommendedAction: 'Swap to a different unit or clear the maintenance flag',
      route: '/equipment',
    }))
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
  equipment,
  serviceLog,
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
    ...buildWeatherPriorities({ weather, irrigation, calendarEvents, now: clock }),
    ...buildSprayRainConflict({ sprays, weather, now: clock }),
    ...buildCalendarWeatherConflict({ calendarEvents, weather, now: clock }),
    ...buildEquipmentPriorities({ equipmentReservations, eventDateById, now: clock }),
    ...buildEquipmentMaintenancePriorities({
      equipmentReservations, eventDateById, equipment, serviceLog, now: clock,
    }),
    ...buildCrewPriorities({ crewAssignments, eventDateById, now: clock }),
    ...buildRoutingConflicts({ sprays, calendarEvents, now: clock }),
    ...buildREIRoutingConflicts({ agronomic, calendarEvents, now: clock }),
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
    weather:     !!weather?.current || (weather?.forecast?.length ?? 0) > 0,
    sprays:      (sprays?.length ?? 0) > 0,
    labels:      (labels?.length ?? 0) > 0,
    agronomic:   !!agronomic,
    sprayWindow: !!sprayWindow,
    irrigation:  !!irrigation,
    equipment:   (equipmentReservations?.length ?? 0) > 0,
    equipmentFleet: (equipment?.length ?? 0) > 0,
    serviceLog:  (serviceLog?.length ?? 0) > 0,
    crew:        (crewAssignments?.length ?? 0) > 0,
    calendar:    (calendarEvents?.length ?? 0) > 0,
  }

  return { priorities, readiness, timeline, sourceCoverage }
}
