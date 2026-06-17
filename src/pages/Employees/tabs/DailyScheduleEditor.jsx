// Phase E.2 — Today's Schedule editor.
//
// Date-picker + per-employee status/time/notes row built on top of the
// recurring weekly grid + per-date overrides. Editing a row creates or
// patches an employee_schedule_override; clearing the override returns
// the employee to recurring behavior without touching the weekly grid.
//
// The merge logic mirrors the worker's /api/employee-schedules/daily
// endpoint so this component can render purely from cached stores
// (useCrewData + useEmployeeSchedulesData + useScheduleOverridesData)
// without an extra fetch per date change.

import { useMemo, useState } from 'react'
import { useCrewData } from '../../../utils/crew/crewStore'
import { useEmployeeSchedulesData } from '../../../utils/schedules/schedulesStore'
import {
  useScheduleOverridesData,
  createScheduleOverride,
  patchScheduleOverride,
  deleteScheduleOverride,
} from '../../../utils/schedules/scheduleOverridesStore'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from './WeeklyScheduleEditor.module.css'

const STATUS_OPTS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'off',       label: 'Off' },
  { value: 'vacation',  label: 'Vacation' },
  { value: 'sick',      label: 'Sick' },
]

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

export default function DailyScheduleEditor() {
  const { employees }                 = useCrewData()
  const { schedules: weeklySchedules } = useEmployeeSchedulesData()
  const { overrides }                  = useScheduleOverridesData()
  const toast                          = useToast()

  const [selectedDate, setSelectedDate] = useState(TODAY_ISO)
  const [busyEmpId, setBusyEmpId]       = useState(null)

  const selectedDow = useMemo(() => {
    return new Date(`${selectedDate}T00:00:00`).getDay()
  }, [selectedDate])

  // Active employees only — inactive crew never appear on a daily roster.
  // Matches the worker's daily endpoint exactly.
  const activeEmployees = useMemo(() => {
    return employees
      .filter(e => e.status !== 'inactive')
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [employees])

  const recurringByEmp = useMemo(() => {
    const m = new Map()
    for (const s of weeklySchedules) {
      if (s.dayOfWeek !== selectedDow) continue
      m.set(s.employeeId, s)
    }
    return m
  }, [weeklySchedules, selectedDow])

  const overrideByEmp = useMemo(() => {
    const m = new Map()
    for (const o of overrides) {
      if (o.effectiveDate !== selectedDate) continue
      m.set(o.employeeId, o)
    }
    return m
  }, [overrides, selectedDate])

  // Merge rule mirrors the worker. Each row carries `source` so the UI
  // can show the right pill + the Reset button only when an override
  // is actually in place.
  const mergedRows = useMemo(() => {
    return activeEmployees.map(emp => {
      const ov  = overrideByEmp.get(emp.id)
      const rec = recurringByEmp.get(emp.id)
      if (ov) {
        return {
          employeeId:   emp.id,
          employeeName: emp.name,
          role:         ov.role ?? rec?.role ?? emp.role ?? null,
          status:       ov.status,
          startTime:    ov.startTime,
          endTime:      ov.endTime,
          notes:        ov.notes ?? '',
          source:       'override',
          overrideId:   ov.id,
        }
      }
      if (rec) {
        return {
          employeeId:   emp.id,
          employeeName: emp.name,
          role:         rec.role ?? emp.role ?? null,
          status:       rec.status,
          startTime:    rec.startTime,
          endTime:      rec.endTime,
          notes:        '',
          source:       'recurring',
          overrideId:   null,
        }
      }
      return {
        employeeId:   emp.id,
        employeeName: emp.name,
        role:         emp.role ?? null,
        status:       'scheduled',
        startTime:    null,
        endTime:      null,
        notes:        '',
        source:       'none',
        overrideId:   null,
      }
    })
  }, [activeEmployees, recurringByEmp, overrideByEmp])

  // Apply an override edit. If the row already has an override id, we
  // PATCH; otherwise we POST a new override. Empty / missing fields
  // pass through as null so the worker doesn't store empty-string
  // sentinels.
  async function applyEdit(row, patch) {
    setBusyEmpId(row.employeeId)
    try {
      const payload = {
        startTime: patch.startTime ?? row.startTime ?? null,
        endTime:   patch.endTime   ?? row.endTime   ?? null,
        role:      patch.role      ?? row.role      ?? null,
        status:    patch.status    ?? row.status    ?? 'scheduled',
        notes:     patch.notes     ?? row.notes     ?? null,
      }
      if (row.overrideId) {
        await patchScheduleOverride(row.overrideId, payload)
      } else {
        await createScheduleOverride({
          employeeId:    row.employeeId,
          effectiveDate: selectedDate,
          ...payload,
        })
      }
    } catch (err) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setBusyEmpId(null)
    }
  }

  // Reset returns the row to recurring behavior (or unscheduled when
  // there's no recurring rule for that DOW). The recurring weekly grid
  // is never touched.
  async function resetToRecurring(row) {
    if (!row.overrideId) return
    setBusyEmpId(row.employeeId)
    try {
      await deleteScheduleOverride(row.overrideId)
      toast.success(`Reset ${row.employeeName} to recurring schedule`)
    } catch (err) {
      toast.error(`Reset failed: ${err.message}`)
    } finally {
      setBusyEmpId(null)
    }
  }

  return (
    <section className={styles.dailySection} data-phase="E.2">
      <header className={styles.dailyHeader}>
        <div>
          <h3 className={styles.dailyTitle}>Today's Schedule</h3>
          <p className={styles.dailyHint}>
            Mark someone off, sick, or vacation for this one date without changing the weekly schedule.
            Use Reset to return them to the recurring grid.
          </p>
        </div>
        <label className={styles.dailyDatePicker}>
          <span>Date</span>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            aria-label="Schedule date"
          />
        </label>
      </header>

      <table className={styles.dailyTable}>
        <thead>
          <tr>
            <th>Operator</th>
            <th>Role</th>
            <th>Status</th>
            <th>Start</th>
            <th>End</th>
            <th>Notes</th>
            <th>Source</th>
            <th aria-label="Reset" />
          </tr>
        </thead>
        <tbody>
          {mergedRows.length === 0 ? (
            <tr>
              <td colSpan={8} className={styles.dailyEmpty}>
                No active employees. Add crew in Employee Management to start scheduling.
              </td>
            </tr>
          ) : mergedRows.map(row => {
            const busy = busyEmpId === row.employeeId
            return (
              <tr
                key={row.employeeId}
                data-status={row.status}
                data-source={row.source}
              >
                <td className={styles.dailyName}>{row.employeeName}</td>
                <td>{row.role ?? '—'}</td>
                <td>
                  <select
                    className={styles.dailyStatusSelect}
                    value={row.status}
                    disabled={busy}
                    onChange={e => applyEdit(row, { status: e.target.value })}
                  >
                    {STATUS_OPTS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="time"
                    className={styles.dailyTimeInput}
                    value={row.startTime ?? ''}
                    disabled={busy || row.status !== 'scheduled'}
                    onChange={e => applyEdit(row, { startTime: e.target.value || null })}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className={styles.dailyTimeInput}
                    value={row.endTime ?? ''}
                    disabled={busy || row.status !== 'scheduled'}
                    onChange={e => applyEdit(row, { endTime: e.target.value || null })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className={styles.dailyNotesInput}
                    value={row.notes}
                    disabled={busy}
                    placeholder="called out, doctor, late…"
                    onBlur={e => {
                      const next = e.target.value.trim() || null
                      const current = row.notes || null
                      if (next === current) return
                      applyEdit(row, { notes: next })
                    }}
                    onChange={e => {
                      // Optimistic local typing — we don't PATCH per
                      // keystroke. Commit happens on blur (above).
                      e.target.value = e.target.value
                    }}
                  />
                </td>
                <td>
                  <span
                    className={styles.dailySourcePill}
                    data-source={row.source}
                  >
                    {row.source === 'override'  && 'Override'}
                    {row.source === 'recurring' && 'Recurring'}
                    {row.source === 'none'      && 'Unscheduled'}
                  </span>
                </td>
                <td>
                  {row.overrideId && (
                    <button
                      type="button"
                      className={styles.dailyResetBtn}
                      onClick={() => resetToRecurring(row)}
                      disabled={busy}
                      title="Remove the override and return to the recurring schedule"
                    >
                      Reset
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
