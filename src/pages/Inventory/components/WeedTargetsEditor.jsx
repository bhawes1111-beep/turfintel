import { useMemo, useState } from 'react'
import {
  TURF_WEED_OPTIONS,
  WEED_CONTROL_TIMINGS,
  makeWeedTarget,
  weedLabel,
} from '../../../utils/inventory/weedTargets'
import styles from './EditInventoryQuantityModal.module.css'

const STATIC_WEED_VALUES = new Set(TURF_WEED_OPTIONS.map(option => option.value))

function editableRows(value) {
  if (!Array.isArray(value)) return []
  return value.map(row => ({
    id: row?.id || makeWeedTarget().id,
    weed: String(row?.weed ?? ''),
    timing: WEED_CONTROL_TIMINGS.some(option => option.value === row?.timing)
      ? row.timing
      : 'post_emergent',
  }))
}

export default function WeedTargetsEditor({ value, onChange, disabled = false }) {
  const rows = editableRows(value)
  const [activeRowId, setActiveRowId] = useState(null)
  const [customOptions, setCustomOptions] = useState([])

  const weedOptions = useMemo(() => {
    const customFromRows = rows
      .map(row => String(row.weed ?? '').trim())
      .filter(weed => weed && !STATIC_WEED_VALUES.has(weed))
      .map(weed => ({ value: weed, label: weed }))
    const merged = [...TURF_WEED_OPTIONS, ...customOptions, ...customFromRows]
    const seen = new Set()
    return merged.filter(option => {
      const key = option.value.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [customOptions, rows])

  function replaceRows(nextRows) {
    onChange?.(nextRows)
  }

  function addRow() {
    replaceRows([...rows, makeWeedTarget()])
  }

  function updateRow(id, patch) {
    replaceRows(rows.map(row => row.id === id ? { ...row, ...patch } : row))
  }

  function removeRow(id) {
    replaceRows(rows.filter(row => row.id !== id))
  }

  function searchMatches(row) {
    const needle = String(row?.weed ?? '').trim().toLowerCase()
    if (!needle) return weedOptions.slice(0, 8)
    return weedOptions
      .filter(option =>
        option.label.toLowerCase().includes(needle) ||
        option.value.toLowerCase().includes(needle)
      )
      .slice(0, 8)
  }

  function exactMatch(value) {
    const needle = String(value ?? '').trim().toLowerCase()
    if (!needle) return null
    return weedOptions.find(option =>
      option.label.toLowerCase() === needle ||
      option.value.toLowerCase() === needle
    ) ?? null
  }

  function chooseWeed(id, option) {
    updateRow(id, { weed: option.value })
    setActiveRowId(null)
  }

  function addTypedWeed(row) {
    const label = String(row?.weed ?? '').trim()
    if (!label) return
    const match = exactMatch(label)
    const option = match ?? { value: label, label }
    if (!match) {
      setCustomOptions(current => (
        current.some(item => item.value.toLowerCase() === label.toLowerCase())
          ? current
          : [...current, option]
      ))
    }
    chooseWeed(row.id, option)
  }

  return (
    <div className={styles.nutrientEditor}>
      <div className={styles.nutrientToolbar}>
        <span className={styles.nutrientHint}>
          Add weeds listed on the label, then mark whether the product is pre-emergent or post-emergent.
        </span>
        <button type="button" className={styles.btnTiny} onClick={addRow} disabled={disabled}>
          + Weed
        </button>
      </div>

      {rows.length > 0 && (
        <div className={styles.weedRows}>
          {rows.map(row => (
            <div key={row.id} className={styles.weedTargetRow}>
              <div className={styles.weedSearchCell}>
                <label className={`${styles.field} ${styles.diseaseTargetField}`}>
                  <span className={styles.label}>Weed</span>
                  <input
                    type="text"
                    value={weedLabel(row.weed)}
                    onChange={e => updateRow(row.id, { weed: e.target.value })}
                    onFocus={() => setActiveRowId(row.id)}
                    onBlur={() => window.setTimeout(() => setActiveRowId(current => current === row.id ? null : current), 120)}
                    onKeyDown={e => e.stopPropagation()}
                    disabled={disabled}
                    aria-label="Turfgrass weed"
                    placeholder="Type to search or add..."
                    autoComplete="off"
                  />
                </label>
                {activeRowId === row.id && !disabled && (
                  <div className={styles.weedSearchMenu}>
                    {searchMatches(row).map(option => (
                      <button
                        key={option.value}
                        type="button"
                        className={styles.weedOption}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => chooseWeed(row.id, option)}
                      >
                        {option.label}
                      </button>
                    ))}
                    {String(row.weed ?? '').trim() && !exactMatch(row.weed) && (
                      <button
                        type="button"
                        className={`${styles.weedOption} ${styles.weedOptionAdd}`}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => addTypedWeed(row)}
                      >
                        Add "{String(row.weed).trim()}" to list
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className={styles.weedControlCell}>
                <label className={styles.field}>
                  <span className={styles.label}>Control</span>
                  <select
                    value={row.timing}
                    onChange={e => updateRow(row.id, { timing: e.target.value })}
                    disabled={disabled}
                    aria-label="Weed control timing"
                  >
                    {WEED_CONTROL_TIMINGS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.weedActionCell}>
                <button
                  type="button"
                  className={styles.btnTinyDanger}
                  onClick={() => removeRow(row.id)}
                  disabled={disabled}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
