import { useMemo, useState } from 'react'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { useSelectedCourse } from '../../../utils/courses/courseStore'
import { useToast } from '../../../utils/feedback/toastContext'
import { openInventoryAuditPrint } from '../../../utils/inventory/inventoryAuditPrint'
import styles from '../Inventory.module.css'

const AUDIT_SECTIONS = [
  { key: 'chemical', label: 'Chemicals', description: 'Fungicides, herbicides, insecticides, PGRs, and other chemicals.' },
  { key: 'fertilizer', label: 'Fertilizer', description: 'Liquid and granular fertilizer products.' },
  { key: 'part', label: 'Parts', description: 'Equipment service and replacement parts.' },
  { key: 'irrigation', label: 'Irrigation', description: 'Heads, nozzles, valves, fittings, wire, and repair stock.' },
  { key: 'fuel', label: 'Fuel', description: 'Gasoline, diesel, and other tracked fuel levels.' },
  { key: 'other', label: 'Other', description: 'Inventory records outside the standard sections.' },
]

const STANDARD_KINDS = new Set(AUDIT_SECTIONS.filter(section => section.key !== 'other').map(section => section.key))

function sectionKey(item) {
  return STANDARD_KINDS.has(item?.kind) ? item.kind : 'other'
}

function allSelections(value = true) {
  return Object.fromEntries(AUDIT_SECTIONS.map(section => [section.key, value]))
}

export default function InventoryAudit() {
  const { items, loading, error } = useInventoryData()
  const selectedCourse = useSelectedCourse()
  const toast = useToast()
  const [selected, setSelected] = useState(() => allSelections(true))

  const counts = useMemo(() => {
    const next = Object.fromEntries(AUDIT_SECTIONS.map(section => [section.key, 0]))
    for (const item of items ?? []) next[sectionKey(item)] += 1
    return next
  }, [items])

  const selectedItems = useMemo(
    () => (items ?? []).filter(item => selected[sectionKey(item)]),
    [items, selected],
  )

  function toggleSection(key) {
    setSelected(current => ({ ...current, [key]: !current[key] }))
  }

  function openPrintPreview() {
    if (selectedItems.length === 0) {
      toast.info?.('Select at least one inventory category with items to print.')
      return
    }
    const opened = openInventoryAuditPrint(selectedItems, {
      courseName: selectedCourse?.name ?? selectedCourse?.shortName ?? '',
    })
    if (!opened) toast.error?.('The audit window was blocked. Allow pop-ups and try again.')
  }

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Inventory Audit"
        subtitle="Choose the inventory sections to include, then open a print or PDF preview."
      >
        <div className={styles.auditSetupHeader}>
          <div>
            <strong>{selectedItems.length}</strong>
            <span> items selected</span>
          </div>
          <div className={styles.auditSetupActions}>
            <button type="button" onClick={() => setSelected(allSelections(true))}>Select All</button>
            <button type="button" onClick={() => setSelected(allSelections(false))}>Clear</button>
          </div>
        </div>

        {error && <p className={styles.auditError}>Inventory could not load. {error}</p>}

        <div className={styles.auditOptionGrid} aria-label="Inventory audit categories">
          {AUDIT_SECTIONS.map(section => (
            <label key={section.key} className={styles.auditOption} data-selected={selected[section.key] ? 'true' : undefined}>
              <input
                type="checkbox"
                checked={Boolean(selected[section.key])}
                onChange={() => toggleSection(section.key)}
              />
              <span className={styles.auditOptionText}>
                <strong>{section.label}</strong>
                <small>{section.description}</small>
              </span>
              <span className={styles.auditOptionCount}>{counts[section.key]}</span>
            </label>
          ))}
        </div>

        <div className={styles.auditGenerateBar}>
          <span>The preview includes recorded stock, package count, size, ounces, gallons, pounds, and physical-count fields.</span>
          <button type="button" onClick={openPrintPreview} disabled={loading || selectedItems.length === 0}>
            {loading ? 'Loading Inventory...' : 'Open Print Preview'}
          </button>
        </div>
      </WorkspaceSection>
    </div>
  )
}
