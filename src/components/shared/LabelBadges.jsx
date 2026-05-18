// Phase 27B — label badge primitives.
//
// Tiny, presentational components for the four label-derived display
// elements that show up across the inventory chemicals card, the
// import wizard, and the spray builder's product picker:
//
//   <SignalBadge word="CAUTION" />
//   <ReiBadge   text="12 hours" />
//   <PhiBadge   text="0 days" />
//   <GroupBadge type="FRAC" code="M5" />
//
// Each renders to null if the input is missing/unrecognized — callers
// can pass raw fields straight from the label row without null-guarding.
// That preserves "no hallucinated values": absent data shows no badge.

import {
  signalWordTone,
  formatReiShort,
  formatPhiShort,
  resolveGroupBadge,
} from '../../utils/chemistry/labelDisplay.js'
import styles from './LabelBadges.module.css'

// ── Signal word ───────────────────────────────────────────────────────────

export function SignalBadge({ word, size = 'sm' }) {
  const tone = signalWordTone(word)
  if (!tone) return null
  const display = String(word).replace(/\s*[—-]\s*POISON/i, '').trim()
  return (
    <span
      className={`${styles.badge} ${styles[`signal_${tone}`]} ${styles[`size_${size}`]}`}
      title={`Signal word: ${display}`}
    >
      {display}
    </span>
  )
}

// ── REI ───────────────────────────────────────────────────────────────────

export function ReiBadge({ text, size = 'sm' }) {
  const short = formatReiShort(text)
  if (!short) return null
  return (
    <span
      className={`${styles.badge} ${styles.rei} ${styles[`size_${size}`]}`}
      title={`Re-entry interval: ${text}`}
    >
      REI {short}
    </span>
  )
}

// ── PHI ───────────────────────────────────────────────────────────────────

export function PhiBadge({ text, size = 'sm' }) {
  const short = formatPhiShort(text)
  if (!short) return null
  return (
    <span
      className={`${styles.badge} ${styles.phi} ${styles[`size_${size}`]}`}
      title={`Pre-harvest interval: ${text}`}
    >
      PHI {short}
    </span>
  )
}

// ── FRAC / HRAC / IRAC group ──────────────────────────────────────────────

export function GroupBadge({ type, code, size = 'sm' }) {
  if (!type || !code) return null
  const g = resolveGroupBadge(type, code)
  const toneClass = g.tone ? styles[`group_${g.tone}`] : styles.group_neutral
  return (
    <span
      className={`${styles.badge} ${styles.group} ${toneClass} ${styles[`size_${size}`]}`}
      title={g.name ? `${type} ${g.code}: ${g.name}` : `${type} ${g.code}`}
    >
      {type} {g.code}
    </span>
  )
}
