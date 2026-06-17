// Phase E.4 — Shared daily schedule merge helper.
//
// Mirrors the worker's /api/employee-schedules/daily merge logic so the
// DAB (Copy Yesterday / Copy From Date / row render) and the public
// kiosk (Display Board) can reuse a single source-of-truth merge
// instead of duplicating "override wins, fallback to recurring" rules
// across surfaces.
//
// Precedence:
//   1. Override for that exact effective_date → use it.
//   2. Recurring rule for that day_of_week → use it.
//   3. Neither → 'scheduled' with NULL times, source='none' (matches
//      the worker's pre-existing "treat unscheduled as scheduled when
//      no rules exist anywhere" fallback).
//
// The `hasAnyScheduleData` flag tells consumers whether the system has
// ANY recurring or override rows at all. Callers use this to decide
// whether to fall back to the legacy "show all active employees"
// behavior (when both stores are empty) or to enforce strict scheduling
// (when at least one rule exists).

/**
 * Build a Map<employeeId, { status, source, role, startTime, endTime, notes, overrideId, recurringId }>
 * for a given date.
 *
 * @param {string} dateIso              YYYY-MM-DD
 * @param {Array}  weeklySchedules      from useEmployeeSchedulesData
 * @param {Array}  scheduleOverrides    from useScheduleOverridesData
 * @returns {Map}
 */
export function buildScheduleByEmployeeForDate(dateIso, weeklySchedules, scheduleOverrides) {
  if (!dateIso) return new Map()
  const dow = new Date(`${dateIso}T00:00:00`).getDay()

  const byEmp = new Map()

  // Recurring rules first; overrides overwrite below.
  for (const s of weeklySchedules) {
    if (s.dayOfWeek !== dow) continue
    byEmp.set(s.employeeId, {
      status:      s.status,
      source:      'recurring',
      role:        s.role ?? null,
      startTime:   s.startTime ?? null,
      endTime:     s.endTime ?? null,
      notes:       null,
      recurringId: s.id,
      overrideId:  null,
    })
  }

  for (const o of scheduleOverrides) {
    if (o.effectiveDate !== dateIso) continue
    const prev = byEmp.get(o.employeeId)
    byEmp.set(o.employeeId, {
      status:      o.status,
      source:      'override',
      role:        o.role ?? prev?.role ?? null,
      startTime:   o.startTime ?? null,
      endTime:     o.endTime ?? null,
      notes:       o.notes ?? null,
      recurringId: prev?.recurringId ?? null,
      overrideId:  o.id,
    })
  }

  return byEmp
}

/**
 * Resolve a single employee's merged schedule for a given date.
 *
 * Returns null when there is no rule (caller decides how to handle
 * — show as scheduled fallback, or treat as unscheduled / skip).
 */
export function getScheduleStatusForEmployee(empId, dateIso, weeklySchedules, scheduleOverrides) {
  if (!empId || !dateIso) return null
  const map = buildScheduleByEmployeeForDate(dateIso, weeklySchedules, scheduleOverrides)
  return map.get(empId) ?? null
}

/**
 * Whether the system has ANY recurring or override rows at all. When
 * false, callers fall back to the legacy behavior (show all active
 * employees, allow all copies). When true, strict merge applies.
 */
export function hasAnyScheduleData(weeklySchedules, scheduleOverrides) {
  return (weeklySchedules?.length ?? 0) > 0 || (scheduleOverrides?.length ?? 0) > 0
}

/**
 * Decide whether an employee may receive a copied assignment for the
 * destination date. Returns { allowed, reason } where reason is one of
 * 'off' | 'sick' | 'vacation' | 'unscheduled' when allowed === false.
 *
 * Honors the "no rules at all" fallback: when both stores are empty,
 * every employee is allowed (matches the DAB's legacy fallback).
 */
export function isEmployeeAssignableForDate(empId, dateIso, weeklySchedules, scheduleOverrides) {
  if (!hasAnyScheduleData(weeklySchedules, scheduleOverrides)) {
    return { allowed: true, reason: null }
  }
  const merged = getScheduleStatusForEmployee(empId, dateIso, weeklySchedules, scheduleOverrides)
  if (!merged) return { allowed: false, reason: 'unscheduled' }
  if (merged.status === 'scheduled') return { allowed: true, reason: null }
  return { allowed: false, reason: merged.status }
}
