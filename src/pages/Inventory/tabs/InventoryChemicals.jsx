import { useState, useMemo } from 'react'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { useImportedLabels } from '../../../utils/inventory/labelImportStore'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import {
  SignalBadge,
  ReiBadge,
  PhiBadge,
  GroupBadge,
} from '../../../components/shared/LabelBadges'
import styles from '../Inventory.module.css'

const TYPES = ['All', 'Fungicide', 'Herbicide', 'Insecticide', 'PGR']

function stockStatus(quantity, reorderLevel) {
  if (quantity <= 0) return 'critical'
  if (quantity <= reorderLevel) return 'low'
  return 'ok'
}

const STATUS_LABEL = { ok: 'In Stock', low: 'Low Stock', critical: 'Out of Stock' }
const STATUS_CLASS = { ok: styles.stockOk, low: styles.stockLow, critical: styles.stockCritical }

export default function InventoryChemicals() {
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

  const visible = useMemo(() => {
    return chemicals.filter(c => {
      const matchFilter = filter === 'All' || c.category === filter
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
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
        <div className={styles.cardGrid}>
          {visible.map(c => {
            const status = stockStatus(c.quantity, c.reorderLevel)
            const label = labelByItem[c.id]
            return (
              <div key={c.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.cardName}>{c.name}</span>
                  <span className={`${styles.stockBadge} ${STATUS_CLASS[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <div className={styles.cardMeta}>
                  <div className={styles.cardMetaRow}>
                    <span className={styles.cardMetaLabel}>Type</span>
                    <span>{c.category}</span>
                  </div>
                  <div className={styles.cardMetaRow}>
                    <span className={styles.cardMetaLabel}>Location</span>
                    <span>{c.location}</span>
                  </div>
                  <div className={styles.cardMetaRow}>
                    <span className={styles.cardMetaLabel}>Expires</span>
                    <span>{c.expiryDate}</span>
                  </div>
                </div>
                <div className={styles.cardQtyRow}>
                  <span className={styles.cardQty}>{c.quantity}</span>
                  <span className={styles.cardQtyUnit}>{c.unit}</span>
                  <span className={styles.cardReorder}>· reorder at {c.reorderLevel}</span>
                </div>
                {label && (
                  <>
                    {/* Phase 27C — quick safety + group badges derived from
                        the saved label row. Each renders to null when its
                        input is missing, so cards with partial labels show
                        only the badges that are real. */}
                    <div className={styles.cardLabelBadges}>
                      <SignalBadge word={label.signalWord} />
                      <ReiBadge   text={label.reiHours} />
                      <PhiBadge   text={label.phi} />
                      {label.fracGroup?.split(',').map(c => (
                        <GroupBadge key={`F-${c}`} type="FRAC" code={c.trim()} />
                      ))}
                      {label.hracGroup?.split(',').map(c => (
                        <GroupBadge key={`H-${c}`} type="HRAC" code={c.trim()} />
                      ))}
                      {label.iracGroup?.split(',').map(c => (
                        <GroupBadge key={`I-${c}`} type="IRAC" code={c.trim()} />
                      ))}
                    </div>
                    <a
                      className={styles.cardLabelLink}
                      href={label.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Label PDF ↗
                    </a>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
      </WorkspaceSection>
    </div>
  )
}
