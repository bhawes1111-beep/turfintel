import { useState, useMemo } from 'react'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { useImportedLabels } from '../../../utils/inventory/labelImportStore'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
// Phase I.1 — Edit inventory quantity for chemicals (drives spray
// editor picker stock display).
import EditInventoryQuantityModal from '../components/EditInventoryQuantityModal'
import ChemicalDetailModal from '../components/ChemicalDetailModal'
import { formatNutrientSourceSummary } from '../../../utils/inventory/nutrientForms'
import { formatDiseaseTargetSummary } from '../../../utils/inventory/diseaseTargets'
import { formatNematodeTargetSummary } from '../../../utils/inventory/nematodeTargets'
import { formatWeedTargetSummary } from '../../../utils/inventory/weedTargets'
import { useAuth } from '../../../context/AuthContext'
import styles from '../Inventory.module.css'

const TYPES = ['All', 'Fungicide', 'Herbicide', 'Insecticide', 'PGR']

function stockStatus(quantity, reorderLevel) {
  if (quantity <= 0) return 'critical'
  if (quantity <= reorderLevel) return 'low'
  return 'ok'
}

const STATUS_LABEL = { ok: 'In Stock', low: 'Low Stock', critical: 'Out of Stock' }
const STATUS_CLASS = { ok: styles.stockOk, low: styles.stockLow, critical: styles.stockCritical }

export default function InventoryChemicals({ onOpenCatalog } = {}) {
  const { items } = useInventoryData()
  const { labels } = useImportedLabels()
  const chemicals = useMemo(() => items.filter(i => i.kind === 'chemical'), [items])
  // inventoryItemId → label, so cards imported via the wizard show a PDF link.
  const labelByItem = useMemo(() => {
    const m = {}
    for (const l of labels) {
      if (l.inventoryItemId && l.pdfUrl) m[l.inventoryItemId] = l
    }
    return m
  }, [labels])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  // Phase I.1 — Edit quantity modal state + permission gate.
  const [editingItem, setEditingItem] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const { can } = useAuth()
  const canEditInventory = can('canEditInventory')
  const selected = chemicals.find(item => item.id === selectedId) ?? null

  const visible = useMemo(() => {
    return chemicals.filter(c => {
      const matchFilter = filter === 'All' || c.category === filter
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
                          (c.analysis ?? '').toLowerCase().includes(search.toLowerCase()) ||
                          (c.nitrogenSource ?? '').toLowerCase().includes(search.toLowerCase()) ||
                          formatNutrientSourceSummary(c.nutrientSources).toLowerCase().includes(search.toLowerCase()) ||
                          formatDiseaseTargetSummary(c.diseaseTargets).toLowerCase().includes(search.toLowerCase()) ||
                          formatNematodeTargetSummary(c.nematodeTargets).toLowerCase().includes(search.toLowerCase()) ||
                          formatWeedTargetSummary(c.weedTargets).toLowerCase().includes(search.toLowerCase()) ||
                          (c.location ?? '').toLowerCase().includes(search.toLowerCase())
      return matchFilter && matchSearch
    })
  }, [search, filter, chemicals])

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Chemicals"
        subtitle="Fungicides, herbicides, insecticides, and PGRs."
      >
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search chemicals…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search chemicals"
        />
        <div className={styles.filterRow}>
          {TYPES.map(t => (
            <button
              key={t}
              className={`${styles.filterBtn} ${filter === t ? styles.filterBtnActive : ''}`}
              onClick={() => setFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        chemicals.length === 0 ? (
          <EmptyState
            title="No chemical inventory yet."
            description="Fungicides, herbicides, insecticides, and PGRs will appear here once stocked."
          />
        ) : (
          <EmptyState
            compact
            title="No matches."
            description="No chemicals match the current filters."
          />
        )
      ) : (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.chemicalTable}`}>
            <thead>
              <tr>
                <th>Chemical name</th>
                <th>In stock</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
          {visible.map(c => {
            const status = stockStatus(c.quantity, c.reorderLevel)
            return (
              <tr
                key={c.id}
                className={styles.chemicalRow}
                tabIndex={0}
                role="button"
                aria-label={`View all information for ${c.name}`}
                onClick={() => setSelectedId(c.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedId(c.id)
                  }
                }}
              >
                <td><strong className={styles.chemicalName}>{c.name}</strong></td>
                <td>
                    <span className={`${styles.stockBadge} ${STATUS_CLASS[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                </td>
                <td><strong>{c.quantity ?? 0}</strong> <span className={styles.chemicalUnit}>{c.unit || ''}</span></td>
              </tr>
            )
          })}
            </tbody>
          </table>
        </div>
      )}
      </WorkspaceSection>

      {/* Phase I.1 — Edit Inventory Quantity modal. */}
      {editingItem && (
        <EditInventoryQuantityModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => setEditingItem(null)}
        />
      )}

      {selected && !editingItem && (
        <ChemicalDetailModal
          item={selected}
          label={labelByItem[selected.id]}
          canEdit={canEditInventory}
          onOpenCatalog={onOpenCatalog}
          onClose={() => setSelectedId(null)}
          onEdit={() => {
            setEditingItem(selected)
            setSelectedId(null)
          }}
        />
      )}
    </div>
  )
}
