import {
  DISEASE_CONTROL_TYPES,
  TURF_DISEASE_OPTIONS,
  makeDiseaseTarget,
  normalizeDiseaseTargets,
} from '../../../utils/inventory/diseaseTargets'
import styles from './EditInventoryQuantityModal.module.css'

export default function DiseaseTargetsEditor({ value, onChange, disabled = false }) {
  const rows = normalizeDiseaseTargets(value)

  function replaceRows(nextRows) {
    onChange?.(normalizeDiseaseTargets(nextRows))
  }

  function addRow() {
    replaceRows([...rows, makeDiseaseTarget()])
  }

  function updateRow(id, patch) {
    replaceRows(rows.map(row => row.id === id ? { ...row, ...patch } : row))
  }

  function removeRow(id) {
    replaceRows(rows.filter(row => row.id !== id))
  }

  return (
    <div className={styles.nutrientEditor}>
      <div className={styles.nutrientToolbar}>
        <span className={styles.nutrientHint}>
          Add the turf diseases this chemical is labeled for, then mark the control style.
        </span>
        <button
          type="button"
          className={styles.btnTiny}
          onClick={addRow}
          disabled={disabled}
        >
          + Disease
        </button>
      </div>

      {rows.length > 0 && (
        <div className={styles.nutrientRows}>
          {rows.map(row => (
            <div key={row.id} className={styles.diseaseTargetRow}>
              <label className={`${styles.field} ${styles.diseaseTargetField}`}>
                <span className={styles.label}>Disease</span>
                <select
                  value={row.disease}
                  onChange={e => updateRow(row.id, { disease: e.target.value })}
                  disabled={disabled}
                  aria-label="Turfgrass disease"
                >
                  {TURF_DISEASE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Control</span>
                <select
                  value={row.controlType}
                  onChange={e => updateRow(row.id, { controlType: e.target.value })}
                  disabled={disabled}
                  aria-label="Disease control type"
                >
                  {DISEASE_CONTROL_TYPES.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

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
