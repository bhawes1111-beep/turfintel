import { buildScheduleByEmployeeForDate } from '../schedules/dailyScheduleMerge.js'
import { paidScheduleHoursForShift, scheduleLunchBreakMinutes } from '../schedules/scheduleHours.js'

const OVERTIME_THRESHOLD = 40
const OVERTIME_MULTIPLIER = 1.5
const SALARY_WORK_DAYS_PER_YEAR = 260
export const PAYROLL_PERIOD_ANCHOR = '2026-07-27'
export const PAYROLL_PERIOD_DAYS = 14

function parseLocalDate(dateIso) {
  if (!dateIso) return null
  const date = new Date(`${dateIso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function toIsoDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function isoDateRange(startDate, endDate) {
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)
  if (!start || !end) return []
  const first = start <= end ? start : end
  const last = start <= end ? end : start
  const dates = []
  for (let cursor = new Date(first); cursor <= last; cursor = addDays(cursor, 1)) {
    dates.push(toIsoDate(cursor))
  }
  return dates
}

export function payrollWeekStartKey(dateIso) {
  const date = parseLocalDate(dateIso)
  if (!date) return null
  date.setDate(date.getDate() - date.getDay())
  return toIsoDate(date)
}

export function defaultPayrollRange(referenceDate = new Date(), anchorDate = PAYROLL_PERIOD_ANCHOR) {
  const reference = referenceDate instanceof Date
    ? new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
    : parseLocalDate(referenceDate)
  const anchor = parseLocalDate(anchorDate)
  if (!reference || !anchor) return { startDate: '', endDate: '' }

  const referenceUtc = Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate())
  const anchorUtc = Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
  const daysFromAnchor = Math.floor((referenceUtc - anchorUtc) / 86400000)
  const periodOffset = Math.floor(daysFromAnchor / PAYROLL_PERIOD_DAYS) * PAYROLL_PERIOD_DAYS
  const start = addDays(anchor, periodOffset)
  const end = addDays(start, PAYROLL_PERIOD_DAYS - 1)
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) }
}

function employeeDisplayName(employee) {
  return employee?.name ?? employee?.fullName ?? employee?.employeeId ?? employee?.id ?? 'Unassigned'
}

function employeeId(employee) {
  return employee?.id ?? employee?.employeeId ?? null
}

function isSalaryEmployee(employee) {
  return employee?.payType === 'salary'
}

function employeeAnnualSalary(employee) {
  return toNumber(employee?.salaryAmount) ?? 0
}

function employeeHourlyRate(employee) {
  return toNumber(employee?.payRate) ?? 0
}

function splitOvertimeForShift(hours, priorWeekHours) {
  const regularHours = Math.min(hours, Math.max(0, OVERTIME_THRESHOLD - priorWeekHours))
  const overtimeHours = Math.max(0, hours - regularHours)
  return { regularHours, overtimeHours }
}

export function buildPayrollBreakdown({
  employees = [],
  weeklySchedules = [],
  scheduleOverrides = [],
  startDate,
  endDate,
} = {}) {
  const dates = isoDateRange(startDate, endDate)
  const employeesById = new Map()
  for (const employee of employees) {
    const id = employeeId(employee)
    if (id) employeesById.set(id, employee)
  }

  const rowsByEmployee = new Map()

  for (const date of dates) {
    const daySchedule = buildScheduleByEmployeeForDate(date, weeklySchedules, scheduleOverrides)
    for (const [id, schedule] of daySchedule.entries()) {
      if (schedule?.status !== 'scheduled') continue
      const lunchBreakMinutes = scheduleLunchBreakMinutes(schedule)
      const hours = paidScheduleHoursForShift(schedule)
      if (hours <= 0) continue
      const employee = employeesById.get(id)
      if (!employee || employee.status === 'inactive') continue
      if (isSalaryEmployee(employee)) continue
      if (employee?.excludeFromPayroll) continue
      const key = id || employeeDisplayName(employee)
      const existing = rowsByEmployee.get(key) ?? {
        employeeId: id,
        name: employeeDisplayName(employee),
        role: employee?.role ?? '',
        department: employee?.department ?? '',
        payType: isSalaryEmployee(employee) ? 'salary' : 'hourly',
        hidePayRate: Boolean(employee?.hidePayRate),
        hourlyRate: employeeHourlyRate(employee),
        annualSalary: employeeAnnualSalary(employee),
        scheduledDays: 0,
        scheduledHours: 0,
        regularHours: 0,
        overtimeHours: 0,
        regularPay: 0,
        overtimePay: 0,
        salaryPay: 0,
        totalPay: 0,
        missingPayRate: false,
        shifts: [],
        weeklyHours: new Map(),
      }

      const weekKey = payrollWeekStartKey(date) ?? 'unknown-week'
      const priorWeekHours = existing.weeklyHours.get(weekKey) ?? 0
      const { regularHours, overtimeHours } = splitOvertimeForShift(hours, priorWeekHours)

      existing.scheduledDays += 1
      existing.scheduledHours += hours
      if (existing.payType === 'hourly') {
        existing.regularHours += regularHours
        existing.overtimeHours += overtimeHours
      }
      existing.weeklyHours.set(weekKey, priorWeekHours + hours)
      existing.shifts.push({
        date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        lunchBreakMinutes,
        lunchStartTime: schedule.lunchStartTime ?? null,
        lunchEndTime: schedule.lunchEndTime ?? null,
        autoLunchBreak: schedule.autoLunchBreak !== false,
        hours,
        regularHours,
        overtimeHours,
        regularPay: existing.payType === 'hourly' ? regularHours * existing.hourlyRate : 0,
        overtimePay: existing.payType === 'hourly' ? overtimeHours * existing.hourlyRate * OVERTIME_MULTIPLIER : 0,
        totalPay: existing.payType === 'hourly'
          ? (regularHours * existing.hourlyRate) + (overtimeHours * existing.hourlyRate * OVERTIME_MULTIPLIER)
          : 0,
        source: schedule.source,
      })

      if (existing.payType === 'hourly') {
        existing.missingPayRate = existing.hourlyRate <= 0
        existing.regularPay += regularHours * existing.hourlyRate
        existing.overtimePay += overtimeHours * existing.hourlyRate * OVERTIME_MULTIPLIER
      }

      rowsByEmployee.set(key, existing)
    }
  }

  const rows = [...rowsByEmployee.values()]
    .map(row => {
      const salaryPay = row.payType === 'salary'
        ? (row.annualSalary > 0 ? (row.annualSalary / SALARY_WORK_DAYS_PER_YEAR) * row.scheduledDays : 0)
        : 0
      const missingPayRate = row.payType === 'salary'
        ? row.annualSalary <= 0
        : row.missingPayRate
      const totalPay = row.payType === 'salary'
        ? salaryPay
        : row.regularPay + row.overtimePay
      return {
        ...row,
        scheduledHours: round2(row.scheduledHours),
        regularHours: round2(row.regularHours),
        overtimeHours: round2(row.overtimeHours),
        regularPay: round2(row.regularPay),
        overtimePay: round2(row.overtimePay),
        salaryPay: round2(salaryPay),
        totalPay: round2(totalPay),
        missingPayRate,
        shifts: row.shifts.map(shift => ({
          ...shift,
          hours: round2(shift.hours),
          regularHours: round2(shift.regularHours),
          overtimeHours: round2(shift.overtimeHours),
          regularPay: round2(shift.regularPay),
          overtimePay: round2(shift.overtimePay),
          totalPay: round2(shift.totalPay),
        })),
        weeklyHours: undefined,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const totals = rows.reduce((sum, row) => {
    sum.employees += 1
    sum.scheduledDays += row.scheduledDays
    sum.scheduledHours += row.scheduledHours
    sum.regularHours += row.regularHours
    sum.overtimeHours += row.overtimeHours
    sum.regularPay += row.regularPay
    sum.overtimePay += row.overtimePay
    sum.salaryPay += row.salaryPay
    sum.totalPay += row.totalPay
    if (row.missingPayRate) sum.missingPayRates += 1
    return sum
  }, {
    employees: 0,
    scheduledDays: 0,
    scheduledHours: 0,
    regularHours: 0,
    overtimeHours: 0,
    regularPay: 0,
    overtimePay: 0,
    salaryPay: 0,
    totalPay: 0,
    missingPayRates: 0,
  })

  for (const key of Object.keys(totals)) {
    if (typeof totals[key] === 'number') totals[key] = round2(totals[key])
  }

  return {
    startDate: dates[0] ?? startDate ?? '',
    endDate: dates[dates.length - 1] ?? endDate ?? '',
    dates,
    rows,
    totals,
    mathNotes: [
      'Scheduled hours use the same schedule math as the rest of TurfIntel.',
      'Auto lunch deducts 30 minutes on shifts scheduled 8 hours or longer; manual lunch uses the entered out/in interval.',
      'Hourly overtime is calculated after 40 paid hours in each Sunday-Saturday week at time and a half.',
      'Salary employees are excluded from payroll calculations and payroll reports.',
      'Employees marked excluded from payroll are skipped even when scheduled.',
    ],
  }
}
