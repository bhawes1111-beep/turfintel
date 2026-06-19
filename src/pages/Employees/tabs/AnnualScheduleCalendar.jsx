// Phase E.5 — Annual Schedule Calendar.
//
// Phase E.8 — Editable shifts:
//   • New EditShiftModal — full row editor (employee × status × times
//     × role × notes). PATCH /api/shift-templates/:id with body.rows
//     already supports this; we just needed a UI.
//   • Picker gains an "Edit" button per shift (between Apply + Rename).
//   • Quick-create A/B/C now auto-opens Edit on the first new shell
//     so the supervisor lands directly in the populate step.
//   • Apply disabled when a shift has zero rows + clear copy in the
//     preview pane ("No employees yet — edit this shift first").
//   • Save Shift: when the name already exists, ask whether to update
//     the existing shift or create a copy (vs. silently returning the
//     existing row via UNIQUE collision).
//   • UI language: "Shift" everywhere; "Template" stays as code only.
//
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

// Phase E.6 — Defaults for quick-create.
//
// Phase E.8 (revision) — Starters are no longer empty shells. Each
// default now seeds one row per active employee with status
// 'scheduled' + sensible default times. This means applying any
// starter on day one produces real, visible schedule rows (a 0-row
// template silently no-ops). The supervisor edits per-employee
// details in the Shift Manager.
const QUICK_CREATE_DEFAULTS = [
  { name: 'A Shift', label: 'Early shift',            startTime: '06:00', endTime: '14:00' },
  { name: 'B Shift', label: 'Late shift',             startTime: '08:00', endTime: '16:00' },
  { name: 'C Shift', label: 'Weekend / small crew',   startTime: '06:00', endTime: '10:00' },
]

function todayIso() { return new Date().toISOString().slice(0, 10) }

function shiftMonth(yyyymm, months) {
  const [y, m] = yyyymm.split('-').map(Number)
  const d = new Date(y, m - 1 + months, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Phase E.7 — Readable date labels. Internal storage stays ISO; these
// only format for display. Constructed via local-noon Date so the
// formatter never drifts a day for users in negative-UTC timezones.
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
const DAY_FORMATTER   = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

function formatMonthLabel(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number)
  return MONTH_FORMATTER.format(new Date(y, m - 1, 1, 12))
}
function formatDayLabel(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  return DAY_FORMATTER.format(new Date(y, m - 1, d, 12))
}
// Day-of-week from an ISO string (avoids constructing a UTC Date that
// could shift the day across timezones).
function dayOfWeek(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getDay()
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
  // Phase E.7 — Copy Day modal + More menu state.
  const [copyDayOpen, setCopyDayOpen] = useState(false)
  const [moreOpen, setMoreOpen]       = useState(false)
  // Phase E.8 — Edit Shift modal target (template ID or null).
  const [editShiftId, setEditShiftId] = useState(null)
  // Phase E.8 (revision) — Shift Manager modal open state. Distinct
  // from the picker (which is the "apply" surface); the manager is
  // the "browse + edit + maintain" surface.
  const [managerOpen, setManagerOpen] = useState(false)

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

  // Phase E.7 — Copy Day via a button (non-drag entrypoint). Same
  // server semantics as drag/drop — both fan in to copyScheduleDay.
  async function handleCopyDay({ sourceDate, replace }) {
    if (!sourceDate || sourceDate === selectedDate) {
      toast.error('Pick a different source date than the selected day.')
      return
    }
    setBusy(true)
    try {
      const result = await copyScheduleDay({ sourceDate, destinationDate: selectedDate, replace })
      await refreshScheduleOverridesData()
      toast.success(
        `Copied from ${sourceDate} to ${selectedDate}: ${result.copied} copied${
          result.replaced ? ` · ${result.replaced} replaced` : ''
        }${result.skipped ? ` · ${result.skipped} skipped` : ''}`,
      )
      setCopyDayOpen(false)
    } catch (err) {
      toast.error(`Copy failed: ${err.message}`)
    } finally {
      setBusy(false)
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
  //
  // Phase E.8 — Name collisions: previously, the worker quietly
  // returned the existing row (UNIQUE collision branch in
  // createShiftTemplate) and the supervisor would think the save
  // worked but the rows weren't actually overwritten. Now we check
  // existing shifts first and ask explicitly: update or copy?
  async function handleSaveAsTemplate(name) {
    const trimmed = (name ?? '').trim()
    if (!trimmed) return
    const existing = shiftTemplates.find(t => t.name.toLowerCase() === trimmed.toLowerCase())
    let mode = 'create'
    let targetId = null
    if (existing) {
      const answer = confirm(
        `A shift named "${existing.name}" already exists (${existing.rowCount ?? 0} rows).\n\n` +
        `OK = update existing shift with the rows from ${selectedDate}\n` +
        `Cancel = keep it and don't save`,
      )
      if (!answer) return
      mode = 'update'
      targetId = existing.id
    }
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
      if (mode === 'update' && targetId) {
        await patchShiftTemplate(targetId, { rows })
      } else {
        await createShiftTemplate({ name: trimmed, rows })
      }
      await refreshShiftTemplatesData()
      toast.success(
        mode === 'update'
          ? `Updated "${trimmed}" with ${rows.length} row(s) from ${selectedDate}`
          : `Saved "${trimmed}" shift (${rows.length} rows)`,
      )
      setShowSaveAsOpen(false)
    } catch (err) {
      toast.error(`Save shift failed: ${err.message}`)
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

  // Phase E.6 → E.8 — Quick-create A/B/C starter shifts.
  //
  // Starters now seed one row per active employee with status
  // 'scheduled' + the default times from QUICK_CREATE_DEFAULTS. This
  // means the first apply produces real schedule rows immediately —
  // no more silent 0-row no-op. The supervisor fine-tunes per-employee
  // status / times / role / notes in the Shift Manager.
  async function handleQuickCreateDefaults() {
    setBusy(true)
    try {
      let created = 0
      for (const def of QUICK_CREATE_DEFAULTS) {
        const existing = shiftTemplates.find(t => t.name === def.name)
        if (existing) continue
        const rows = activeEmployees.map((emp, i) => ({
          employeeId: emp.id,
          status:     'scheduled',
          startTime:  def.startTime,
          endTime:    def.endTime,
          role:       emp.role ?? null,
          notes:      null,
          sortOrder:  i * 10,
        }))
        await createShiftTemplate({
          name:  def.name,
          label: def.label,
          rows,
        })
        created++
      }
      await refreshShiftTemplatesData()
      if (created === 0) {
        toast.info('A / B / C shifts already exist.')
      } else {
        toast.success(`Created ${created} starter shift${created !== 1 ? 's' : ''} (${activeEmployees.length} employees pre-loaded)`)
      }
    } catch (err) {
      toast.error(`Quick-create failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // Phase E.8 — Edit Shift entrypoint from the picker.
  function handleEditShift(t) {
    setTemplatePickerOpen(false)
    setEditShiftId(t.id)
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
          <span className={styles.currentMonth} title={currentMonth}>{formatMonthLabel(currentMonth)}</span>
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
          const dow        = dayOfWeek(cell.date)
          const isWeekend  = dow === 0 || dow === 6
          const dayNum     = parseInt(cell.date.slice(8), 10)
          return (
            <button
              type="button"
              key={cell.date}
              className={styles.dayTile}
              data-selected={isSelected ? 'true' : undefined}
              data-today={isToday ? 'true' : undefined}
              data-weekend={isWeekend ? 'true' : undefined}
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
                  {/* Phase E.7 — Two primary lines: working / hours.
                      Off count surfaces only when > 0 ("2 out"). */}
                  {summary.scheduledCount > 0 && (
                    <span className={styles.dayCountScheduled}>{summary.scheduledCount} working</span>
                  )}
                  {summary.totalHours > 0 && (
                    <span className={styles.dayHours}>{summary.totalHours} hrs</span>
                  )}
                  {summary.offCount > 0 && (
                    <span className={styles.dayCountOff}>{summary.offCount} out</span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Selected day editor ── */}
      <div className={styles.dayEditor}>
        <header className={styles.dayEditorHeader}>
          <div className={styles.dayEditorTitleRow}>
            <h4 className={styles.dayEditorTitle} title={selectedDate}>{formatDayLabel(selectedDate)}</h4>
            {/* Phase E.7 — Past-date hint. Doesn't block editing — just
                surfaces that the supervisor is editing history. */}
            {selectedDate < todayIso() && (
              <span className={styles.pastDateBadge} title="This date is in the past — overrides still apply but won't change anything moving forward">Past date</span>
            )}
          </div>
          {/* Phase E.7 — Toolbar simplified to three primary actions +
              a More menu. Apply Shift / Save Shift rename the previous
              Apply Template / Save as Template buttons. */}
          <div className={styles.dayEditorActions}>
            <button type="button" className={styles.actionBtnPrimary} onClick={() => setTemplatePickerOpen(true)} disabled={busy}>
              Apply Shift
            </button>
            <button type="button" className={styles.actionBtn} onClick={() => setShowSaveAsOpen(true)} disabled={busy}>
              Save Shift
            </button>
            <button type="button" className={styles.actionBtn} onClick={() => setCopyDayOpen(true)} disabled={busy}>
              Copy Day
            </button>
            {/* Phase E.8 — Manage Shifts: dedicated maintenance surface
                with stats + per-shift Edit / Duplicate / Rename / Delete. */}
            <button type="button" className={styles.actionBtn} onClick={() => setManagerOpen(true)} disabled={busy}>
              Manage Shifts
            </button>
            {/* More menu — Mark all + Clear day overrides are
                lower-frequency so they hide behind a single click. */}
            <div className={styles.moreMenuWrap}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => setMoreOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                disabled={busy}
              >
                More ▾
              </button>
              {moreOpen && (
                <div className={styles.moreMenu} role="menu" onClick={() => setMoreOpen(false)}>
                  <button type="button" role="menuitem" className={styles.moreItem} onClick={() => markAllStatus('scheduled')}>
                    Mark all Scheduled
                  </button>
                  <button type="button" role="menuitem" className={styles.moreItem} onClick={() => markAllStatus('off')}>
                    Mark all Off
                  </button>
                  <button type="button" role="menuitem" className={`${styles.moreItem} ${styles.moreItemDanger}`} onClick={clearDayOverrides}>
                    Clear Day Overrides
                  </button>
                </div>
              )}
            </div>
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
          activeEmployees={activeEmployees}
          selectedDate={selectedDate}
          destHasOverrides={scheduleOverrides.some(o => o.effectiveDate === selectedDate)}
          busy={busy}
          onClose={() => setTemplatePickerOpen(false)}
          onApply={handleApplyTemplate}
          onDelete={handleDeleteTemplate}
          onRename={handleRenameTemplate}
          onDuplicate={handleDuplicateTemplate}
          onEdit={handleEditShift}
          onQuickCreate={handleQuickCreateDefaults}
        />
      )}

      {/* ── Edit Shift modal (Phase E.8) ── */}
      {editShiftId && (
        <EditShiftModal
          shiftId={editShiftId}
          activeEmployees={activeEmployees}
          onClose={() => setEditShiftId(null)}
          onSaved={() => {
            refreshShiftTemplatesData()
            setEditShiftId(null)
          }}
        />
      )}

      {/* ── Shift Manager modal (Phase E.8 revision) ── */}
      {managerOpen && (
        <ShiftManagerModal
          templates={shiftTemplates}
          busy={busy}
          onClose={() => setManagerOpen(false)}
          onEdit={(t) => { setManagerOpen(false); setEditShiftId(t.id) }}
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

      {/* ── Copy Day modal (Phase E.7 — non-drag entrypoint) ── */}
      {copyDayOpen && (
        <CopyDayModal
          destinationDate={selectedDate}
          destHasOverrides={scheduleOverrides.some(o => o.effectiveDate === selectedDate)}
          busy={busy}
          onClose={() => setCopyDayOpen(false)}
          onCopy={handleCopyDay}
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
  activeEmployees,
  selectedDate,
  destHasOverrides,
  busy,
  onClose,
  onApply,
  onDelete,
  onRename,
  onDuplicate,
  onEdit,
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
  // Phase E.8 — Block Apply on 0-row shifts so the supervisor never
  // accidentally "applies" an empty starter and thinks it worked.
  const activeRowCount = (activeTemplate?.rowCount ?? activeRows?.length ?? 0)
  const isEmpty        = !!activeTemplate && !loadingPreview && activeRowCount === 0
  const canApply       = !!activeId && !busy && !isEmpty && !loadingPreview

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Apply Shift to {selectedDate}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>×</button>
        </header>

        <div className={styles.modalBody}>
          {!hasTemplates && (
            <div className={styles.quickCreateBanner}>
              <p>No shifts yet. Get started with quick defaults:</p>
              <ul className={styles.quickCreateList}>
                {QUICK_CREATE_DEFAULTS.map(d => (
                  <li key={d.name}><strong>{d.name}</strong> <span>· {d.label}</span></li>
                ))}
              </ul>
              <button type="button" className={styles.actionBtnPrimary} onClick={onQuickCreate} disabled={busy}>
                Create A / B / C starter shifts
              </button>
              <p className={styles.quickCreateNote}>
                Each starter opens in the editor so you can fill in who works, when, and what role.
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
                    data-empty={(t.rowCount ?? 0) === 0 ? 'true' : undefined}
                    onClick={() => setActiveId(t.id)}
                  >
                    <div className={styles.templateMeta}>
                      <strong>{t.name}</strong>
                      {t.label && <span className={styles.templateLabel}>{t.label}</span>}
                      <span className={styles.templateRowCount}>
                        {t.rowCount ?? 0} rows{(t.rowCount ?? 0) === 0 ? ' · needs editing' : ''}
                      </span>
                    </div>
                    <div className={styles.templateActions}>
                      <button type="button" className={styles.actionBtnSmall} disabled={busy} onClick={e => { e.stopPropagation(); onEdit(t) }} title="Edit shift rows">Edit</button>
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

                    {/* Phase E.8 — Row list preview. Shows which
                        employees will be written + their status +
                        times so the supervisor sees the actual diff
                        before clicking Apply. */}
                    {!isEmpty && activeRows && activeRows.length > 0 && (
                      <details className={styles.previewRowsBlock}>
                        <summary className={styles.previewRowsSummary}>Rows that will be applied ({activeRows.length})</summary>
                        <ul className={styles.previewRowsList}>
                          {activeRows.map(r => {
                            const name = activeEmployees.find(e => e.id === r.employeeId)?.name ?? r.employeeId
                            return (
                              <li key={r.id ?? r.employeeId} data-status={r.status}>
                                <span className={styles.previewRowName}>{name}</span>
                                <span className={styles.previewRowStatus}>{r.status}</span>
                                <span className={styles.previewRowTimes}>
                                  {r.status === 'scheduled' && r.startTime && r.endTime
                                    ? `${r.startTime}–${r.endTime}`
                                    : '—'}
                                </span>
                                <span className={styles.previewRowRole}>{r.role ?? ''}</span>
                              </li>
                            )
                          })}
                        </ul>
                      </details>
                    )}

                    {/* Phase E.8 — 0-row guard: a shift with no rows
                        would apply silently and do nothing. Surface
                        it clearly and route the supervisor to Edit. */}
                    {isEmpty && (
                      <div className={styles.emptyShiftBanner}>
                        <p><strong>No employees yet — edit this shift before applying.</strong></p>
                        <button
                          type="button"
                          className={styles.actionBtnPrimary}
                          onClick={() => onEdit(activeTemplate)}
                          disabled={busy}
                        >
                          Edit Shift
                        </button>
                      </div>
                    )}

                    {destHasOverrides && !isEmpty && (
                      <label className={styles.replaceCheckbox}>
                        <input
                          type="checkbox"
                          checked={replace}
                          onChange={e => setReplace(e.target.checked)}
                          disabled={busy}
                        />
                        <span>
                          <strong>{selectedDate} already has overrides.</strong>{' '}
                          Replace them with this shift (existing overrides for that date will be deleted first).
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
          <h3 className={styles.modalTitle}>Save {date} as Shift</h3>
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
            {busy ? 'Saving…' : 'Save Shift'}
          </button>
        </footer>
      </div>
    </div>
  )
}

// Phase E.8 (revision) — Shift Manager modal.
//
// The "browse + maintain" surface for saved shifts. Distinct from the
// picker (which is the "apply now" surface). Lists every shift with
// computed stats — scheduled / off / hours — and exposes Edit /
// Duplicate / Rename / Delete on each row. Empty shifts get a clear
// "Empty" badge.
//
// Stats are computed by lazily fetching the full template body for
// each shift on mount; the list endpoint only carries rowCount, not
// the full rows[]. Caches results in component state so re-renders
// don't re-fetch.
function ShiftManagerModal({
  templates,
  busy,
  onClose,
  onEdit,
  onDelete,
  onRename,
  onDuplicate,
  onQuickCreate,
}) {
  const [statsById, setStatsById] = useState({})
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Fan-out fetch all templates' rows in parallel for the stats grid.
  // For a typical shift library (3–10 templates), this is fast and
  // means the supervisor sees full stats immediately without per-row
  // click-to-load latency.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all(
      templates.map(t =>
        fetchShiftTemplateById(t.id)
          .then(full => [t.id, summarizeRows(full.rows ?? [])])
          .catch(() => [t.id, { scheduled: 0, off: 0, totalHours: 0 }]),
      ),
    ).then(pairs => {
      if (cancelled) return
      setStatsById(Object.fromEntries(pairs))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [templates])

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Manage Shifts</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>×</button>
        </header>
        <div className={styles.modalBody}>
          <p className={styles.modalHint}>
            Saved shifts apply to any calendar date. Edit a shift to change which employees are scheduled, off, sick, or on vacation.
          </p>

          {templates.length === 0 ? (
            <div className={styles.quickCreateBanner}>
              <p>No shifts yet. Create A / B / C starters to get going:</p>
              <ul className={styles.quickCreateList}>
                {QUICK_CREATE_DEFAULTS.map(d => (
                  <li key={d.name}>
                    <strong>{d.name}</strong> <span>· {d.label} · {d.startTime}–{d.endTime}</span>
                  </li>
                ))}
              </ul>
              <button type="button" className={styles.actionBtnPrimary} onClick={onQuickCreate} disabled={busy}>
                Create A / B / C starter shifts
              </button>
              <p className={styles.quickCreateNote}>
                Each starter is pre-loaded with every active employee at default times. Edit any shift to fine-tune.
              </p>
            </div>
          ) : (
            <table className={styles.managerTable}>
              <thead>
                <tr>
                  <th>Shift</th>
                  <th>Rows</th>
                  <th>Scheduled</th>
                  <th>Off / Sick / Vac</th>
                  <th>Hours</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => {
                  const stats = statsById[t.id]
                  const rowCount = t.rowCount ?? 0
                  const isEmpty = rowCount === 0
                  return (
                    <tr key={t.id} data-empty={isEmpty ? 'true' : undefined}>
                      <td>
                        <div className={styles.managerShiftMeta}>
                          <strong>{t.name}</strong>
                          {t.label && <span className={styles.templateLabel}>{t.label}</span>}
                          {t.description && <span className={styles.managerShiftDesc}>{t.description}</span>}
                        </div>
                      </td>
                      <td className={styles.managerNumCell}>
                        {rowCount}
                        {isEmpty && <span className={styles.managerEmptyBadge}>Empty</span>}
                      </td>
                      <td className={styles.managerNumCell}>{loading ? '…' : stats?.scheduled ?? 0}</td>
                      <td className={styles.managerNumCell}>{loading ? '…' : stats?.off ?? 0}</td>
                      <td className={styles.managerNumCell}>{loading ? '…' : `${stats?.totalHours ?? 0}h`}</td>
                      <td>
                        <div className={styles.templateActions}>
                          <button type="button" className={styles.actionBtnSmall} disabled={busy} onClick={() => onEdit(t)} title="Edit shift rows">Edit</button>
                          <button type="button" className={styles.actionBtnSmall} disabled={busy} onClick={() => onDuplicate(t)} title="Duplicate">Duplicate</button>
                          <button type="button" className={styles.actionBtnSmall} disabled={busy} onClick={() => onRename(t)} title="Rename">Rename</button>
                          <button type="button" className={`${styles.actionBtnSmall} ${styles.actionBtnDanger}`} disabled={busy} onClick={() => onDelete(t)} title="Delete">Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// Phase E.8 — Edit Shift modal. Renders one row per active employee
// and lets the supervisor set status / start / end / role / notes.
// Saving PATCHes the template via patchShiftTemplate({ rows }) which
// the worker translates to a rows-replace (DELETE + INSERT).
//
// CRITICAL: edits stay within shift_template_rows. They DO NOT touch
// employee_schedule_overrides or employee_schedules — those only get
// written when the supervisor explicitly applies the shift to a date.
function EditShiftModal({ shiftId, activeEmployees, onClose, onSaved }) {
  const toast = useToast()
  const [shift, setShift]   = useState(null)
  const [rows, setRows]     = useState(null)
  const [busy, setBusy]     = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Pull the full template once. Merge its rows into the active
  // employee list so every active employee gets an editable row even
  // if the shift currently has no entry for them (the common case for
  // a fresh starter).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchShiftTemplateById(shiftId)
      .then(t => {
        if (cancelled) return
        setShift(t)
        const byEmployee = new Map((t.rows ?? []).map(r => [r.employeeId, r]))
        const seeded = activeEmployees.map((emp, i) => {
          const existing = byEmployee.get(emp.id)
          return {
            employeeId: emp.id,
            employeeName: emp.name,
            status:     existing?.status    ?? 'scheduled',
            startTime:  existing?.startTime ?? '',
            endTime:    existing?.endTime   ?? '',
            role:       existing?.role      ?? emp.role ?? '',
            notes:      existing?.notes     ?? '',
            sortOrder:  existing?.sortOrder ?? i * 10,
          }
        })
        setRows(seeded)
      })
      .catch(err => {
        if (cancelled) return
        toast.error(`Could not load shift: ${err.message}`)
        onClose()
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [shiftId, activeEmployees, toast, onClose])

  function patchRow(employeeId, patch) {
    setRows(prev => prev.map(r => r.employeeId === employeeId ? { ...r, ...patch } : r))
  }

  async function handleSave() {
    if (!rows) return
    // Only persist rows that have meaningful content — a row with
    // status='scheduled' and no times / role / notes carries no info
    // worth replaying.
    const payload = rows
      .filter(r => r.status !== 'scheduled' || r.startTime || r.endTime || r.role || r.notes)
      .map((r, i) => ({
        employeeId: r.employeeId,
        status:     r.status,
        startTime:  r.startTime || null,
        endTime:    r.endTime   || null,
        role:       r.role      || null,
        notes:      r.notes     || null,
        sortOrder:  i * 10,
      }))
    setBusy(true)
    try {
      await patchShiftTemplate(shiftId, { rows: payload })
      toast.success(`Saved "${shift?.name ?? 'shift'}" with ${payload.length} row(s)`)
      onSaved?.()
    } catch (err) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  if (loading || !rows) {
    return (
      <div className={styles.modalOverlay} onClick={onClose}>
        <div className={`${styles.modal} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
          <header className={styles.modalHeader}>
            <h3 className={styles.modalTitle}>Edit Shift</h3>
            <button type="button" className={styles.modalClose} onClick={onClose}>×</button>
          </header>
          <div className={styles.modalBody}>
            <p className={styles.previewEmpty}>Loading shift…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Edit Shift — {shift?.name}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>×</button>
        </header>
        <div className={styles.modalBody}>
          <p className={styles.modalHint}>
            Set who works (or who is off), their hours, role, and notes for this shift. The shift can then be applied to any date.
          </p>
          <table className={styles.editorTable}>
            <thead>
              <tr>
                <th>Operator</th>
                <th>Status</th>
                <th>Start</th>
                <th>End</th>
                <th>Role</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.editorEmpty}>
                    No active employees. Add crew in Employee Management before editing a shift.
                  </td>
                </tr>
              ) : rows.map(row => (
                <tr key={row.employeeId} data-status={row.status}>
                  <td className={styles.editorName}>{row.employeeName}</td>
                  <td>
                    <select
                      className={styles.editorStatusSelect}
                      value={row.status}
                      disabled={busy}
                      onChange={e => patchRow(row.employeeId, { status: e.target.value })}
                    >
                      {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      type="time"
                      className={styles.editorTimeInput}
                      value={row.startTime}
                      disabled={busy || row.status !== 'scheduled'}
                      onChange={e => patchRow(row.employeeId, { startTime: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      className={styles.editorTimeInput}
                      value={row.endTime}
                      disabled={busy || row.status !== 'scheduled'}
                      onChange={e => patchRow(row.employeeId, { endTime: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className={styles.editorNotesInput}
                      value={row.role}
                      disabled={busy}
                      placeholder="optional"
                      onChange={e => patchRow(row.employeeId, { role: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className={styles.editorNotesInput}
                      value={row.notes}
                      disabled={busy}
                      placeholder="optional"
                      onChange={e => patchRow(row.employeeId, { notes: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className={styles.modalFooter}>
          <button type="button" className={styles.actionBtn} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={styles.actionBtnPrimary} onClick={handleSave} disabled={busy || rows.length === 0}>
            {busy ? 'Saving…' : 'Save Shift'}
          </button>
        </footer>
      </div>
    </div>
  )
}

// Phase E.7 — Copy Day modal. Non-drag entrypoint for the copy-day
// flow. Default source = yesterday (relative to destinationDate). The
// supervisor picks a different source via <input type="date">.
function CopyDayModal({ destinationDate, destHasOverrides, busy, onClose, onCopy }) {
  // Default to yesterday relative to the destination, computed via
  // local-noon so timezone shifts can't flip the day.
  const defaultSource = useMemo(() => {
    const [y, m, d] = destinationDate.split('-').map(Number)
    const dt = new Date(y, m - 1, d, 12)
    dt.setDate(dt.getDate() - 1)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  }, [destinationDate])
  const [sourceDate, setSourceDate] = useState(defaultSource)
  const [replace, setReplace]       = useState(destHasOverrides)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const sameDay = sourceDate === destinationDate
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Copy Day → {destinationDate}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>×</button>
        </header>
        <div className={styles.modalBody}>
          <p className={styles.modalHint}>Copy the merged schedule from a source date onto this date. Recurring rules and assignments are not affected.</p>
          <label className={styles.modalField}>
            <span>Source date</span>
            <input
              type="date"
              autoFocus
              value={sourceDate}
              onChange={e => setSourceDate(e.target.value)}
              className={styles.modalInput}
            />
          </label>
          {sameDay && (
            <p className={styles.modalWarn}>Source date is the same as the destination — pick a different day.</p>
          )}
          {destHasOverrides && (
            <label className={styles.replaceCheckbox}>
              <input
                type="checkbox"
                checked={replace}
                onChange={e => setReplace(e.target.checked)}
                disabled={busy}
              />
              <span>
                <strong>{destinationDate} already has overrides.</strong>{' '}
                Replace them with {sourceDate}'s schedule (existing overrides for that date will be deleted first).
              </span>
            </label>
          )}
        </div>
        <footer className={styles.modalFooter}>
          <button type="button" className={styles.actionBtn} onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className={styles.actionBtnPrimary}
            disabled={busy || sameDay}
            onClick={() => onCopy({ sourceDate, replace })}
          >
            {busy ? 'Copying…' : 'Copy Day'}
          </button>
        </footer>
      </div>
    </div>
  )
}
