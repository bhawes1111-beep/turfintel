import { useEffect, useMemo, useState } from 'react'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import { EmptyState } from '../../../components/shared/EmptyState'
import {
  useSprayPrograms,
  listSprayProgramItems,
} from '../../../utils/sprayPrograms/sprayProgramStore'
import {
  buildProgramCalendarItems,
  filterProgramCalendarItems,
  sortProgramCalendarItems,
  groupProgramItemsForCalendar,
  groupCalendarEventsByDate,
  PROGRAM_CALENDAR_DEFAULT_FILTERS,
} from '../../../utils/sprayPrograms/programCalendar'
// Phase 7H (2/?) — read-only detail drawer + the stores it needs to
// resolve linked completed sprays + intelligence context.
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { useProductCatalog } from '../../../utils/productCatalog/productCatalogStore'
import { useImportedLabels } from '../../../utils/inventory/labelImportStore'
import { useSpraysData } from '../../../utils/sprays/spraysStore'
import ProgramCalendarItemDrawer from './components/ProgramCalendarItemDrawer'
// Phase 7R.4 — grouped-application drawer (one event = N products).
import ProgramCalendarApplicationDrawer from './components/ProgramCalendarApplicationDrawer'
// Phase 7H (3/?) — filter/sort toolbar.
import CalendarFilterToolbar from './components/CalendarFilterToolbar'
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
  // Phase 7H (2/?) — stores for the read-only detail drawer.
  const { items: inventoryItems }     = useInventoryData()
  const { products: catalogProducts } = useProductCatalog()
  const { labels: importedLabels }    = useImportedLabels()
  const { records: sprayRecords }     = useSpraysData()
  const labelsByItemId = useMemo(() => {
    const out = {}
    for (const lbl of importedLabels ?? []) {
      if (lbl?.inventoryItemId) out[lbl.inventoryItemId] = lbl
    }
    return out
  }, [importedLabels])
  const intelContext = useMemo(() => ({
    inventoryProducts: inventoryItems ?? [],
    catalogProducts:   catalogProducts ?? [],
    labelsByItemId,
  }), [inventoryItems, catalogProducts, labelsByItemId])
  const sprayRecordsById = useMemo(() => {
    const out = {}
    for (const r of sprayRecords ?? []) if (r?.id) out[r.id] = r
    return out
  }, [sprayRecords])

  // Selected planned-item id; the per-product drawer is open whenever
  // this is set. Items are reached by drilling into the grouped
  // application drawer first.
  const [selectedItemId, setSelectedItemId] = useState(null)
  // Phase 7R.4 — selected grouped-application event id. Clicking a
  // calendar cell or agenda row opens this drawer (NOT the per-item one).
  const [selectedEventId, setSelectedEventId] = useState(null)

  // Phase 7H (3/?) — filter + sort state. Filters narrow the calendar
  // items before grouping; sort orders the agenda + unscheduled lists.
  // The month grid receives the same filtered set so a cell only ever
  // surfaces items the user asked to see.
  const [filters, setFilters]   = useState(() => ({ ...PROGRAM_CALENDAR_DEFAULT_FILTERS }))
  const [sortMode, setSortMode] = useState('date')

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

  // Apply filter + sort BEFORE grouping so the month grid, agenda, and
  // unscheduled buckets all honor the same narrowed view.
  const filteredItems = useMemo(
    () => filterProgramCalendarItems(calendarItems, filters),
    [calendarItems, filters],
  )
  const sortedItems = useMemo(
    () => sortProgramCalendarItems(filteredItems, sortMode),
    [filteredItems, sortMode],
  )

  // Phase 7R.4 — group the filtered+sorted items into per-application
  // events (program × date × area × type) and then bucket those events
  // by day so the month grid renders one chip per application instead
  // of one chip per product row.
  const events = useMemo(
    () => groupProgramItemsForCalendar(sortedItems),
    [sortedItems],
  )
  const { byDay, unscheduled } = useMemo(
    () => groupCalendarEventsByDate(events),
    [events],
  )

  const monthCells = useMemo(() => buildMonthGrid(year, month), [year, month])

  // Selected-item resolution. Walk every cached program's items to find
  // the planner row by id; resolve the parent program + the linked
  // completed spray (when present). Defensive against missing caches.
  const selection = useMemo(() => {
    if (!selectedItemId) return null
    for (const p of programs ?? []) {
      const list = itemsByProgramId?.[p.id]
      if (!Array.isArray(list)) continue
      const item = list.find(i => i.id === selectedItemId)
      if (item) {
        const linkedSpray = item.linkedSprayRecordId
          ? sprayRecordsById[item.linkedSprayRecordId] ?? null
          : null
        return { item, program: p, linkedSpray }
      }
    }
    return null
  }, [selectedItemId, programs, itemsByProgramId, sprayRecordsById])

  // Phase 7R.4 — selected grouped-application event resolution. Looks
  // the event up in the current `events` projection, then resolves the
  // parent program object for the drawer's title/action wiring.
  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null
    const ev = events.find(e => e.id === selectedEventId)
    if (!ev) return null
    const program = (programs ?? []).find(p => p?.id === ev.programId) ?? null
    return { event: ev, program }
  }, [selectedEventId, events, programs])

  // Agenda rows: events whose window touches the active month.
  const agendaRows = useMemo(() => {
    const rows = []
    for (const cell of monthCells) {
      if (!cell.inMonth) continue
      const list = byDay[cell.key]
      if (!list || list.length === 0) continue
      for (const ev of list) {
        rows.push({ key: cell.key, ev })
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
      {/* Phase S.6c.1 — 'Spray Program Calendar' → 'Planned Spray
          Calendar' user-facing header. 'Program Planner' tab in
          subtitle was already renamed to 'Planned Sprays' in S.6b. */}
      <WorkspaceSection
        title="Planned Spray Calendar"
        subtitle="Read-only visualization of planned spray windows. Items remain editable from the Planned Sprays tab."
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
            {/* Phase 7H (3/?) — filter + sort toolbar. */}
            <CalendarFilterToolbar
              calendarItems={calendarItems}
              filters={filters}
              onFiltersChange={setFilters}
              sortMode={sortMode}
              onSortChange={setSortMode}
              filteredCount={sortedItems.length}
              totalCount={calendarItems.length}
            />

            <div className={styles.toolbarRow}>
              <div className={styles.navGroup}>
                <button type="button" className={styles.navBtn} onClick={goPrevMonth}>← Prev</button>
                <button type="button" className={styles.navBtn} onClick={goToday}>Today</button>
                <button type="button" className={styles.navBtn} onClick={goNextMonth}>Next →</button>
              </div>
              <h3 className={styles.monthHeader}>{monthLabel(year, month)}</h3>
              <span className={styles.countLabel}>
                {agendaRows.length} application{agendaRows.length !== 1 ? 's' : ''} this month
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
                      events={list}
                      onSelectEvent={setSelectedEventId}
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
                    {agendaRows.map(({ key, ev }, i) => (
                      <AgendaRow
                        key={`${key}-${ev.id}-${i}`}
                        day={key}
                        ev={ev}
                        onSelectEvent={setSelectedEventId}
                      />
                    ))}
                  </ul>
                )
                : (
                  <p className={styles.emptyAgenda}>No planned applications fall in this month.</p>
                )}
            </section>

            {/* ── Unscheduled / no-date items ──────────────────────── */}
            {unscheduled.length > 0 && (
              <section className={styles.agendaSection}>
                <h4 className={styles.sectionLabel}>Unscheduled / no date</h4>
                <p className={styles.unscheduledHint}>
                  These applications do not have planned dates set. Open the Program Planner tab to schedule them.
                </p>
                <ul className={styles.agendaList}>
                  {unscheduled.map((ev, i) => (
                    <AgendaRow
                      key={`unscheduled-${ev.id}-${i}`}
                      day={null}
                      ev={ev}
                      onSelectEvent={setSelectedEventId}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </WorkspaceSection>

      {/* Phase 7R.4 — grouped-application drawer. Opens when a calendar
          chip / agenda row / unscheduled row is clicked. Drilling into
          a product row inside this drawer opens the per-item drawer
          below. */}
      <ProgramCalendarApplicationDrawer
        event={selectedEvent?.event ?? null}
        program={selectedEvent?.program ?? null}
        onSelectItem={(itemId) => setSelectedItemId(itemId)}
        onClose={() => setSelectedEventId(null)}
      />

      {/* Phase 7H (2/?) — read-only per-item drawer. Reached by drilling
          into a product row inside the application drawer above. */}
      <ProgramCalendarItemDrawer
        item={selection?.item ?? null}
        program={selection?.program ?? null}
        linkedSpray={selection?.linkedSpray ?? null}
        intelContext={intelContext}
        inventoryItems={inventoryItems ?? []}
        onClose={() => setSelectedItemId(null)}
      />
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function BoundaryNote() {
  return (
    <p className={styles.boundaryNote}>{BOUNDARY_COPY.join(' ')}</p>
  )
}

// Phase 7R.4 — DayCell + AgendaRow now render grouped *events*
// (one per program × date × area × type), NOT per-product rows.
// Clicking a chip opens the grouped-application drawer; the per-item
// drawer is reached by drilling into a product row inside that drawer.

function deriveEventStatus(ev) {
  // Roll-up status for chip styling: completed only if every product is
  // completed; canceled if every product canceled; otherwise show the
  // dominant "live" state.
  const sb = ev?.statusBreakdown
  if (!sb) return 'planned'
  const total = (sb.planned ?? 0) + (sb.completed ?? 0) + (sb.skipped ?? 0) + (sb.canceled ?? 0)
  if (total === 0) return 'planned'
  if (sb.completed === total) return 'completed'
  if (sb.canceled  === total) return 'canceled'
  if (sb.planned   > 0) return 'planned'
  if (sb.skipped   > 0) return 'skipped'
  return 'planned'
}

function DayCell({ cell, events, onSelectEvent }) {
  const hasEvents = events.length > 0
  const visible   = events.slice(0, 3)
  const overflow  = events.length - visible.length
  return (
    <div
      role="gridcell"
      className={`${styles.dayCell} ${cell.inMonth ? '' : styles.dayCell_outMonth} ${hasEvents ? styles.dayCell_hasItems : ''}`}
    >
      <div className={styles.dayHeader}>
        <span className={styles.dayNum}>{cell.day}</span>
      </div>
      {hasEvents && (
        <ul className={styles.dayItemList}>
          {visible.map(ev => {
            const evStatus = deriveEventStatus(ev)
            const showType = ev.applicationType !== 'spray'
            return (
              <li key={ev.id}>
                <button
                  type="button"
                  className={`${styles.dayItem} ${styles.dayItemBtn} ${styles[`status_${evStatus}`] ?? ''}`}
                  title={`${ev.programName ?? ''} — ${ev.title}${showType ? ' · ' + ev.typeLabel : ''} (${ev.productCount} product${ev.productCount !== 1 ? 's' : ''})`}
                  onClick={() => onSelectEvent?.(ev.id)}
                  aria-label={`Open ${ev.title}${showType ? ' ' + ev.typeLabel : ''} application with ${ev.productCount} product${ev.productCount !== 1 ? 's' : ''}`}
                >
                  {ev.hasCompletedLink && (
                    <span className={styles.completedDot} aria-hidden>✓</span>
                  )}
                  <span className={styles.dayItemLabel}>
                    {ev.title}
                    {showType && (
                      <span className={styles.dayItemTypeChip}> · {ev.typeLabel}</span>
                    )}
                  </span>
                  <span className={styles.dayItemCount}>{ev.productCount}</span>
                </button>
              </li>
            )
          })}
          {overflow > 0 && (
            <li className={styles.dayOverflow}>+{overflow} more</li>
          )}
        </ul>
      )}
    </div>
  )
}

function AgendaRow({ day, ev, onSelectEvent }) {
  const evStatus = deriveEventStatus(ev)
  const showType = ev.applicationType !== 'spray'
  const titleSuffix = showType ? ` · ${ev.typeLabel}` : ''
  return (
    <li className={`${styles.agendaItem} ${styles[`agendaStatus_${evStatus}`] ?? ''}`}>
      <button
        type="button"
        className={styles.agendaItemBtn}
        onClick={() => onSelectEvent?.(ev.id)}
        aria-label={`Open ${ev.title}${titleSuffix} application with ${ev.productCount} product${ev.productCount !== 1 ? 's' : ''}`}
      >
        <div className={styles.agendaMain}>
          <div className={styles.agendaTitleRow}>
            <span className={styles.agendaProduct}>
              {ev.title}{titleSuffix}
            </span>
            <span className={styles.agendaStatusBadge}>
              {STATUS_LABEL[evStatus] ?? evStatus}
            </span>
            <span className={styles.agendaProductCount}>
              {ev.productCount} product{ev.productCount !== 1 ? 's' : ''}
            </span>
            {ev.hasCompletedLink && (
              <span className={styles.agendaLinkedChip} title="At least one product is linked to a completed spray record">
                ✓ Linked completed
              </span>
            )}
          </div>
          <div className={styles.agendaMeta}>
            {ev.programName && <span>📋 {ev.programName}</span>}
            {ev.targetArea  && <span>📍 {ev.targetArea}</span>}
            {ev.plannedStartDate && (
              <span>🗓 {ev.plannedEndDate && ev.plannedEndDate !== ev.plannedStartDate
                ? `${ev.plannedStartDate} → ${ev.plannedEndDate}`
                : ev.plannedStartDate}</span>
            )}
          </div>
          {day && (
            <div className={styles.agendaDayKey}>On {day}</div>
          )}
        </div>
      </button>
    </li>
  )
}
