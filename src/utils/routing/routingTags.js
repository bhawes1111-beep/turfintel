// Phase 34 — Routing & Mowing Visual Language.
//
// Pure helper that maps the existing event.tags[] strings to compact visual
// chips (icon + minimal label + tone) per docs/VISUAL_LANGUAGE.md §4.
//
// No schema change: event.tags already exists in the calendar payload and is
// exposed by the Worker (defaults to []). Unknown tags are ignored so the
// card never fills with noise. Matching is case-insensitive and tolerant of
// separators (mow_ns / mow-ns / "Mow NS" all match).

// Tone vocabulary maps to the Display Board palette (VISUAL_LANGUAGE §2).
//   neutral  — informational routing
//   caution  — amber, "pay attention"
//   critical — red, stop/closed
//   weather  — sky blue, water/weather
const TAG_DEFS = [
  { match: ['mow-ns', 'mow-northsouth', 'mownorthsouth'], icon: '↕',  label: 'N–S',        tone: 'neutral' },
  { match: ['mow-ew', 'mow-eastwest', 'moweastwest'],     icon: '↔',  label: 'E–W',        tone: 'neutral' },
  { match: ['mow-diagonal', 'mow-diag', 'diagonal'],      icon: '⤢',  label: 'Diagonal',   tone: 'neutral' },
  { match: ['double-cut', 'doublecut', 'double'],         icon: '⇈',  label: 'Double-cut', tone: 'neutral' },
  { match: ['cleanup', 'clean-up'],                       icon: '↻',  label: 'Cleanup',    tone: 'neutral' },
  { match: ['no-cleanup', 'nocleanup'],                   icon: '⊘',  label: 'No cleanup', tone: 'neutral' },
  { match: ['roll', 'rolling'],                           icon: '⛳', label: 'Roll',       tone: 'neutral' },
  { match: ['skip'],                                      icon: '⏭',  label: 'Skip',       tone: 'caution' },
  { match: ['closed', 'hole-closed', 'holeclosed'],       icon: '⛔', label: 'Closed',     tone: 'critical' },
  { match: ['frost', 'frost-delay', 'frostdelay'],        icon: '❄',  label: 'Frost',      tone: 'caution' },
  { match: ['handwater', 'hand-water'],                   icon: '💧', label: 'Handwater',  tone: 'weather' },
  { match: ['irrigation', 'irrigation-active', 'irr'],    icon: '💧', label: 'Irrigation', tone: 'weather' },
]

// Render order: directions/closures first (highest glance value), then the
// rest in definition order. We key by the index of the matched def.
const TONE_ORDER = { critical: 0, caution: 1, weather: 2, neutral: 3 }

function normalize(tag) {
  return String(tag ?? '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .trim()
}

function defForTag(tag) {
  const n = normalize(tag)
  if (!n) return null
  for (const def of TAG_DEFS) {
    if (def.match.includes(n)) return def
  }
  return null
}

/**
 * routingChipsFromTags(tags, opts)
 *   tags  — array of strings (event.tags[]). Tolerant of null/undefined.
 *   opts.max — cap visible chips (default 6). Overflow returned as `extra`.
 *
 * Returns { chips: [{ key, icon, label, tone }], extra }.
 * De-dupes by label so "irrigation" + "irr" don't double up.
 */
export function routingChipsFromTags(tags, { max = 6 } = {}) {
  if (!Array.isArray(tags) || tags.length === 0) return { chips: [], extra: 0 }

  const byLabel = new Map()
  for (const t of tags) {
    const def = defForTag(t)
    if (!def) continue
    if (!byLabel.has(def.label)) {
      byLabel.set(def.label, { key: def.label, icon: def.icon, label: def.label, tone: def.tone })
    }
  }

  const all = [...byLabel.values()].sort(
    (a, b) => (TONE_ORDER[a.tone] ?? 9) - (TONE_ORDER[b.tone] ?? 9),
  )

  if (all.length <= max) return { chips: all, extra: 0 }
  return { chips: all.slice(0, max), extra: all.length - max }
}
