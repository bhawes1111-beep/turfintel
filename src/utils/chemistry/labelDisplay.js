// Phase 27B — chemical-label display helpers.
//
// Pure functions that turn the raw label fields (as stored in
// inventory_product_labels / returned by the extract endpoint) into the
// minimal presentation primitives the UI needs to render badges and
// quick chips.
//
// Conservative: every helper returns `null` when input is missing or
// not recognized. Callers should branch on null to decide whether to
// render at all — never invent a fallback.

// ── Signal word ────────────────────────────────────────────────────────────
//
// The label's signal word is the canonical EPA acute-toxicity indicator.
// Map it to a tone token the UI can color-code against:
//
//   Danger  → red    (Toxicity Category I)
//   Warning → orange (Category II)
//   Caution → yellow (Category III)
//
// Unknown / missing → null. Don't guess.

export const SIGNAL_TONES = {
  DANGER:  'danger',
  WARNING: 'warning',
  CAUTION: 'caution',
}

/**
 * @param {string|null|undefined} word — signal word string (any casing)
 * @returns {'danger'|'warning'|'caution'|null}
 */
export function signalWordTone(word) {
  if (typeof word !== 'string') return null
  // Strip the "— POISON" suffix that Category I labels print and
  // normalize the dash so we match both "DANGER — POISON" and
  // "DANGER-POISON".
  const cleaned = word.replace(/\s*[—-]\s*POISON/i, '').trim().toUpperCase()
  if (cleaned.startsWith('DANGER'))  return SIGNAL_TONES.DANGER
  if (cleaned.startsWith('WARNING')) return SIGNAL_TONES.WARNING
  if (cleaned.startsWith('CAUTION')) return SIGNAL_TONES.CAUTION
  return null
}

// ── REI (Re-entry Interval) ───────────────────────────────────────────────
//
// The extractor stores REI as a free-text string like "12 hours" or
// "0 days". parseRei() pulls the numeric value and unit so badges can
// render compactly ("12h", "0d") and callers can sort/threshold.

/**
 * @param {string|null|undefined} text
 * @returns {{ value: number, unit: 'hours'|'days', original: string }|null}
 */
export function parseRei(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  const m = text.match(/(\d+)\s*(hours?|hrs?|h\b|days?|d\b)/i)
  if (!m) return null
  const value = parseInt(m[1], 10)
  if (!Number.isFinite(value)) return null
  const unit = m[2].toLowerCase().startsWith('d') ? 'days' : 'hours'
  return { value, unit, original: text.trim() }
}

/**
 * Short form for badge labels: "12h" / "0d". Returns null for unparseable
 * input so the caller knows not to render a badge.
 */
export function formatReiShort(text) {
  const r = parseRei(text)
  if (!r) return null
  return `${r.value}${r.unit === 'days' ? 'd' : 'h'}`
}

// ── PHI (Pre-Harvest Interval) ────────────────────────────────────────────
//
// Same shape as REI. PHI is rare on turf labels but standard on labels
// that also register the product for food crops.

/** @returns {{ value: number, unit: 'hours'|'days', original: string }|null} */
export function parsePhi(text) {
  return parseRei(text)  // identical token grammar; reuse.
}

export function formatPhiShort(text) {
  return formatReiShort(text)
}

// ── Group code badge tones ────────────────────────────────────────────────
//
// FRAC / HRAC / IRAC color coding already comes from the resistance-risk
// metadata in [chemistryMetadata.js]. We re-export a tone mapping here so
// label badge components don't all need to import RESISTANCE_RISK.

import { RESISTANCE_RISK, lookupGroup } from './chemistryMetadata.js'

/**
 * Map a resistance-risk level to the UI tone used by GroupBadge.
 * `unknown` → null so the caller can render a neutral border instead.
 * @param {string|null} risk
 */
export function riskTone(risk) {
  switch (risk) {
    case RESISTANCE_RISK.LOW:    return 'low'
    case RESISTANCE_RISK.MEDIUM: return 'medium'
    case RESISTANCE_RISK.HIGH:   return 'high'
    default:                     return null
  }
}

/**
 * Resolve a single group code to the display primitives the badge needs.
 * Returns the recognized name when known, the code as fallback, plus a
 * tone token. Unknown codes still render — they just get a neutral tone.
 *
 * @param {'FRAC'|'HRAC'|'IRAC'} type
 * @param {string} code
 */
export function resolveGroupBadge(type, code) {
  const meta = lookupGroup(type, code)
  return {
    type,
    code:  meta.code,
    name:  meta.name,
    tone:  riskTone(meta.riskLevel),
    recognized: meta.recognized,
  }
}
