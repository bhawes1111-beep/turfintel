import {
  NEMATODE_CONTROL_TYPES,
  TURF_NEMATODE_OPTIONS,
  makeNematodeTarget,
  normalizeNematodeTargets,
} from '../../../utils/inventory/nematodeTargets'
import styles from './EditInventoryQuantityModal.module.css'

export default function NematodeTargetsEditor({ value, onChange, disabled = false }) {
  const rows = normalizeNematodeTargets(value)

  function replaceRows(nextRows) {
    onChange?.(normalizeNematodeTargets(nextRows))
  }

  function addRow() {
    replaceRows([...rows, makeNematodeTarget()])
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
          Add the nematodes this chemical is labeled for, then mark the control style.
        </span>
        <button
          type="button"
          className={styles.btnTiny}
          onClick={addRow}
          disabled={disabled}
        >
          + Nematode
        </button>
      </div>

      {rows.length > 0 && (
        <div className={styles.nutrientRows}>
          {rows.map(row => (
            <div key={row.id} className={styles.diseaseTargetRow}>
              <label className={`${styles.field} ${styles.diseaseTargetField}`}>
                <span className={styles.label}>Nematode</span>
                <select
                  value={row.nematode}
                  onChange={e => updateRow(row.id, { nematode: e.target.value })}
                  disabled={disabled}
                  aria-label="Turfgrass nematode"
                >
                  {TURF_NEMATODE_OPTIONS.map(option => (
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
                  aria-label="Nematode control type"
                >
                  {NEMATODE_CONTROL_TYPES.map(option => (
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
