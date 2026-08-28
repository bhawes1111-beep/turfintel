import {
  COATED_NUTRIENT_OPTIONS,
  FERTILIZER_COATING_TYPES,
  normalizeFertilizerCoating,
} from '../../../utils/inventory/fertilizerCoatings'
import styles from './EditInventoryQuantityModal.module.css'

export default function FertilizerCoatingEditor({ value, onChange, disabled = false }) {
  const coating = normalizeFertilizerCoating(value)

  function update(patch) {
    onChange?.(normalizeFertilizerCoating({ ...coating, ...patch }))
  }

  const hasCoating = coating.coatingType !== 'none'

  return (
    <div className={styles.nutrientEditor}>
      <span className={styles.nutrientHint}>
        Track coated or controlled-release fertilizer separately from the nutrient analysis.
      </span>
      <div className={styles.grid}>
        <label className={styles.field}>
          <span className={styles.label}>Coating type</span>
          <select
            value={coating.coatingType}
            onChange={e => update({ coatingType: e.target.value })}
            disabled={disabled}
            aria-label="Fertilizer coating type"
          >
            {FERTILIZER_COATING_TYPES.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {hasCoating && (
          <label className={styles.field}>
            <span className={styles.label}>Coated nutrient</span>
            <select
              value={coating.coatedNutrient}
              onChange={e => update({ coatedNutrient: e.target.value })}
              disabled={disabled}
              aria-label="Coated nutrient"
            >
              {COATED_NUTRIENT_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {hasCoating && (
          <label className={styles.field}>
            <span className={styles.label}>Coated percent</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={coating.coatedPercent}
              onChange={e => update({ coatedPercent: e.target.value })}
              placeholder="50"
              aria-label="Coated nutrient percent"
              disabled={disabled}
            />
          </label>
        )}
        {hasCoating && (
          <label className={styles.field}>
            <span className={styles.label}>Release days</span>
            <input
              type="text"
              value={coating.releaseDays}
              onChange={e => update({ releaseDays: e.target.value })}
              placeholder="45-90"
              aria-label="Coated fertilizer release days"
              disabled={disabled}
            />
          </label>
        )}
      </div>
      {hasCoating && (
        <label className={styles.field}>
          <span className={styles.label}>Coating notes</span>
          <textarea
            rows={2}
            value={coating.notes}
            onChange={e => update({ notes: e.target.value })}
            placeholder="Example: 50% slow release nitrogen from PCU"
            aria-label="Coated fertilizer notes"
            disabled={disabled}
          />
        </label>
      )}
    </div>
  )
}
