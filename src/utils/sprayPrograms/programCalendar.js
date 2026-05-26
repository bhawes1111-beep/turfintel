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

// Exported for the smoke; not part of the public render contract.
export const __TEST = {
  isValidDate,
  parseDayMs,
  dayKey,
  MAX_RANGE_DAYS,
  DAY_MS,
}
