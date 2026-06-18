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
//
// Phase E.6 — Usability polish:
//   • Jump-to-date input in the header (faster than prev/next clicks).
//   • Quick-create A/B/C empty templates so a fresh course gets a
//     usable shift library in one click.
//   • Rename + duplicate templates in the picker.
//   • Apply-template preview: counts + hours render BEFORE the
//     destructive action so the supervisor sees exactly what they're
//     about to write.
//   • Drag source / drop target styling distinguishable.
//   • Day-editor quick actions: Mark all Scheduled / Mark all Off /
//     Clear day overrides (the last one already existed).

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
  patchShiftTemplate,
  deleteShiftTemplate,
  applyShiftTemplate,
  duplicateShiftTemplate,
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

// Phase E.6 — Defaults for quick-create. Each entry creates an empty
// template (zero rows) with the given name; the supervisor saves a
// real day onto it later via "Save as Template…" overwriting the
// blank shell, or applies it as-is (no-op). A label hint shows on
// each tile in the picker.
const QUICK_CREATE_DEFAULTS = [
  { name: 'A Shift',  label: 'Early shift' },
  { name: 'B Shift',  label: 'Late shift'  },
  { name: 'C Shift',  label: 'Weekend / small crew' },
]

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

// Phase E.6 — Compute a preview summary {scheduled, off, totalHours}
// for a set of rows. Used by the template picker so the supervisor
// sees what they're applying BEFORE clicking the destructive button.
function summarizeRows(rows) {
  let scheduled = 0, off = 0, hours = 0
  for (const r of rows ?? []) {
    if (r.status === 'scheduled') {
      scheduled++
      hours += diffHours(r.startTime, r.endTime)
    } else {
      off++
    }
  }
  return { scheduled, off, totalHours: Math.round(hours * 10) / 10 }
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

  // Phase E.6 — Bulk-status helpers. "Mark all scheduled" and "Mark
  // all off" iterate the merged roster and apply a status to every
  // employee whose current merged status differs. Reuses applyEdit so
  // the recurring grid is still untouched (writes go to overrides).
  async function markAllStatus(targetStatus) {
    if (!confirm(`Mark all employees ${targetStatus} for ${selectedDate}? This writes overrides for every operator and never modifies the weekly recurring grid.`)) return
    setBusy(true)
    try {
      let saved = 0
      for (const row of selectedDayRows) {
        if (row.status === targetStatus) continue
        await applyEdit(row, { status: targetStatus })
        saved += 1
      }
      toast.success(`Marked ${saved} ${targetStatus} for ${selectedDate}`)
    } finally {
      setBusy(false)
    }
  }

  // ── Calendar tile interactions ──────────────────────────────────────
  function handleSelectDate(date) {
    if (!date) return
    setSelectedDate(date)
    // Phase E.6 — Snap to the month of the clicked date so picking a
    // day on a leading/trailing blank actually navigates the calendar.
    const month = date.slice(0, 7)
    if (month !== currentMonth) setCurrentMonth(month)
  }

  function handleDragStart(date) {
    setDragSource(date)
  }
  function handleDragOver(e) {
    e.preventDefault()
  }
  async function handleDrop(destinationDate) {
    if (!dragSource || !destinationDate || dragSource === destinationDate) {
      // Phase E.6 — Same-day copy fails silently (no toast, no
      // confirm) — quick-and-quiet feels right for a no-op gesture.
      setDragSource(null)
      return
    }
    const destHasOverrides = scheduleOverrides.some(o => o.effectiveDate === destinationDate)
    let replace = false
    if (destHasOverrides) {
      if (!confirm(`${destinationDate} already has a schedule. Replace it with ${dragSource}'s schedule?`)) {
        setDragSource(null)
        return
      }
      replace = true
    } else {
      if (!confirm(`Copy schedule from ${dragSource} to ${destinationDate}?`)) {
        setDragSource(null)
        return
      }
    }
    setBusy(true)
    try {
      const result = await copyScheduleDay({ sourceDate: dragSource, destinationDate, replace })
      await refreshScheduleOverridesData()
      // Phase E.6 — Toast format leads with "Copied from <date>" so
      // the supervisor knows at a glance which source was used.
      toast.success(
        `Copied from ${dragSource} to ${destinationDate}: ${result.copied} copied${
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
  async function handleApplyTemplate(templateId, replaceConfirmed) {
    // Phase E.6 — The template picker now confirms in-UI (preview
    // panel + "Replace existing schedule" toggle), so we trust the
    // replaceConfirmed flag from the caller instead of firing a
    // browser confirm() per click. Keeps the modal flow snappy.
    setBusy(true)
    try {
      const result = await applyShiftTemplate(templateId, { effectiveDate: selectedDate, replace: replaceConfirmed })
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
    // Phase E.6 — More descriptive confirm copy including the row
    // count so the supervisor knows what they're losing.
    if (!confirm(
      `Delete shift template "${t.name}" (${t.rowCount ?? 0} rows)?\n\n` +
      `Past applications of this template stay in place — only the saved template is removed. ` +
      `This cannot be undone.`,
    )) return
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

  // Phase E.6 — Quick-create empty A/B/C templates so a fresh course
  // gets a usable shift library in one click. Each is a no-rows
  // shell; the supervisor populates it via "Save as Template…"
  // overwriting the blank later.
  async function handleQuickCreateDefaults() {
    setBusy(true)
    try {
      let created = 0
      for (const def of QUICK_CREATE_DEFAULTS) {
        const existing = shiftTemplates.find(t => t.name === def.name)
        if (existing) continue
        await createShiftTemplate({ name: def.name, label: def.label, rows: [] })
        created++
      }
      await refreshShiftTemplatesData()
      if (created === 0) {
        toast.info('A/B/C templates already exist.')
      } else {
        toast.success(`Created ${created} starter template${created !== 1 ? 's' : ''}`)
      }
    } catch (err) {
      toast.error(`Quick-create failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // Phase E.6 — Rename template inline.
  async function handleRenameTemplate(t) {
    const next = prompt(`Rename "${t.name}" to:`, t.name)
    if (next === null) return
    const trimmed = next.trim()
    if (!trimmed || trimmed === t.name) return
    setBusy(true)
    try {
      await patchShiftTemplate(t.id, { name: trimmed })
      toast.success(`Renamed to "${trimmed}"`)
    } catch (err) {
      toast.error(`Rename failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // Phase E.6 — Duplicate template via store helper.
  async function handleDuplicateTemplate(t) {
    const next = prompt(`Duplicate "${t.name}" as:`, `${t.name} (copy)`)
    if (next === null) return
    const trimmed = next.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      await duplicateShiftTemplate(t.id, trimmed)
      await refreshShiftTemplatesData()
      toast.success(`Duplicated as "${trimmed}"`)
    } catch (err) {
      toast.error(`Duplicate failed: ${err.message}`)
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
          {/* Phase E.6 — Jump-to-date input. Beats prev/next clicks
              when navigating months apart. Snaps both currentMonth
              AND selectedDate to whatever the user picks. */}
          <label className={styles.jumpToDate}>
            <span className={styles.jumpToDateLabel}>Jump to</span>
            <input
              type="date"
              value={selectedDate}
              onChange={e => {
                const next = e.target.value
                if (!next) return
                setSelectedDate(next)
                setCurrentMonth(next.slice(0, 7))
              }}
              aria-label="Jump to date"
            />
          </label>
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
          const isDragSource = dragSource === cell.date
          const dayNum     = parseInt(cell.date.slice(8), 10)
          return (
            <button
              type="button"
              key={cell.date}
              className={styles.dayTile}
              data-selected={isSelected ? 'true' : undefined}
              data-today={isToday ? 'true' : undefined}
              data-drag-source={isDragSource ? 'true' : undefined}
              data-drag-over={dragSource && dragSource !== cell.date ? 'true' : undefined}
              draggable={!busy}
              onDragStart={() => handleDragStart(cell.date)}
              onDragEnd={() => setDragSource(null)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(cell.date)}
              onClick={() => handleSelectDate(cell.date)}
            >
              <div className={styles.dayNumber}>{dayNum}</div>
              {summary && (
                <div className={styles.daySummary}>
                  {summary.scheduledCount > 0 && <span className={styles.dayCountScheduled}>{summary.scheduledCount}</span>}
                  {summary.totalHours > 0 && <span className={styles.dayHours}>{summary.totalHours}h</span>}
                  {summary.offCount > 0 && <span className={styles.dayCountOff}>{summary.offCount} off</span>}
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
            {/* Phase E.6 — Quick status helpers. Each writes overrides
                only — recurring grid is never touched. */}
            <button type="button" className={styles.actionBtn} onClick={() => markAllStatus('scheduled')} disabled={busy}>
              Mark all Scheduled
            </button>
            <button type="button" className={styles.actionBtn} onClick={() => markAllStatus('off')} disabled={busy}>
              Mark all Off
            </button>
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
        <TemplatePickerModal
          templates={shiftTemplates}
          selectedDate={selectedDate}
          destHasOverrides={scheduleOverrides.some(o => o.effectiveDate === selectedDate)}
          busy={busy}
          onClose={() => setTemplatePickerOpen(false)}
          onApply={handleApplyTemplate}
          onDelete={handleDeleteTemplate}
          onRename={handleRenameTemplate}
          onDuplicate={handleDuplicateTemplate}
          onQuickCreate={handleQuickCreateDefaults}
        />
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

// Phase E.6 — Template picker with preview, quick-create defaults,
// rename, duplicate, and replace warning surfaced in-UI (no extra
// browser confirm before each apply). The supervisor selects a
// template → preview pane shows count + hours → toggle Replace if
// needed → click Apply.
function TemplatePickerModal({
  templates,
  selectedDate,
  destHasOverrides,
  busy,
  onClose,
  onApply,
  onDelete,
  onRename,
  onDuplicate,
  onQuickCreate,
}) {
  const [activeId, setActiveId] = useState(null)
  const [activeRows, setActiveRows] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [replace, setReplace] = useState(destHasOverrides)

  useEffect(() => { setReplace(destHasOverrides) }, [destHasOverrides])

  // Lazy-fetch full template rows when a tile is selected so the
  // preview pane can summarize them. The list view only carries
  // rowCount; full rows[] live behind GET /:id.
  useEffect(() => {
    if (!activeId) { setActiveRows(null); return }
    let cancelled = false
    setLoadingPreview(true)
    fetchShiftTemplateById(activeId)
      .then(t => { if (!cancelled) setActiveRows(t.rows ?? []) })
      .catch(() => { if (!cancelled) setActiveRows([]) })
      .finally(() => { if (!cancelled) setLoadingPreview(false) })
    return () => { cancelled = true }
  }, [activeId])

  const preview = useMemo(() => summarizeRows(activeRows ?? []), [activeRows])
  const activeTemplate = templates.find(t => t.id === activeId)
  const hasTemplates   = templates.length > 0
  const canApply       = !!activeId && !busy

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Apply Shift Template to {selectedDate}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>×</button>
        </header>

        <div className={styles.modalBody}>
          {!hasTemplates && (
            <div className={styles.quickCreateBanner}>
              <p>No shift templates yet. Get started with quick defaults:</p>
              <ul className={styles.quickCreateList}>
                {QUICK_CREATE_DEFAULTS.map(d => (
                  <li key={d.name}><strong>{d.name}</strong> <span>· {d.label}</span></li>
                ))}
              </ul>
              <button type="button" className={styles.actionBtnPrimary} onClick={onQuickCreate} disabled={busy}>
                Create A / B / C starter templates
              </button>
              <p className={styles.quickCreateNote}>
                Each starter is an empty shell — populate it by editing a day and clicking <em>Save as Template…</em>.
              </p>
            </div>
          )}

          {hasTemplates && (
            <div className={styles.pickerLayout}>
              <ul className={styles.templateList}>
                {templates.map(t => (
                  <li
                    key={t.id}
                    className={styles.templateRow}
                    data-active={t.id === activeId ? 'true' : undefined}
                    onClick={() => setActiveId(t.id)}
                  >
                    <div className={styles.templateMeta}>
                      <strong>{t.name}</strong>
                      {t.label && <span className={styles.templateLabel}>{t.label}</span>}
                      <span className={styles.templateRowCount}>{t.rowCount ?? 0} rows</span>
                    </div>
                    <div className={styles.templateActions}>
                      <button type="button" className={styles.actionBtnSmall} disabled={busy} onClick={e => { e.stopPropagation(); onRename(t) }} title="Rename">Rename</button>
                      <button type="button" className={styles.actionBtnSmall} disabled={busy} onClick={e => { e.stopPropagation(); onDuplicate(t) }} title="Duplicate">Duplicate</button>
                      <button type="button" className={`${styles.actionBtnSmall} ${styles.actionBtnDanger}`} disabled={busy} onClick={e => { e.stopPropagation(); onDelete(t) }} title="Delete">Delete</button>
                    </div>
                  </li>
                ))}
              </ul>

              <aside className={styles.previewPane} aria-live="polite">
                {!activeTemplate ? (
                  <p className={styles.previewEmpty}>Select a template on the left to preview.</p>
                ) : loadingPreview ? (
                  <p className={styles.previewEmpty}>Loading…</p>
                ) : (
                  <>
                    <h4 className={styles.previewTitle}>{activeTemplate.name}</h4>
                    {activeTemplate.label && <p className={styles.previewLabel}>{activeTemplate.label}</p>}
                    <dl className={styles.previewStats}>
                      <div>
                        <dt>Scheduled</dt>
                        <dd>{preview.scheduled}</dd>
                      </div>
                      <div>
                        <dt>Off / Sick / Vacation</dt>
                        <dd>{preview.off}</dd>
                      </div>
                      <div>
                        <dt>Total hours</dt>
                        <dd>{preview.totalHours}h</dd>
                      </div>
                    </dl>

                    {destHasOverrides && (
                      <label className={styles.replaceCheckbox}>
                        <input
                          type="checkbox"
                          checked={replace}
                          onChange={e => setReplace(e.target.checked)}
                          disabled={busy}
                        />
                        <span>
                          <strong>{selectedDate} already has overrides.</strong>{' '}
                          Replace them with this template (existing overrides for that date will be deleted first).
                        </span>
                      </label>
                    )}

                    <div className={styles.previewActions}>
                      <button
                        type="button"
                        className={styles.actionBtnPrimary}
                        disabled={!canApply}
                        onClick={() => onApply(activeId, replace)}
                      >
                        {busy ? 'Applying…' : 'Apply to ' + selectedDate}
                      </button>
                    </div>
                  </>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
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
