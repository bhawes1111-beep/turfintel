import { useEffect, useMemo, useState } from 'react'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import { EmptyState } from '../../../components/shared/EmptyState'
import {
  useSprayPrograms,
  listSprayProgramItems,
} from '../../../utils/sprayPrograms/sprayProgramStore'
import {
  buildProgramCalendarItems,
  groupProgramItemsByDate,
} from '../../../utils/sprayPrograms/programCalendar'
import styles from './SprayProgramCalendar.module.css'

// Phase 7H (1/?) — Spray Program Calendar tab.
//
// Read-only visualization over spray_programs + spray_program_items.
// Layout: month grid (with active-month navigation) + an Agenda list
// for the same month, plus a dedicated "Unscheduled / no date" bucket
// so items without a planned window don't disappear.
//
// Strict invariants:
//   - never calls createSpray
//   - never calls recordInventoryUsage
//   - never writes a calendar event
//   - never mutates spray_programs / spray_program_items / catalog
//   - never auto-flips item status
//   - no drag/drop scheduling in this commit

const BOUNDARY_COPY = [
  'Calendar view is read-only.',
  'Planned windows do not create completed spray records.',
  'Moving items on this view is not enabled yet.',
  'Inventory is not deducted from planned items.',
]

const STATUS_LABEL = {
  planned:   'Planned',
  completed: 'Completed',
  skipped:   'Skipped',
  canceled:  'Canceled',
}

// Day-of-week labels for the month grid (Sunday-first to match the
// existing app's calendar convention).
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function todayMonthAnchor() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() } // month 0–11
}

function monthLabel(year, month) {
  const dt = new Date(Date.UTC(year, month, 1))
  return dt.toLocaleString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function dayKey(year, month, day) {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

/**
 * Build a 6-row × 7-col month grid (always 42 cells) so the layout
 * doesn't jump between 4-row and 6-row months. Each cell carries
 * `inMonth` for the styling layer.
 */
function buildMonthGrid(year, month) {
  const first   = new Date(Date.UTC(year, month, 1))
  const firstDow = first.getUTCDay()                          // 0 = Sun
  const start   = new Date(Date.UTC(year, month, 1 - firstDow))
  const cells   = []
  for (let i = 0; i < 42; i++) {
    const dt = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i))
    cells.push({
      year:  dt.getUTCFullYear(),
      month: dt.getUTCMonth(),
      day:   dt.getUTCDate(),
      key:   dayKey(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()),
      inMonth: dt.getUTCMonth() === month,
    })
  }
  return cells
}

export default function SprayProgramCalendar() {
  const { programs, itemsByProgramId, loading, error } = useSprayPrograms()

  const [{ year, month }, setAnchor] = useState(todayMonthAnchor)

  // Lazy-load items for every non-archived program on mount + on
  // programs change. Items are cached per-program in the store, so
  // re-runs are cheap.
  useEffect(() => {
    let cancelled = false
    const live = (programs ?? []).filter(p => p && p.status !== 'archived')
    Promise.allSettled(
      live.map(p => listSprayProgramItems(p.id)),
    ).then(() => {
      if (cancelled) return
      // No-op: store state already updated.
    })
    return () => { cancelled = true }
  }, [programs])

  const calendarItems = useMemo(
    () => buildProgramCalendarItems(programs ?? [], itemsByProgramId ?? {}),
    [programs, itemsByProgramId],
  )

  const { byDay, unscheduled } = useMemo(
    () => groupProgramItemsByDate(calendarItems),
    [calendarItems],
  )

  const monthCells = useMemo(() => buildMonthGrid(year, month), [year, month])

  // Agenda rows: items whose window touches the active month.
  const agendaRows = useMemo(() => {
    const rows = []
    for (const cell of monthCells) {
      if (!cell.inMonth) continue
      const list = byDay[cell.key]
      if (!list || list.length === 0) continue
      for (const ci of list) {
        // Only emit each item once per day; if its window also covers
        // adjacent cells, the calendar grid handles that naturally.
        rows.push({ key: cell.key, ci })
      }
    }
    return rows
  }, [monthCells, byDay])

  function goPrevMonth() {
    setAnchor(({ year, month }) => {
      if (month === 0) return { year: year - 1, month: 11 }
      return { year, month: month - 1 }
    })
  }
  function goNextMonth() {
    setAnchor(({ year, month }) => {
      if (month === 11) return { year: year + 1, month: 0 }
      return { year, month: month + 1 }
    })
  }
  function goToday() {
    setAnchor(todayMonthAnchor())
  }

  if (error) {
    return (
      <div className={styles.tabContent}>
        <EmptyState
          title="Could not load spray programs."
          description={error}
        />
      </div>
    )
  }

  const hasAnyData = calendarItems.length > 0
  const monthHasItems = agendaRows.length > 0

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Spray Program Calendar"
        subtitle="Read-only visualization of planned spray windows. Items remain editable from the Program Planner tab."
      >
        <BoundaryNote />

        {loading && !hasAnyData && (
          <EmptyState compact title="Loading planned items…" />
        )}

        {!loading && !hasAnyData && (
          <EmptyState
            title="No planned items yet."
            description="Open the Program Planner tab to create a spray program and add planned items."
          />
        )}

        {hasAnyData && (
          <>
            <div className={styles.toolbarRow}>
              <div className={styles.navGroup}>
                <button type="button" className={styles.navBtn} onClick={goPrevMonth}>← Prev</button>
                <button type="button" className={styles.navBtn} onClick={goToday}>Today</button>
                <button type="button" className={styles.navBtn} onClick={goNextMonth}>Next →</button>
              </div>
              <h3 className={styles.monthHeader}>{monthLabel(year, month)}</h3>
              <span className={styles.countLabel}>
                {agendaRows.length} planned item{agendaRows.length !== 1 ? 's' : ''} this month
              </span>
            </div>

            {/* ── Month grid ───────────────────────────────────────── */}
            <div className={styles.gridWrap} role="grid" aria-label={`Spray program calendar for ${monthLabel(year, month)}`}>
              <div className={styles.weekdayRow}>
                {WEEKDAYS.map(d => (
                  <span key={d} className={styles.weekdayCell}>{d}</span>
                ))}
              </div>
              <div className={styles.grid}>
                {monthCells.map(cell => {
                  const list = byDay[cell.key] ?? []
                  return (
                    <DayCell
                      key={cell.key}
                      cell={cell}
                      items={list}
                    />
                  )
                })}
              </div>
            </div>

            {/* ── Agenda for active month ──────────────────────────── */}
            <section className={styles.agendaSection}>
              <h4 className={styles.sectionLabel}>Agenda — {monthLabel(year, month)}</h4>
              {monthHasItems
                ? (
                  <ul className={styles.agendaList}>
                    {agendaRows.map(({ key, ci }, i) => (
                      <AgendaRow key={`${key}-${ci.id}-${i}`} day={key} ci={ci} />
                    ))}
                  </ul>
                )
                : (
                  <p className={styles.emptyAgenda}>No planned items fall in this month.</p>
                )}
            </section>

            {/* ── Unscheduled / no-date items ──────────────────────── */}
            {unscheduled.length > 0 && (
              <section className={styles.agendaSection}>
                <h4 className={styles.sectionLabel}>Unscheduled / no date</h4>
                <p className={styles.unscheduledHint}>
                  These items do not have planned dates set. Open the Program Planner tab to schedule them.
                </p>
                <ul className={styles.agendaList}>
                  {unscheduled.map((ci, i) => (
                    <AgendaRow key={`unscheduled-${ci.id}-${i}`} day={null} ci={ci} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </WorkspaceSection>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function BoundaryNote() {
  return (
    <p className={styles.boundaryNote}>{BOUNDARY_COPY.join(' ')}</p>
  )
}

function DayCell({ cell, items }) {
  const hasItems = items.length > 0
  const visible  = items.slice(0, 3)
  const overflow = items.length - visible.length
  return (
    <div
      role="gridcell"
      className={`${styles.dayCell} ${cell.inMonth ? '' : styles.dayCell_outMonth} ${hasItems ? styles.dayCell_hasItems : ''}`}
    >
      <div className={styles.dayHeader}>
        <span className={styles.dayNum}>{cell.day}</span>
      </div>
      {hasItems && (
        <ul className={styles.dayItemList}>
          {visible.map(ci => (
            <li
              key={ci.id}
              className={`${styles.dayItem} ${styles[`status_${ci.status}`] ?? ''}`}
              title={`${ci.programName ?? ''} — ${ci.displayLabel}`}
            >
              {ci.hasCompletedLink && (
                <span className={styles.completedDot} aria-hidden>✓</span>
              )}
              <span className={styles.dayItemLabel}>{ci.displayLabel}</span>
            </li>
          ))}
          {overflow > 0 && (
            <li className={styles.dayOverflow}>+{overflow} more</li>
          )}
        </ul>
      )}
    </div>
  )
}

function AgendaRow({ day, ci }) {
  return (
    <li className={`${styles.agendaItem} ${styles[`agendaStatus_${ci.status}`] ?? ''}`}>
      <div className={styles.agendaMain}>
        <div className={styles.agendaTitleRow}>
          <span className={styles.agendaProduct}>{ci.displayLabel}</span>
          <span className={styles.agendaStatusBadge}>
            {STATUS_LABEL[ci.status] ?? ci.status}
          </span>
          {ci.hasCompletedLink && (
            <span className={styles.agendaLinkedChip} title="Linked to a completed spray record">
              ✓ Linked completed
            </span>
          )}
        </div>
        <div className={styles.agendaMeta}>
          {ci.programName && <span>📋 {ci.programName}</span>}
          {ci.targetArea  && <span>📍 {ci.targetArea}</span>}
          {ci.rangeLabel && <span>🗓 {ci.rangeLabel}</span>}
          {ci.plannedWindowLabel && !ci.rangeLabel && (
            <span>🗓 {ci.plannedWindowLabel}</span>
          )}
        </div>
        {day && (
          <div className={styles.agendaDayKey}>On {day}</div>
        )}
      </div>
    </li>
  )
}
