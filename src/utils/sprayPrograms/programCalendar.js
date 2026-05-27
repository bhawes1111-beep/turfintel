// Phase 7H (1/?) — Spray Program calendar view-models.
//
// Pure-compute helpers that flatten spray_programs + spray_program_items
// into a calendar-ready shape. No fetch, no React, no store imports,
// no mutation. The calendar view is strictly visualization — these
// helpers never write D1, never deduct inventory, never produce
// spray_records, and never auto-link items.
//
// Architectural notes:
//   - Items with at least one valid planned date land in the dated set.
//     groupProgramItemsByDate returns a map keyed by ISO "YYYY-MM-DD"
//     spanning every day in the planned window inclusive (so a 7-day
//     window appears on all 7 days, not just the start).
//   - Items with no valid dates (both planned_start_date and
//     planned_end_date null/invalid) are routed to an "unscheduled"
//     bucket so they don't silently disappear. The UI surfaces this
//     bucket explicitly.
//   - linkedSprayRecordId is read but never written.

const DAY_MS = 86_400_000

function isValidDate(d) {
  if (d == null || d === '') return false
  return Number.isFinite(Date.parse(d))
}

function dayKey(epoch) {
  // YYYY-MM-DD in UTC. Planned dates are stored as ISO date-only
  // strings so UTC keying matches the wall-clock value the user
  // entered, without timezone drift.
  const dt = new Date(epoch)
  const y  = dt.getUTCFullYear()
  const m  = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d  = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDayMs(date) {
  if (!isValidDate(date)) return null
  // Truncate to UTC midnight so day-count arithmetic is stable.
  const t = Date.parse(date)
  return Math.floor(t / DAY_MS) * DAY_MS
}

/**
 * Resolve the planned window for one item.
 *
 * @param {Object} item
 * @returns {{
 *   start: number|null,        // epoch ms at UTC midnight, or null
 *   end:   number|null,
 *   isRange: boolean,
 *   hasAnyDate: boolean,
 * }}
 */
export function getProgramItemWindow(item) {
  if (!item) return { start: null, end: null, isRange: false, hasAnyDate: false }
  const s = parseDayMs(item.plannedStartDate)
  const e = parseDayMs(item.plannedEndDate)
  if (s == null && e == null) {
    return { start: null, end: null, isRange: false, hasAnyDate: false }
  }
  // Anchor to whichever side is present.
  const anchor = s ?? e
  const start  = s ?? anchor
  const end    = e ?? anchor
  // Defensive: if the dates somehow arrived inverted, swap them so the
  // map fills correctly without a negative loop.
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  return {
    start: lo,
    end:   hi,
    isRange: lo !== hi,
    hasAnyDate: true,
  }
}

/**
 * Human-readable label for the planned window.
 *
 * @param {Object} item
 * @returns {string}
 */
export function formatProgramCalendarRange(item) {
  if (!item) return ''
  const start = item.plannedStartDate
  const end   = item.plannedEndDate
  const label = item.plannedWindowLabel
  if (isValidDate(start) && isValidDate(end)) {
    if (start === end) return start
    // Use ASCII arrow so the value is safe to drop into PDF/JSON exports.
    return `${start} → ${end}`
  }
  if (isValidDate(start)) return start
  if (isValidDate(end))   return end
  if (label)              return label
  return ''
}

/**
 * Flatten programs + items into one calendar-ready array. Programs are
 * NOT mutated; items are NOT mutated. Each output row carries enough
 * context to render a calendar cell or an agenda row without
 * re-walking the source arrays.
 *
 * Items are filtered by:
 *   - REVIEWABLE_KINDS does not apply here — every status is shown.
 *   - Archived programs are dropped by default; pass
 *     options.includeArchived=true to include them.
 *
 * @param {Object[]} programs               spray_programs rows
 * @param {Object}   itemsByProgramId       { [programId]: items[] }
 * @param {Object}   [options]
 * @param {boolean}  [options.includeArchived=false]
 * @returns {Array}  calendar-item view models (see file header)
 */
export function buildProgramCalendarItems(programs = [], itemsByProgramId = {}, options = {}) {
  const includeArchived = options?.includeArchived === true
  const out = []

  for (const program of programs ?? []) {
    if (!program) continue
    if (!includeArchived && program.status === 'archived') continue
    const items = itemsByProgramId?.[program.id]
    if (!Array.isArray(items)) continue       // lazy cache miss — show nothing for this program

    for (const item of items) {
      if (!item) continue
      const win = getProgramItemWindow(item)
      const linkedId  = item.linkedSprayRecordId ?? null
      const rangeLabel = formatProgramCalendarRange(item)
      const display = item.productName
        ?? item.targetArea
        ?? '(unnamed item)'
      out.push({
        id:                  `cal-${item.id}`,
        programId:           program.id,
        programName:         program.name ?? null,
        itemId:              item.id,
        productName:         item.productName ?? null,
        targetArea:          item.targetArea  ?? null,
        status:              item.status ?? 'planned',
        plannedStartDate:    item.plannedStartDate ?? null,
        plannedEndDate:      item.plannedEndDate   ?? null,
        plannedWindowLabel:  item.plannedWindowLabel ?? null,
        applicationNotes:    item.applicationNotes  ?? null,
        rateValue:           item.rateValue ?? null,
        rateUnit:            item.rateUnit  ?? null,
        carrierVolumeValue:  item.carrierVolumeValue ?? null,
        carrierVolumeUnit:   item.carrierVolumeUnit  ?? null,
        displayLabel:        display,
        rangeLabel,
        linkedSprayRecordId: linkedId,
        hasCompletedLink:    !!linkedId,
        // The "stale or missing date" flag is true when no resolvable
        // date is present AT ALL. (A linked-but-stale spray record
        // doesn't affect this — that's a separate stewardship signal.)
        isStaleOrMissingDate: !win.hasAnyDate,
        // Internal: epoch range for the grouping pass below. Not part
        // of the public contract (consumers can re-derive via
        // getProgramItemWindow if they need it).
        _start: win.start,
        _end:   win.end,
      })
    }
  }

  return out
}

/**
 * Group calendar items by ISO date key. Range items appear under every
 * day in their window (inclusive). Items with no valid dates land in
 * the special 'unscheduled' bucket — never silently dropped.
 *
 * Range explosion is bounded at MAX_RANGE_DAYS to defend against a
 * pathological 10-year window producing thousands of keys. Items
 * exceeding the bound still appear under their start day and in
 * 'unscheduled' (so the steward can see they were captured).
 *
 * @param {Array} calendarItems   output of buildProgramCalendarItems
 * @returns {{ byDay: Object<string, Array>, unscheduled: Array }}
 */
const MAX_RANGE_DAYS = 366

export function groupProgramItemsByDate(calendarItems = []) {
  const byDay = {}
  const unscheduled = []

  for (const ci of calendarItems ?? []) {
    if (!ci) continue
    if (ci.isStaleOrMissingDate || ci._start == null || ci._end == null) {
      unscheduled.push(ci)
      continue
    }
    const spanDays = Math.floor((ci._end - ci._start) / DAY_MS) + 1
    if (spanDays > MAX_RANGE_DAYS) {
      // Show the anchor only; surface the row in unscheduled too so a
      // year-long "window" doesn't bloat the calendar grid into
      // garbage.
      const key = dayKey(ci._start)
      ;(byDay[key] = byDay[key] ?? []).push(ci)
      unscheduled.push(ci)
      continue
    }
    for (let t = ci._start; t <= ci._end; t += DAY_MS) {
      const key = dayKey(t)
      ;(byDay[key] = byDay[key] ?? []).push(ci)
    }
  }

  // Sort each day's list: linked-completed first, then by status, then
  // by productName. Stable enough for a calendar cell where the user
  // expects high-signal items to surface to the top.
  const statusOrder = { planned: 0, completed: 1, skipped: 2, canceled: 3 }
  function cmp(a, b) {
    if (a.hasCompletedLink !== b.hasCompletedLink) return a.hasCompletedLink ? -1 : 1
    const sa = statusOrder[a.status] ?? 9
    const sb = statusOrder[b.status] ?? 9
    if (sa !== sb) return sa - sb
    return (a.productName ?? '').localeCompare(b.productName ?? '')
  }
  for (const key of Object.keys(byDay)) byDay[key].sort(cmp)
  unscheduled.sort(cmp)

  return { byDay, unscheduled }
}

// ── Phase 7H (3/?) — Filtering, sorting, and filter-option discovery ──────
//
// Pure-compute helpers that narrow + reorder the calendar-item array
// produced by buildProgramCalendarItems. No fetch, no React, no store
// imports, no mutation. Filters never throw on bad input — unknown
// values fall back to 'all'. Sort modes are deterministic (stable on
// equal keys via a secondary id tiebreak).

const STATUS_VALUES = new Set(['planned', 'completed', 'skipped', 'canceled'])
const LINK_STATES   = new Set(['all', 'linked', 'unlinked'])
const SORT_MODES    = new Set(['date', 'program', 'product', 'status'])

export const PROGRAM_CALENDAR_DEFAULT_FILTERS = Object.freeze({
  search:     '',
  programId:  'all',
  status:     'all',
  targetArea: 'all',
  linkState:  'all',
})

function normalizeSearchToken(s) {
  if (s == null) return ''
  return String(s).trim().toLowerCase()
}

function matchesSearch(ci, token) {
  if (!token) return true
  const hay = [
    ci.productName,
    ci.programName,
    ci.targetArea,
    ci.plannedWindowLabel,
    ci.displayLabel,
    ci.rangeLabel,
  ]
    .filter(Boolean)
    .map(v => String(v).toLowerCase())
    .join(' ')
  return hay.includes(token)
}

/**
 * Filter calendar items by a (potentially partial) filters object.
 * Unknown / missing keys are treated as 'all' (no narrowing). The input
 * array is never mutated; a new array is always returned.
 *
 * @param {Array}  calendarItems  output of buildProgramCalendarItems
 * @param {Object} [filters]
 * @param {string} [filters.search='']
 * @param {string} [filters.programId='all']
 * @param {string} [filters.status='all']     planned|completed|skipped|canceled|all
 * @param {string} [filters.targetArea='all']
 * @param {string} [filters.linkState='all']  all|linked|unlinked
 * @returns {Array}
 */
export function filterProgramCalendarItems(calendarItems = [], filters = {}) {
  if (!Array.isArray(calendarItems)) return []
  const f = filters && typeof filters === 'object' ? filters : {}

  const token       = normalizeSearchToken(f.search)
  const programId   = f.programId   ?? 'all'
  const statusRaw   = f.status      ?? 'all'
  const status      = statusRaw === 'all' || STATUS_VALUES.has(statusRaw) ? statusRaw : 'all'
  const targetArea  = f.targetArea  ?? 'all'
  const linkStateIn = f.linkState   ?? 'all'
  const linkState   = LINK_STATES.has(linkStateIn) ? linkStateIn : 'all'

  const out = []
  for (const ci of calendarItems) {
    if (!ci) continue
    if (programId !== 'all' && ci.programId !== programId) continue
    if (status    !== 'all' && (ci.status ?? 'planned') !== status) continue
    if (targetArea !== 'all' && (ci.targetArea ?? '') !== targetArea) continue
    if (linkState === 'linked'   && !ci.hasCompletedLink) continue
    if (linkState === 'unlinked' &&  ci.hasCompletedLink) continue
    if (!matchesSearch(ci, token)) continue
    out.push(ci)
  }
  return out
}

/**
 * Sort calendar items by the given mode without mutating the input.
 * Unknown modes fall back to 'date'. All modes use a secondary id
 * tiebreak so output ordering is deterministic regardless of input
 * order.
 *
 * @param {Array}  calendarItems
 * @param {string} [sortMode='date']  date|program|product|status
 * @returns {Array}
 */
export function sortProgramCalendarItems(calendarItems = [], sortMode = 'date') {
  if (!Array.isArray(calendarItems)) return []
  const mode = SORT_MODES.has(sortMode) ? sortMode : 'date'
  const copy = calendarItems.slice()
  const statusOrder = { planned: 0, completed: 1, skipped: 2, canceled: 3 }
  const idKey = (ci) => String(ci?.itemId ?? ci?.id ?? '')

  function byDate(a, b) {
    const av = a._start ?? Number.POSITIVE_INFINITY
    const bv = b._start ?? Number.POSITIVE_INFINITY
    if (av !== bv) return av - bv
    return idKey(a).localeCompare(idKey(b))
  }
  function byProgram(a, b) {
    const r = (a.programName ?? '').localeCompare(b.programName ?? '')
    if (r !== 0) return r
    return byDate(a, b)
  }
  function byProduct(a, b) {
    const r = (a.productName ?? a.displayLabel ?? '').localeCompare(b.productName ?? b.displayLabel ?? '')
    if (r !== 0) return r
    return byDate(a, b)
  }
  function byStatus(a, b) {
    const sa = statusOrder[a.status] ?? 9
    const sb = statusOrder[b.status] ?? 9
    if (sa !== sb) return sa - sb
    return byDate(a, b)
  }

  const cmp = mode === 'program' ? byProgram
            : mode === 'product' ? byProduct
            : mode === 'status'  ? byStatus
            :                      byDate
  copy.sort(cmp)
  return copy
}

/**
 * Derive option lists for the filter toolbar dropdowns from the
 * currently visible calendar items. Each list begins with an "all"
 * entry so the dropdown can be wired without a separate render branch.
 *
 * @param {Array} calendarItems  output of buildProgramCalendarItems
 * @returns {{
 *   programs:    Array<{ value: string, label: string }>,
 *   statuses:    Array<{ value: string, label: string }>,
 *   targetAreas: Array<{ value: string, label: string }>,
 *   linkStates:  Array<{ value: string, label: string }>,
 *   sortModes:   Array<{ value: string, label: string }>,
 * }}
 */
export function buildProgramCalendarFilterOptions(calendarItems = []) {
  const programMap = new Map()
  const areaSet    = new Set()
  const statusSet  = new Set()

  for (const ci of calendarItems ?? []) {
    if (!ci) continue
    if (ci.programId && !programMap.has(ci.programId)) {
      programMap.set(ci.programId, ci.programName ?? '(unnamed program)')
    }
    if (ci.targetArea) areaSet.add(ci.targetArea)
    if (ci.status)     statusSet.add(ci.status)
  }

  const programs = [{ value: 'all', label: 'All programs' }]
  // Sort programs by name for a stable dropdown ordering.
  const programEntries = Array.from(programMap.entries())
    .sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? ''))
  for (const [id, name] of programEntries) programs.push({ value: id, label: name })

  const STATUS_LABEL = { planned: 'Planned', completed: 'Completed', skipped: 'Skipped', canceled: 'Canceled' }
  const statuses = [{ value: 'all', label: 'All statuses' }]
  for (const s of ['planned', 'completed', 'skipped', 'canceled']) {
    if (statusSet.has(s)) statuses.push({ value: s, label: STATUS_LABEL[s] })
  }

  const targetAreas = [{ value: 'all', label: 'All target areas' }]
  for (const a of Array.from(areaSet).sort((x, y) => x.localeCompare(y))) {
    targetAreas.push({ value: a, label: a })
  }

  const linkStates = [
    { value: 'all',      label: 'All link states' },
    { value: 'linked',   label: 'Linked completed' },
    { value: 'unlinked', label: 'Not linked' },
  ]

  const sortModes = [
    { value: 'date',    label: 'Date' },
    { value: 'program', label: 'Program' },
    { value: 'product', label: 'Product' },
    { value: 'status',  label: 'Status' },
  ]

  return { programs, statuses, targetAreas, linkStates, sortModes }
}

// ── Phase 7R.4 (1/?) — Grouped calendar events ───────────────────────────
//
// Pure-compute helper that rolls a flat list of calendar items
// (output of buildProgramCalendarItems / filterProgramCalendarItems
// / sortProgramCalendarItems) into one event per
// program × date × target_area × application bucket.
//
// The bucket distinguishes Water In / Granular / Aeration / Spray
// types on the same date + area, derived purely from
// applicationNotes text — there is no new schema column. The bucket
// keys are:
//   - 'aeration'  if any item carries an "aeration" mention
//   - 'water-in'  if any item carries "water in"
//   - 'granular'  if any item carries "granular only"
//   - 'spray'     otherwise
//
// Returns event view-models with the shape the calendar grid + agenda
// surfaces consume (id / title / subtitle / type / start / end /
// programId / programName / targetArea / items / productCount /
// statusBreakdown / hasCompletedLink / nutrientSummary / notes).
// Underlying spray_program_items are never mutated — this helper is
// strictly read-side projection.

const APPLICATION_TYPE_LABEL = {
  spray:    'Spray',
  'water-in': 'Water In',
  granular: 'Granular',
  aeration: 'Aeration',
}

function deriveApplicationType(notes) {
  if (!notes || typeof notes !== 'string') return 'spray'
  const lower = notes.toLowerCase()
  if (lower.includes('aeration'))      return 'aeration'
  if (lower.includes('water in'))      return 'water-in'
  if (lower.includes('granular only')) return 'granular'
  return 'spray'
}

// One application "bucket" per item, used to pick the strongest
// type across all products on the same date+area. Higher = wins.
const TYPE_PRIORITY = { aeration: 3, 'water-in': 2, granular: 1, spray: 0 }

function pickBucketType(types) {
  let winner = 'spray'
  let winnerRank = -1
  for (const t of types) {
    const rank = TYPE_PRIORITY[t] ?? 0
    if (rank > winnerRank) { winner = t; winnerRank = rank }
  }
  return winner
}

function extractNutrientSummary(notes) {
  if (!notes || typeof notes !== 'string') return null
  // Format from the seed: "Nutrient summary: 0.08 lbs N/1000, 0.16 lbs K/1000."
  // Capture until the sentence-ending period (a period followed by a
  // space or end-of-string) so decimals like "0.08" don't truncate.
  const m = notes.match(/Nutrient summary:\s*(.+?)(?:\.\s|\.$|$)/i)
  if (!m) return null
  const cleaned = m[1].trim().replace(/\s+/g, ' ')
  return cleaned || null
}

function makeEventId(item, bucketType) {
  // Stable id: program + start + end + area + bucket. Falls back
  // gracefully when dates are missing.
  return [
    'pe',
    item.programId   ?? 'noprogram',
    item.plannedStartDate ?? 'nodate',
    item.plannedEndDate   ?? item.plannedStartDate ?? 'nodate',
    (item.targetArea ?? 'noarea').replace(/\s+/g, '-').toLowerCase(),
    bucketType,
  ].join('|')
}

/**
 * Group a flat array of calendar-item rows into per-application
 * calendar events. Items that share program + dates + area + type
 * collapse into a single event whose `items` array is the
 * underlying product rows.
 *
 * @param {Array} calendarItems  output of buildProgramCalendarItems
 * @returns {Array<{
 *   id: string,
 *   title: string,
 *   subtitle: string|null,
 *   applicationType: 'spray' | 'water-in' | 'granular' | 'aeration',
 *   typeLabel: string,
 *   programId: string|null,
 *   programName: string|null,
 *   targetArea: string|null,
 *   plannedStartDate: string|null,
 *   plannedEndDate: string|null,
 *   _start: number|null,
 *   _end: number|null,
 *   isStaleOrMissingDate: boolean,
 *   items: Array<Object>,
 *   productCount: number,
 *   hasCompletedLink: boolean,
 *   statusBreakdown: { planned: number, completed: number, skipped: number, canceled: number },
 *   nutrientSummary: Array<string>,
 *   notes: Array<string>,
 * }>}
 */
export function groupProgramItemsForCalendar(calendarItems = []) {
  const buckets = new Map()

  // Pass 1: bucket items by (program, dates, area, type-derived-from-row).
  // We use the row-level type for keying so a single "Water In" item
  // doesn't collapse with the surrounding "Spray" items on the same
  // date. After bucketing, the bucket's `applicationType` is the
  // highest-priority type across the items in that bucket — which
  // for a sane fixture equals the row-level type (because all items
  // in a true grouping share one bucket key).
  for (const ci of Array.isArray(calendarItems) ? calendarItems : []) {
    if (!ci) continue
    const type = deriveApplicationType(ci.applicationNotes)
    const key = makeEventId(ci, type)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        id: key,
        applicationType: type,
        programId:        ci.programId   ?? null,
        programName:      ci.programName ?? null,
        targetArea:       ci.targetArea  ?? null,
        plannedStartDate: ci.plannedStartDate ?? null,
        plannedEndDate:   ci.plannedEndDate   ?? ci.plannedStartDate ?? null,
        _start:           ci._start ?? null,
        _end:             ci._end   ?? ci._start ?? null,
        isStaleOrMissingDate: ci.isStaleOrMissingDate === true,
        items:            [],
        types:            [],
        nutrientSummarySet: new Set(),
        notesSet:           new Set(),
      }
      buckets.set(key, bucket)
    }
    bucket.items.push(ci)
    bucket.types.push(type)
    const ns = extractNutrientSummary(ci.applicationNotes)
    if (ns) bucket.nutrientSummarySet.add(ns)
    if (ci.applicationNotes) bucket.notesSet.add(ci.applicationNotes)
    bucket.isStaleOrMissingDate = bucket.isStaleOrMissingDate || ci.isStaleOrMissingDate === true
  }

  // Pass 2: finalize.
  const out = []
  for (const bucket of buckets.values()) {
    const type   = pickBucketType(bucket.types)
    const typeLabel = APPLICATION_TYPE_LABEL[type] ?? 'Spray'
    const areaTitle = bucket.targetArea || '(no area)'
    // Title: just the area (e.g. "Greens"). Type chip renders
    // separately in the calendar cell + agenda row, OR appears as a
    // " · TypeLabel" suffix when the consumer wants a single string.
    const title = areaTitle
    const subtitle = type === 'spray' ? null : typeLabel

    // status breakdown across the bucket.
    const statusBreakdown = { planned: 0, completed: 0, skipped: 0, canceled: 0 }
    let anyLinked = false
    for (const it of bucket.items) {
      statusBreakdown[it.status ?? 'planned'] =
        (statusBreakdown[it.status ?? 'planned'] ?? 0) + 1
      if (it.hasCompletedLink) anyLinked = true
    }

    out.push({
      id:               bucket.id,
      title,
      subtitle,
      applicationType:  type,
      typeLabel,
      programId:        bucket.programId,
      programName:      bucket.programName,
      targetArea:       bucket.targetArea,
      plannedStartDate: bucket.plannedStartDate,
      plannedEndDate:   bucket.plannedEndDate,
      _start:           bucket._start,
      _end:             bucket._end,
      isStaleOrMissingDate: bucket.isStaleOrMissingDate,
      items:            bucket.items,
      productCount:     bucket.items.length,
      hasCompletedLink: anyLinked,
      statusBreakdown,
      nutrientSummary:  Array.from(bucket.nutrientSummarySet),
      notes:            Array.from(bucket.notesSet),
    })
  }

  // Sort earliest-first within the array so consumers can render
  // agenda rows directly without resorting.
  out.sort((a, b) => {
    const av = a._start ?? Number.POSITIVE_INFINITY
    const bv = b._start ?? Number.POSITIVE_INFINITY
    if (av !== bv) return av - bv
    // Same date → put higher-priority types first (Aeration before
    // Water In before Granular before Spray).
    const ar = TYPE_PRIORITY[a.applicationType] ?? 0
    const br = TYPE_PRIORITY[b.applicationType] ?? 0
    if (ar !== br) return br - ar
    return (a.title ?? '').localeCompare(b.title ?? '')
  })
  return out
}

/**
 * Group calendar events by day key, mirroring the existing
 * groupProgramItemsByDate output shape so consumers can render the
 * monthly grid with grouped events instead of per-product items.
 *
 * @param {Array} events  output of groupProgramItemsForCalendar
 * @returns {{ byDay: Object<string, Array>, unscheduled: Array }}
 */
export function groupCalendarEventsByDate(events = []) {
  const byDay = {}
  const unscheduled = []

  for (const ev of Array.isArray(events) ? events : []) {
    if (!ev) continue
    if (ev.isStaleOrMissingDate || ev._start == null || ev._end == null) {
      unscheduled.push(ev)
      continue
    }
    const spanDays = Math.floor((ev._end - ev._start) / DAY_MS) + 1
    if (spanDays > MAX_RANGE_DAYS) {
      const key = dayKey(ev._start)
      ;(byDay[key] = byDay[key] ?? []).push(ev)
      unscheduled.push(ev)
      continue
    }
    for (let t = ev._start; t <= ev._end; t += DAY_MS) {
      const key = dayKey(t)
      ;(byDay[key] = byDay[key] ?? []).push(ev)
    }
  }

  // Sort each day: higher-priority application type first, then by
  // area name for stability.
  function cmp(a, b) {
    const ar = TYPE_PRIORITY[a.applicationType] ?? 0
    const br = TYPE_PRIORITY[b.applicationType] ?? 0
    if (ar !== br) return br - ar
    return (a.title ?? '').localeCompare(b.title ?? '')
  }
  for (const key of Object.keys(byDay)) byDay[key].sort(cmp)
  unscheduled.sort(cmp)
  return { byDay, unscheduled }
}

// Exported for the smoke; not part of the public render contract.
export const __TEST = {
  isValidDate,
  parseDayMs,
  dayKey,
  MAX_RANGE_DAYS,
  DAY_MS,
  STATUS_VALUES,
  LINK_STATES,
  SORT_MODES,
  // Phase 7R.4 internals
  APPLICATION_TYPE_LABEL,
  TYPE_PRIORITY,
  deriveApplicationType,
  pickBucketType,
  extractNutrientSummary,
  makeEventId,
}
