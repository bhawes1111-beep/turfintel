import { useMemo, useState } from 'react'
import { useInventoryData } from '../../../../utils/inventory/inventoryStore'
import styles from './PlannerPickers.module.css'

// Phase 7F (3/?) — Inventory picker for the Spray Program Planner.
//
// Reads from useInventoryData; never writes. Picking an inventory item
// just calls onSelect(item) so the planner can populate the planned
// item's inventoryItemId — no stock deduction, no usage record, no
// catalog touch.

const KIND_FILTERS = [
  { value: 'all',        label: 'All' },
  { value: 'chemical',   label: 'Chemicals' },
  { value: 'fertilizer', label: 'Fertilizer' },
  { value: 'product',    label: 'Products' },
]

export default function InventoryPickerModal({ onSelect, onCancel }) {
  const { items, loading, error } = useInventoryData()
  const [search, setSearch] = useState('')
  const [kind,   setKind]   = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const onlyKind = kind === 'all' ? null : kind
    return (items ?? [])
      .filter(i => onlyKind ? i.kind === onlyKind : true)
      .filter(i => {
        if (!q) return true
        return (i.name ?? '').toLowerCase().includes(q)
            || (i.category ?? '').toLowerCase().includes(q)
            || (i.vendor ?? '').toLowerCase().includes(q)
      })
      // Sort: in-stock first by name; out-of-stock last.
      .sort((a, b) => {
        const ao = (a.quantity ?? 0) > 0 ? 0 : 1
        const bo = (b.quantity ?? 0) > 0 ? 0 : 1
        if (ao !== bo) return ao - bo
        return (a.name ?? '').localeCompare(b.name ?? '')
      })
  }, [items, search, kind])

  function stockSummary(item) {
    if (item.quantity == null || item.unit == null) return null
    const q = `${item.quantity} ${item.unit}`
    if (item.quantity <= 0) return { label: q, tone: 'critical' }
    if (item.reorderLevel != null && item.quantity <= item.reorderLevel) return { label: q, tone: 'warn' }
    return { label: q, tone: 'ok' }
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Pick inventory item">
      <div className={styles.modal}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Select inventory item</h2>
            <p className={styles.subtitle}>
              Inventory links are for planning only and do not deduct stock.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onCancel}
            aria-label="Close"
          >✕</button>
        </header>

        {error && (
          <div className={styles.errorBanner}>Could not load inventory: {error}</div>
        )}

        <div className={styles.toolbar}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search by name, category, or vendor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search inventory"
            autoFocus
          />
          <div className={styles.filterRow}>
            {KIND_FILTERS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.filterBtn} ${kind === opt.value ? styles.filterBtnActive : ''}`}
                onClick={() => setKind(opt.value)}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        <div className={styles.resultSummary}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          {loading && (items?.length ?? 0) === 0 ? ' · loading…' : ''}
        </div>

        <ul className={styles.resultList}>
          {filtered.length === 0 ? (
            <li className={styles.empty}>
              {(items?.length ?? 0) === 0
                ? 'No inventory items available.'
                : 'No inventory items match the current search.'}
            </li>
          ) : filtered.map(item => {
            const stock = stockSummary(item)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.resultBtn}
                  onClick={() => onSelect(item)}
                  aria-label={`Choose ${item.name}`}
                >
                  <div className={styles.resultMain}>
                    <span className={styles.resultName}>{item.name}</span>
                    <span className={styles.resultSub}>
                      {[item.category || item.kind, item.location, item.vendor]
                        .filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  {stock && (
                    <span
                      className={`${styles.stockChip} ${styles[`stockChip_${stock.tone}`]}`}
                      title="Stock display only — selecting does not deduct."
                    >
                      {stock.label}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
