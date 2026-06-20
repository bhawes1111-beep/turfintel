// Phase S.7 — Calendar-first Spray workspace.
//
// Replaces the old card-dashboard SprayWorkspace as the default Spray
// landing tab. Layout patterned after AnnualScheduleCalendar (E.5):
//
//   • Header with month-prev / month-next / Today / Jump-to-date.
//   • 6-week monthly grid; each cell shows compact area chips for
//     completed sprays + planned sprays + a "Needs info" badge.
//   • Selected-day summary panel underneath the calendar.
//   • Embedded BuildSpraySheet under the summary panel, seeded with
//     the selected date so the supervisor can immediately log a
//     spray without switching tabs.
//
// Strict contract:
//   • Read-only over existing stores (useSpraysData + useSprayPrograms +
//     shared recordNeedsInfo helper). No new fetches, no mutations
//     from this component itself — all writes go through the embedded
//     BuildSpraySheet, which preserves S.5a.2 permission gating.
//   • Date math uses local-noon dates (avoids UTC day drift), matching
//     the AnnualScheduleCalendar pattern.

import { useEffect, useMemo, useState } from 'react'
import { useSpraysData, refreshSpraysData } from '../../../utils/sprays/spraysStore'
import {
  useSprayPrograms,
  refreshSprayPrograms,
  listSprayProgramItems,
} from '../../../utils/sprayPrograms/sprayProgramStore'
import { recordNeedsInfo } from '../../../utils/sprays/recordNeedsInfo'
import { useSelectedCourseId } from '../../../utils/courses/courseStore'
import { useAuth } from '../../../context/AuthContext'
import BuildSpraySheet from './BuildSpraySheet'
// Phase S.7a — Reuse the existing EditSprayRecordModal (S.5a.1) so the
// calendar workspace gets the same safe-edit semantics as Records
// (mutable-field whitelist + snapshot exclusion + product mix read-only).
import EditSprayRecordModal from './EditSprayRecordModal'
// Phase S.7b — Full read-only application sheet. Opens when a
// completed-row card is clicked; offers an Edit button that delegates
// to the same EditSprayRecordModal above.
import SprayApplicationSheetModal from './SprayApplicationSheetModal'
import styles from './SprayCalendarWorkspace.module.css'

// ── Date helpers (local-noon — no UTC drift) ──────────────────────────
function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftMonth(yyyymm, months) {
  const [y, m] = yyyymm.split('-').map(Number)
  const d = new Date(y, m - 1 + months, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
const DAY_FORMATTER   = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

function formatMonthLabel(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number)
  return MONTH_FORMATTER.format(new Date(y, m - 1, 1, 12))
}
function formatDayLabel(yyyymmdd) {
  if (!yyyymmdd) return ''
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  return DAY_FORMATTER.format(new Date(y, m - 1, d, 12))
}

// Build the 6-week month grid (cells before the 1st + after the last
// day of the month are blank `{ date: null }` so the 7-col layout
// stays clean).
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

// Extract a short area label list from a completed spray record.
// Tries `.areas[].name`, falls back to `.area`, then `.holes`.
function extractAreaLabels(record) {
  if (Array.isArray(record?.areas) && record.areas.length > 0) {
    return record.areas
      .map(a => (typeof a === 'string' ? a : a?.name))
      .filter(Boolean)
  }
  if (record?.area) return [record.area]
  if (record?.holes) return [record.holes]
  return []
}

// Extract a short area label from a planned-spray item. The model
// (Phase 7F) stores `targetArea` per item.
function extractPlannedArea(item) {
  return item?.targetArea ?? null
}

// Truncate an area-name list per the spec: 1-2 → all names, more → first
// two + "+N". Always returns ≤ 3 chips.
function truncateLabels(labels) {
  const unique = Array.from(new Set(labels.filter(Boolean)))
  if (unique.length <= 2) return unique
  return [unique[0], unique[1], `+${unique.length - 2}`]
}

// Bucket a planned-spray-item to its visible date. Prefers
// plannedStartDate, falls back to plannedEndDate. Items without
// either are bucketed to "unscheduled" (not rendered on the grid).
function plannedItemDate(item) {
  if (!item) return null
  const s = item.plannedStartDate
  if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const e = item.plannedEndDate
  if (typeof e === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e)) return e
  return null
}

// ── Component ─────────────────────────────────────────────────────────
export default function SprayCalendarWorkspace() {
  const courseId = useSelectedCourseId()
  const { records: sprays, loading: spraysLoading } = useSpraysData()
  const { programs, itemsByProgramId } = useSprayPrograms()

  const [currentMonth, setCurrentMonth] = useState(() => todayIso().slice(0, 7))
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const [jumpInput, setJumpInput] = useState('')
  // Phase S.7a — Currently-editing record. Mirrors Records' pattern.
  const [editingRecord, setEditingRecord] = useState(null)
  // Phase S.7b — Currently-viewed record in the full application sheet.
  // Distinct from editingRecord: the sheet is read-only first; an
  // explicit Edit button transitions to the existing edit modal.
  const [viewingRecord, setViewingRecord] = useState(null)

  // Phase S.7a — Permission gate. The worker is the source of truth
  // (POST /api/sprays/:id gated by canEditSprays); this client gate
  // just hides the Edit affordance to avoid dead-end clicks.
  const { can } = useAuth()
  const canEditSprays = can('canEditSprays')

  // Boot the stores on mount so the page is populated whether or not
  // the user clicked through Workspace earlier.
  useEffect(() => {
    refreshSpraysData()
    refreshSprayPrograms()
  }, [])

  // Lazy-fetch items for every active program in the visible month
  // so the calendar can render planned-spray chips across programs.
  // Mirrors the SprayWorkspace pattern (S.4) — read-only fetch.
  useEffect(() => {
    if (!Array.isArray(programs)) return
    const active = programs.filter(p => p && p.status !== 'archived' && (!courseId || p.courseId === courseId))
    for (const p of active) {
      if (!itemsByProgramId?.[p.id]) {
        listSprayProgramItems(p.id).catch(() => {})
      }
    }
  }, [programs, courseId, itemsByProgramId])

  const monthGrid = useMemo(() => buildMonthGrid(currentMonth), [currentMonth])
  const monthLabel = useMemo(() => formatMonthLabel(currentMonth), [currentMonth])

  // ── Records by date (completed sprays for the visible month) ──────
  const recordsByDate = useMemo(() => {
    const out = {}
    const safe = Array.isArray(sprays) ? sprays : []
    for (const r of safe) {
      if (!r || !r.date) continue
      if (courseId && r.courseId && r.courseId !== courseId) continue
      if (!out[r.date]) out[r.date] = []
      out[r.date].push(r)
    }
    return out
  }, [sprays, courseId])

  // ── Planned items by date (current visible month + nearby) ─────────
  const plannedByDate = useMemo(() => {
    const out = {}
    const safePrograms = Array.isArray(programs) ? programs : []
    for (const p of safePrograms) {
      if (!p || p.status === 'archived') continue
      if (courseId && p.courseId && p.courseId !== courseId) continue
      const items = itemsByProgramId?.[p.id]
      if (!Array.isArray(items)) continue
      for (const item of items) {
        const date = plannedItemDate(item)
        if (!date) continue
        if (!out[date]) out[date] = []
        out[date].push({ programName: p.name, ...item })
      }
    }
    return out
  }, [programs, itemsByProgramId, courseId])

  // ── Selected-day data ─────────────────────────────────────────────
  const selectedRecords = recordsByDate[selectedDate] ?? []
  const selectedPlanned = plannedByDate[selectedDate] ?? []
  const selectedNeedsInfo = selectedRecords.filter(recordNeedsInfo)

  const today = todayIso()

  function goToToday() {
    const t = todayIso()
    setCurrentMonth(t.slice(0, 7))
    setSelectedDate(t)
  }

  function handleJump(e) {
    e?.preventDefault?.()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jumpInput)) return
    setCurrentMonth(jumpInput.slice(0, 7))
    setSelectedDate(jumpInput)
  }

  // Phase S.7 — refresh after a successful embedded commit. The
  // BuildSpraySheet's own commit pipeline already refreshes its
  // local state; this just bumps spraysStore so the calendar chips
  // re-render with the new record.
  function handleEmbeddedCommit() {
    refreshSpraysData()
  }

  return (
    <div className={styles.workspace}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h2 className={styles.title}>Spray Calendar</h2>
          <p className={styles.hint}>Click a date to build, view, or plan sprays.</p>
        </div>
        <div className={styles.headerControls}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => setCurrentMonth(m => shiftMonth(m, -1))}
            aria-label="Previous month"
          >‹</button>
          <span className={styles.monthLabel}>{monthLabel}</span>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => setCurrentMonth(m => shiftMonth(m, 1))}
            aria-label="Next month"
          >›</button>
          <button type="button" className={styles.todayBtn} onClick={goToToday}>
            Today
          </button>
          <form className={styles.jumpForm} onSubmit={handleJump}>
            <label className={styles.jumpLabel}>
              <span className={styles.srOnly}>Jump to date</span>
              <input
                type="date"
                className={styles.jumpInput}
                value={jumpInput}
                onChange={e => setJumpInput(e.target.value)}
                aria-label="Jump to date"
              />
            </label>
            <button type="submit" className={styles.jumpBtn}>Go</button>
          </form>
        </div>
      </header>

      {/* ── Calendar grid ───────────────────────────────────────── */}
      <div className={styles.calendar} aria-busy={spraysLoading ? 'true' : 'false'}>
        <div className={styles.dayHeader} role="row">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className={styles.dayHeaderCell} role="columnheader">{d}</div>
          ))}
        </div>
        <div className={styles.monthGrid} role="grid">
          {monthGrid.map((cell, i) => {
            if (!cell.date) {
              return <div key={`blank-${i}`} className={styles.cellBlank} role="gridcell" aria-hidden />
            }
            const date = cell.date
            const dayNum = Number(date.slice(-2))
            const isToday = date === today
            const isSelected = date === selectedDate

            const recs = recordsByDate[date] ?? []
            const plans = plannedByDate[date] ?? []
            const needsInfoCount = recs.filter(recordNeedsInfo).length

            // Compact area labels (completed sprays).
            const completedAreas = truncateLabels(recs.flatMap(extractAreaLabels))
            const plannedAreas   = truncateLabels(plans.map(extractPlannedArea).filter(Boolean))

            const cellClass = [
              styles.cell,
              isToday    ? styles.cellToday    : '',
              isSelected ? styles.cellSelected : '',
            ].filter(Boolean).join(' ')

            return (
              <button
                key={date}
                type="button"
                className={cellClass}
                role="gridcell"
                aria-label={`${formatDayLabel(date)} — ${recs.length} sprayed, ${plans.length} planned`}
                aria-selected={isSelected ? 'true' : 'false'}
                onClick={() => setSelectedDate(date)}
                data-date={date}
              >
                <div className={styles.cellHeader}>
                  <span className={styles.cellDayNum}>{dayNum}</span>
                  {recs.length > 0 && (
                    <span className={styles.countChipCompleted} title={`${recs.length} sprayed`}>
                      {recs.length} sprayed
                    </span>
                  )}
                  {plans.length > 0 && (
                    <span className={styles.countChipPlanned} title={`${plans.length} planned`}>
                      {plans.length} planned
                    </span>
                  )}
                </div>
                {completedAreas.length > 0 && (
                  <ul className={styles.chipList} aria-label="Completed areas">
                    {completedAreas.map((a, j) => (
                      <li key={`c-${j}`} className={styles.chipCompleted}>{a}</li>
                    ))}
                  </ul>
                )}
                {plannedAreas.length > 0 && (
                  <ul className={styles.chipList} aria-label="Planned areas">
                    {plannedAreas.map((a, j) => (
                      <li key={`p-${j}`} className={styles.chipPlanned}>
                        <span className={styles.chipPlannedPrefix}>Planned:</span> {a}
                      </li>
                    ))}
                  </ul>
                )}
                {needsInfoCount > 0 && (
                  <span className={styles.needsInfoBadge} title={`${needsInfoCount} needs info`}>
                    Needs info
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Selected-day summary panel ──────────────────────────── */}
      <section className={styles.selectedDay} aria-live="polite">
        <header className={styles.selectedDayHeader}>
          <h3 className={styles.selectedDayTitle}>{formatDayLabel(selectedDate)}</h3>
          <div className={styles.selectedDayChips}>
            <span className={styles.summaryChip} data-tone="completed">{selectedRecords.length} sprayed</span>
            <span className={styles.summaryChip} data-tone="planned">{selectedPlanned.length} planned</span>
            {selectedNeedsInfo.length > 0 && (
              <span className={styles.summaryChip} data-tone="needs-info">
                {selectedNeedsInfo.length} needs info
              </span>
            )}
          </div>
        </header>

        {selectedRecords.length === 0 && selectedPlanned.length === 0 ? (
          <p className={styles.emptyState}>No sprays logged or planned for this date.</p>
        ) : (
          <div className={styles.selectedDayLists}>
            {selectedRecords.length > 0 && (
              <div className={styles.selectedDayBlock}>
                <h4 className={styles.selectedDayBlockTitle}>Completed</h4>
                <ul className={styles.selectedDayList}>
                  {selectedRecords.map(r => {
                    const areas = extractAreaLabels(r)
                    const ni = recordNeedsInfo(r)
                    // Phase S.7a — Build a compact weather summary string
                    // ("72°F · 60% RH · NE 5mph") from the record's
                    // conditions block. Uses != null guards (S.6a) so
                    // 0 values render correctly.
                    const c = r.conditions ?? {}
                    const weatherBits = [
                      c.temp != null         ? `${c.temp}°F`                                   : null,
                      c.humidity != null     ? `${c.humidity}% RH`                             : null,
                      c.windDirection || c.windSpeedMph != null
                        ? `${c.windDirection ?? ''} ${c.windSpeedMph != null ? `${c.windSpeedMph}mph` : ''}`.trim()
                        : null,
                    ].filter(Boolean)
                    return (
                      // Phase S.7b — Row is now a button; click opens
                      // the full read-only sheet. Per-row Edit button
                      // stops propagation so the sheet doesn't also
                      // open. All users (including read-only viewers)
                      // can open the sheet; only canEditSprays sees
                      // the Edit affordance inside the sheet.
                      <li key={r.id} className={styles.selectedDayRowItem}>
                        <button
                          type="button"
                          className={styles.selectedDayRow}
                          onClick={() => setViewingRecord(r)}
                          aria-label={`View spray application sheet for ${areas.join(', ') || r.date}`}
                        >
                          <div className={styles.completedRowBody}>
                            <span className={styles.rowMain}>
                              {areas.join(', ') || '—'}
                              {r.applicator && (
                                <span className={styles.rowMeta}> · {r.applicator}</span>
                              )}
                            </span>
                            {(r.startTime || r.endTime) && (
                              <span className={styles.rowSubMeta}>
                                {r.startTime ?? '—'}{r.endTime ? ` → ${r.endTime}` : ''}
                              </span>
                            )}
                            {weatherBits.length > 0 && (
                              <span className={styles.rowSubMeta}>{weatherBits.join(' · ')}</span>
                            )}
                          </div>
                          <div className={styles.completedRowActions}>
                            {ni && <span className={styles.rowNeedsInfo}>Needs info</span>}
                            {/* Phase S.7a — Edit button. S.5a.2 gate:
                                hidden entirely for users without canEditSprays
                                (no view-only purpose; the row already shows
                                everything visible read-only).
                                Phase S.7b — stopPropagation so the row's
                                view-sheet click doesn't also fire. */}
                            {canEditSprays && (
                              <span
                                role="button"
                                tabIndex={0}
                                className={styles.editBtn}
                                onClick={(e) => { e.stopPropagation(); setEditingRecord(r) }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault(); e.stopPropagation(); setEditingRecord(r)
                                  }
                                }}
                                aria-label={`Edit spray record for ${areas.join(', ') || r.date}`}
                              >
                                Edit
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {selectedPlanned.length > 0 && (
              <div className={styles.selectedDayBlock}>
                <h4 className={styles.selectedDayBlockTitle}>Planned</h4>
                <ul className={styles.selectedDayList}>
                  {selectedPlanned.map((item, i) => (
                    <li key={`${item.id ?? i}`} className={styles.selectedDayRow}>
                      <span className={styles.rowMain}>
                        {item.targetArea ?? '—'}
                        {item.productName && (
                          <span className={styles.rowMeta}> · {item.productName}</span>
                        )}
                        {item.programName && (
                          <span className={styles.rowMeta}> · {item.programName}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Embedded Build Spray form ───────────────────────────── */}
      <section className={styles.embeddedBuilder} aria-label="Build a spray for the selected date">
        <header className={styles.embeddedBuilderHeader}>
          <h3 className={styles.embeddedBuilderTitle}>Build a spray for this date</h3>
          <p className={styles.embeddedBuilderHint}>
            Draft date is set from the calendar selection. Commit Application saves
            the spray and refreshes the calendar chips above.
          </p>
        </header>
        {/* Phase S.7 — Reuses the existing BuildSpraySheet component.
            New optional props: initialDate (seeds the draft date) and
            onCommit (refresh hook). Builder still owns its own draft +
            autosave + permission gating. */}
        <BuildSpraySheet initialDate={selectedDate} onCommit={handleEmbeddedCommit} />
      </section>

{/* Phase S.7b — Full read-only application sheet modal. Opens on
          completed-row click. Its Edit action closes the sheet and
          opens the existing EditSprayRecordModal (so the user can
          flow View → Edit → Save → calendar refreshes). */}
      {viewingRecord && (
        <SprayApplicationSheetModal
          record={viewingRecord}
          canEdit={canEditSprays}
          onEdit={(rec) => { setViewingRecord(null); setEditingRecord(rec) }}
          onClose={() => setViewingRecord(null)}
        />
      )}

      {/* Phase S.7a — Edit Spray Record modal. Reuses S.5a.1's
          EditSprayRecordModal byte-for-byte; the modal owns its own
          patchSpray() + refreshSpraysData() pipeline, so closing on
          save automatically updates the calendar chips above. */}
      {editingRecord && (
        <EditSprayRecordModal
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSaved={() => setEditingRecord(null)}
        />
      )}
    </div>
  )
}
