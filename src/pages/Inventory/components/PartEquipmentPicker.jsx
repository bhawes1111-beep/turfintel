import styles from './EditInventoryQuantityModal.module.css'
import { normalizePartEquipment } from '../../../utils/inventory/partEquipment'

export default function PartEquipmentPicker({ equipment = [], value = [], onChange, disabled = false }) {
  const selected = normalizePartEquipment(value)
  const fleetNames = equipment.map(unit => unit?.name).filter(Boolean)
  const options = [...new Set([...fleetNames, ...selected])]
    .sort((a, b) => a.localeCompare(b))

  function toggle(name) {
    const next = selected.includes(name)
      ? selected.filter(item => item !== name)
      : [...selected, name]
    onChange?.(next)
  }

  return (
    <div className={styles.equipmentPicker} role="group" aria-label="Compatible equipment">
      <div className={styles.equipmentPickerSummary}>
        <strong>{selected.length === 0 ? 'No equipment selected' : `${selected.length} selected`}</strong>
        <span>Select every fleet unit this part fits.</span>
      </div>
      <div className={styles.equipmentPickerOptions}>
        {options.length === 0 ? (
          <span className={styles.equipmentPickerEmpty}>Add equipment to the fleet before assigning parts.</span>
        ) : options.map(name => (
          <label className={styles.equipmentPickerOption} key={name}>
            <input
              type="checkbox"
              checked={selected.includes(name)}
              onChange={() => toggle(name)}
              disabled={disabled}
            />
            <span>{name}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
