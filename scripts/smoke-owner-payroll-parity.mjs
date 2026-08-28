import assert from 'node:assert/strict'
import { buildPayrollBreakdown } from '../src/utils/crew/payrollMath.js'
import { buildAgronomyProgressReport } from '../src/utils/reports/reportBuilder.js'

const employees = [
  { id: 'hourly', name: 'Hourly Employee', status: 'active', payType: 'hourly', payRate: 20 },
  { id: 'salary', name: 'Salary Employee', status: 'active', payType: 'salary', salaryAmount: 52000 },
  { id: 'excluded', name: 'Excluded Employee', status: 'active', payType: 'hourly', payRate: 100, excludeFromPayroll: true },
]

const weeklySchedules = [0, 1, 2, 3, 4, 5].map(dayOfWeek => ({
  id: `hourly-${dayOfWeek}`,
  employeeId: 'hourly',
  dayOfWeek,
  status: 'scheduled',
  startTime: '08:00',
  endTime: '17:00',
})).concat([1, 2, 3, 4, 5].flatMap(dayOfWeek => ([
  {
    id: `salary-${dayOfWeek}`,
    employeeId: 'salary',
    dayOfWeek,
    status: 'scheduled',
    startTime: '08:00',
    endTime: '16:00',
  },
  {
    id: `excluded-${dayOfWeek}`,
    employeeId: 'excluded',
    dayOfWeek,
    status: 'scheduled',
    startTime: '08:00',
    endTime: '16:00',
  },
])))

const options = { startDate: '2026-08-02', endDate: '2026-08-08' }
const payroll = buildPayrollBreakdown({ employees, weeklySchedules, scheduleOverrides: [], ...options })
const ownerReport = buildAgronomyProgressReport({
  employees,
  weeklySchedules,
  scheduleOverrides: [],
}, options)

const ownerTotals = ownerReport.metadata.totals
assert.equal(ownerTotals.scheduleHours, payroll.totals.scheduledHours, 'scheduled hours match payroll tab')
assert.equal(ownerTotals.regularHours, payroll.totals.regularHours, 'regular hours match payroll tab')
assert.equal(ownerTotals.overtimeHours, payroll.totals.overtimeHours, 'overtime hours match payroll tab')
assert.equal(ownerTotals.payrollTotal, payroll.totals.totalPay, 'payroll dollars match payroll tab')
assert.equal(ownerTotals.payrollTotal, 1130, 'hourly overtime is included and salary pay is excluded')
assert.equal(payroll.rows.some(row => row.employeeId === 'salary'), false, 'salary employee is absent from payroll rows')

const payrollSection = ownerReport.sections.find(section => section.title === 'Labor / Payroll')
assert.equal(
  JSON.stringify(payrollSection?.data?.rows ?? []).includes('Salary Employee'),
  false,
  'salary employee is absent from owner report payroll rows',
)

console.log('Owner report payroll parity smoke passed')
