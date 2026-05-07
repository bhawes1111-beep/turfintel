import { useState, useMemo } from 'react'
import { SPRAY_RECORDS, TYPE_COLORS } from '../../../data/spray'
import styles from '../Spray.module.css'

const TYPES = ['All', 'Fungicide', 'Herbicide', 'Insecticide', 'PGR', 'Fertilizer']

export default function SprayRecords() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')

  const visible = useMemo(() => {
    return SPRAY_RECORDS.filter(r => {
      const matchFilter = filter === 'All' || r.type === filter
      const matchSearch = r.product.toLowerCase().includes(search.toLowerCase()) ||
                          r.area.toLowerCase().includes(search.toLowerCase()) ||
                          r.applicator.toLowerCase().includes(search.toLowerCase())
      return matchFilter && matchSearch
    })
  }, [search, filter])

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search by product, area, or applicator…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search spray records"
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
        <p className={styles.emptyState}>No records match your search.</p>
      ) : (
        <div className={styles.recordList}>
          {visible.map(r => {
            const colors = TYPE_COLORS[r.type] || {}
            return (
              <div key={r.id} className={styles.recordCard}>
                <div className={styles.recordHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className={styles.recordProduct}>{r.product}</span>
                    <span
                      className={styles.recordTypePill}
                      style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
                    >
                      {r.type}
                    </span>
                  </div>
                  <span className={styles.recordDate}>{r.date}</span>
                </div>

                <div className={styles.recordMeta}>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Area</span>
                    <span className={styles.recordMetaValue}>{r.area}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Rate</span>
                    <span className={styles.recordMetaValue}>{r.rate}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Total Product</span>
                    <span className={styles.recordMetaValue}>{r.totalProduct}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Tank Volume</span>
                    <span className={styles.recordMetaValue}>{r.tankVol}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Applicator</span>
                    <span className={styles.recordMetaValue}>{r.applicator}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Conditions</span>
                    <span className={styles.recordMetaValue}>{r.temp} · {r.wind} · {r.humidity} RH</span>
                  </div>
                </div>

                {r.notes && (
                  <div className={styles.recordNotes}>{r.notes}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
