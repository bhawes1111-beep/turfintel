import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildPayrollBreakdown, defaultPayrollRange } from '../src/utils/crew/payrollMath.js'
import { paidScheduleHours, paidScheduleHoursForShift, scheduleLunchBreakMinutes } from '../src/utils/schedules/scheduleHours.js'

function nearly(actual, expected, label) {
  assert.equal(Math.abs(actual - expected) < 0.01, true, `${label}: expected ${expected}, got ${actual}`)
}

assert.deepEqual(
  defaultPayrollRange('2026-08-03'),
  { startDate: '2026-07-27', endDate: '2026-08-09' },
  'current pay period is anchored to July 27, 2026',
)
assert.deepEqual(
  defaultPayrollRange('2026-08-10'),
  { startDate: '2026-08-10', endDate: '2026-08-23' },
  'pay period advances every fourteen days',
)
assert.deepEqual(
  defaultPayrollRange('2026-07-26'),
  { startDate: '2026-07-13', endDate: '2026-07-26' },
  'dates before the anchor resolve to the preceding biweekly period',
)

const employees = [
  { id: 'emp-hourly', name: 'Hourly Employee', role: 'Grounds', department: 'Grounds', payType: 'hourly', payRate: 20 },
  { id: 'emp-salary', name: 'Salary Employee', role: 'Supervisor', department: 'Supervisory', payType: 'salary', salaryAmount: 52000 },
  { id: 'emp-excluded', name: 'Other Department', role: 'Helper', department: 'Outside', payType: 'hourly', payRate: 99, excludeFromPayroll: true },
  { id: 'emp-inactive', name: 'Inactive Employee', role: 'Grounds', department: 'Grounds', status: 'inactive', payType: 'hourly', payRate: 20 },
]

const weeklySchedules = [
  0, 1, 2, 3, 4, 5,
].map(dayOfWeek => ({
  id: `hourly-${dayOfWeek}`,
  employeeId: 'emp-hourly',
  dayOfWeek,
  status: 'scheduled',
  startTime: '08:00',
  endTime: '17:00',
})).concat([1, 2, 3, 4, 5].map(dayOfWeek => ({
  id: `salary-${dayOfWeek}`,
  employeeId: 'emp-salary',
  dayOfWeek,
  status: 'scheduled',
  startTime: '08:00',
  endTime: '16:00',
}))).concat([1, 2, 3, 4, 5].map(dayOfWeek => ({
  id: `excluded-${dayOfWeek}`,
  employeeId: 'emp-excluded',
  dayOfWeek,
  status: 'scheduled',
  startTime: '07:00',
  endTime: '15:00',
}))).concat([1, 2, 3, 4, 5].map(dayOfWeek => ({
  id: `inactive-${dayOfWeek}`,
  employeeId: 'emp-inactive',
  dayOfWeek,
  status: 'scheduled',
  startTime: '05:00',
  endTime: '13:00',
})))

const payroll = buildPayrollBreakdown({
  employees,
  weeklySchedules,
  scheduleOverrides: [],
  startDate: '2026-08-02',
  endDate: '2026-08-08',
})

const hourly = payroll.rows.find(row => row.employeeId === 'emp-hourly')
const salary = payroll.rows.find(row => row.employeeId === 'emp-salary')
const excluded = payroll.rows.find(row => row.employeeId === 'emp-excluded')
const inactive = payroll.rows.find(row => row.employeeId === 'emp-inactive')

assert.ok(hourly, 'hourly employee row exists')
assert.equal(salary, undefined, 'salary employee is excluded from payroll')
assert.equal(excluded, undefined, 'excluded employee is skipped from payroll')
assert.equal(inactive, undefined, 'inactive employee is skipped from payroll')

nearly(hourly.scheduledHours, 51, 'hourly scheduled hours')
nearly(hourly.regularHours, 40, 'hourly regular hours')
nearly(hourly.overtimeHours, 11, 'hourly overtime hours')
nearly(hourly.regularPay, 800, 'hourly regular pay')
nearly(hourly.overtimePay, 330, 'hourly overtime pay')
nearly(hourly.totalPay, 1130, 'hourly total pay')

nearly(payroll.totals.scheduledHours, 51, 'total scheduled hours')
nearly(payroll.totals.overtimeHours, 11, 'total overtime hours')
nearly(payroll.totals.totalPay, 1130, 'total payroll')
nearly(paidScheduleHours('05:00', '01:30'), 8, 'morning shift with 1:30 PM stored as 01:30')
nearly(paidScheduleHours('08:00', '16:00', 30), 7.5, 'checked lunch subtracts 30 minutes')
nearly(paidScheduleHours('08:00', '16:00', 0), 8, 'unchecked lunch keeps the full shift')
nearly(paidScheduleHours('08:00', '12:00', 30), 4, 'short shifts do not deduct lunch')
nearly(paidScheduleHoursForShift({ startTime: '08:00', endTime: '16:00' }), 7.5, 'automatic lunch defaults on for an eight-hour shift')
nearly(paidScheduleHoursForShift({ startTime: '08:00', endTime: '16:00', autoLunchBreak: false, lunchStartTime: '12:00', lunchEndTime: '12:45' }), 7.25, 'manual lunch uses the entered interval')
nearly(paidScheduleHoursForShift({ startTime: '08:00', endTime: '14:00', autoLunchBreak: false, lunchStartTime: '11:30', lunchEndTime: '12:00' }), 5.5, 'manual lunch deducts from a shorter shift')
nearly(scheduleLunchBreakMinutes({ autoLunchBreak: false, lunchStartTime: '12:00', lunchEndTime: '12:45' }), 45, 'manual lunch reports its actual minutes')

const employeesPage = await readFile(new URL('../src/pages/Employees/Employees.jsx', import.meta.url), 'utf8')
assert.match(employeesPage, /EmployeePayroll/, 'Employees page imports payroll tab')
assert.match(employeesPage, /'Payroll'/, 'Employees page exposes payroll tab')

const payrollComponent = await readFile(new URL('../src/pages/Employees/tabs/EmployeePayroll.jsx', import.meta.url), 'utf8')
assert.match(payrollComponent, /Employee Breakdown/, 'Payroll component has employee breakdown')
assert.match(payrollComponent, /PayrollEmployeeCard/, 'Payroll component breaks down employees into cards')
assert.match(payrollComponent, /row\.shifts\.map/, 'Payroll component lists each shift')
assert.match(payrollComponent, /lunchStartTime/, 'Payroll component shows each shift manual lunch interval')

console.log('Employee payroll smoke passed')
