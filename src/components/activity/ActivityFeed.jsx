import { useState, useMemo } from 'react'
import { aggregateAll } from '../../utils/activity/activityBuilder'
import { useOperations } from '../../utils/operations/OperationsContext'
import ActivityFilters from './ActivityFilters'
import ActivityCard from './ActivityCard'
import styles from './activity.module.css'

const DEFAULT_FILTERS = {
  module:         'All',
  dateRange:      'All Time',
  severity:       'All',
  hasAttachments: false,
}

function inDateRange(timestamp, range) {
  if (range === 'All Time') return true
  const ts    = new Date(timestamp)
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (range === 'Today') return ts >= today
  if (range === 'This Week') {
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay())
    return ts >= weekStart
  }
  if (range === 'This Month') return ts >= new Date(now.getFullYear(), now.getMonth(), 1)
  return true
}

export default function ActivityFeed() {
  const { state }         = useOperations()
  const [filters, setFilters] = useState(DEFAULT_FILTERS)

  const ALL_ACTIVITIES = useMemo(
    () => aggregateAll(state.repairOverrides, state.equipmentOverrides),
    [state.repairOverrides, state.equipmentOverrides],
  )

  const visible = useMemo(() => {
    return ALL_ACTIVITIES.filter(a => {
      if (filters.module !== 'All' && a.module !== filters.module)           return false
      if (!inDateRange(a.timestamp, filters.dateRange))                       return false
      if (filters.severity !== 'All' && a.severity !== filters.severity)      return false
      if (filters.hasAttachments && a.attachments.length === 0)               return false
      return true
    })
  }, [filters, ALL_ACTIVITIES])

  const isFiltered = filters.module !== 'All' || filters.dateRange !== 'All Time' ||
    filters.severity !== 'All' || filters.hasAttachments

  return (
    <div className={styles.acFeed}>
      <ActivityFilters filters={filters} onChange={setFilters} />

      <p className={styles.acCount}>
        {visible.length} event{visible.length !== 1 ? 's' : ''}
        {isFiltered ? ' (filtered)' : ''}
      </p>

      {visible.length === 0 ? (
        <p className={styles.acEmpty}>No activity matches your filters.</p>
      ) : (
        <div className={styles.acList}>
          {visible.map(a => <ActivityCard key={a.id} activity={a} />)}
        </div>
      )}
    </div>
  )
}
