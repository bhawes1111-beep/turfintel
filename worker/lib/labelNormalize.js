// Phase 21 — chemical label normalization layer.
//
// Pure functions that turn raw, heuristic-captured label strings into
// structured/canonical values for the import wizard's review form. Every
// normalizer returns the SAME shape:
//
//   { raw, normalized, ok }
//
//   raw         — the input string (or null) passed through unchanged so
//                 the UI can show what the extractor actually saw
//   normalized  — canonical value (string, array, or null); `null`/`[]`
//                 means normalization failed or input was empty
//   ok          — true when normalization produced a usable value
//
// Conservative by design — if a value can't be normalized confidently,
// `ok: false` and `normalized` is null/empty. Never guess.

// ── Manufacturer ──────────────────────────────────────────────────────────

const LEGAL_SUFFIX_RE = /,?\s*(?:L\.?L\.?C\.?|Inc\.?|Corp\.?|Corporation|Co\.?|Company|Ltd\.?|GmbH|S\.?A\.?)\s*\.?\s*$/i

export function normalizeManufacturer(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { raw: raw ?? null, normalized: null, ok: false }
  }
  // Drop everything after the first newline/period (addresses tend to follow).
  let cleaned = raw.split(/[\n.]/)[0].trim()
  // Iteratively strip stacked legal suffixes ("Co., LLC" → "Co" → "").
  let prev
  do {
    prev = cleaned
    cleaned = cleaned.replace(LEGAL_SUFFIX_RE, '').trim()
  } while (cleaned !== prev)
  cleaned = cleaned.replace(/,$/, '').trim()
  return {
    raw,
    normalized: cleaned || null,
    ok: !!cleaned,
  }
}

// ── Signal Word ───────────────────────────────────────────────────────────

const SIGNAL_MAP = { CAUTION: 'Caution', WARNING: 'Warning', DANGER: 'Danger' }

export function normalizeSignalWord(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { raw: raw ?? null, normalized: null, ok: false }
  }
  // EPA Toxicity Category I labels often print "DANGER — POISON"; the POISON
  // suffix conveys oral toxicity but the canonical signal word is DANGER.
  const stripped = raw.replace(/\s*[—-]\s*POISON/i, '').trim().toUpperCase()
  const normalized = SIGNAL_MAP[stripped] ?? null
  return { raw, normalized, ok: !!normalized }
}

// ── EPA Registration Number ───────────────────────────────────────────────

const EPA_FORMAT_RE = /^\d{2,6}-\d{1,6}(?:-\d{1,6})?$/

export function normalizeEpaNumber(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { raw: raw ?? null, normalized: null, ok: false }
  }
  // Strip stray whitespace inside the number (PDFs sometimes split runs).
  const cleaned = raw.replace(/\s+/g, '').replace(/[.,]$/, '').trim()
  const ok = EPA_FORMAT_RE.test(cleaned)
  return {
    raw,
    normalized: ok ? cleaned : null,
    ok,
  }
}

// ── FRAC / HRAC / IRAC group codes ────────────────────────────────────────
//
// Labels phrase these many ways:
//   "FRAC Group: M5"          → ["M5"]
//   "FRAC: M5/P1"             → ["M5", "P1"]
//   "FRAC Code 3, 11"         → ["3", "11"]
//   "IRAC Group 1A or 4A"     → ["1A", "4A"]

const GROUP_CODE_RE = /^[A-Z0-9]{1,4}$/

export function normalizeGroupCodes(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { raw: raw ?? null, normalized: [], ok: false }
  }
  const tokens = raw
    .split(/[\s,;/]+|\bor\b/i)
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0 && GROUP_CODE_RE.test(s))
  // De-dupe while preserving order.
  const seen = new Set()
  const out = []
  for (const t of tokens) {
    if (!seen.has(t)) { seen.add(t); out.push(t) }
  }
  return { raw, normalized: out, ok: out.length > 0 }
}

// ── Active Ingredients ────────────────────────────────────────────────────
//
// Parse `Name X.Y%` pairs into `[{ name, percent }]`. Conservative: each
// pair must have a clear name (starts with a letter) and a numeric percent.

const AI_PAIR_RE = /([A-Z][A-Za-z0-9 ()\-,]*?)\s+(\d+(?:\.\d+)?)\s*%/g

export function normalizeActiveIngredients(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { raw: raw ?? null, normalized: [], ok: false }
  }
  const out = []
  AI_PAIR_RE.lastIndex = 0
  let m
  while ((m = AI_PAIR_RE.exec(raw))) {
    const name = m[1]
      .replace(/[,]+$/, '')          // trailing comma drag-in
      .replace(/^[\s,]+/, '')
      .trim()
    const percent = parseFloat(m[2])
    if (name.length > 1 && !Number.isNaN(percent)) {
      out.push({ name, percent })
    }
  }
  return { raw, normalized: out, ok: out.length > 0 }
}

// ── Convenience: human-readable formatters ────────────────────────────────
//
// The worker uses these to produce form-ready strings for the wizard's
// top-level draft fields, while keeping the structured `normalized`
// available in `fields.X` for the raw-vs-normalized display.

export function formatGroupCodes(arr) {
  return Array.isArray(arr) && arr.length > 0 ? arr.join(', ') : null
}

export function formatActiveIngredients(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null
  return arr.map(({ name, percent }) => `${name} ${percent}%`).join(', ')
}
