// Phase E.5 — Annual Schedule Calendar.
//
// Month view of the per-date schedule. Each tile shows scheduled /
// off counts + total hours. Click a tile to open the day editor (the
// existing E.2 Today's Schedule panel scoped to that date). Drag one
// tile onto another to copy that day's merged schedule. Shift-template
// picker lets supervisors apply saved A/B/C-style bundles to any
// date.
//
// The recurring weekly grid (employee_schedules) is NEVER mutated from
// this surface — every write lands in employee_schedule_overrides.

import { useEffect, useMemo, useState } from 'react'
import { useCrewData } from '../../../utils/crew/crewStore'
import { useEmployeeSchedulesData } from '../../../utils/schedules/schedulesStore'
import {
  useScheduleOverridesData,
  refreshScheduleOverridesData,
  createScheduleOverride,
  patchScheduleOverride,
  deleteScheduleOverride,
} from '../../../utils/schedules/scheduleOverridesStore'
import {
  useShiftTemplatesData,
  refreshShiftTemplatesData,
  fetchShiftTemplateById,
  createShiftTemplate,
  deleteShiftTemplate,
  applyShiftTemplate,
  copyScheduleDay,
} from '../../../utils/schedules/shiftTemplatesStore'
import { useToast } from '../../../utils/feedback/toastContext'
import { buildScheduleByEmployeeForDate } from '../../../utils/schedules/dailyScheduleMerge'
import styles from './AnnualScheduleCalendar.module.css'

const STATUS_OPTS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'off',       label: 'Off' },
  { value: 'vacation',  label: 'Vacation' },
  { value: 'sick',      label: 'Sick' },
]

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function todayIso() { return new Date().toISOString().slice(0, 10) }

function shiftMonth(yyyymm, months) {
  const [y, m] = yyyymm.split('-').map(Number)
  const d = new Date(y, m - 1 + months, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function diffHours(s, e) {
  if (!s || !e) return 0
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  if (![sh, sm, eh, em].every(Number.isFinite)) return 0
  const a = sh * 60 + sm, b = eh * 60 + em
  return b > a ? (b - a) / 60 : 0
}

// Build the 6-week month grid. Cells before the 1st and after the last
// day of the month are blank (date: null) so the layout stays a clean
// 7-column grid.
function buildMonthGrid(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const leadingBlanks = first.getDay()
  const daysInMonth = new Date(y, m, 0).getDate()
  const cells = []
  for (let i = 0; i < leadingBlanks; i++) cells.push({ date: null })
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
  }
  while (cells.length % 7 !== 0) cells.push({ date: null })
  return cells
}

export default function AnnualScheduleCalendar() {
  const { employees }                    = useCrewData()
  const { schedules: weeklySchedules }   = useEmployeeSchedulesData()
  const { overrides: scheduleOverrides } = useScheduleOverridesData()
  const { templates: shiftTemplates }    = useShiftTemplatesData()
  const toast = useToast()

  const [currentMonth, setCurrentMonth] = useState(() => todayIso().slice(0, 7))
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const [busy, setBusy]                 = useState(false)
  const [dragSource, setDragSource]     = useState(null)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [showSaveAsOpen, setShowSaveAsOpen]         = useState(false)

  const monthGrid = useMemo(() => buildMonthGrid(currentMonth), [currentMonth])

  const activeEmployees = useMemo(() => {
    return employees
      .filter(e => e.status !== 'inactive')
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [employees])

  // Per-date summary for tile render. Reuses the shared merge helper
  // so the calendar matches what DAB / kiosk / day editor see.
  const summaryByDate = useMemo(() => {
    const m = new Map()
    for (const cell of monthGrid) {
      if (!cell.date) continue
      const merged = buildScheduleByEmployeeForDate(cell.date, weeklySchedules, scheduleOverrides)
      let scheduled = 0, off = 0, hours = 0
      for (const emp of activeEmployees) {
        const eff = merged.get(emp.id)
        if (!eff) continue
        if (eff.status === 'scheduled') {
          scheduled += 1
          hours += diffHours(eff.startTime, eff.endTime)
        } else {
          off += 1
        }
      }
      m.set(cell.date, {
        scheduledCount: scheduled,
        offCount:       off,
        totalHours:     Math.round(hours * 10) / 10,
      })
    }
    return m
  }, [monthGrid, activeEmployees, weeklySchedules, scheduleOverrides])

  // Merged daily roster for the selected day — drives the day editor.
  const selectedDayRows = useMemo(() => {
    const merged = buildScheduleByEmployeeForDate(selectedDate, weeklySchedules, scheduleOverrides)
    return activeEmployees.map(emp => {
      const eff = merged.get(emp.id)
      return {
        employeeId:   emp.id,
        employeeName: emp.name,
        role:         eff?.role ?? emp.role ?? null,
        status:       eff?.status ?? 'scheduled',
        startTime:    eff?.startTime ?? null,
        endTime:      eff?.endTime   ?? null,
        notes:        eff?.notes     ?? '',
        source:       eff?.source ?? 'none',
        overrideId:   eff?.overrideId ?? null,
      }
    })
  }, [activeEmployees, weeklySchedules, scheduleOverrides, selectedDate])

  // ── Day editor row mutations ────────────────────────────────────────
  async function applyEdit(row, patch) {
    setBusy(true)
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
      setBusy(false)
    }
  }

  async function clearDayOverrides() {
    if (!confirm(`Clear all overrides for ${selectedDate}? Recurring rules stay intact.`)) return
    setBusy(true)
    try {
      const dayOverrides = scheduleOverrides.filter(o => o.effectiveDate === selectedDate)
      for (const ov of dayOverrides) {
        try { await deleteScheduleOverride(ov.id) } catch { /* skip */ }
      }
      toast.success(`Cleared overrides for ${selectedDate}`)
    } finally {
      setBusy(false)
    }
  }

  // ── Calendar tile interactions ──────────────────────────────────────
  function handleSelectDate(date) {
    if (!date) return
    setSelectedDate(date)
  }

  function handleDragStart(date) {
    setDragSource(date)
  }
  function handleDragOver(e) {
    e.preventDefault()
  }
  async function handleDrop(destinationDate) {
    if (!dragSource || !destinationDate || dragSource === destinationDate) {
      setDragSource(null)
      return
    }
    const destHasOverrides = scheduleOverrides.some(o => o.effectiveDate === destinationDate)
    const prettySrc = dragSource
    const prettyDst = destinationDate
    let replace = false
    if (destHasOverrides) {
      if (!confirm(`${prettyDst} already has a schedule. Replace it with ${prettySrc}'s schedule?`)) {
        setDragSource(null)
        return
      }
      replace = true
    } else {
      if (!confirm(`Copy schedule from ${prettySrc} to ${prettyDst}?`)) {
        setDragSource(null)
        return
      }
    }
    setBusy(true)
    try {
      const result = await copyScheduleDay({ sourceDate: dragSource, destinationDate, replace })
      await refreshScheduleOverridesData()
      toast.success(
        `Copied ${dragSource} → ${destinationDate}: ${result.copied} copied${
          result.replaced ? ` · ${result.replaced} replaced` : ''
        }${result.skipped ? ` · ${result.skipped} skipped` : ''}`,
      )
      setSelectedDate(destinationDate)
    } catch (err) {
      toast.error(`Copy failed: ${err.message}`)
    } finally {
      setBusy(false)
      setDragSource(null)
    }
  }

  // ── Shift template apply ────────────────────────────────────────────
  async function handleApplyTemplate(templateId) {
    const destHasOverrides = scheduleOverrides.some(o => o.effectiveDate === selectedDate)
    let replace = false
    if (destHasOverrides) {
      if (!confirm(`${selectedDate} already has a schedule. Replace it with this template?`)) return
      replace = true
    } else {
      if (!confirm(`Apply template to ${selectedDate}?`)) return
    }
    setBusy(true)
    try {
      const result = await applyShiftTemplate(templateId, { effectiveDate: selectedDate, replace })
      await refreshScheduleOverridesData()
      toast.success(
        `Applied "${result.templateName}" to ${selectedDate}: ${result.applied} applied${
          result.replaced ? ` · ${result.replaced} replaced` : ''
        }${result.skipped ? ` · ${result.skipped} skipped` : ''}`,
      )
      setTemplatePickerOpen(false)
    } catch (err) {
      toast.error(`Apply failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // Save the current day's merged schedule as a new shift template.
  async function handleSaveAsTemplate(name) {
    const trimmed = (name ?? '').trim()
    if (!trimmed) return
    setBusy(true)
    try {
      const rows = selectedDayRows
        .filter(r => r.status !== 'scheduled' || r.startTime || r.endTime || r.role || r.notes)
        .map((r, i) => ({
          employeeId: r.employeeId,
          status:     r.status,
          startTime:  r.startTime,
          endTime:    r.endTime,
          role:       r.role,
          notes:      r.notes || null,
          sortOrder:  i * 10,
        }))
      await createShiftTemplate({ name: trimmed, rows })
      await refreshShiftTemplatesData()
      toast.success(`Saved "${trimmed}" template (${rows.length} rows)`)
      setShowSaveAsOpen(false)
    } catch (err) {
      toast.error(`Save template failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteTemplate(t) {
    if (!confirm(`Delete template "${t.name}"? Past applications are not affected.`)) return
    setBusy(true)
    try {
      await deleteShiftTemplate(t.id)
      toast.success(`Deleted template "${t.name}"`)
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.calendarSection} data-phase="E.5">
      <header className={styles.calendarHeader}>
        <div>
          <h3 className={styles.calendarTitle}>Annual Schedule Calendar</h3>
          <p className={styles.calendarHint}>
            Schedule any day. Click a tile to edit. Drag a tile onto another to copy a day. Apply saved shift templates.
            Recurring weekly schedules are never modified from this surface.
          </p>
        </div>
        <div className={styles.calendarNav}>
          <button type="button" onClick={() => setCurrentMonth(m => shiftMonth(m, -1))} className={styles.navBtn} aria-label="Previous month">‹</button>
          <span className={styles.currentMonth}>{currentMonth}</span>
          <button type="button" onClick={() => setCurrentMonth(m => shiftMonth(m, 1))} className={styles.navBtn} aria-label="Next month">›</button>
          <button type="button" onClick={() => { setCurrentMonth(todayIso().slice(0, 7)); setSelectedDate(todayIso()) }} className={styles.todayBtn}>Today</button>
        </div>
      </header>

      {/* ── Calendar grid ── */}
      <div className={styles.calendarGrid} role="grid" aria-label="Month calendar">
        {DOW_LABELS.map(d => (
          <div key={d} className={styles.dowHeader}>{d}</div>
        ))}
        {monthGrid.map((cell, i) => {
          if (!cell.date) return <div key={`blank-${i}`} className={styles.blankTile} />
          const summary = summaryByDate.get(cell.date)
          const isSelected = cell.date === selectedDate
          const isToday    = cell.date === todayIso()
          const dayNum     = parseInt(cell.date.slice(8), 10)
          return (
            <button
              type="button"
              key={cell.date}
              className={styles.dayTile}
              data-selected={isSelected ? 'true' : undefined}
              data-today={isToday ? 'true' : undefined}
              data-drag-over={dragSource && dragSource !== cell.date ? 'true' : undefined}
              draggable={!busy}
              onDragStart={() => handleDragStart(cell.date)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(cell.date)}
              onClick={() => handleSelectDate(cell.date)}
            >
              <div className={styles.dayNumber}>{dayNum}</div>
              {summary && (
                <div className={styles.daySummary}>
                  <span className={styles.dayCountScheduled}>{summary.scheduledCount}</span>
                  {summary.offCount > 0 && <span className={styles.dayCountOff}>{summary.offCount} off</span>}
                  {summary.totalHours > 0 && <span className={styles.dayHours}>{summary.totalHours}h</span>}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Selected day editor ── */}
      <div className={styles.dayEditor}>
        <header className={styles.dayEditorHeader}>
          <h4 className={styles.dayEditorTitle}>{selectedDate}</h4>
          <div className={styles.dayEditorActions}>
            <button type="button" className={styles.actionBtn} onClick={() => setTemplatePickerOpen(true)} disabled={busy}>
              Apply Template…
            </button>
            <button type="button" className={styles.actionBtn} onClick={() => setShowSaveAsOpen(true)} disabled={busy}>
              Save as Template…
            </button>
            <button type="button" className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={clearDayOverrides} disabled={busy}>
              Clear Day Overrides
            </button>
          </div>
        </header>

        <table className={styles.editorTable}>
          <thead>
            <tr>
              <th>Operator</th>
              <th>Role</th>
              <th>Status</th>
              <th>Start</th>
              <th>End</th>
              <th>Notes</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {selectedDayRows.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.editorEmpty}>
                  No active employees. Add crew in Employee Management to start scheduling.
                </td>
              </tr>
            ) : selectedDayRows.map(row => (
              <tr key={row.employeeId} data-status={row.status} data-source={row.source}>
                <td className={styles.editorName}>{row.employeeName}</td>
                <td>{row.role ?? '—'}</td>
                <td>
                  <select
                    className={styles.editorStatusSelect}
                    value={row.status}
                    disabled={busy}
                    onChange={e => applyEdit(row, { status: e.target.value })}
                  >
                    {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td>
                  <input
                    type="time"
                    className={styles.editorTimeInput}
                    value={row.startTime ?? ''}
                    disabled={busy || row.status !== 'scheduled'}
                    onChange={e => applyEdit(row, { startTime: e.target.value || null })}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className={styles.editorTimeInput}
                    value={row.endTime ?? ''}
                    disabled={busy || row.status !== 'scheduled'}
                    onChange={e => applyEdit(row, { endTime: e.target.value || null })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className={styles.editorNotesInput}
                    defaultValue={row.notes}
                    disabled={busy}
                    placeholder="optional"
                    onBlur={e => {
                      const next = e.target.value.trim() || null
                      const current = row.notes || null
                      if (next === current) return
                      applyEdit(row, { notes: next })
                    }}
                  />
                </td>
                <td>
                  <span className={styles.sourcePill} data-source={row.source}>
                    {row.source === 'override'  && 'Override'}
                    {row.source === 'recurring' && 'Recurring'}
                    {row.source === 'none'      && 'Unscheduled'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Template picker modal ── */}
      {templatePickerOpen && (
        <div className={styles.modalOverlay} onClick={() => setTemplatePickerOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Apply Shift Template to {selectedDate}</h3>
              <button type="button" className={styles.modalClose} onClick={() => setTemplatePickerOpen(false)}>×</button>
            </header>
            <div className={styles.modalBody}>
              {shiftTemplates.length === 0 ? (
                <p className={styles.modalEmpty}>
                  No shift templates yet. Use <strong>Save as Template…</strong> on a day to create one (e.g. "A Shift", "Tournament Morning").
                </p>
              ) : (
                <ul className={styles.templateList}>
                  {shiftTemplates.map(t => (
                    <li key={t.id} className={styles.templateRow}>
                      <div className={styles.templateMeta}>
                        <strong>{t.name}</strong>
                        {t.label && <span className={styles.templateLabel}>{t.label}</span>}
                        <span className={styles.templateRowCount}>{t.rowCount ?? 0} rows</span>
                      </div>
                      <div className={styles.templateActions}>
                        <button type="button" className={styles.actionBtn} disabled={busy} onClick={() => handleApplyTemplate(t.id)}>
                          Apply
                        </button>
                        <button type="button" className={`${styles.actionBtn} ${styles.actionBtnDanger}`} disabled={busy} onClick={() => handleDeleteTemplate(t)}>
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Save-as modal ── */}
      {showSaveAsOpen && (
        <SaveAsModal
          date={selectedDate}
          rowCount={selectedDayRows.length}
          onClose={() => setShowSaveAsOpen(false)}
          onSave={handleSaveAsTemplate}
          busy={busy}
        />
      )}
    </section>
  )
}

function SaveAsModal({ date, rowCount, onClose, onSave, busy }) {
  const [name, setName] = useState('')
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Save {date} as Shift Template</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>×</button>
        </header>
        <div className={styles.modalBody}>
          <p className={styles.modalHint}>Capture the {rowCount} operator-row(s) shown for this date as a reusable template (e.g. "A Shift", "Tournament Morning").</p>
          <label className={styles.modalField}>
            <span>Template name</span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="A Shift"
              className={styles.modalInput}
            />
          </label>
        </div>
        <footer className={styles.modalFooter}>
          <button type="button" className={styles.actionBtn} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={styles.actionBtnPrimary} onClick={() => onSave(name)} disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Save Template'}
          </button>
        </footer>
      </div>
    </div>
  )
}
