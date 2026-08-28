import { useMemo, useState } from 'react'
import { nutrientLabel } from '../../utils/inventory/nutrientForms'
import { useInventoryData } from '../../utils/inventory/inventoryStore'
import { useSpraysData } from '../../utils/sprays/spraysStore'
import { buildNutrientActionQueue } from '../../utils/turfHealth/nutrientBenchmarks'
import styles from './NutrientSamples.module.css'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'application', label: 'Applications' },
  { value: 'retest', label: 'Retests' },
  { value: 'review', label: 'Review' },
]

const PRIORITY_LABELS = {
  urgent: 'Urgent',
  attention: 'Attention',
  plan: 'Plan',
  upcoming: 'Upcoming',
  setup: 'Set date',
}

function displayDate(value) {
  if (!value) return ''
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function NutrientActionQueue({ samples, canEdit, onOpenSample, onStartApplication }) {
  const { records, loading: recordsLoading } = useSpraysData()
  const { items, loading: inventoryLoading } = useInventoryData()
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(false)
  const actions = useMemo(
    () => buildNutrientActionQueue(samples, records, items),
    [samples, records, items],
  )
  const filtered = useMemo(
    () => filter === 'all' ? actions : actions.filter(action => action.kind === filter),
    [actions, filter],
  )
  const shown = expanded ? filtered : filtered.slice(0, 6)
  const urgentCount = actions.filter(action => action.priority === 'urgent' || action.priority === 'attention').length
  const countFor = value => value === 'all' ? actions.length : actions.filter(action => action.kind === value).length

  if (recordsLoading || inventoryLoading) {
    return <section className={styles.actionQueue}><p className={styles.actionLoading}>Reviewing nutrient follow-ups...</p></section>
  }

  return (
    <section className={styles.actionQueue} aria-label="Nutrient action queue">
      <div className={styles.actionHeader}>
        <div>
          <p className={styles.eyebrow}>Nutrient Action Queue</p>
          <h2>What needs attention</h2>
          <p>Latest samples only. Completed, linked applications drive recommendation progress.</p>
        </div>
        <div className={styles.actionCounts}>
          <span><b>{actions.length}</b> Open</span>
          <span className={urgentCount > 0 ? styles.actionCountUrgent : ''}><b>{urgentCount}</b> Attention</span>
        </div>
      </div>

      <div className={styles.actionFilters} aria-label="Nutrient action filter">
        {FILTERS.map(option => <button
          type="button"
          key={option.value}
          className={filter === option.value ? styles.active : ''}
          onClick={() => { setFilter(option.value); setExpanded(false) }}
        >{option.label} <span>{countFor(option.value)}</span></button>)}
      </div>

      {shown.length > 0 ? <div className={styles.actionList}>
        {shown.map(action => {
          const sample = samples.find(item => item.id === action.sampleId)
          return <div className={styles.actionRow} key={action.id}>
            <span className={`${styles.actionPriority} ${styles[`action${action.priority[0].toUpperCase()}${action.priority.slice(1)}`]}`}>{PRIORITY_LABELS[action.priority]}</span>
            <div className={styles.actionIdentity}>
              <strong>{action.nutrient ? `${nutrientLabel(action.nutrient)}: ` : ''}{action.title}</strong>
              <span>{action.location} / {action.sampleType} sample from {displayDate(action.sampleDate)}</span>
              <small>{action.detail}{action.dueDate ? ` / ${displayDate(action.dueDate)}` : ''}</small>
            </div>
            <div className={styles.actionButtons}>
              <button type="button" onClick={() => onOpenSample(sample)}>View Sample</button>
              {canEdit && action.kind === 'application' && onStartApplication && <button type="button" className={styles.actionPrimary} onClick={() => onStartApplication(sample)}>Start Application</button>}
            </div>
          </div>
        })}
      </div> : <p className={styles.actionEmpty}>No nutrient actions in this category.</p>}

      {filtered.length > 6 && <button type="button" className={styles.actionExpand} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : `Show all ${filtered.length}`}</button>}
    </section>
  )
}
