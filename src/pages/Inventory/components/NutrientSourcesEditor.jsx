import { useState } from 'react'
import {
  NUTRIENTS,
  makeNutrientSource,
  normalizeNutrientSources,
  nutrientFormOptionsFor,
  nutrientReleaseForForm,
} from '../../../utils/inventory/nutrientForms'
import styles from './EditInventoryQuantityModal.module.css'

export default function NutrientSourcesEditor({ value, onChange, disabled = false }) {
  const rows = normalizeNutrientSources(value)
  const [selectedNutrient, setSelectedNutrient] = useState('N')

  function replaceRows(nextRows) {
    onChange?.(normalizeNutrientSources(nextRows))
  }

  function addRow(nutrient = 'N') {
    replaceRows([...rows, makeNutrientSource(nutrient)])
  }

  function updateRow(id, patch) {
    replaceRows(rows.map(row => {
      if (row.id !== id) return row
      const next = { ...row, ...patch }
      if (patch.nutrient) {
        const first = nutrientFormOptionsFor(patch.nutrient)[0]
        next.form = first.value
        next.release = first.release
      }
      if (patch.form) {
        next.release = nutrientReleaseForForm(next.nutrient, patch.form)
      }
      return next
    }))
  }

  function removeRow(id) {
    replaceRows(rows.filter(row => row.id !== id))
  }

  return (
    <div className={styles.nutrientEditor}>
      <div className={styles.nutrientToolbar}>
        <span className={styles.nutrientHint}>
          Add each nutrient form separately so spray sheets can split quick and slow release.
        </span>
        <span className={styles.nutrientAddControl}>
          <select
            value={selectedNutrient}
            onChange={e => setSelectedNutrient(e.target.value)}
            disabled={disabled}
            aria-label="Nutrient to add"
          >
            {NUTRIENTS.map(nutrient => (
              <option key={nutrient.value} value={nutrient.value}>
                {nutrient.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.btnTiny}
            onClick={() => addRow(selectedNutrient)}
            disabled={disabled}
          >
            + Add nutrient
          </button>
        </span>
      </div>

      {rows.length > 0 && (
        <div className={styles.nutrientRows}>
          {rows.map(row => (
            <div key={row.id} className={styles.nutrientRow}>
              <label className={styles.field}>
                <span className={styles.label}>Nutrient</span>
                <select
                  value={row.nutrient}
                  onChange={e => updateRow(row.id, { nutrient: e.target.value })}
                  disabled={disabled}
                  aria-label="Nutrient"
                >
                  {NUTRIENTS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className={`${styles.field} ${styles.nutrientFormField}`}>
                <span className={styles.label}>Form</span>
                <select
                  value={row.form}
                  onChange={e => updateRow(row.id, { form: e.target.value })}
                  disabled={disabled}
                  aria-label={`${row.nutrient} form`}
                >
                  {nutrientFormOptionsFor(row.nutrient).map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Percent</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={row.percent}
                  onChange={e => updateRow(row.id, { percent: e.target.value })}
                  disabled={disabled}
                  aria-label={`${row.nutrient} percent`}
                  placeholder="12"
                />
              </label>

              <div className={styles.field}>
                <span className={styles.label}>Release</span>
                <span
                  className={styles.releaseAuto}
                  aria-label={`${row.nutrient} release speed`}
                >
                  {row.release === 'slow' ? 'Slow' : 'Quick'}
                </span>
              </div>

              <button
                type="button"
                className={styles.btnTinyDanger}
                onClick={() => removeRow(row.id)}
                disabled={disabled}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
