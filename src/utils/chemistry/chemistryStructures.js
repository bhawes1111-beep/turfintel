// Phase 22A — Chemistry Intelligence: structural parsers.
//
// Pure helpers that turn the strings stored on inventory_product_labels
// rows (and the inventory_items rows themselves) into structured objects
// the warning layer can reason about. Built to be tolerant of imperfect
// inputs — labels arrive from heuristic PDF extraction (Phase 20/21), so
// we never throw on a malformed string; we return empty arrays instead.
//
// Conceptually similar to worker/lib/labelNormalize.js but client-side and
// scoped to the questions Phase 22 wants to ask:
//   1. Which FRAC/HRAC/IRAC codes are in this tank mix?
//   2. Which active ingredients are duplicated across tank products?
//   3. What is the canonical name of an active ingredient?
//
// No React, no side effects, no I/O.

// ── Group-code parsing ────────────────────────────────────────────────────
//
// Labels and the wizard form store group codes in many shapes:
//   "M5"                  → ['M5']
//   "M5/P1"               → ['M5', 'P1']
//   "3, 11"               → ['3', '11']
//   "1A or 4A"            → ['1A', '4A']
//   "FRAC Group 11"       → ['11']     (FRAC prefix is stripped)
//   ['M5', 'P1']          → ['M5', 'P1'] (already-array passthrough)

const GROUP_TOKEN_RE = /^[A-Z0-9]{1,4}$/
const GROUP_PREFIX_RE = /\b(?:FRAC|HRAC|IRAC|GROUP|CODE|MOA)\b/gi

/**
 * Parse a raw group-code string (or array) into a canonical uppercase array.
 * Always returns an array — empty when parsing fails or input is empty.
 * Preserves first-seen order and de-duplicates.
 */
export function parseGroupCodes(raw) {
  if (Array.isArray(raw)) {
    const out = []
    const seen = new Set()
    for (const item of raw) {
      const code = typeof item === 'string' ? item.trim().toUpperCase() : null
      if (code && GROUP_TOKEN_RE.test(code) && !seen.has(code)) {
        seen.add(code)
        out.push(code)
      }
    }
    return out
  }
  if (typeof raw !== 'string' || !raw.trim()) return []
  const stripped = raw.replace(GROUP_PREFIX_RE, ' ').replace(/[:;]/g, ' ')
  const tokens = stripped
    .split(/[\s,/]+|\bor\b/i)
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0 && GROUP_TOKEN_RE.test(s))
  const seen = new Set()
  const out = []
  for (const t of tokens) {
    if (!seen.has(t)) { seen.add(t); out.push(t) }
  }
  return out
}

// ── Active-ingredient parsing ─────────────────────────────────────────────
//
// Active ingredient strings on labels typically look like:
//   "Chlorothalonil 54.0%, Acibenzolar-S-methyl 0.45%"
//   "Mefenoxam ........... 33.3%"
//   "Tebuconazole 5.97% Trifloxystrobin 2.98%"
// We return an array of { name, percent } pairs. Order matches input.

const AI_PAIR_RE = /([A-Z][A-Za-z0-9 ()\-,'.]*?)\s+(\d+(?:\.\d+)?)\s*%/g

/**
 * Parse an active-ingredients string into `[{ name, percent }]`.
 * Conservative: each pair must have a clear leading-letter name AND a
 * numeric percent. Returns [] on empty/malformed input.
 *
 * Accepts:
 *   - a string with "Name X.Y%" pairs
 *   - an existing array of { name, percent } objects (passthrough w/ cleanup)
 */
export function parseActiveIngredients(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map(it => {
        if (!it || typeof it !== 'object') return null
        const name = typeof it.name === 'string' ? it.name.trim() : ''
        const percent = Number(it.percent)
        if (name.length < 2 || !Number.isFinite(percent)) return null
        return { name, percent }
      })
      .filter(Boolean)
  }
  if (typeof raw !== 'string' || !raw.trim()) return []
  const out = []
  AI_PAIR_RE.lastIndex = 0
  let m
  while ((m = AI_PAIR_RE.exec(raw))) {
    const name = m[1]
      .replace(/[,]+$/, '')
      .replace(/^[\s,]+/, '')
      .replace(/\s*\.{2,}\s*$/, '')
      .trim()
    const percent = parseFloat(m[2])
    if (name.length > 1 && !Number.isNaN(percent)) {
      out.push({ name, percent })
    }
  }
  return out
}

// ── Active-ingredient name normalization ──────────────────────────────────
//
// Duplicate detection needs a stable key per active. Real labels print
// the same molecule with surprising variation:
//   "Chlorothalonil"
//   "chlorothalonil"
//   "Chlorothalonil (technical)"
//   "Tebuconazole, Trifloxystrobin"   (will be split into two)
// We lowercase, strip parenthetical qualifiers, drop trailing punctuation,
// and collapse whitespace. The result is the comparison key; the original
// `name` is preserved for display.

export function normalizeActiveName(name) {
  if (typeof name !== 'string') return ''
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')            // strip "(technical)" / "(ai)"
    .replace(/[*†‡§]/g, ' ')                // footnote marks
    .replace(/[,;:.]+\s*$/, '')             // trailing punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Duplicate-active detection across a tank mix ──────────────────────────
//
// Input: an array of products, each carrying the actives that came out of
// parseActiveIngredients(). Output: array of duplicate groups — one entry
// per active that appears in two or more products.
//
// Each duplicate group:
//   {
//     activeKey   — normalized name used as the comparison key
//     displayName — first-seen original-case name for UI
//     products    — array of { productId, productName, percent }
//   }

/**
 * @typedef {Object} TankProduct
 * @property {string}   id       — stable id (inventoryItemId or row id)
 * @property {string}   name     — display name of the product
 * @property {Array<{name: string, percent: number}>} actives
 */

/**
 * Find active ingredients that are present in 2+ products of the tank.
 * Stable order — duplicate groups appear in first-encounter order, and
 * within a group, products appear in input order. Products with no
 * actives are silently skipped.
 */
export function findDuplicateActives(products) {
  if (!Array.isArray(products) || products.length < 2) return []
  /** @type {Map<string, { displayName: string, products: any[] }>} */
  const groups = new Map()
  for (const p of products) {
    if (!p || !Array.isArray(p.actives)) continue
    for (const a of p.actives) {
      const key = normalizeActiveName(a.name)
      if (!key) continue
      if (!groups.has(key)) {
        groups.set(key, { displayName: a.name, products: [] })
      }
      groups.get(key).products.push({
        productId:   p.id ?? null,
        productName: p.name ?? '(unnamed product)',
        percent:     Number.isFinite(a.percent) ? a.percent : null,
      })
    }
  }
  const dupes = []
  for (const [key, g] of groups) {
    if (g.products.length >= 2) {
      dupes.push({ activeKey: key, displayName: g.displayName, products: g.products })
    }
  }
  return dupes
}

// ── Tank-mix code aggregation ─────────────────────────────────────────────
//
// Given the labels (or label-like objects) for the products in a tank, roll
// up all FRAC / HRAC / IRAC codes that appear, with which products each
// code came from. Used by the warning layer to flag e.g. "two FRAC-11
// products in this same tank".
//
// Input: array of { id, name, label } where label has fracGroup, hracGroup,
// iracGroup as strings (or pre-parsed arrays).
//
// Output: { FRAC: [...], HRAC: [...], IRAC: [...] } where each entry is
//   { code, products: [{ productId, productName }] }

/**
 * @typedef {Object} ProductWithLabel
 * @property {string} id
 * @property {string} name
 * @property {Object|null} label
 */

export function aggregateTankCodes(products) {
  /** @type {Record<'FRAC'|'HRAC'|'IRAC', Map<string, {productId: string, productName: string}[]>>} */
  const buckets = { FRAC: new Map(), HRAC: new Map(), IRAC: new Map() }
  if (!Array.isArray(products)) return { FRAC: [], HRAC: [], IRAC: [] }

  for (const p of products) {
    if (!p?.label) continue
    const fracCodes = parseGroupCodes(p.label.fracGroup)
    const hracCodes = parseGroupCodes(p.label.hracGroup)
    const iracCodes = parseGroupCodes(p.label.iracGroup)
    const member = { productId: p.id ?? null, productName: p.name ?? '(unnamed product)' }

    for (const c of fracCodes) {
      if (!buckets.FRAC.has(c)) buckets.FRAC.set(c, [])
      buckets.FRAC.get(c).push(member)
    }
    for (const c of hracCodes) {
      if (!buckets.HRAC.has(c)) buckets.HRAC.set(c, [])
      buckets.HRAC.get(c).push(member)
    }
    for (const c of iracCodes) {
      if (!buckets.IRAC.has(c)) buckets.IRAC.set(c, [])
      buckets.IRAC.get(c).push(member)
    }
  }

  const flatten = (map) => Array.from(map.entries()).map(([code, products]) => ({ code, products }))
  return {
    FRAC: flatten(buckets.FRAC),
    HRAC: flatten(buckets.HRAC),
    IRAC: flatten(buckets.IRAC),
  }
}
