export const DEFAULT_LUNCH_BREAK_MINUTES = 30

export function grossScheduleHours(startTime, endTime) {
  if (!startTime || !endTime) return 0
  const [sh, sm] = String(startTime).split(':').map(Number)
  const [eh, em] = String(endTime).split(':').map(Number)
  if (![sh, sm, eh, em].every(Number.isFinite)) return 0
  const start = sh * 60 + sm
  const end = eh * 60 + em
  let diff = end - start
  if (diff < 0 && sh < 12) {
    const afternoonEnd = end + (12 * 60)
    const afternoonDiff = afternoonEnd - start
    if (afternoonDiff > 0 && afternoonDiff <= 12 * 60) diff = afternoonDiff
  }
  if (diff < 0) diff += 24 * 60
  if (diff <= 0) return 0
  return Math.round((diff / 60) * 100) / 100
}

export function paidScheduleHours(startTime, endTime, lunchBreakMinutes = DEFAULT_LUNCH_BREAK_MINUTES) {
  const gross = grossScheduleHours(startTime, endTime)
  if (gross <= 0) return 0
  if (gross < 8) return gross
  const lunchHours = Math.max(0, Number(lunchBreakMinutes) || 0) / 60
  return Math.max(0, Math.round((gross - lunchHours) * 100) / 100)
}

export function scheduleLunchBreakMinutes(schedule = {}) {
  if (schedule.autoLunchBreak !== false) return DEFAULT_LUNCH_BREAK_MINUTES
  const lunchHours = grossScheduleHours(schedule.lunchStartTime, schedule.lunchEndTime)
  return Math.max(0, Math.round(lunchHours * 60))
}

export function paidScheduleHoursForShift(schedule = {}) {
  const gross = grossScheduleHours(schedule.startTime, schedule.endTime)
  if (gross <= 0) return 0
  if (schedule.autoLunchBreak !== false) {
    return paidScheduleHours(schedule.startTime, schedule.endTime, DEFAULT_LUNCH_BREAK_MINUTES)
  }
  const lunchHours = scheduleLunchBreakMinutes(schedule) / 60
  return Math.max(0, Math.round((gross - lunchHours) * 100) / 100)
}
