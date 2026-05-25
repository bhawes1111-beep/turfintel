import { useMemo, useState } from 'react'
import { useSpraysData } from '../../../../utils/sprays/spraysStore'
import styles from './PlannerPickers.module.css'

// Phase 7F (4/?) — Completed-spray picker for the Spray Program Planner.
//
// Reads from useSpraysData; never writes. Selecting a row fires
// onSelect(sprayRecord) so the planner can attach the existing
// completed record to a planned item via the narrow
// /completed-link endpoint. Soft-deleted records are excluded.
//
// Stewardship copy is explicit:
//   "Linking connects this planned item to an existing completed
//    spray record."
//   "This does not create a spray record."
//   "This does not deduct inventory."
//   "Completed records remain unchanged."

export default function CompletedSprayPickerModal({ onSelect, onCancel }) {
  const { records, loading, error } = useSpraysData()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const live = (records ?? []).filter(r => !r?.deletedAt && r?.status !== 'deleted')
    const q = search.trim().toLowerCase()
    return live
      .filter(r => {
        if (!q) return true
        if ((r.applicationName ?? '').toLowerCase().includes(q)) return true
        if ((r.date ?? '').toLowerCase().includes(q)) return true
        if ((r.area ?? '').toLowerCase().includes(q)) return true
        if (Array.isArray(r.products)) {
          for (const p of r.products) {
            if ((p?.name ?? '').toLowerCase().includes(q)) return true
          }
        }
        return false
      })
      // Newest first (string-sort ISO dates is correct, defensive on missing).
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
  }, [records, search])

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Pick completed spray record">
      <div className={styles.modal}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Link completed spray record</h2>
            <p className={styles.subtitle}>
              Linking connects this planned item to an existing completed
              spray record. This does not create a spray record. This
              does not deduct inventory. Completed records remain unchanged.
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
          <div className={styles.errorBanner}>Could not load spray records: {error}</div>
        )}

        <div className={styles.toolbar}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search by name, date, area, or product…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search completed sprays"
            autoFocus
          />
        </div>

        <div className={styles.resultSummary}>
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
          {loading && (records?.length ?? 0) === 0 ? ' · loading…' : ''}
        </div>

        <ul className={styles.resultList}>
          {filtered.length === 0 ? (
            <li className={styles.empty}>
              {(records?.length ?? 0) === 0
                ? 'No completed spray records available.'
                : 'No completed spray records match the current search.'}
            </li>
          ) : filtered.map(rec => {
            const productCount = Array.isArray(rec.products) ? rec.products.length : 0
            const productPreview = Array.isArray(rec.products)
              ? rec.products.slice(0, 3).map(p => p?.name).filter(Boolean).join(', ')
              : ''
            return (
              <li key={rec.id}>
                <button
                  type="button"
                  className={styles.resultBtn}
                  onClick={() => onSelect(rec)}
                  aria-label={`Choose spray ${rec.applicationName ?? rec.id}`}
                >
                  <div className={styles.resultMain}>
                    <span className={styles.resultName}>
                      {rec.applicationName ?? '(unnamed spray)'}
                    </span>
                    <span className={styles.resultSub}>
                      {[rec.date, rec.area].filter(Boolean).join(' · ')}
                      {productCount > 0 && ` · ${productCount} product${productCount !== 1 ? 's' : ''}`}
                    </span>
                    {productPreview && (
                      <span className={styles.resultSub}>
                        {productPreview}
                        {productCount > 3 && ` +${productCount - 3} more`}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
