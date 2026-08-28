import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { nutrientLabel } from '../../utils/inventory/nutrientForms'
import { useInventoryData } from '../../utils/inventory/inventoryStore'
import { useSpraysData } from '../../utils/sprays/spraysStore'
import { buildNutrientActionQueue } from '../../utils/turfHealth/nutrientBenchmarks'
import { useNutrientSamplesData } from '../../utils/turfHealth/nutrientSamplesStore'
import styles from './NutrientAlertsWidget.module.css'

const PRIORITY_LABELS = {
  urgent: 'Urgent',
  attention: 'Review',
  plan: 'Plan',
  upcoming: 'Upcoming',
  setup: 'Set date',
}

function openNutrients(navigate, sampleId = '') {
  navigate('/turf-health', {
    state: {
      activeTab: 'Nutrients',
      nutrientSampleId: sampleId,
    },
  })
}

export default function NutrientAlertsWidget() {
  const navigate = useNavigate()
  const { samples, loading: samplesLoading, error } = useNutrientSamplesData()
  const { records, loading: recordsLoading } = useSpraysData()
  const { items, loading: inventoryLoading } = useInventoryData()
  const actions = useMemo(
    () => buildNutrientActionQueue(samples, records, items),
    [samples, records, items],
  )
  const visible = actions.slice(0, 5)
  const attention = actions.filter(action => action.priority === 'urgent' || action.priority === 'attention').length
  const applications = actions.filter(action => action.kind === 'application').length
  const retests = actions.filter(action => action.kind === 'retest').length
  const loading = samplesLoading || recordsLoading || inventoryLoading

  if (loading) return <p className={styles.message}>Reviewing samples and completed applications...</p>
  if (error) return <p className={styles.error}>Nutrient alerts could not be loaded.</p>

  return (
    <div className={styles.widget}>
      <div className={styles.summary} aria-label="Nutrient alert summary">
        <div><strong>{attention}</strong><span>Need attention</span></div>
        <div><strong>{applications}</strong><span>Applications</span></div>
        <div><strong>{retests}</strong><span>Retests</span></div>
      </div>

      {visible.length > 0 ? (
        <div className={styles.list}>
          {visible.map(action => (
            <button
              type="button"
              className={styles.row}
              key={action.id}
              onClick={() => openNutrients(navigate, action.sampleId)}
            >
              <span className={`${styles.priority} ${styles[action.priority]}`}>
                {PRIORITY_LABELS[action.priority] ?? action.priority}
              </span>
              <span className={styles.identity}>
                <strong>{action.nutrient ? `${nutrientLabel(action.nutrient)}: ` : ''}{action.title}</strong>
                <small>{action.location} / {action.detail}</small>
              </span>
              <span className={styles.view}>View</span>
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>No nutrient actions need attention.</p>
      )}

      <button type="button" className={styles.openAll} onClick={() => openNutrients(navigate)}>
        Open Nutrient Actions
      </button>
    </div>
  )
}
