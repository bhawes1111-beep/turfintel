// Phase 13 — Weekly Schedule Editor.
//
// Employees × 7-day grid for editing recurring weekly schedules. Each
// cell is one row in employee_schedules keyed by
// (course_id, employee_id, day_of_week). Click a cell to expand it
// into an inline editor that lets the supervisor set status + times,
// or clear the day.
//
// Phase 1 scope: recurring weekly schedules only. No exceptions, no
// PTO request engine, no overtime alerts.

import { useMemo, useState } from 'react'
import { useCrewData } from '../../../utils/crew/crewStore'
import {
  useEmployeeSchedulesData,
  createEmployeeSchedule,
  patchEmployeeSchedule,
  deleteEmployeeSchedule,
} from '../../../utils/schedules/schedulesStore'
import { useToast } from '../../../utils/feedback/toastContext'
import SaveTemplateModal from './SaveTemplateModal'
import TemplatesModal   from './TemplatesModal'
import styles from './WeeklyScheduleEditor.module.css'

const COMMON_ROLES = [
  'Setup Crew',
  'Greens',
  'Tees',
  'Fairways',
  'Bunker Crew',
  'Spray Tech',
  'Mechanic',
  'Irrigation',
  'Detail',
]

const DAYS = [
  { dow: 0, short: 'Sun', long: 'Sunday' },
  { dow: 1, short: 'Mon', long: 'Monday' },
  { dow: 2, short: 'Tue', long: 'Tuesday' },
  { dow: 3, short: 'Wed', long: 'Wednesday' },
  { dow: 4, short: 'Thu', long: 'Thursday' },
  { dow: 5, short: 'Fri', long: 'Friday' },
  { dow: 6, short: 'Sat', long: 'Saturday' },
]

const STATUS_OPTS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'off',       label: 'Off' },
  { value: 'vacation',  label: 'Vacation' },
  { value: 'sick',      label: 'Sick' },
]

const DEFAULT_START = '05:30'
const DEFAULT_END   = '14:00'

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  if (!Number.isFinite(hour)) return t
  const am  = hour < 12
  const h12 = ((hour + 11) % 12) + 1
  return `${h12}:${m}${am ? 'a' : 'p'}`
}

export default function WeeklyScheduleEditor() {
  const { employees }                 = useCrewData()
  const { schedules, loading, error } = useEmployeeSchedulesData()
  const toast                         = useToast()

  const [editingKey, setEditingKey] = useState(null) // `${empId}:${dow}` | null
  const [saveOpen,      setSaveOpen]      = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  // Only active employees show up. Inactive crew shouldn't get scheduled.
  const activeEmployees = useMemo(() => {
    return employees
      .filter(e => e.status === 'active' || e.status === 'on-leave')
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [employees])

  // Index: schedules[empId][dow] = row
  const scheduleIndex = useMemo(() => {
    const m = new Map()
    for (const s of schedules) {
      if (!m.has(s.employeeId)) m.set(s.employeeId, {})
      m.get(s.employeeId)[s.dayOfWeek] = s
    }
    return m
  }, [schedules])

  function cellKey(empId, dow) { return `${empId}:${dow}` }

  function rowOrEmpty(empId, dow) {
    return scheduleIndex.get(empId)?.[dow] ?? null
  }

  async function saveCell({ row, empId, dow, status, startTime, endTime, role }) {
    try {
      if (row) {
        await patchEmployeeSchedule(row.id, {
          status,
          startTime: status === 'scheduled' ? (startTime || DEFAULT_START) : null,
          endTime:   status === 'scheduled' ? (endTime   || DEFAULT_END)   : null,
          role:      role?.trim() || null,
        })
      } else {
        await createEmployeeSchedule({
          employeeId: empId,
          dayOfWeek:  dow,
          status,
          startTime:  status === 'scheduled' ? (startTime || DEFAULT_START) : null,
          endTime:    status === 'scheduled' ? (endTime   || DEFAULT_END)   : null,
          role:       role?.trim() || null,
        })
      }
      setEditingKey(null)
    } catch (err) {
      toast.error(`Save failed: ${err.message}`)
    }
  }

  async function clearCell(row) {
    try {
      await deleteEmployeeSchedule(row.id)
      setEditingKey(null)
    } catch (err) {
      toast.error(`Clear failed: ${err.message}`)
    }
  }

  // ── Bulk row helper: Mon–Fri scheduled with default times ─────────────
  async function applyWeekdaysFor(emp) {
    try {
      let saved = 0
      for (const dow of [1, 2, 3, 4, 5]) {
        const existing = rowOrEmpty(emp.id, dow)
        if (existing && existing.status === 'scheduled') continue
        if (existing) {
          await patchEmployeeSchedule(existing.id, {
            status:    'scheduled',
            startTime: DEFAULT_START,
            endTime:   DEFAULT_END,
          })
        } else {
          await createEmployeeSchedule({
            employeeId: emp.id,
            dayOfWeek:  dow,
            status:     'scheduled',
            startTime:  DEFAULT_START,
            endTime:    DEFAULT_END,
          })
        }
        saved += 1
      }
      toast.success(saved > 0 ? `${emp.name} → Mon–Fri default shift` : `${emp.name} already on Mon–Fri`)
    } catch (err) {
      toast.error(`Bulk update failed: ${err.message}`)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  if (loading && schedules.length === 0) {
    return <p className={styles.empty}>Loading schedules…</p>
  }
  if (activeEmployees.length === 0) {
    return (
      <p className={styles.empty}>
        No active employees. Hire someone first in the Active Employees tab.
      </p>
    )
  }

  return (
    <div className={styles.wrap}>

      <header className={styles.header}>
        <div>
          <h3 className={styles.title}>Weekly Schedule</h3>
          <p className={styles.subtitle}>
            Recurring weekly shifts. The Daily Assignment Board pulls
            from scheduled crew on the selected day; everyone else stays
            off the board.
          </p>
        </div>
        <div className={styles.legend}>
          {STATUS_OPTS.map(s => (
            <span key={s.value} className={styles.legendChip} data-status={s.value}>
              {s.label}
            </span>
          ))}
        </div>
      </header>

      {/* Template controls (Phase 14) */}
      <div className={styles.templateBar}>
        <button
          type="button"
          className={styles.tplBtn}
          onClick={() => setSaveOpen(true)}
          title="Snapshot the current schedule as a reusable template"
        >
          Save Template
        </button>
        <button
          type="button"
          className={styles.tplBtn}
          data-variant="apply"
          onClick={() => setTemplatesOpen(true)}
          title="Apply or manage saved templates"
        >
          Apply Template
        </button>
        <button
          type="button"
          className={styles.tplBtn}
          data-variant="manage"
          onClick={() => setTemplatesOpen(true)}
          title="View, apply, or delete saved templates"
        >
          Manage Templates
        </button>
      </div>

      {error && <p className={styles.errorBanner}>Schedule load error: {error}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.scheduleTable}>
          <thead>
            <tr>
              <th className={styles.thOperator}>Operator</th>
              {DAYS.map(d => (
                <th key={d.dow}>{d.short}</th>
              ))}
              <th aria-label="Bulk" />
            </tr>
          </thead>
          <tbody>
            {activeEmployees.map(emp => (
              <tr key={emp.id}>
                <td className={styles.opCell}>
                  <span className={styles.opName}>{emp.name}</span>
                  {emp.role && <span className={styles.opRole}>{emp.role}</span>}
                </td>
                {DAYS.map(d => {
                  const row    = rowOrEmpty(emp.id, d.dow)
                  const key    = cellKey(emp.id, d.dow)
                  const editing = editingKey === key
                  return (
                    <td key={d.dow} className={styles.dayCell}>
                      {editing ? (
                        <CellEditor
                          row={row}
                          empId={emp.id}
                          dow={d.dow}
                          dayLabel={d.long}
                          empName={emp.name}
                          onSave={saveCell}
                          onClear={clearCell}
                          onCancel={() => setEditingKey(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          className={styles.cellButton}
                          data-status={row?.status ?? 'unset'}
                          onClick={() => setEditingKey(key)}
                          aria-label={`Edit ${emp.name} ${d.long}`}
                        >
                          {row ? (
                            <>
                              <span className={styles.cellLabel}>
                                {STATUS_OPTS.find(s => s.value === row.status)?.label
                                  ?? row.status}
                              </span>
                              {row.status === 'scheduled' && row.startTime && (
                                <span className={styles.cellTime}>
                                  {fmtTime(row.startTime)}
                                  {row.endTime && `–${fmtTime(row.endTime)}`}
                                </span>
                              )}
                              {row.status === 'scheduled' && row.role && (
                                <span className={styles.cellRoleTag}>{row.role}</span>
                              )}
                            </>
                          ) : (
                            <span className={styles.cellEmpty}>—</span>
                          )}
                        </button>
                      )}
                    </td>
                  )
                })}
                <td>
                  <button
                    type="button"
                    className={styles.bulkBtn}
                    onClick={() => applyWeekdaysFor(emp)}
                    title="Schedule Mon–Fri with default morning shift"
                  >
                    Mon–Fri
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.footnote}>
        Default morning shift: {fmtTime(DEFAULT_START)}–{fmtTime(DEFAULT_END)}.
        Click any cell to set a custom shift, mark off / vacation / sick,
        or clear the day.
      </p>

      {saveOpen && (
        <SaveTemplateModal
          schedules={schedules}
          onClose={() => setSaveOpen(false)}
        />
      )}
      {templatesOpen && (
        <TemplatesModal
          onClose={() => setTemplatesOpen(false)}
        />
      )}

    </div>
  )
}

// ── Inline cell editor ─────────────────────────────────────────────────

function CellEditor({ row, empId, dow, dayLabel, empName, onSave, onClear, onCancel }) {
  const [status,    setStatus]    = useState(row?.status    ?? 'scheduled')
  const [startTime, setStartTime] = useState(row?.startTime ?? DEFAULT_START)
  const [endTime,   setEndTime]   = useState(row?.endTime   ?? DEFAULT_END)
  const [role,      setRole]      = useState(row?.role      ?? '')
  const isScheduled = status === 'scheduled'

  return (
    <div className={styles.cellEditor} onClick={e => e.stopPropagation()}>
      <span className={styles.cellEditorHeader}>
        {empName} · {dayLabel}
      </span>
      <select
        className={styles.cellEditorField}
        value={status}
        onChange={e => setStatus(e.target.value)}
        autoFocus
      >
        {STATUS_OPTS.map(s => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      {isScheduled && (
        <>
          <div className={styles.cellEditorTimes}>
            <input
              type="time"
              className={styles.cellEditorField}
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              aria-label="Start time"
            />
            <span className={styles.cellEditorDash}>→</span>
            <input
              type="time"
              className={styles.cellEditorField}
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              aria-label="End time"
            />
          </div>
          <input
            type="text"
            className={styles.cellEditorField}
            value={role}
            onChange={e => setRole(e.target.value)}
            placeholder="Role (optional) — Greens, Spray Tech…"
            list="role-suggestions"
            aria-label="Role for this shift"
          />
          <datalist id="role-suggestions">
            {COMMON_ROLES.map(r => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </>
      )}
      <div className={styles.cellEditorActions}>
        <button
          type="button"
          className={styles.cellEditorSave}
          onClick={() => onSave({ row, empId, dow, status, startTime, endTime, role })}
        >Save</button>
        <button
          type="button"
          className={styles.cellEditorCancel}
          onClick={onCancel}
        >Cancel</button>
        {row && (
          <button
            type="button"
            className={styles.cellEditorClear}
            onClick={() => onClear(row)}
            title="Remove this schedule row"
          >Clear</button>
        )}
      </div>
    </div>
  )
}
