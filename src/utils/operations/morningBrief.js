// Phase 24C — Morning Operations Brief: pure builder.
//
// Turns the snapshot the Daily Operations Center already maintains (the
// same data the page renders + the attention engine consumes) into a
// structured, distributable brief: per-section bullets plus a serialized
// `textVersion` ready for Copy / Print / CSV.
//
// Same-inputs → same-outputs. No React, no fetch, no DOM access. Browser-
// side helpers (download / clipboard) are NOT in this module — callers
// reuse the shared helpers in programExport.js.

// ── Cart status vocabulary ──────────────────────────────────────────────
// Mirrors the page's CART_OPTIONS. Kept here so the brief stays readable
// without importing UI constants.

const CART_LABELS = {
  'open':            'Open',
  'cart-path-only':  'Cart-path only',
  'walking-only':    'Walking only',
  'closed':          'Closed',
}

// ── Date formatting ─────────────────────────────────────────────────────
// Matches the chemistry layer's terse style: "May 16" (no year). Used
// in the brief heading. Yearless avoids stale-feeling reports when one
// gets pulled up months later.

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function fmtShortDate(iso) {
  if (typeof iso !== 'string') return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const mo = parseInt(m[2], 10), d = parseInt(m[3], 10)
  if (!Number.isFinite(mo) || !Number.isFinite(d)) return null
  return `${MONTH_SHORT[mo - 1] ?? '???'} ${d}`
}

// ── Per-section builders ────────────────────────────────────────────────
//
// Each returns { bullets: string[], hasData: boolean }. Bullets are
// already user-facing strings so the textVersion serializer can render
// them directly without further per-section logic.

function buildWeatherSummary(weatherCurrent, cartStatus) {
  const bullets = []
  const c = weatherCurrent ?? null
  let weatherSeen = false

  if (c?.rainfall24h != null && c.rainfall24h >= 0.5) {
    bullets.push(`${c.rainfall24h.toFixed(2)}″ rainfall overnight`)
    weatherSeen = true
  }
  if (c?.currentTemp != null && c.currentTemp <= 33) {
    bullets.push(`Frost risk (${Math.round(c.currentTemp)}°F)`)
    weatherSeen = true
  } else if (c?.currentTemp != null && c.currentTemp <= 40) {
    bullets.push(`Cool start (${Math.round(c.currentTemp)}°F)`)
    weatherSeen = true
  }
  if (c?.wind != null && c.wind >= 15) {
    bullets.push(`High wind (${Math.round(c.wind)} mph)`)
    weatherSeen = true
  } else if (c?.wind != null && c.wind >= 8) {
    bullets.push(`Breezy conditions expected (${Math.round(c.wind)} mph)`)
    weatherSeen = true
  }
  if (c?.currentTemp != null && c.currentTemp > 40 && (c?.wind == null || c.wind < 8)) {
    bullets.push(`Calm — ${Math.round(c.currentTemp)}°F, light wind`)
    weatherSeen = true
  }
  if (!weatherSeen && c?.currentTemp != null) {
    bullets.push(`Current temp ${Math.round(c.currentTemp)}°F`)
  }
  if (!weatherSeen && !c?.currentTemp) {
    bullets.push('No live weather available.')
  }

  // Cart status is always rendered explicitly — superintendents need this
  // on every brief regardless of weather.
  const cart = CART_LABELS[cartStatus] ?? null
  if (cart) bullets.push(`Carts: ${cart}`)

  return { bullets, hasData: bullets.length > 0 }
}

function buildCrewSummaryBullets(crewSnapshot) {
  const bullets = []
  const scheduled  = crewSnapshot?.scheduled ?? 0
  const unassigned = crewSnapshot?.unassigned ?? 0
  const tasks      = crewSnapshot?.assignments ?? 0
  const active     = crewSnapshot?.activeTotal ?? 0

  if (active === 0 && scheduled === 0 && tasks === 0) {
    // Render the fallback bullet so the brief reader sees that crew was
    // checked but there was nothing to report — never an empty section.
    bullets.push('No active crew members configured yet.')
    return { bullets, hasData: false }
  }
  bullets.push(`${scheduled} scheduled`)
  bullets.push(`${tasks} task${tasks === 1 ? '' : 's'} today`)
  if (unassigned > 0) bullets.push(`${unassigned} unassigned`)
  return { bullets, hasData: true }
}

function buildSpraySummaryBullets(spraySchedule) {
  const bullets = []
  const today    = spraySchedule?.todayCount ?? 0
  const upcoming = Array.isArray(spraySchedule?.upcoming) ? spraySchedule.upcoming.length : 0
  const pending  = spraySchedule?.pending ?? 0

  if (today === 0 && upcoming === 0 && pending === 0) {
    bullets.push('No spray events scheduled.')
    return { bullets, hasData: false }
  }
  if (today > 0)    bullets.push(`${today} planned application${today === 1 ? '' : 's'} today`)
  if (upcoming > today) bullets.push(`${upcoming - today} more in next 3 days`)
  if (pending > 0)  bullets.push(`${pending} pending spray record${pending === 1 ? '' : 's'}`)
  return { bullets, hasData: true }
}

function buildEquipmentSummaryBullets(equipmentAlerts) {
  const bullets = []
  const oos      = equipmentAlerts?.outOfService ?? 0
  const overdue  = equipmentAlerts?.overdue ?? 0
  const conflict = equipmentAlerts?.conflicts ?? 0
  if (oos === 0 && overdue === 0 && conflict === 0) {
    bullets.push('No equipment alerts.')
    return { bullets, hasData: false }
  }
  if (oos > 0)      bullets.push(`${oos} out of service`)
  if (overdue > 0)  bullets.push(`${overdue} overdue for maintenance`)
  if (conflict > 0) bullets.push(`${conflict} reservation conflict${conflict === 1 ? '' : 's'}`)
  return { bullets, hasData: true }
}

function buildOperationsSummaryBullets(cartStatus, todayNote) {
  const bullets = []
  const cart = CART_LABELS[cartStatus] ?? null
  if (cart) bullets.push(`Course status: ${cart}`)
  const note = typeof todayNote === 'string' ? todayNote.trim() : ''
  if (note) bullets.push(`Note: ${note}`)
  return { bullets, hasData: bullets.length > 0 }
}

function buildPriorityBullets(priorities) {
  const bullets = []
  if (!Array.isArray(priorities) || priorities.length === 0) {
    return { bullets, hasData: false }
  }
  for (const p of priorities) {
    if (!p || typeof p.text !== 'string') continue
    const text = p.text.trim()
    if (!text) continue
    const tag = p.done ? ' ✓' : ''
    bullets.push(`${text}${tag}`)
  }
  return { bullets, hasData: bullets.length > 0 }
}

function buildAttentionBullets(attentionItems) {
  const bullets = []
  if (!Array.isArray(attentionItems) || attentionItems.length === 0) {
    return { bullets, hasData: false }
  }
  for (const it of attentionItems) {
    // "[HIGH] Wind 18 mph with 2 planned sprays today"
    const tag = String(it?.severity ?? '').toUpperCase()
    bullets.push(`[${tag}] ${it?.title ?? '(untitled)'}`)
  }
  return { bullets, hasData: true }
}

// ── Plain-text serializer ───────────────────────────────────────────────

function serialize(brief) {
  const lines = []
  if (brief.courseName) lines.push(brief.courseName)
  const dateLabel = fmtShortDate(brief.generatedAt) ?? brief.generatedAt
  lines.push(`Morning Operations Brief — ${dateLabel}`)
  lines.push('')

  function pushSection(label, section) {
    if (!section || section.bullets.length === 0) return
    lines.push(label)
    for (const b of section.bullets) lines.push(`• ${b}`)
    lines.push('')
  }

  pushSection('Conditions',       brief.weatherSummary)
  pushSection('Operations',       brief.operationsSummary)
  pushSection('Crew',             brief.crewSummary)
  pushSection('Sprays',           brief.spraySummary)
  pushSection('Equipment',        brief.equipmentSummary)
  pushSection('Priorities',       brief.priorities)
  pushSection('Needs Attention',  brief.attentionItems)

  // Trim trailing blank line.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}

// ── Public entry ────────────────────────────────────────────────────────

/**
 * @param {Object} snapshot
 *   weatherCurrent, cartStatus, todayNote, crewSnapshot, spraySchedule,
 *   equipmentAlerts, priorities (array), attentionItems (array)
 * @param {Object} [meta]
 *   courseName, generatedAt (ISO YYYY-MM-DD; defaults to today UTC)
 */
export function buildMorningBrief(snapshot = {}, meta = {}) {
  const generatedAt = meta.generatedAt ?? new Date().toISOString().slice(0, 10)
  const courseName  = meta.courseName ?? null

  const brief = {
    generatedAt,
    courseName,
    weatherSummary:    buildWeatherSummary(snapshot.weatherCurrent, snapshot.cartStatus),
    operationsSummary: buildOperationsSummaryBullets(snapshot.cartStatus, snapshot.todayNote),
    crewSummary:       buildCrewSummaryBullets(snapshot.crewSnapshot),
    spraySummary:      buildSpraySummaryBullets(snapshot.spraySchedule),
    equipmentSummary:  buildEquipmentSummaryBullets(snapshot.equipmentAlerts),
    priorities:        buildPriorityBullets(snapshot.priorities),
    attentionItems:    buildAttentionBullets(snapshot.attentionItems),
  }
  brief.textVersion = serialize(brief)
  return brief
}

// ── CSV export helpers ─────────────────────────────────────────────────
//
// Two-column key/value layout — section + line. Pragmatic; reads fine on
// phones (the consultant/owner email use case) without forcing a wide
// schema. Headers are part of the result so the existing serializeCsv()
// helper can render it directly.

const CSV_HEADERS = ['section', 'line']

/**
 * Flatten a brief into a 2-column row matrix for CSV export. Empty
 * sections are omitted so the file mirrors what the reader sees in the
 * text version.
 */
export function buildBriefCsvRows(brief) {
  const rows = []
  if (!brief) return { headers: CSV_HEADERS.slice(), rows }
  function push(section, lines) {
    if (!Array.isArray(lines) || lines.length === 0) return
    for (const line of lines) rows.push([section, line])
  }
  rows.push(['header', brief.courseName ?? 'Morning Operations Brief'])
  rows.push(['header', `Generated ${brief.generatedAt}`])
  push('Conditions',      brief.weatherSummary?.bullets)
  push('Operations',      brief.operationsSummary?.bullets)
  push('Crew',            brief.crewSummary?.bullets)
  push('Sprays',          brief.spraySummary?.bullets)
  push('Equipment',       brief.equipmentSummary?.bullets)
  push('Priorities',      brief.priorities?.bullets)
  push('Needs Attention', brief.attentionItems?.bullets)
  return { headers: CSV_HEADERS.slice(), rows }
}

/** Slug-safe filename: "<course>-morning-brief-YYYY-MM-DD.csv". */
export function defaultBriefFilename({ courseName, generatedAt } = {}) {
  const datePart = (generatedAt ?? new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, '')
  const slug = (courseName ?? 'turfintel')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'turfintel'
  return `${slug}-morning-brief-${datePart}.csv`
}
