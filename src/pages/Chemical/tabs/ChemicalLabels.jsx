import { useState, useMemo } from 'react'
import { CHEMICALS } from '../../../data/chemicals'
import ChemicalCard from '../../../components/shared/ChemicalCard'
import ChemicalModal from '../../../components/shared/ChemicalModal'
import styles from '../Chemical.module.css'

const FILTERS = ['All', 'Fungicide', 'Herbicide', 'Insecticide', 'PGR', 'Fertilizer']

export default function ChemicalLabels() {
  const [search, setSearch]         = useState('')
  const [activeFilter, setFilter]   = useState('All')
  const [selected, setSelected]     = useState(null)

  const visible = useMemo(() => {
    return CHEMICALS.filter(c => {
      const matchesFilter = activeFilter === 'All' || c.tags.includes(activeFilter)
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
                            c.manufacturer.toLowerCase().includes(search.toLowerCase())
      return matchesFilter && matchesSearch
    })
  }, [search, activeFilter])

  return (
    <div className={styles.labelsTab}>

      {/* Toolbar */}
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
          {FILTERS.map(f => (
            <button
              key={f}
              className={`${styles.filterBtn} ${activeFilter === f ? styles.filterBtnActive : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Card grid */}
      {visible.length === 0 ? (
        <p className={styles.emptyState}>No chemicals match your search.</p>
      ) : (
        <div className={styles.chemGrid}>
          {visible.map(c => (
            <ChemicalCard key={c.id} chemical={c} onMore={setSelected} />
          ))}
        </div>
      )}

      {/* Modal */}
      {selected && (
        <ChemicalModal chemical={selected} onClose={() => setSelected(null)} />
      )}

    </div>
  )
}
