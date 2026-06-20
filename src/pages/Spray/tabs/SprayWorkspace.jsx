// Phase S.4 — Spray Workspace entry surface.
//
// Date-first landing surface modeled on the crew Annual Schedule
// Calendar layout. Lists planned program items + completed records +
// drafts for the selected date in clean stacked cards. Quick-action
// buttons route to the existing Spray tabs unchanged — this surface
// is read-only on its own and never mutates spray data directly.
//
// Reuses existing stores:
//   • useSpraysData()    → returns { records } including status +
//                           date + products[] (Phase 5.3).
//   • useSprayPrograms() → returns { programs, itemsByProgramId }.
//                           Items carry plannedStartDate/EndDate
//                           and a status (planned | applied | etc).
//
// No worker calls, no mutations, no calculation logic touched.

import { useEffect, useMemo, useState } from 'react'
import { useSpraysData, refreshSpraysData } from '../../../utils/sprays/spraysStore'
import {
  useSprayPrograms,
  refreshSprayPrograms,
  listSprayProgramItems,
} from '../../../utils/sprayPrograms/sprayProgramStore'
import { useSelectedCourseId } from '../../../utils/courses/courseStore'
// Phase S.6a — Shared needs-info heuristic. Replaces the local
// duplicate which used the wrong field names (windSpeed vs.
// windSpeedMph, temperature vs. temp).
import { recordNeedsInfo } from '../../../utils/sprays/recordNeedsInfo'
import styles from './SprayWorkspace.module.css'

function todayIso() { return new Date().toISOString().slice(0, 10) }

function shiftDay(yyyymmdd, delta) {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 12)
  dt.setDate(dt.getDate() + delta)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// Display formatters — internal storage stays ISO.
const DAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'long', month: 'long', day: 'numeric',
})
function formatDay(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  return DAY_FORMATTER.format(new Date(y, m - 1, d, 12))
}

// Returns true when `date` falls inside [start, end] inclusive. Either
// bound can be null — when start is null we anchor on end alone, and
// vice-versa. When both are null, the item is never matched (no date).
function dateInWindow(dateIso, startIso, endIso) {
  if (!dateIso) return false
  if (!startIso && !endIso) return false
  const start = startIso ?? endIso
  const end   = endIso   ?? startIso
  return dateIso >= start && dateIso <= end
}

// Phase S.6a — recordNeedsInfo() moved to src/utils/sprays/
// recordNeedsInfo.js. The local copy here used wrong field names
// (windSpeed vs. windSpeedMph, temperature vs. temp) and disagreed
// with the SprayRecords filter toggle. The shared helper is the
// single source of truth across Workspace, Records, and the
// compliance packet report builder.

export default function SprayWorkspace({ onNavigateTab }) {
  const { records } = useSpraysData()
  const { programs, itemsByProgramId } = useSprayPrograms()
  const courseId = useSelectedCourseId()
  const [selectedDate, setSelectedDate] = useState(todayIso)

  // Refresh on mount so a freshly-mounted workspace shows current
  // data without waiting for the next user-triggered fetch.
  useEffect(() => {
    refreshSpraysData()
    refreshSprayPrograms()
  }, [])

  // Lazy-load items for every active program so the planned-sprays
  // card can render across all programs without forcing the user to
  // open the Program Planner first. Cached by sprayProgramStore.
  useEffect(() => {
    const activePrograms = programs.filter(p => p.status !== 'archived' && p.courseId === courseId)
    for (const p of activePrograms) {
      if (!itemsByProgramId[p.id]) {
        listSprayProgramItems(p.id).catch(() => { /* surface via store error */ })
      }
    }
  }, [programs, itemsByProgramId, courseId])

  // ── Records for the selected day ────────────────────────────────────
  const dayRecords = useMemo(() => {
    return (records ?? []).filter(r => r.date === selectedDate)
  }, [records, selectedDate])

  const dayCompleted    = useMemo(() => dayRecords.filter(r => r.status === 'completed'),    [dayRecords])
  const dayInProgress   = useMemo(() => dayRecords.filter(r => r.status === 'in-progress'),  [dayRecords])
  const dayPendingReview= useMemo(() => dayRecords.filter(r => r.status === 'pending-review'),[dayRecords])
  const dayPlannedRecs  = useMemo(() => dayRecords.filter(r => r.status === 'planned'),      [dayRecords])
  const dayIncomplete   = useMemo(() => dayRecords.filter(recordNeedsInfo),                   [dayRecords])

  // ── Planned program items for the selected day ──────────────────────
  const dayPlannedItems = useMemo(() => {
    const out = []
    for (const program of programs) {
      if (program.courseId !== courseId) continue
      if (program.status === 'archived')  continue
      const items = itemsByProgramId[program.id] ?? []
      for (const item of items) {
        if (item.status !== 'planned') continue
        if (!dateInWindow(selectedDate, item.plannedStartDate, item.plannedEndDate)) continue
        out.push({
          id:         item.id,
          programId:  program.id,
          programName:program.name,
          productName:item.productName,
          targetArea: item.targetArea,
          rate:       (item.rateValue != null && item.rateUnit)
                        ? `${item.rateValue} ${item.rateUnit}`
                        : null,
        })
      }
    }
    return out
  }, [programs, itemsByProgramId, courseId, selectedDate])

  // ── Quick-action button targets — set the parent Spray tab ─────────
  function go(tab) {
    if (typeof onNavigateTab === 'function') onNavigateTab(tab)
  }

  const isToday = selectedDate === todayIso()
  const isPast  = selectedDate < todayIso()

  // Total counts for the header chip strip.
  const totalPlanned   = dayPlannedItems.length + dayPlannedRecs.length
  const totalCompleted = dayCompleted.length
  const totalDrafts    = dayInProgress.length + dayPendingReview.length

  return (
    <section className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h3 className={styles.title}>Spray Workspace</h3>
          <p className={styles.hint}>
            Date-first view of planned sprays, completed applications, and drafts.
            Build, log, and manage sprays from one place.
          </p>
        </div>
      </header>

      {/* ── Date navigator ── */}
      <div className={styles.dateNav}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setSelectedDate(shiftDay(selectedDate, -1))}
          aria-label="Previous day"
        >
          ‹
        </button>
        <div className={styles.dateLabelWrap}>
          <span className={styles.dateLabel} title={selectedDate}>{formatDay(selectedDate)}</span>
          {isToday && <span className={styles.dateBadge} data-tone="today">Today</span>}
          {isPast  && <span className={styles.dateBadge} data-tone="past">Past</span>}
        </div>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setSelectedDate(shiftDay(selectedDate, 1))}
          aria-label="Next day"
        >
          ›
        </button>
        <label className={styles.jumpTo}>
          <span className={styles.jumpToLabel}>Jump to</span>
          <input
            type="date"
            value={selectedDate}
            onChange={e => { if (e.target.value) setSelectedDate(e.target.value) }}
            aria-label="Jump to date"
          />
        </label>
        <button
          type="button"
          className={styles.todayBtn}
          onClick={() => setSelectedDate(todayIso())}
          disabled={isToday}
        >
          Today
        </button>
      </div>

      {/* ── Quick actions ── */}
      <div className={styles.actions}>
        <button type="button" className={styles.actionBtnPrimary} onClick={() => go('Build Spray')}>
          Build Spray Sheet
        </button>
        <button type="button" className={styles.actionBtn} onClick={() => go('Records')}>
          Log Application
        </button>
        {/* Phase S.6b — Renamed "Spray Programs" → "Planned Sprays".
            navigateTab key also renamed; both branches of Spray.jsx
            route the new key to the right component. */}
        <button type="button" className={styles.actionBtn} onClick={() => go('Planned Sprays')}>
          Planned Sprays
        </button>
        <button type="button" className={styles.actionBtn} onClick={() => go('Calendar')}>
          Spray Calendar
        </button>
        <button type="button" className={styles.actionBtn} onClick={() => go('Calculator')}>
          Mix Calculator
        </button>
      </div>

      {/* ── Day summary chips ── */}
      <div className={styles.summaryChips} aria-live="polite">
        <span className={styles.summaryChip} data-tone="planned">
          {totalPlanned} planned
        </span>
        <span className={styles.summaryChip} data-tone="completed">
          {totalCompleted} completed
        </span>
        {totalDrafts > 0 && (
          <span className={styles.summaryChip} data-tone="drafts">
            {totalDrafts} draft / pending
          </span>
        )}
        {dayIncomplete.length > 0 && (
          <span className={styles.summaryChip} data-tone="incomplete">
            {dayIncomplete.length} needs info
          </span>
        )}
      </div>

      {/* ── Selected-day cards ── */}
      <div className={styles.cards}>
        {/* Planned */}
        <article className={styles.card} data-tone="planned">
          <header className={styles.cardHeader}>
            <h4 className={styles.cardTitle}>Planned Sprays</h4>
            <span className={styles.cardCount}>{totalPlanned}</span>
          </header>
          <div className={styles.cardBody}>
            {totalPlanned === 0 ? (
              <p className={styles.cardEmpty}>No sprays planned for this date.</p>
            ) : (
              <ul className={styles.cardList}>
                {dayPlannedItems.map(item => (
                  <li key={`pgm-${item.id}`} className={styles.cardRow}>
                    <div className={styles.rowMain}>
                      <strong>{item.productName ?? '(unnamed product)'}</strong>
                      {item.targetArea && <span className={styles.rowMeta}>· {item.targetArea}</span>}
                      {item.rate && <span className={styles.rowMeta}>· {item.rate}</span>}
                    </div>
                    <span className={styles.rowSource}>{item.programName}</span>
                  </li>
                ))}
                {dayPlannedRecs.map(r => (
                  <li key={`rec-${r.id}`} className={styles.cardRow}>
                    <div className={styles.rowMain}>
                      <strong>{(r.products ?? []).map(p => p.name).join(', ') || '(no products)'}</strong>
                      {(r.areas ?? []).length > 0 && (
                        <span className={styles.rowMeta}>
                          · {r.areas.map(a => a.name ?? a).join(', ')}
                        </span>
                      )}
                    </div>
                    <span className={styles.rowSource}>Draft sheet</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>

        {/* Completed */}
        <article className={styles.card} data-tone="completed">
          <header className={styles.cardHeader}>
            <h4 className={styles.cardTitle}>Completed Applications</h4>
            <span className={styles.cardCount}>{totalCompleted}</span>
          </header>
          <div className={styles.cardBody}>
            {totalCompleted === 0 ? (
              <p className={styles.cardEmpty}>No completed applications logged for this date.</p>
            ) : (
              <ul className={styles.cardList}>
                {dayCompleted.map(r => (
                  <li key={r.id} className={styles.cardRow}>
                    <div className={styles.rowMain}>
                      <strong>{(r.products ?? []).map(p => p.name).join(', ') || '(no products)'}</strong>
                      {(r.areas ?? []).length > 0 && (
                        <span className={styles.rowMeta}>
                          · {r.areas.map(a => a.name ?? a).join(', ')}
                        </span>
                      )}
                    </div>
                    <span className={styles.rowSource}>{r.applicator ?? ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>

        {/* Drafts / In-progress */}
        {totalDrafts > 0 && (
          <article className={styles.card} data-tone="drafts">
            <header className={styles.cardHeader}>
              <h4 className={styles.cardTitle}>Drafts / Pending Review</h4>
              <span className={styles.cardCount}>{totalDrafts}</span>
            </header>
            <div className={styles.cardBody}>
              <ul className={styles.cardList}>
                {[...dayInProgress, ...dayPendingReview].map(r => (
                  <li key={r.id} className={styles.cardRow}>
                    <div className={styles.rowMain}>
                      <strong>{(r.products ?? []).map(p => p.name).join(', ') || '(no products)'}</strong>
                    </div>
                    <span className={styles.rowSource}>
                      {r.status === 'in-progress' ? 'In progress' : 'Pending review'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        )}

        {/* Compliance / missing info */}
        {dayIncomplete.length > 0 && (
          <article className={styles.card} data-tone="incomplete">
            <header className={styles.cardHeader}>
              <h4 className={styles.cardTitle}>Compliance — Needs Info</h4>
              <span className={styles.cardCount}>{dayIncomplete.length}</span>
            </header>
            <div className={styles.cardBody}>
              <p className={styles.cardHint}>
                These completed records are missing products, areas, or weather conditions. Open them in Spray Records to finish them.
              </p>
              <ul className={styles.cardList}>
                {dayIncomplete.map(r => (
                  <li key={r.id} className={styles.cardRow}>
                    <div className={styles.rowMain}>
                      <strong>{(r.products ?? []).map(p => p.name).join(', ') || '(no products)'}</strong>
                    </div>
                    <button type="button" className={styles.linkBtn} onClick={() => go('Records')}>
                      Open in Records →
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        )}
      </div>

      <p className={styles.footerHint}>
        Need the full toolbox? Use the tabs above — Build Spray, Records, Calendar, Programs, Calculator, and More — to reach the original spray surfaces unchanged.
      </p>
    </section>
  )
}
