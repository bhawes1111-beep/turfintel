import { useState, useMemo } from 'react'
import styles from '../Disease.module.css'
import { DISEASE_LIBRARY } from '../../../data/disease'

export default function DiseaseLibrary() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const results = useMemo(() => {
    const q = search.toLowerCase()
    return DISEASE_LIBRARY.filter(d => {
      const matchesType = typeFilter === 'all' || d.type.toLowerCase() === typeFilter
      const matchesSearch = !q ||
        d.name.toLowerCase().includes(q) ||
        d.pathogen.toLowerCase().includes(q) ||
        d.hosts.toLowerCase().includes(q) ||
        d.symptoms.toLowerCase().includes(q)
      return matchesType && matchesSearch
    })
  }, [search, typeFilter])

  return (
    <div>
      <div className={styles.libraryControls}>
        <input
          type="text"
          className={styles.searchBox}
          placeholder="Search by disease, pathogen, host..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="fungal">Fungal</option>
          <option value="oomycete">Oomycete</option>
        </select>
      </div>

      <div className={styles.libraryGrid}>
        {results.map(d => (
          <div key={d.id} className={styles.libraryCard}>
            <div className={styles.libraryCardHeader}>
              <div>
                <div className={styles.libraryName}>{d.name}</div>
                <div className={styles.libraryPathogen}>{d.pathogen}</div>
              </div>
              <span className={`${styles.typeBadge} ${styles[d.type.toLowerCase()]}`}>
                {d.type}
              </span>
            </div>

            <div className={styles.libraryRow}>
              <strong>Conditions</strong>
              {d.conditions}
            </div>

            <div className={styles.libraryRow}>
              <strong>Host Grasses</strong>
              {d.hosts}
            </div>

            <div className={styles.libraryRow}>
              <strong>Symptoms</strong>
              {d.symptoms}
            </div>

            <div className={styles.libraryRow}>
              <strong>Management</strong>
              {d.management}
            </div>

            <div className={styles.libraryRow}>
              <strong>Fungicides</strong>
              <div className={styles.tagList}>
                {d.fungicides.map(f => (
                  <span key={f} className={styles.tag}>{f}</span>
                ))}
              </div>
            </div>

            <div className={styles.seasonBadge}>🗓 {d.season}</div>
          </div>
        ))}
      </div>

      {results.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No diseases match your search.</p>
      )}
    </div>
  )
}
