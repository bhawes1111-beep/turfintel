import { useMemo, useState } from 'react'
import { useCrewData } from '../../../utils/crew/crewStore'
import { useEmployeeSchedulesData } from '../../../utils/schedules/schedulesStore'
import { useScheduleOverridesData } from '../../../utils/schedules/scheduleOverridesStore'
import { buildPayrollBreakdown, defaultPayrollRange } from '../../../utils/crew/payrollMath'
import styles from '../Employees.module.css'

const initialRange = defaultPayrollRange()

function money(value) {
  return `$${(Number(value) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function hours(value) {
  const n = Number(value) || 0
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} hrs`
}

function formatTime(value) {
  if (!value) return '--'
  const [hh, mm] = String(value).split(':')
  const h = Number(hh)
  if (!Number.isFinite(h)) return value
  const suffix = h >= 12 ? 'PM' : 'AM'
  const displayHour = h % 12 || 12
  return `${displayHour}:${mm ?? '00'} ${suffix}`
}

function paySetup(row) {
  if (row.hidePayRate) return 'Pay rate hidden'
  if (row.payType === 'salary') {
    return row.annualSalary > 0
      ? `${money(row.annualSalary)} / yr`
      : 'Salary not set'
  }
  return row.hourlyRate > 0
    ? `${money(row.hourlyRate)} / hr`
    : 'Hourly rate not set'
}

export default function EmployeePayroll() {
  const { employees, loading: employeesLoading, error: employeesError } = useCrewData()
  const { schedules, loading: schedulesLoading, error: schedulesError } = useEmployeeSchedulesData()
  const { overrides, loading: overridesLoading, error: overridesError } = useScheduleOverridesData()
  const [startDate, setStartDate] = useState(initialRange.startDate)
  const [endDate, setEndDate] = useState(initialRange.endDate)

  const payroll = useMemo(() => buildPayrollBreakdown({
    employees,
    weeklySchedules: schedules,
    scheduleOverrides: overrides,
    startDate,
    endDate,
  }), [employees, schedules, overrides, startDate, endDate])

  const loading = employeesLoading || schedulesLoading || overridesLoading
  const error = employeesError || schedulesError || overridesError

  if (loading) return <p className={styles.empty}>Loading payroll data...</p>
  if (error) return <p className={styles.empty}>Could not load payroll data: {error}</p>

  return (
    <div className={styles.payrollRoot}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>Payroll</h3>
            <p className={styles.payrollSub}>
              Opens to the current biweekly pay period and pulls scheduled shifts, pay rates, lunch deductions, and overtime.
            </p>
          </div>
          <span className={styles.sectionHint}>Private management only</span>
        </div>

        <div className={styles.payrollToolbar}>
          <span className={styles.sectionHint}>Biweekly pay period</span>
          <label className={styles.payrollField}>
            <span>Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={event => setStartDate(event.target.value)}
            />
          </label>
          <label className={styles.payrollField}>
            <span>End date</span>
            <input
              type="date"
              value={endDate}
              onChange={event => setEndDate(event.target.value)}
            />
          </label>
        </div>

        <div className={styles.payrollSummaryGrid}>
          <div className={styles.payrollStat}>
            <span>Total payroll</span>
            <strong>{money(payroll.totals.totalPay)}</strong>
          </div>
          <div className={styles.payrollStat}>
            <span>Scheduled hours</span>
            <strong>{hours(payroll.totals.scheduledHours)}</strong>
          </div>
          <div className={styles.payrollStat}>
            <span>Regular hours</span>
            <strong>{hours(payroll.totals.regularHours)}</strong>
          </div>
          <div className={styles.payrollStat} data-tone={payroll.totals.overtimeHours > 0 ? 'warn' : undefined}>
            <span>Overtime</span>
            <strong>{hours(payroll.totals.overtimeHours)}</strong>
          </div>
          <div className={styles.payrollStat}>
            <span>Employees</span>
            <strong>{payroll.totals.employees}</strong>
          </div>
        </div>

        {payroll.totals.missingPayRates > 0 && (
          <p className={styles.payrollWarning}>
            {payroll.totals.missingPayRates} scheduled employee{payroll.totals.missingPayRates === 1 ? '' : 's'} need a pay rate before payroll is complete.
          </p>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Employee Breakdown</h3>
          <span className={styles.sectionHint}>
            {payroll.startDate || startDate} to {payroll.endDate || endDate}
          </span>
        </div>

        {payroll.rows.length === 0 ? (
          <p className={styles.empty}>No scheduled shifts with start and end times in this date range.</p>
        ) : (
          <div className={styles.payrollEmployeeList}>
            {payroll.rows.map(row => (
              <PayrollEmployeeCard key={row.employeeId ?? row.name} row={row} />
            ))}
          </div>
        )}
      </div>

      <div className={styles.payrollNotes}>
        {payroll.mathNotes.map(note => <span key={note}>{note}</span>)}
      </div>
    </div>
  )
}

function PayrollEmployeeCard({ row }) {
  return (
    <article className={styles.payrollEmployeeCard}>
      <header className={styles.payrollEmployeeHeader}>
        <div>
          <div className={styles.payrollEmployee}>{row.name}</div>
          <div className={styles.payrollMeta}>
            {[row.role, row.department].filter(Boolean).join(' · ') || 'No role set'} · {paySetup(row)}
          </div>
        </div>
        <strong className={styles.payrollEmployeeTotal}>{money(row.totalPay)}</strong>
      </header>

      <div className={styles.payrollMiniTotals}>
        <span><b>{row.scheduledDays}</b> days</span>
        <span><b>{hours(row.scheduledHours)}</b> scheduled</span>
        {row.payType === 'hourly' ? (
          <>
            <span><b>{hours(row.regularHours)}</b> regular</span>
            <span data-tone={row.overtimeHours > 0 ? 'warn' : undefined}><b>{hours(row.overtimeHours)}</b> OT</span>
            <span><b>{money(row.regularPay)}</b> regular pay</span>
            <span><b>{money(row.overtimePay)}</b> OT pay</span>
          </>
        ) : (
          <span><b>{money(row.salaryPay)}</b> salary pay</span>
        )}
      </div>

      {row.missingPayRate && (
        <p className={styles.payrollWarning}>Pay rate is missing for this employee.</p>
      )}

      <div className={styles.payrollShiftTableWrap}>
        <table className={styles.payrollShiftTable}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Shift</th>
              <th>Lunch</th>
              <th>Paid hours</th>
              <th>Regular</th>
              <th>OT</th>
              <th>Pay</th>
            </tr>
          </thead>
          <tbody>
            {row.shifts.map(shift => (
              <tr key={`${row.employeeId}-${shift.date}-${shift.startTime}-${shift.endTime}`}>
                <td>{shift.date}</td>
                <td>{formatTime(shift.startTime)} - {formatTime(shift.endTime)}</td>
                <td>
                  {shift.autoLunchBreak
                    ? 'Auto 30 min'
                    : shift.lunchStartTime && shift.lunchEndTime
                      ? `${formatTime(shift.lunchStartTime)} - ${formatTime(shift.lunchEndTime)} (${shift.lunchBreakMinutes} min)`
                      : 'None'}
                </td>
                <td>{hours(shift.hours)}</td>
                <td>{row.payType === 'salary' ? '--' : hours(shift.regularHours)}</td>
                <td>{row.payType === 'salary' ? '--' : hours(shift.overtimeHours)}</td>
                <td>{row.payType === 'salary' ? 'Salary' : money(shift.totalPay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}
