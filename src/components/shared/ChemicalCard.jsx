import { useState } from 'react'
import styles from './ChemicalCard.module.css'

// Maps tag name → CSS module class for colored pills
const TAG_CLASS = {
  Fungicide:   styles.tagFungicide,
  Herbicide:   styles.tagHerbicide,
  Insecticide: styles.tagInsecticide,
  PGR:         styles.tagPgr,
  Fertilizer:  styles.tagFertilizer,
}

const SIGNAL_CLASS = {
  Caution: styles.signalCaution,
  Warning: styles.signalWarning,
  Danger:  styles.signalDanger,
}

// Derives the most relevant resistance group label from the chemical data
function resistanceLabel(c) {
  if (c.fracGroup) return `FRAC ${c.fracGroup}`
  if (c.hracGroup) return `HRAC ${c.hracGroup}`
  if (c.iracGroup) return `IRAC ${c.iracGroup}`
  return null
}

export default function ChemicalCard({ chemical, onMore }) {
  // Pin state is visual-only until database persistence is added.
  // When API is ready: lift state to ChemicalLabels and call PATCH /chemicals/:id
  const [pinned, setPinned] = useState(chemical.pinned)

  const group = resistanceLabel(chemical)

  return (
    <div className={`${styles.card} ${pinned ? styles.cardPinned : ''}`}>

      {/* Top row: pin · product name · More button */}
      <div className={styles.cardTop}>
        <button
          className={`${styles.pinBtn} ${pinned ? styles.pinBtnActive : ''}`}
          onClick={() => setPinned(p => !p)}
          aria-label={pinned ? 'Unpin chemical' : 'Pin chemical'}
          title={pinned ? 'Unpin' : 'Pin to top'}
        >
          {pinned ? '★' : '☆'}
        </button>

        <span className={styles.productName}>{chemical.name}</span>

        <button
          className={styles.moreBtn}
          onClick={() => onMore(chemical)}
          aria-label={`View details for ${chemical.name}`}
        >
          More ›
        </button>
      </div>

      {/* Manufacturer · type */}
      <div className={styles.cardMeta}>
        <span className={styles.manufacturer}>{chemical.manufacturer}</span>
        {chemical.type && (
          <>
            <span className={styles.metaDot}>·</span>
            <span className={styles.chemType}>{chemical.type}</span>
          </>
        )}
      </div>

      {/* Stats: group · REI · signal word */}
      <div className={styles.statsRow}>
        {group && (
          <div className={styles.stat}>
            <span className={styles.statLabel}>Group</span>
            <span className={styles.statValue}>{group}</span>
          </div>
        )}
        <div className={styles.stat}>
          <span className={styles.statLabel}>REI</span>
          <span className={styles.statValue}>{chemical.rei}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Signal</span>
          <span className={`${styles.statValue} ${SIGNAL_CLASS[chemical.signalWord] ?? ''}`}>
            {chemical.signalWord}
          </span>
        </div>
      </div>

      {/* Use rate */}
      <div className={styles.rateRow}>
        <span className={styles.rateLabel}>Rate:</span>
        <span className={styles.rateValue}>{chemical.useRate}</span>
      </div>

      {/* Quick-type tag pills */}
      <div className={styles.tagRow}>
        {chemical.tags.map(tag => (
          <span key={tag} className={`${styles.tag} ${TAG_CLASS[tag] ?? ''}`}>
            {tag}
          </span>
        ))}
      </div>

    </div>
  )
}
