// Phase 19 — Inventory Chemical Import Wizard (server side).
//
// The wizard uploads a label PDF (via the existing /api/attachments
// system, parent_type 'inventory_label'), then the user reviews/edits
// the metadata and saves. This module handles:
//
//   POST /api/inventory/import-label/extract  — AI extraction draft.
//        No AI provider is wired yet, so this returns a "not configured"
//        contract the frontend branches on to fall back to manual entry.
//        When an AI binding is added, this is the only function to change.
//
//   POST /api/inventory/import-label/save     — creates the inventory_items
//        row AND the inventory_product_labels row in one request.
//        Duplicate handling via dedupeMode. Admin-key gated upstream.
//
//   GET  /api/inventory/import-label/labels   — course-scoped list of saved
//        labels so the Chemicals tab can surface a "Label PDF" link.
//
// The inventory_items row stays the canonical stock record; the related
// inventory_product_labels row holds the richer regulatory metadata that
// doesn't belong in the lean inventory_items schema.

import { extractText, getDocumentProxy } from 'unpdf'
import { json, badRequest, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'
import { rowToItem } from './inventory.js'
import {
  normalizeManufacturer,
  normalizeSignalWord,
  normalizeEpaNumber,
  normalizeGroupCodes,
  normalizeActiveIngredients,
  formatGroupCodes,
  formatActiveIngredients,
} from '../lib/labelNormalize.js'

// ── Mappers ────────────────────────────────────────────────────────────────

function parseJsonArray(raw) {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function rowToLabel(row) {
  if (!row) return null
  return {
    id:                row.id,
    courseId:          row.course_id,
    inventoryItemId:   row.inventory_item_id,
    pdfAttachmentId:   row.pdf_attachment_id,
    productName:       row.product_name,
    manufacturer:      row.manufacturer,
    epaNumber:         row.epa_number,
    activeIngredients: row.active_ingredients,
    signalWord:        row.signal_word,
    restrictedUse:     row.restricted_use === 1,
    reiHours:          row.rei_hours,
    phi:               row.phi,
    fracGroup:         row.frac_group,
    hracGroup:         row.hrac_group,
    iracGroup:         row.irac_group,
    chemicalClass:     row.chemical_class,
    applicationRates:  parseJsonArray(row.application_rates_json),
    targets:           parseJsonArray(row.targets_json),
    turfSites:         row.turf_sites,
    safetyNotes:       row.safety_notes,
    storageNotes:      row.storage_notes,
    labelUrl:          row.label_url,
    pdfUrl:            row.pdf_attachment_id
      ? `/api/attachments/${encodeURIComponent(row.pdf_attachment_id)}/file`
      : null,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  }
}

/**
 * The empty draft skeleton the extract endpoint returns when AI is not
 * configured. Keeps the frontend form bound to a stable shape whether
 * the fields come from AI or manual entry.
 */
function emptyDraft() {
  return {
    name:              null,
    kind:              'chemical',
    category:          null,
    unit:              null,
    quantity:          0,
    manufacturer:      null,
    epaNumber:         null,
    activeIngredients: null,
    chemicalClass:     null,
    signalWord:        null,
    restrictedUse:     false,
    reiHours:          null,
    phi:               null,
    fracGroup:         null,
    hracGroup:         null,
    iracGroup:         null,
    applicationRates:  [],
    targets:           [],
    turfSites:         null,
    safetyNotes:       null,
    storageNotes:      null,
    labelUrl:          null,
    notes:             null,
    // Phase 27A — fertilizer-specific draft fields. `guaranteedAnalysis`
    // is the structured nutrient breakdown; `analysis` (e.g. "46-0-0") and
    // `nitrogenSource` (the "Derived from" string) live on inventory_items.
    guaranteedAnalysis: [],
    analysis:          null,
    nitrogenSource:    null,
    // Phase 27A-2 — product-name suggestion derived from filename. Never
    // confirmed; the wizard renders it as a hint under the input, never as
    // a prefill. ok=false until the user types it in themselves.
    productNameSuggestion: null,
  }
}

// ── Section extractors (Phase 27A-2) ──────────────────────────────────────
//
// Each helper returns null OR { raw, normalized, ok, source } so the
// extract endpoint can include them in draft.fields with full provenance
// for the wizard's FROM-LABEL display.

const TURF_SITE_TOKENS = [
  // Turf-specific
  'golf courses', 'greens', 'tees', 'fairways', 'roughs', 'sod farms',
  'sports fields', 'cemeteries', 'residential lawns', 'commercial lawns',
  'industrial turf', 'ornamental turf', 'commercial turf',
  'institutional turf',
  // Broadened (Phase 27A-2 — non-turf labels also surface)
  'row crops', 'vegetables', 'fruits', 'tree nuts', 'vineyards',
  'citrus', 'orchards', 'nurseries', 'greenhouses', 'ornamentals',
  'landscape plantings', 'christmas tree farms', 'rights-of-way',
  'non-cropland',
]

function extractTurfSites(text) {
  // Find a sentence that contains 2+ whitelisted site tokens — that's the
  // strongest signal we have a real "registered sites" line and not just
  // a passing reference like "for use on greens" alone.
  const sentences = text.split(/[.\n]/)
  let bestSentence = null
  let bestHits = []
  for (const s of sentences) {
    if (s.length > 400) continue
    const hits = TURF_SITE_TOKENS.filter(tok =>
      new RegExp(`\\b${tok.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(s),
    )
    if (hits.length >= 2 && hits.length > bestHits.length) {
      bestHits = hits
      bestSentence = s.replace(/\s+/g, ' ').trim()
    }
  }
  if (!bestSentence) return null
  return {
    raw: bestSentence.slice(0, 260),
    normalized: bestHits.slice().sort(),
    ok: true,
    source: 'site-list sentence (≥2 whitelisted tokens)',
  }
}

function extractApplicationRates(text) {
  const RATE_RE = /\b(\d+(?:\.\d+)?(?:\s*[–\-]\s*\d+(?:\.\d+)?)?)\s*(fl\s*oz|oz|lbs?|pints?|pt|qts?|qt|gal|gallons?)\s*\/\s*(1,?000\s*(?:sq\s*ft|square\s*feet)|acre|a\b)\b/gi
  const seen = new Set()
  const rates = []
  let m
  while ((m = RATE_RE.exec(text)) !== null) {
    const value = m[1].replace(/\s*[–\-]\s*/, '-').replace(/\s+/g, '')
    const unit  = m[2].replace(/\s+/g, ' ').toLowerCase()
      .replace(/^lbs?$/, 'lb').replace(/^pints?$/, 'pt')
      .replace(/^qts?$/,  'qt').replace(/^gallons?$/, 'gal')
    const per   = /1,?000\s*(?:sq\s*ft|square\s*feet)/i.test(m[3])
      ? '1000 sq ft'
      : 'acre'
    const norm  = `${value} ${unit}/${per}`
    if (!seen.has(norm)) { seen.add(norm); rates.push(norm) }
  }
  const PPM_RE = /\b(\d+(?:\.\d+)?(?:\s*[–\-]\s*\d+(?:\.\d+)?)?)\s*ppm\b/gi
  while ((m = PPM_RE.exec(text)) !== null) {
    const v = m[1].replace(/\s*[–\-]\s*/, '-').replace(/\s+/g, '')
    const norm = `${v} ppm`
    if (!seen.has(norm)) { seen.add(norm); rates.push(norm) }
  }
  if (rates.length === 0) return null
  return {
    raw: rates.join('\n'),
    normalized: rates,
    ok: true,
    source: 'rate-table scan',
  }
}

// Whitelisted disease / weed / insect / PGR target terms. Conservative —
// only terms common enough on turf labels to extract without false
// positives. NOTE: bermudagrass is intentionally omitted because on turf
// labels it is normally the crop, not a target weed.
const TARGET_TERMS = {
  disease: [
    'dollar spot', 'brown patch', 'pythium', 'anthracnose', 'leaf spot',
    'fairy ring', 'gray leaf spot', 'rust', 'snow mold', 'red thread',
    'take-all', 'brown ring patch', 'summer patch', 'bermudagrass decline',
    'fusarium', 'yellow tuft', 'mini ring',
  ],
  weed: [
    'crabgrass', 'goosegrass', 'poa annua', 'annual bluegrass', 'dandelion',
    'clover', 'nutsedge', 'kikuyu', 'yellow nutsedge', 'purple nutsedge',
    'kyllinga', 'oxalis', 'henbit', 'chickweed', 'spurge', 'plantain',
  ],
  insect: [
    'white grub', 'chinch bug', 'cutworm', 'sod webworm', 'fire ant',
    'billbug', 'nematode', 'mole cricket', 'aphid', 'armyworm', 'spittlebug',
    'scale insect',
  ],
  pgr: [
    'seedhead suppression', 'growth suppression', 'poa annua suppression',
    'growth regulation', 'stem elongation', 'gibberellin',
  ],
}

function extractTargets(text) {
  const seen = new Map()  // term → category
  for (const [category, terms] of Object.entries(TARGET_TERMS)) {
    for (const term of terms) {
      const re = new RegExp(`\\b${term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i')
      if (re.test(text)) seen.set(term, category)
    }
  }
  if (seen.size === 0) return null
  const sorted = [...seen.entries()].sort()
  return {
    raw: sorted.map(([t]) => t).join(', '),
    normalized: sorted.map(([term, category]) => ({ term, category })),
    ok: true,
    source: 'term whitelist scan',
  }
}

const PPE_TERMS = [
  'Long-sleeved shirt',
  'Long pants',
  'Chemical-resistant gloves',
  'Chemical resistant gloves',  // PROHEX-style (no hyphen)
  'Shoes plus socks',
  'Protective eyewear',
  'Respirator',
]

function extractPPE(text) {
  const found = new Set()
  for (const t of PPE_TERMS) {
    const re = new RegExp(`\\b${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i')
    if (re.test(text)) {
      // Canonicalize variants.
      const canon = t.replace(/Chemical resistant gloves/i, 'Chemical-resistant gloves')
      found.add(canon)
    }
  }
  if (found.size === 0) return null
  const arr = [...found]
  return {
    raw: arr.join('\n'),
    normalized: arr,
    ok: true,
    source: 'PPE whitelist',
  }
}

function extractStorageNotes(text) {
  const PATTERNS = [
    // Standalone "PESTICIDE STORAGE:" heading (PROHEX style).
    [/\bPESTICIDE\s+STORAGE\s*[:]\s*([\s\S]{20,600}?)(?:\s*PESTICIDE\s+DISPOSAL|\s*CONTAINER\s+HANDLING|\s*DIRECTIONS\s+FOR\s+USE|\s*GENERAL\s+INFORMATION|$)/i,
     'PESTICIDE STORAGE section'],
    // Combined heading (Primo style).
    [/\b(?:Pesticide\s+Storage\s+and\s+Disposal|STORAGE\s+AND\s+DISPOSAL)\b\s*[:.]?\s*([\s\S]{20,600}?)(?:\s*Container\s+Handling|\s*DIRECTIONS\s+FOR\s+USE|\s*GENERAL\s+INFORMATION|$)/i,
     'STORAGE AND DISPOSAL section'],
  ]
  for (const [re, src] of PATTERNS) {
    const m = text.match(re)
    if (!m) continue
    const clean = m[1].replace(/\s+/g, ' ').trim().slice(0, 480)
    if (clean.length < 20) continue
    return { raw: clean, normalized: clean, ok: true, source: src }
  }
  return null
}

function extractRainfast(text) {
  const kwIdx = text.search(/\b(?:rainfast|water[- ]?in|watering[- ]?in|do not water|irrigate after)\b/i)
  if (kwIdx < 0) return null
  // Window: up to 200 chars before and 200 chars after, then trim at real
  // sentence boundaries. Don't split on bare periods because PDF text
  // includes decimal numbers ("27.5 WDG").
  const start = Math.max(0, kwIdx - 200)
  const end   = Math.min(text.length, kwIdx + 200)
  const window = text.slice(start, end)
  const beforeKw = window.slice(0, kwIdx - start)
  let bestBoundary = -1
  const re = /[.!?]\s+(?=[A-Z])/g
  let mm
  while ((mm = re.exec(beforeKw)) !== null) bestBoundary = mm.index + mm[0].length
  const sentenceStart = bestBoundary > 0 ? bestBoundary : 0
  const afterStart = window.slice(sentenceStart)
  // Greedy minimal to a period NOT followed by a digit (decimal).
  const endMatch = afterStart.match(/.*?[.!?](?!\d)/s)
  let snippet = (endMatch ? endMatch[0] : afterStart.slice(0, 300))
    .replace(/\s+/g, ' ')
    .trim()
  // If the snippet still starts with a digit fragment ("5 WDG is..."),
  // re-anchor at the first capital letter within the first 60 chars.
  const capStart = snippet.search(/[A-Z][a-zA-Z]/)
  if (capStart > 0 && capStart < 60) snippet = snippet.slice(capStart).trim()
  if (snippet.length < 10) return null
  return {
    raw: snippet.slice(0, 280),
    normalized: snippet.slice(0, 280),
    ok: true,
    source: 'rainfast/irrigation clause',
  }
}

function extractTurfRestrictions(text) {
  const restrictions = []
  function add(s) {
    const norm = s.replace(/\s+/g, ' ').trim()
    if (!norm) return
    // Trim trailing all-caps section bleed.
    const cut = norm
      .replace(/\s+\d?\s*(?:PRECAUTIONARY|HAZARDS|CAUTION|WARNING|DANGER|GENERAL|DIRECTIONS|STORAGE|FIRST AID)\b.*$/i, '')
      .trim()
    if (cut.length < 4) return
    if (!restrictions.find(x => x.toLowerCase() === cut.toLowerCase())) {
      restrictions.push(cut)
    }
  }
  for (const m of text.matchAll(/Not for use (?:on|in)\s+([^.\n]{3,120})/gi)) {
    add('Not for use in ' + m[1])
  }
  if (/Not for use in California|California restriction|California, do not/i.test(text)) {
    if (!restrictions.find(r => /^California restriction$/i.test(r)) &&
        !restrictions.find(r => /not for use in california\b/i.test(r))) {
      restrictions.push('California restriction')
    }
  }
  for (const m of text.matchAll(/DO NOT apply to\s+([^.\n]{3,120})/gi)) {
    add('Do not apply to ' + m[1])
  }
  if (restrictions.length === 0) return null
  return {
    raw: restrictions.join('\n'),
    normalized: restrictions,
    ok: true,
    source: 'restriction clauses (Not for use / DO NOT apply)',
  }
}

// Filename-based product name suggestion. Returns ok=false on purpose:
// the wizard never auto-prefills the product name field — the user must
// confirm it from the label themselves. This is a hint only.
function extractFilenameProductName(filename) {
  if (typeof filename !== 'string' || filename.length < 4) return null
  const stripped = filename
    .replace(/\.[A-Za-z0-9]+$/, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\b(label|specimen|specimen[- ]?label|spec|sds|msds|datasheet|brochure)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (stripped.length < 3) return null
  return {
    raw: filename,
    normalized: stripped,
    ok: false,
    source: 'filename (suggestion only — verify before saving)',
  }
}

// ── Fertilizer "Guaranteed Analysis" parser (Phase 27A) ───────────────────
//
// Looks for the GUARANTEED ANALYSIS block and parses nutrient/percent
// pairs in the standard label format:
//
//     Total Nitrogen (N) ........... 46.0%
//     Available Phosphate (P2O5) ... 18.0%
//     Soluble Potash (K2O) ......... 12.0%
//     Derived from: Urea, ...
//
// Returns { nutrients: [{name, symbol, percent}], derivedFrom, npk } or
// null if the GA block is absent. `npk` is the conventional "N-P-K"
// string derived from the N, P2O5, and K2O entries (when present).
function parseGuaranteedAnalysis(text) {
  const ga = text.match(/GUARANTEED\s+ANALYSIS([\s\S]{0,1500})/i)
  if (!ga) return null

  let block = ga[1]
    .replace(/(?:\s*\.\s*){2,}/g, ' ')   // collapse dot leaders
    .replace(/\s+/g, ' ')
  // Stop at the end-of-block markers that commonly follow GA on real labels.
  block = block.split(
    /Directions\s+for\s+use|This\s+product\s+is|NET\s+WEIGHT|Distributed\s+(?:by|for)|Manufactured\s+(?:by|for)|Guaranteed\s+by/i,
  )[0]

  // Nutrient rows: "Total Nitrogen (N) 46.0%" / "Iron (Fe) 1.5%"
  const nutrients = []
  const NUT_RE = /([A-Z][A-Za-z][A-Za-z .\-]{2,40}?)\s*\(([A-Za-z0-9]{1,6})\)\s+(\d+(?:\.\d+)?)\s*%/g
  let m
  while ((m = NUT_RE.exec(block)) !== null) {
    nutrients.push({
      name:    m[1].trim(),
      symbol:  m[2].trim(),
      percent: parseFloat(m[3]),
    })
  }

  const derived = block.match(/Derived\s+from\s*:?\s*([^.\n]{2,200}?)(?:\s+Directions|\s+This\s+product|$)/i)
  const derivedFrom = derived ? derived[1].trim().replace(/[,;]\s*$/, '') : null

  // Standard fertilizer NPK uses Total Nitrogen, Available Phosphate
  // (P2O5), and Soluble Potash (K2O). Build "N-P-K" only if at least one
  // primary is present so we don't fabricate "0-0-0".
  const find = (sym) => nutrients.find(n => n.symbol.toUpperCase() === sym)
  const nN = find('N')
  const nP = find('P2O5')
  const nK = find('K2O')
  let npk = null
  if (nN || nP || nK) {
    npk = `${nN ? nN.percent : 0}-${nP ? nP.percent : 0}-${nK ? nK.percent : 0}`
  }

  return { nutrients, derivedFrom, npk }
}

// ── Extract ────────────────────────────────────────────────────────────────
//
// Phase 20 — real server-side PDF text extraction.
//
// Flow: fetch the uploaded PDF from R2 → run unpdf (pdfjs-dist under the
// hood) to get selectable text → apply regex heuristics on top of an empty
// draft skeleton. Fields that don't match heuristics stay null — the
// wizard requires manual review before saving regardless.
//
// Limits: scanned/image-only PDFs return ~empty text; we detect that and
// surface a clear "scanned" state. OCR is intentionally NOT implemented
// in this phase.

const RAW_TEXT_CAP_BYTES = 50_000

/**
 * Phase 20/21 — regex heuristics for the common chemical-label fields.
 *
 * Returns RAW captured strings (with minimal whitespace cleanup) so the
 * normalization layer can produce canonical/structured values separately
 * while the wizard's UI still has access to "what the extractor actually
 * saw". Conservative — fields with no confident match stay null.
 */
function applyHeuristics(text, fileName = null) {
  const draft = emptyDraft()
  // Phase 27A-2 — section-extraction results are stored here as
  // { raw, normalized, ok, source } so normalizeDraft can merge them into
  // draft.fields for the wizard's FROM-LABEL display.
  const sectionFields = {}

  // EPA registration number — "EPA Reg. No.: 100-1364" / "EPA Reg # 100-1364-50"
  const epa = text.match(
    /EPA\s+Reg(?:istration)?\.?\s*(?:No|Number|#)?\.?\s*:?\s*([\d]{2,6}-[\d]{1,6}(?:-[\d]{1,6})?)/i,
  )
  if (epa) draft.epaNumber = epa[1]

  // Restricted-use pesticide flag (boolean — no normalization needed).
  if (/RESTRICTED\s+USE\s+PESTICIDE/i.test(text)) draft.restrictedUse = true

  // Signal word — anchored near "KEEP OUT OF REACH" when available, since
  // the words DANGER/WARNING/CAUTION can also appear as plain prose. Stores
  // the literal match (e.g. "CAUTION", "DANGER — POISON"); the normalizer
  // strips POISON suffixes and title-cases.
  const koor = text.search(/KEEP\s+OUT\s+OF\s+REACH/i)
  const window = koor !== -1
    ? text.slice(Math.max(0, koor - 240), koor + 240)
    : text
  const sig = window.match(/\b(DANGER\s*[—-]?\s*POISON|DANGER|WARNING|CAUTION)\b/)
  if (sig) draft.signalWord = sig[1].trim()

  // Re-Entry Interval — Phase 27A: accept hours OR days, and multiple
  // keyword variants. Labels phrase this as "Restricted-Entry Interval
  // (REI) for this product is 0 days" / "Reentry interval of 12 hours".
  const rei = text.match(
    /(?:Restricted[- ]Entry Interval|Re-?Entry Interval|Reentry Interval|REI)[^.\n]{0,140}?(\d+)\s*(hours?|hrs?|h\b|days?|d\b)/i,
  )
  if (rei) {
    const unit = rei[2].toLowerCase().startsWith('d') ? 'days' : 'hours'
    draft.reiHours = `${rei[1]} ${unit}`
  }

  // Pre-Harvest Interval — Phase 27A: accept "PHI", "Pre-harvest" and
  // "Preharvest" variants. Days OR hours.
  const phi = text.match(
    /(?:Pre-?Harvest Interval|Preharvest Interval|PHI)[^.\n]{0,140}?(\d+)\s*(days?|d\b|hours?|hrs?|h\b)/i,
  )
  if (phi) {
    const unit = phi[2].toLowerCase().startsWith('d') ? 'days' : 'hours'
    draft.phi = `${phi[1]} ${unit}`
  }

  // FRAC / HRAC / IRAC group codes — capture the raw group string; the
  // normalizer splits "M5/P1" / "3, 11" / "1A or 4A" into a clean array.
  // Phase 27A: also accept the "Group N <Fungicide|Herbicide|Insecticide>"
  // phrasing many labels use instead of the FRAC/HRAC/IRAC acronym.
  const frac = text.match(/FRAC\s+(?:Code|Group)?[:\s]+([\w\d]{1,8}(?:[,/][\w\d]{1,8})*)/i)
    || text.match(/Group\s+([A-Z0-9]{1,4}(?:\s*[,/]\s*[A-Z0-9]{1,4})*)\s+Fungicide/i)
  if (frac) draft.fracGroup = frac[1].replace(/\s+/g, '').trim()
  const hrac = text.match(/HRAC\s+(?:Code|Group)?[:\s]+([\w\d]{1,8}(?:[,/][\w\d]{1,8})*)/i)
    || text.match(/Group\s+([A-Z0-9]{1,4}(?:\s*[,/]\s*[A-Z0-9]{1,4})*)\s+Herbicide/i)
  if (hrac) draft.hracGroup = hrac[1].replace(/\s+/g, '').trim()
  const irac = text.match(/IRAC\s+(?:Code|Group)?[:\s]+([\w\d]{1,8}(?:[,/][\w\d]{1,8})*)/i)
    || text.match(/Group\s+([A-Z0-9]{1,4}(?:\s*[,/]\s*[A-Z0-9]{1,4})*)\s+Insecticide/i)
  if (irac) draft.iracGroup = irac[1].replace(/\s+/g, '').trim()

  // Active Ingredients — capture between "Active Ingredient(s)" and a
  // sentinel. Whitespace + dot-leader cleanup only; the normalizer parses
  // the "Name X.Y%" pairs into a structured array.
  const ai = text.match(
    /Active\s+Ingredient[s]?\s*[:.]?\s*([\s\S]{1,500}?)(?:Other\s+Ingredient|Inert\s+Ingredient|Inert:|TOTAL:|Total\s*:|KEEP\s+OUT|EPA\s+Reg)/i,
  )
  if (ai) {
    const cleaned = ai[1]
      // Collapse dot leaders. PDFs render leaders both as runs (......) and
      // space-separated (. . . . .) depending on the typesetter — handle both.
      .replace(/(?:\s*\.\s*){2,}/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[:.\s*]+/, '')
      .trim()
      .slice(0, 280)
    if (cleaned.length > 5) draft.activeIngredients = cleaned
  }

  // Manufacturer / Marketer — Phase 27A: stop the tail capture before any
  // digit (street numbers immediately follow the company name on most
  // labels) and accept "Guaranteed by:" (fertilizer convention) in
  // addition to the four pesticide-label lead-ins. The normalizer still
  // strips the legal suffix afterward.
  const mfr = text.match(
    /(?:Manufactured|Marketed|Distributed|Produced|Guaranteed)\s+(?:by|for)\s*[:\s]+([A-Z][^,\n\d]{2,80}(?:,\s*(?:L\.?L\.?C\.?|Inc\.?|Corp\.?|Corporation|Co\.?|Company|Ltd\.?))?)/i,
  )
  if (mfr) {
    let name = mfr[1].trim().slice(0, 100)
    // Drop an unmatched trailing "(..." fragment if the close paren got
    // cut off by the digit/newline stop.
    name = name.replace(/\s*\([^)]*$/, '').trim()
    if (name.length > 2) draft.manufacturer = name
  }

  // Fertilizer "Guaranteed Analysis" block — Phase 27A.
  // Parses "Total Nitrogen (N) 46.0%" rows into a structured array, plus
  // the trailing "Derived from: ..." line. Used to prefill the fertilizer
  // form fields (analysis = "N-P-K", nitrogenSource = derived-from text).
  const ga = parseGuaranteedAnalysis(text)
  if (ga && ga.nutrients.length > 0) {
    draft.guaranteedAnalysis = ga.nutrients
    if (ga.npk) draft.analysis = ga.npk
    if (ga.derivedFrom) draft.nitrogenSource = ga.derivedFrom
    // Strong signal this is a fertilizer label — flip the kind default so
    // the wizard opens the fertilizer-specific fields. User can override
    // in the review step if wrong.
    if (ga.npk) draft.kind = 'fertilizer'
  }

  // Product name — Phase 27A-2: not extracted from PDF text (still
  // unreliable across vendor layouts), but we surface a filename-derived
  // SUGGESTION with ok=false so the wizard can show it as a hint under
  // the empty input. The user still types the real product name from
  // the label. We never auto-prefill.
  const nameSuggestion = extractFilenameProductName(fileName)
  if (nameSuggestion) {
    draft.productNameSuggestion = nameSuggestion.normalized
    sectionFields.productName = nameSuggestion
  }

  // ── Section-level extraction (Phase 27A-2) ───────────────────────────
  // Each helper returns null OR { raw, normalized, ok, source }. When
  // ok=true we also populate the top-level draft field that the wizard's
  // form input binds to (form-ready display string or array).

  const sites = extractTurfSites(text)
  if (sites) {
    sectionFields.turfSites = sites
    draft.turfSites = Array.isArray(sites.normalized)
      ? sites.normalized.join(', ')
      : sites.raw
  }

  const rates = extractApplicationRates(text)
  if (rates) {
    sectionFields.applicationRates = rates
    draft.applicationRates = rates.normalized
  }

  const targets = extractTargets(text)
  if (targets) {
    sectionFields.targets = targets
    // Form-ready: one term per line, no category prefix (keeps the existing
    // targetsText textarea behavior). Categories live in fields.targets.normalized
    // for the FROM-LABEL display.
    draft.targets = targets.normalized.map(t => t.term)
  }

  const ppe = extractPPE(text)
  if (ppe) {
    sectionFields.ppe = ppe
    draft.safetyNotes = `PPE: ${ppe.normalized.join(', ')}`
  }

  const storage = extractStorageNotes(text)
  if (storage) {
    sectionFields.storageNotes = storage
    draft.storageNotes = storage.normalized
  }

  const rainfast = extractRainfast(text)
  if (rainfast) {
    sectionFields.rainfast = rainfast
    // No dedicated rainfast field on inventory_product_labels; land it
    // in notes so the operator sees it. Existing notes are preserved
    // by the wizard form (we only set if blank).
    draft.notes = rainfast.normalized
  }

  const restrictions = extractTurfRestrictions(text)
  if (restrictions) {
    sectionFields.turfRestrictions = restrictions
    // No dedicated turf-restrictions field; combine into safetyNotes
    // alongside PPE if PPE was also extracted.
    const lines = []
    if (ppe) lines.push(`PPE: ${ppe.normalized.join(', ')}`)
    lines.push(...restrictions.normalized)
    draft.safetyNotes = lines.join('\n')
  }

  // Attach the section results to a non-enumerable holder we read in
  // normalizeDraft. Using a regular property because the worker JSON-
  // serializes the draft and we want section data discarded before that
  // pass merges it into draft.fields.
  Object.defineProperty(draft, '__sectionFields', {
    value: sectionFields,
    enumerable: false,
  })

  return draft
}

/**
 * Phase 21 — apply the normalization layer on top of the raw heuristic
 * draft.
 *
 *   - Top-level `draft.X` fields become the form-ready normalized values
 *     (display strings) so the existing wizard form pre-fill keeps working.
 *   - `draft.fields` carries `{ raw, normalized, ok }` per normalizable
 *     field so the wizard can render raw-vs-normalized side-by-side.
 *
 * Fields that aren't normalizable (REI, PHI, restrictedUse, etc.) keep
 * their raw value as-is and are absent from `fields`.
 */
function normalizeDraft(rawDraft) {
  const fields = {}
  const draft  = { ...rawDraft }

  // EPA registration number — string in, string out.
  if (rawDraft.epaNumber != null) {
    const r = normalizeEpaNumber(rawDraft.epaNumber)
    fields.epaNumber = r
    draft.epaNumber  = r.normalized ?? rawDraft.epaNumber
  }

  // Manufacturer — trim legal suffixes.
  if (rawDraft.manufacturer != null) {
    const r = normalizeManufacturer(rawDraft.manufacturer)
    fields.manufacturer = r
    draft.manufacturer  = r.normalized ?? rawDraft.manufacturer
  }

  // Signal word — map to whitelist {Caution, Warning, Danger}.
  if (rawDraft.signalWord != null) {
    const r = normalizeSignalWord(rawDraft.signalWord)
    fields.signalWord = r
    draft.signalWord  = r.normalized ?? rawDraft.signalWord
  }

  // Active ingredients — parse into [{ name, percent }]; form-ready as
  // "Name X%, Name X%" joined string.
  if (rawDraft.activeIngredients != null) {
    const r = normalizeActiveIngredients(rawDraft.activeIngredients)
    fields.activeIngredients = r
    draft.activeIngredients  = formatActiveIngredients(r.normalized) ?? rawDraft.activeIngredients
  }

  // FRAC / HRAC / IRAC — parse to arrays; form-ready as comma-joined.
  for (const key of /** @type {const} */ (['fracGroup', 'hracGroup', 'iracGroup'])) {
    if (rawDraft[key] != null) {
      const r = normalizeGroupCodes(rawDraft[key])
      fields[key] = r
      draft[key]  = formatGroupCodes(r.normalized) ?? rawDraft[key]
    }
  }

  // Phase 27A-2 — merge in the section-level extraction results
  // (turfSites, applicationRates, targets, ppe, storageNotes, rainfast,
  // turfRestrictions, productName-suggestion) so the wizard's FROM-LABEL
  // provenance display has full per-field { raw, normalized, ok, source }.
  // These come pre-shaped; no further normalization needed.
  if (rawDraft.__sectionFields) {
    for (const [k, v] of Object.entries(rawDraft.__sectionFields)) {
      fields[k] = v
    }
  }

  draft.fields = fields
  return draft
}

/**
 * POST /api/inventory/import-label/extract
 *
 * Body: { attachmentId } — the uploaded PDF's attachment id.
 *
 * Fetches the PDF from R2, extracts text via unpdf, applies the regex
 * heuristics, and returns:
 *   {
 *     configured, source, scanned, message, extractedAt, totalPages,
 *     rawText,             // for the wizard's "view extracted text" panel
 *     draft,               // shape matches the empty draft, prefilled
 *     hints: { fieldsFound: [...] }
 *   }
 *
 * If text extraction returns near-empty content, the PDF is treated as
 * scanned/image-only and the wizard falls back to manual entry.
 */
export async function extractLabelDraft(env, request) {
  const body         = await readJson(request)
  const attachmentId = body?.attachmentId

  if (!attachmentId) {
    return json({
      configured:  true,
      source:      'pdf-text',
      scanned:     false,
      message:     'No attachmentId provided — manual entry only.',
      extractedAt: new Date().toISOString(),
      draft:       emptyDraft(),
      hints:       { fieldsFound: [] },
    })
  }
  if (!env.DB)     return json({ configured: false, message: 'D1 not configured',     draft: emptyDraft() }, 503)
  if (!env.PHOTOS) return json({ configured: false, message: 'R2 (PHOTOS) not configured', draft: emptyDraft() }, 503)

  // Find the uploaded PDF.
  const row = await env.DB.prepare(
    'SELECT * FROM operational_attachments WHERE id = ? AND status = ?',
  ).bind(attachmentId, 'active').first()
  if (!row) {
    return json({ configured: false, message: 'Attachment not found', draft: emptyDraft() }, 404)
  }
  if (row.content_type !== 'application/pdf') {
    return json({
      configured: false,
      message:    `Attachment is not a PDF (${row.content_type})`,
      draft:      emptyDraft(),
    }, 400)
  }

  // Pull PDF bytes from R2.
  const obj = await env.PHOTOS.get(row.r2_key)
  if (!obj) {
    return json({ configured: false, message: 'PDF object missing in R2', draft: emptyDraft() }, 410)
  }
  const buffer = await obj.arrayBuffer()

  // Extract text. unpdf wraps pdfjs-dist and runs in the Workers runtime.
  let text = ''
  let totalPages = 0
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    totalPages = pdf.numPages
    const result = await extractText(pdf, { mergePages: true })
    text = typeof result?.text === 'string'
      ? result.text
      : Array.isArray(result?.text)
        ? result.text.join('\n')
        : ''
  } catch (err) {
    console.warn('[Label Extract] unpdf failed:', err?.message)
    return json({
      configured:  true,
      source:      'pdf-text',
      scanned:     false,
      message:     `PDF parsing failed: ${err?.message ?? 'unknown error'}`,
      extractedAt: new Date().toISOString(),
      totalPages,
      rawText:     '',
      draft:       emptyDraft(),
      hints:       { fieldsFound: [], error: true },
    })
  }

  // Strip nulls, normalize, and check for image-only PDFs (which extract
  // to essentially nothing because the content is rasterized).
  const clean = text.replace(/ /g, '').trim()
  if (clean.length < 80) {
    return json({
      configured:  true,
      source:      'pdf-text',
      scanned:     true,
      message:     'Scanned/image-only PDF extraction not yet supported. Enter the label details manually.',
      extractedAt: new Date().toISOString(),
      totalPages,
      rawText:     clean,
      draft:       emptyDraft(),
      hints:       { fieldsFound: [] },
    })
  }

  // Apply heuristics, then run the Phase 21 normalization layer on top.
  // `draft` carries normalized top-level values for the form pre-fill, and
  // `draft.fields` holds per-field { raw, normalized, ok } for the
  // wizard's raw-vs-normalized display.
  const rawDraft = applyHeuristics(clean, row.file_name)
  const draft    = normalizeDraft(rawDraft)
  const fieldsFound = []
  if (draft.epaNumber)         fieldsFound.push('epaNumber')
  if (draft.signalWord)        fieldsFound.push('signalWord')
  if (draft.restrictedUse)     fieldsFound.push('restrictedUse')
  if (draft.reiHours)          fieldsFound.push('reiHours')
  if (draft.phi)               fieldsFound.push('phi')
  if (draft.fracGroup)         fieldsFound.push('fracGroup')
  if (draft.hracGroup)         fieldsFound.push('hracGroup')
  if (draft.iracGroup)         fieldsFound.push('iracGroup')
  if (draft.activeIngredients) fieldsFound.push('activeIngredients')
  if (draft.manufacturer)      fieldsFound.push('manufacturer')
  // Phase 27A — fertilizer signals.
  if (draft.analysis)          fieldsFound.push('analysis')
  if (draft.nitrogenSource)    fieldsFound.push('nitrogenSource')
  // Phase 27A-2 — section-level signals. Each appears in fieldsFound only
  // when the corresponding section extractor confidently matched.
  if (draft.fields?.turfSites?.ok)        fieldsFound.push('turfSites')
  if (draft.fields?.applicationRates?.ok) fieldsFound.push('applicationRates')
  if (draft.fields?.targets?.ok)          fieldsFound.push('targets')
  if (draft.fields?.ppe?.ok)              fieldsFound.push('ppe')
  if (draft.fields?.storageNotes?.ok)     fieldsFound.push('storageNotes')
  if (draft.fields?.rainfast?.ok)         fieldsFound.push('rainfast')
  if (draft.fields?.turfRestrictions?.ok) fieldsFound.push('turfRestrictions')
  // productName is reported only as a SUGGESTION (ok:false) — surface it
  // separately so the wizard can show the filename hint without putting
  // a green-confidence chip on it.
  if (draft.fields?.productName)          fieldsFound.push('productNameSuggestion')

  // Cap raw text in the response — labels are typically a few KB but the
  // multi-page master label PDFs can be larger.
  const rawText = clean.length > RAW_TEXT_CAP_BYTES
    ? clean.slice(0, RAW_TEXT_CAP_BYTES) + '\n…[truncated]'
    : clean

  return json({
    configured:  true,
    source:      'pdf-text',
    scanned:     false,
    message: fieldsFound.length > 0
      ? `Extracted ${fieldsFound.length} field${fieldsFound.length === 1 ? '' : 's'} heuristically. Review every value before saving.`
      : 'Text was extracted but no fields matched the heuristics. Enter the details manually.',
    extractedAt: new Date().toISOString(),
    totalPages,
    rawText,
    draft,
    hints:       { fieldsFound },
  })
}

// ── Save ───────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/import-label/save
 *
 * Body: {
 *   courseId?, dedupeMode?, pdfAttachmentId?,
 *   item:  { id?, name, kind, category, unit, quantity, reorderLevel,
 *            costPerUnit, manufacturer, epaNumber, expiryDate,
 *            analysis, nitrogenSource, notes },
 *   label: { productName, manufacturer, epaNumber, activeIngredients,
 *            signalWord, restrictedUse, reiHours, phi, fracGroup,
 *            hracGroup, iracGroup, chemicalClass, applicationRates,
 *            targets, turfSites, safetyNotes, storageNotes, labelUrl,
 *            rawExtraction }
 * }
 *
 * dedupeMode:
 *   'check'  (default) — if an item with the same name exists in the
 *                        course, respond 409 { duplicate, existing } and
 *                        save nothing. The wizard then re-submits with
 *                        'create' or 'update'.
 *   'create'           — always insert a new inventory_items row.
 *   'update'           — update the existing item in place and replace
 *                        its label row.
 */
export async function saveImportedLabel(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)

  const body  = await readJson(request)
  const item  = body?.item
  const label = body?.label ?? {}
  if (!item || typeof item !== 'object') return badRequest('item object is required')
  if (!item.name || !String(item.name).trim()) return badRequest('item.name is required')

  const courseId   = resolveCourseId(body)
  const dedupeMode = body.dedupeMode ?? 'check'

  // Duplicate check — case-insensitive name match within the course.
  const existing = await env.DB.prepare(
    `SELECT * FROM inventory_items WHERE course_id = ? AND LOWER(name) = LOWER(?) LIMIT 1`,
  ).bind(courseId, item.name).first()

  if (existing && dedupeMode === 'check') {
    return json({
      duplicate: true,
      existing:  rowToItem(existing),
      message:   `An inventory item named "${existing.name}" already exists in this course.`,
    }, 409)
  }

  // ── Resolve the inventory item (create new or update in place) ──────────
  let itemId
  if (existing && dedupeMode === 'update') {
    itemId = existing.id
    await env.DB.prepare(`
      UPDATE inventory_items SET
        kind = ?, name = ?, category = ?, unit = ?, quantity = ?,
        reorder_level = ?, cost_per_unit = ?, notes = ?,
        manufacturer = ?, epa_number = ?, expiry_date = ?,
        analysis = ?, nitrogen_source = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      item.kind ?? 'chemical',
      item.name,
      item.category       ?? null,
      item.unit           ?? null,
      item.quantity       ?? 0,
      item.reorderLevel   ?? null,
      item.costPerUnit    ?? null,
      item.notes          ?? null,
      item.manufacturer   ?? null,
      item.epaNumber      ?? null,
      item.expiryDate     ?? null,
      item.analysis       ?? null,
      item.nitrogenSource ?? null,
      itemId,
    ).run()
  } else {
    // 'create', or 'check' with no existing match. The wizard pre-generates
    // item.id up front so the label PDF could be uploaded keyed to it.
    itemId = item.id ?? generateId('inv')
    await env.DB.prepare(`
      INSERT INTO inventory_items (
        id, kind, name, category, unit, quantity, reorder_level,
        cost_per_unit, notes, manufacturer, epa_number, expiry_date,
        analysis, nitrogen_source, course_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      itemId,
      item.kind ?? 'chemical',
      item.name,
      item.category       ?? null,
      item.unit           ?? null,
      item.quantity       ?? 0,
      item.reorderLevel   ?? null,
      item.costPerUnit    ?? null,
      item.notes          ?? null,
      item.manufacturer   ?? null,
      item.epaNumber      ?? null,
      item.expiryDate     ?? null,
      item.analysis       ?? null,
      item.nitrogenSource ?? null,
      courseId,
    ).run()
  }

  // ── Upsert the label row (one label per item) ──────────────────────────
  await env.DB.prepare(
    `DELETE FROM inventory_product_labels WHERE inventory_item_id = ?`,
  ).bind(itemId).run()

  const labelId = generateId('lbl')
  await env.DB.prepare(`
    INSERT INTO inventory_product_labels (
      id, course_id, inventory_item_id, pdf_attachment_id,
      product_name, manufacturer, epa_number, active_ingredients,
      signal_word, restricted_use, rei_hours, phi,
      frac_group, hrac_group, irac_group, chemical_class,
      application_rates_json, targets_json, turf_sites,
      safety_notes, storage_notes, label_url, raw_extraction_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    labelId,
    courseId,
    itemId,
    body.pdfAttachmentId ?? null,
    label.productName       ?? item.name ?? null,
    label.manufacturer      ?? item.manufacturer ?? null,
    label.epaNumber         ?? item.epaNumber ?? null,
    label.activeIngredients ?? null,
    label.signalWord        ?? null,
    label.restrictedUse ? 1 : 0,
    label.reiHours          ?? null,
    label.phi               ?? null,
    label.fracGroup         ?? null,
    label.hracGroup         ?? null,
    label.iracGroup         ?? null,
    label.chemicalClass     ?? null,
    Array.isArray(label.applicationRates) && label.applicationRates.length > 0
      ? JSON.stringify(label.applicationRates) : null,
    Array.isArray(label.targets) && label.targets.length > 0
      ? JSON.stringify(label.targets) : null,
    label.turfSites    ?? null,
    label.safetyNotes  ?? null,
    label.storageNotes ?? null,
    label.labelUrl     ?? null,
    label.rawExtraction != null ? JSON.stringify(label.rawExtraction) : null,
  ).run()

  const savedItem  = await env.DB.prepare(
    'SELECT * FROM inventory_items WHERE id = ?',
  ).bind(itemId).first()
  const savedLabel = await env.DB.prepare(
    'SELECT * FROM inventory_product_labels WHERE id = ?',
  ).bind(labelId).first()

  return json({
    item:    rowToItem(savedItem),
    label:   rowToLabel(savedLabel),
    updated: !!(existing && dedupeMode === 'update'),
  })
}

// ── List ───────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/import-label/labels?courseId=...
 * Course-scoped, newest first. Used by the Chemicals tab to show a
 * "Label PDF" link on items that were imported through the wizard.
 */
export async function listImportedLabels(env, courseId) {
  if (!env.DB) return json([])
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM inventory_product_labels ${where} ORDER BY datetime(created_at) DESC`,
  ).bind(...binds).all()
  return json(results.map(rowToLabel))
}
