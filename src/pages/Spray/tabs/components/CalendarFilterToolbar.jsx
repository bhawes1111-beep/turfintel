import { useMemo } from 'react'
import { buildProgramCalendarFilterOptions, PROGRAM_CALENDAR_DEFAULT_FILTERS }
  from '../../../../utils/sprayPrograms/programCalendar'
import styles from './CalendarFilterToolbar.module.css'

// Phase 7H (3/?) — Spray Program Calendar filter toolbar.
//
// Stateless presentation component over the parent's filters + sort
// state. Read-only: never writes, never fetches, never mutates the
// underlying programs/items. The toolbar exists purely to narrow what
// the calendar grid + agenda + unscheduled buckets render.
//
// Props:
//   - calendarItems  current (unfiltered) calendar items — feeds the
//                    dropdown option lists so the toolbar only ever
//                    offers values that actually exist in the data.
//   - filters        { search, programId, status, targetArea, linkState }
//   - onFiltersChange(next)
//   - sortMode       'date' | 'program' | 'product' | 'status'
//   - onSortChange(mode)
//   - filteredCount  count of items after filtering
//   - totalCount     count of items before filtering
//
// Mobile-first: the toolbar stacks vertically below ~700px and uses
// compact rows on phones. No table-only layout.

export default function CalendarFilterToolbar({
  calendarItems = [],
  filters,
  onFiltersChange,
  sortMode = 'date',
  onSortChange,
  filteredCount = 0,
  totalCount    = 0,
}) {
  const options = useMemo(
    () => buildProgramCalendarFilterOptions(calendarItems),
    [calendarItems],
  )

  const f = filters ?? PROGRAM_CALENDAR_DEFAULT_FILTERS

  function update(patch) {
    onFiltersChange?.({ ...f, ...patch })
  }
  function clearAll() {
    onFiltersChange?.({ ...PROGRAM_CALENDAR_DEFAULT_FILTERS })
  }

  const isDirty =
    (f.search ?? '') !== '' ||
    (f.programId  ?? 'all') !== 'all' ||
    (f.status     ?? 'all') !== 'all' ||
    (f.targetArea ?? 'all') !== 'all' ||
    (f.linkState  ?? 'all') !== 'all'

  return (
    <div className={styles.toolbar} role="group" aria-label="Calendar filters">
      <div className={styles.controls}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Search</span>
          <input
            type="search"
            className={styles.searchInput}
            value={f.search ?? ''}
            placeholder="Product, program, area…"
            onChange={(e) => update({ search: e.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Program</span>
          <select
            className={styles.select}
            value={f.programId ?? 'all'}
            onChange={(e) => update({ programId: e.target.value })}
          >
            {options.programs.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <select
            className={styles.select}
            value={f.status ?? 'all'}
            onChange={(e) => update({ status: e.target.value })}
          >
            {options.statuses.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Target area</span>
          <select
            className={styles.select}
            value={f.targetArea ?? 'all'}
            onChange={(e) => update({ targetArea: e.target.value })}
          >
            {options.targetAreas.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Link state</span>
          <select
            className={styles.select}
            value={f.linkState ?? 'all'}
            onChange={(e) => update({ linkState: e.target.value })}
          >
            {options.linkStates.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Sort</span>
          <select
            className={styles.select}
            value={sortMode}
            onChange={(e) => onSortChange?.(e.target.value)}
          >
            {options.sortModes.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={styles.clearBtn}
          onClick={clearAll}
          disabled={!isDirty}
          aria-label="Clear all filters"
        >
          Clear filters
        </button>
      </div>

      <div className={styles.summaryRow}>
        <span className={styles.countLabel}>
          Showing {filteredCount} of {totalCount} planned item{totalCount !== 1 ? 's' : ''}
        </span>
        {isDirty && (
          <span className={styles.activeBadge} aria-label="Filters are active">
            Filters active
          </span>
        )}
      </div>
    </div>
  )
}
