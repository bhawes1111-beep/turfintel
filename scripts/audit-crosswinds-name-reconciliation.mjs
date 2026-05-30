// Phase 7X.5 — Crosswinds name-reconciliation review.
//
//   node scripts/audit-crosswinds-name-reconciliation.mjs            (console)
//   node scripts/audit-crosswinds-name-reconciliation.mjs --json     (raw JSON)
//   node scripts/audit-crosswinds-name-reconciliation.mjs --write-doc (write md)
//
// READ-ONLY review of inventory rows that carry cost basis but DO NOT
// match a Crosswinds program item by exact name. Proposes likely
// reconciliation candidates so a steward can confirm by hand. Never
// merges names; never PATCHes; never deducts inventory.
//
// Sources combined here:
//   - live /api/spray-programs/{id}/items                    (public GET)
//   - live /api/inventory                                    (public GET)
//   - the live cost-aware estimator's status per program item
//     (programCostAwareness.estimateProgramItemCost) so we can
//     report the expected-impact-if-reconciled
//   - the manual alias-review section in
//     docs/crosswinds-greens-program-2026-product-audit.md
//     (these are hints, not auto-merges)
//   - the four explicit known mismatches in the Phase 7X.5 spec
//
// We NEVER reach the live audit table here — this is a stewardship
// recommendation, not a history report (Phase 7X.4 owns the latter).

import { readFileSync, writeFileSync } from 'fs'
import {
  estimateProgramItemCost,
  resolveProgramArea,
} from '../src/utils/sprayPrograms/programCostAwareness.js'

const PROGRAM_ID = 'sp-crosswinds-greens-2026'
const DOC_FILE   = 'docs/crosswinds-name-reconciliation-review.md'

const args = process.argv.slice(2)
const AS_JSON   = args.includes('--json')
const WRITE_DOC = args.includes('--write-doc')

// ── Env / API helpers (same pattern as the other read-only scripts) ───────
function loadEnv() {
  const out = { ...process.env }
  try {
    for (const ln of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = ln.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m) out[m[1]] = m[2].replace(/\r$/, '')
    }
  } catch { /* .env.local optional */ }
  return out
}
const ENV = loadEnv()
const API = (ENV.TURFINTEL_API_URL || '').replace(/\/$/, '')
const KEY = ENV.TURFINTEL_API_KEY || ''

async function getJson(path) {
  const res = await fetch(API + path, { headers: KEY ? { 'x-admin-key': KEY } : {} })
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
  return res.json()
}

// ── DO-NOT-MERGE pairs (verbatim from product-audit doc + spec) ───────────
// These are program-name + inventory-name combinations that must NEVER
// be merged by any future automation. Surfaced as warnings.
const DO_NOT_MERGE = [
  { a: 'Ampliphy 18', b: 'Veriphy 18', reason: 'Separate products even though spellings are similar (per Phase 7T.1 product audit).' },
]

// ── Explicit known mismatches from the Phase 7X.5 spec ────────────────────
// These are stewardship-confirmed, so they get HIGH confidence + a
// specific action recommendation. The math + impact get computed
// against live data below.
const EXPLICIT_HINTS = [
  { inventoryName: '13-2-13',              programName: 'Vereens 13-2-13', reason: 'Same product — Vereens-branded 13-2-13 granular per the program doc.' },
  { inventoryName: '18-3-18 Greens Grade', programName: 'PUSH 18-3-18',    reason: 'Same product — Vereens PUSH-branded 18-3-18 greens grade per the program doc.' },
  // Prothioconazole has NO inventory row by that exact name; the
  // alias-review doc says the inventory row is "Prothioconazole (generic
  // Densicor)". We compute this dynamically below (it falls out of the
  // similarity probe).
]

// ── Alias-review groups (verbatim copy from the product-audit doc) ────────
// Hints for the steward; we never auto-collapse these. Each entry lists
// the program-side name to look up + the inventory-side candidate(s)
// to surface as a recommendation.
const ALIAS_REVIEW_GROUPS = [
  { programName: 'Prothioconazole',        inventoryCandidates: ['Prothioconazole (generic Densicor)'], reason: 'Prothioconazole / generic Densicor alias group.' },
  { programName: 'Kickdrum 0-0-29 K Acetate', inventoryCandidates: ['KickDrum 0-0-29'],                 reason: 'Kickdrum / KickDrum spelling variant.' },
  { programName: 'BioRhythym',             inventoryCandidates: ['BioRhythm'],                          reason: 'BioRhythym spelling variant — confirm via catalog.' },
  { programName: 'Harmony',                inventoryCandidates: ['Root Harmony'],                       reason: 'Harmony / Root Harmony alias — confirm via catalog.' },
  { programName: 'Fame',                   inventoryCandidates: ['Fame SC'],                            reason: 'Fame / Fame SC alias group.' },
  // (Prize Phiter / Prize Phyter etc. are already inventory-matched —
  // listed here for completeness but won't surface as candidates.)
]

// ── Name normalization for similarity probes ──────────────────────────────
// Same shape as the offline product-audit script: lowercase, drop
// punctuation that varies between spellings, collapse whitespace.
function normName(s) {
  if (s == null) return ''
  return String(s)
    .toLowerCase()
    .replace(/[®™]/g, '')
    .replace(/[^a-z0-9.+/ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
// Token bag for Jaccard-style overlap (good for catching "Vereens
// 13-2-13" ↔ "13-2-13" or "PUSH 18-3-18" ↔ "18-3-18 Greens Grade").
function tokens(s) {
  const n = normName(s)
  if (!n) return new Set()
  return new Set(n.split(/[\s/-]+/).filter(Boolean))
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const union = a.size + b.size - inter
  return union ? inter / union : 0
}
// N-P-K signature, e.g. "18-3-18". Catches fertilizer rows that
// share an analysis even when the prefix differs.
function npk(s) {
  const m = String(s ?? '').match(/\b(\d{1,2})-(\d{1,2})-(\d{1,2})\b/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function roundCents(n) {
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

// ── Build the recommendation set ──────────────────────────────────────────
async function buildReview() {
  if (!API) throw new Error('TURFINTEL_API_URL not set (in env or .env.local).')

  const [programs, programItems, inventoryAll] = await Promise.all([
    getJson('/api/spray-programs?status=active'),
    getJson(`/api/spray-programs/${PROGRAM_ID}/items`),
    getJson('/api/inventory'),
  ])
  const program = (Array.isArray(programs) ? programs : []).find(p => p?.id === PROGRAM_ID) ?? null
  const items   = Array.isArray(programItems) ? programItems : []
  const inv     = (Array.isArray(inventoryAll) ? inventoryAll : []).filter(i => i && i.kind !== 'part' && i.kind !== 'fuel')
  const area    = resolveProgramArea({ program })

  // Map inventory by exact name (normalized) so we can tell which rows
  // already match a program item.
  const invByNormName = new Map()
  for (const r of inv) invByNormName.set(normName(r.name), r)

  // Program item lookup by name + by NPK signature.
  const itemsByName = new Map()
  for (const it of items) {
    const k = normName(it.productName)
    if (!itemsByName.has(k)) itemsByName.set(k, [])
    itemsByName.get(k).push(it)
  }
  const itemsByNpk = new Map()
  for (const it of items) {
    const k = npk(it.productName)
    if (!k) continue
    if (!itemsByNpk.has(k)) itemsByNpk.set(k, [])
    itemsByNpk.get(k).push(it)
  }

  // Phase 7X.4 split: exact-name-matched contributing vs not. Reused
  // here so the report's groups line up with the current-state doc.
  const costed = inv.filter(i => i.costPerUnit != null && Number(i.costPerUnit) > 0)
  const exactMatchedContributing = []
  const costedNotContributing    = []
  for (const r of costed) {
    const n = normName(r.name)
    const prog = itemsByName.get(n) ?? []
    if (prog.length === 0) costedNotContributing.push(r)
    else                   exactMatchedContributing.push({ inv: r, programItems: prog })
  }

  // Estimator status per program item (for impact projection).
  const ctx = { inventoryProducts: inv, program }
  const itemEsts = new Map()
  for (const it of items) itemEsts.set(it.id, estimateProgramItemCost(it, ctx))

  // ── Recommendation builder ──────────────────────────────────────────────
  // For each costed-but-off-program inventory row, propose the most
  // likely program-name candidate via:
  //   1. Explicit hint (highest confidence)
  //   2. Same N-P-K analysis (high confidence for fertilizers)
  //   3. Substring/token-overlap Jaccard >= 0.5 (medium)
  //   4. Anything weaker → low (notes only, not surfaced)
  const recommendations = []
  for (const r of costedNotContributing) {
    const invName = r.name ?? ''
    const explicit = EXPLICIT_HINTS.find(h => normName(h.inventoryName) === normName(invName))
    if (explicit) {
      const progItems = itemsByName.get(normName(explicit.programName)) ?? []
      recommendations.push(buildRec({
        r, candidateName: explicit.programName, candidateItems: progItems,
        confidence: 'high', via: 'explicit-spec-hint', reason: explicit.reason,
      }, ctx, itemEsts, area))
      continue
    }
    // NPK shared signature.
    const myNpk = npk(invName)
    if (myNpk) {
      const candidates = itemsByNpk.get(myNpk) ?? []
      // Pick the candidate name with the highest token overlap (so
      // "18-3-18 Greens Grade" → "PUSH 18-3-18" beats unrelated NPK
      // matches when several program items share an analysis).
      const groups = new Map()
      for (const it of candidates) {
        const name = it.productName
        if (!groups.has(name)) groups.set(name, [])
        groups.get(name).push(it)
      }
      let best = null
      for (const [name, list] of groups) {
        if (normName(name) === normName(invName)) continue
        const score = jaccard(tokens(invName), tokens(name))
        if (!best || score > best.score) best = { name, list, score }
      }
      if (best && best.score >= 0.3) {
        recommendations.push(buildRec({
          r, candidateName: best.name, candidateItems: best.list,
          confidence: best.score >= 0.5 ? 'high' : 'medium',
          via: 'npk-signature',
          reason: `Shared N-P-K analysis (${myNpk}); token overlap ${best.score.toFixed(2)}.`,
        }, ctx, itemEsts, area))
        continue
      }
    }
    // Pure token-overlap fallback against ALL program names.
    let best = null
    for (const [normProgName, list] of itemsByName) {
      if (normProgName === normName(invName)) continue
      const score = jaccard(tokens(invName), tokens(list[0]?.productName ?? ''))
      if (!best || score > best.score) best = { name: list[0]?.productName, list, score }
    }
    if (best && best.score >= 0.5) {
      recommendations.push(buildRec({
        r, candidateName: best.name, candidateItems: best.list,
        confidence: 'medium', via: 'name-token-overlap',
        reason: `Token overlap ${best.score.toFixed(2)} with a program item name.`,
      }, ctx, itemEsts, area))
      continue
    }
    // Truly off-program (no candidate stronger than 0.5 overlap).
    recommendations.push({
      inventoryName: r.name,
      inventoryId:   r.id,
      programProductName: null,
      programItemIds:     [],
      costBasis: r.costPerUnit != null ? `$${r.costPerUnit}/${r.costUnit ?? r.unit ?? '—'}` : null,
      estimatedContribution: 0,
      confidence: 'low',
      action: 'off-program (no candidate found)',
      reason: 'No program item shares enough name signal to suggest a reconciliation.',
    })
  }

  // ── Reverse direction: program rows with no inventory cost but a likely
  //    costed inventory candidate (e.g. Prothioconazole → "Prothioconazole
  //    (generic Densicor)").
  const programSideRecommendations = []
  for (const group of ALIAS_REVIEW_GROUPS) {
    const prog = itemsByName.get(normName(group.programName)) ?? []
    if (prog.length === 0) continue
    const invCandidates = group.inventoryCandidates
      .map(name => invByNormName.get(normName(name)))
      .filter(Boolean)
    if (invCandidates.length === 0) continue
    // Use the first inventory candidate that has cost basis if any.
    const costedCandidate = invCandidates.find(c => c.costPerUnit != null && Number(c.costPerUnit) > 0)
      ?? invCandidates[0]
    // Impact: sum what these program items WOULD contribute if linked.
    let impact = 0
    for (const it of prog) {
      // Re-estimate with a synthetic item that points at the candidate
      // inventory id, leaving original program items untouched.
      const syn = { ...it, inventoryItemId: costedCandidate.id }
      const est = estimateProgramItemCost(syn, ctx)
      if (est.status === 'estimated' && Number.isFinite(est.estimatedCost)) impact += est.estimatedCost
    }
    programSideRecommendations.push({
      inventoryName: costedCandidate.name,
      inventoryId:   costedCandidate.id,
      programProductName: group.programName,
      programItemIds: prog.map(p => p.id),
      programUses: prog.length,
      costBasis: costedCandidate.costPerUnit != null
        ? `$${costedCandidate.costPerUnit}/${costedCandidate.costUnit ?? costedCandidate.unit ?? '—'}`
        : null,
      estimatedContribution: roundCents(impact),
      confidence: 'high',
      action: 'manually confirm same product',
      reason: group.reason,
      direction: 'program-side',
    })
  }

  // ── Unit-conversion-only blockers (not name issues) ─────────────────────
  // These rows are costed AND name-matched but the estimator says
  // 'cost-basis-found-unit-conversion-needed'. We surface them so they
  // don't get mistaken for a name problem.
  const unitConversionBlockers = []
  for (const it of items) {
    const est = itemEsts.get(it.id)
    if (est?.status !== 'cost-basis-found-unit-conversion-needed') continue
    const n = normName(it.productName)
    const matched = invByNormName.get(n)
    if (!matched || matched.costPerUnit == null) continue
    unitConversionBlockers.push({
      productName: it.productName,
      inventoryId: matched.id,
      programItemId: it.id,
      rate: `${it.rateValue ?? '?'} ${it.rateUnit ?? ''}`.trim(),
      costBasis: `$${matched.costPerUnit}/${matched.costUnit ?? matched.unit ?? '—'}`,
      message: est?.message ?? null,
    })
  }
  // De-dupe by productName so Manzate Max appears once.
  const seen = new Set()
  const unitConversionUnique = []
  for (const u of unitConversionBlockers) {
    const key = normName(u.productName)
    if (seen.has(key)) continue
    seen.add(key)
    unitConversionUnique.push({ ...u, programUses: items.filter(i => normName(i.productName) === key).length })
  }

  // ── DO-NOT-MERGE pairs surfaced regardless of whether they appear ────
  // (they should always be present in the program).
  const doNotMergePairs = DO_NOT_MERGE.map(p => ({
    a: p.a, b: p.b, reason: p.reason,
    bothInProgram: (itemsByName.get(normName(p.a))?.length ?? 0) > 0
                && (itemsByName.get(normName(p.b))?.length ?? 0) > 0,
  }))

  return {
    schema: 'crosswinds-name-reconciliation-review/v1',
    generatedAt: new Date().toISOString(),
    program: { id: program?.id ?? PROGRAM_ID, name: program?.name ?? null, areaAcres: area.acres, areaSource: area.source },
    counts: {
      exactMatchedContributing:  exactMatchedContributing.length,
      costedNotContributing:     costedNotContributing.length,
      reconciliationCandidates:  recommendations.filter(r => r.programProductName).length,
      programSideRecommendations: programSideRecommendations.length,
      doNotMergePairs:           doNotMergePairs.length,
      unitConversionBlockers:    unitConversionUnique.length,
    },
    exactMatchedContributing: exactMatchedContributing.map(e => ({
      inventoryName: e.inv.name,
      inventoryId:   e.inv.id,
      programUses:   e.programItems.length,
      costBasis: e.inv.costPerUnit != null ? `$${e.inv.costPerUnit}/${e.inv.costUnit ?? e.inv.unit ?? '—'}` : null,
    })),
    reconciliationCandidates: recommendations,
    programSideRecommendations,
    doNotMergePairs,
    unitConversionBlockers: unitConversionUnique,
  }
}

// Build one recommendation row. Estimates "expected contribution if
// reconciled" by simulating an inventoryItemId link from each candidate
// program item to the inventory row, running the live estimator, and
// summing the resulting estimated costs.
function buildRec({ r, candidateName, candidateItems, confidence, via, reason }, ctx, itemEsts, area) {
  let impact = 0
  for (const it of candidateItems) {
    const syn = { ...it, inventoryItemId: r.id }
    const est = estimateProgramItemCost(syn, ctx)
    if (est.status === 'estimated' && Number.isFinite(est.estimatedCost)) impact += est.estimatedCost
  }
  return {
    inventoryName: r.name,
    inventoryId:   r.id,
    programProductName: candidateName,
    programItemIds:     candidateItems.map(i => i.id),
    programUses:        candidateItems.length,
    costBasis: r.costPerUnit != null ? `$${r.costPerUnit}/${r.costUnit ?? r.unit ?? '—'}` : null,
    estimatedContribution: roundCents(impact),
    confidence,
    matchVia: via,
    action: 'manually confirm same product',
    reason,
    direction: 'inventory-side',
  }
}

// ── Renderers ──────────────────────────────────────────────────────────────
function fmtMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(n))
  } catch { return `$${Number(n).toFixed(2)}` }
}

function renderConsole(a) {
  const L = []
  L.push('— Crosswinds Greens Program 2026 — name-reconciliation review')
  L.push('')
  L.push(`Program: ${a.program.name ?? a.program.id}`)
  L.push(`Area basis: ${a.program.areaAcres != null ? a.program.areaAcres + ' acres (' + a.program.areaSource + ')' : 'NOT AVAILABLE'}`)
  L.push('')
  L.push('Counts:')
  L.push(`  exact matches contributing:           ${a.counts.exactMatchedContributing}`)
  L.push(`  costed inventory not contributing:    ${a.counts.costedNotContributing}`)
  L.push(`  reconciliation candidates (inv-side): ${a.counts.reconciliationCandidates}`)
  L.push(`  program-side recommendations:         ${a.counts.programSideRecommendations}`)
  L.push(`  DO-NOT-MERGE pairs:                   ${a.counts.doNotMergePairs}`)
  L.push(`  unit-conversion-only blockers:        ${a.counts.unitConversionBlockers}`)
  L.push('')
  L.push('Reconciliation candidates (inventory-side):')
  for (const c of a.reconciliationCandidates) {
    const arrow = c.programProductName ? ` → ${c.programProductName}` : ' → (no program match)'
    L.push(`  • ${c.inventoryName}${arrow}  [${c.confidence}]`)
    L.push(`      cost: ${c.costBasis}, program uses: ${c.programUses ?? 0}, impact if reconciled: ${fmtMoney(c.estimatedContribution)}`)
    if (c.matchVia) L.push(`      match via: ${c.matchVia}`)
    L.push(`      reason: ${c.reason}`)
  }
  L.push('')
  L.push('Program-side recommendations (program rows whose existing costed inventory candidate could light them up):')
  for (const c of a.programSideRecommendations) {
    L.push(`  • ${c.programProductName} → ${c.inventoryName}  [${c.confidence}]`)
    L.push(`      cost: ${c.costBasis}, program uses: ${c.programUses}, impact if reconciled: ${fmtMoney(c.estimatedContribution)}`)
    L.push(`      reason: ${c.reason}`)
  }
  L.push('')
  L.push('DO NOT MERGE pairs:')
  for (const p of a.doNotMergePairs) {
    L.push(`  • ${p.a} ↔ ${p.b}  ${p.bothInProgram ? '(both in program)' : '(not both in program)'}`)
    L.push(`      ${p.reason}`)
  }
  L.push('')
  L.push('Unit-conversion-only blockers (cost basis IS on file; not a name issue):')
  for (const u of a.unitConversionBlockers) {
    L.push(`  • ${u.productName}: ${u.rate}  vs cost ${u.costBasis}  (${u.programUses} use${u.programUses !== 1 ? 's' : ''})`)
    if (u.message) L.push(`      ${u.message}`)
  }
  return L.join('\n')
}

function renderDoc(a) {
  const md = []
  md.push('# Crosswinds Greens Program 2026 — Name Reconciliation Review')
  md.push('')
  md.push('Generated by [`scripts/audit-crosswinds-name-reconciliation.mjs`](../scripts/audit-crosswinds-name-reconciliation.mjs).')
  md.push('**Read-only stewardship review.** No automatic merge has been performed.')
  md.push('Inventory usage and deduction are unaffected. Every recommendation')
  md.push('below requires a manual confirmation before any name change or')
  md.push('cost-basis link is created.')
  md.push('')
  md.push(`- Generated at: \`${a.generatedAt}\``)
  md.push(`- Program: **${a.program.name ?? a.program.id}**`)
  md.push(`- Area basis: **${a.program.areaAcres != null ? a.program.areaAcres + ' acres' : 'NOT AVAILABLE'}**${a.program.areaSource ? ` (${a.program.areaSource})` : ''}`)
  md.push('')
  md.push('## Summary')
  md.push('')
  md.push(`- Exact name matches already contributing: **${a.counts.exactMatchedContributing}**`)
  md.push(`- Costed inventory rows NOT contributing: **${a.counts.costedNotContributing}**`)
  md.push(`- Inventory-side reconciliation candidates: **${a.counts.reconciliationCandidates}**`)
  md.push(`- Program-side reconciliation recommendations: **${a.counts.programSideRecommendations}**`)
  md.push(`- DO-NOT-MERGE pairs flagged: **${a.counts.doNotMergePairs}**`)
  md.push(`- Unit-conversion-only blockers: **${a.counts.unitConversionBlockers}**`)
  md.push('')

  // Inventory-side candidates (the spec's "Costed but not contributing"
  // group, augmented with a candidate program name).
  md.push('## Reconciliation candidates (inventory-side)')
  md.push('')
  md.push('These inventory rows already carry a cost basis but no program item')
  md.push('matches them by exact name. The proposed program name is a stewardship')
  md.push('hint — confirm by hand before any action.')
  md.push('')
  md.push('| Inventory name | Suggested program name | Confidence | Cost | Uses | Impact if reconciled | Reason |')
  md.push('|----------------|------------------------|------------|------|------|----------------------|--------|')
  for (const c of a.reconciliationCandidates) {
    const prog = c.programProductName ?? '(none)'
    md.push(`| ${c.inventoryName} | ${prog} | ${c.confidence} | ${c.costBasis ?? '—'} | ${c.programUses ?? 0} | ${fmtMoney(c.estimatedContribution)} | ${c.reason} |`)
  }
  md.push('')
  md.push('## Program-side recommendations')
  md.push('')
  md.push('Program rows that currently read as "missing cost basis" but whose')
  md.push('inventory candidate already carries a cost basis. Reconciling the name')
  md.push('would light them up in the next estimator run.')
  md.push('')
  md.push('| Program product | Inventory candidate | Confidence | Cost | Uses | Impact if reconciled | Reason |')
  md.push('|-----------------|----------------------|------------|------|------|----------------------|--------|')
  for (const c of a.programSideRecommendations) {
    md.push(`| ${c.programProductName} | ${c.inventoryName} | ${c.confidence} | ${c.costBasis ?? '—'} | ${c.programUses} | ${fmtMoney(c.estimatedContribution)} | ${c.reason} |`)
  }
  md.push('')
  md.push('## DO NOT MERGE')
  md.push('')
  for (const p of a.doNotMergePairs) {
    md.push(`- **${p.a} ↔ ${p.b}** — ${p.reason}${p.bothInProgram ? ' (both currently in the Crosswinds program)' : ''}`)
  }
  md.push('')
  md.push('## Unit-conversion-only blockers (not a name issue)')
  md.push('')
  md.push('These items already have an exact-name inventory match AND cost basis,')
  md.push('but the rate unit cannot be converted to the cost unit safely without a')
  md.push('manual conversion factor. This is intentional behavior of the')
  md.push('Phase 7V.1 estimator (never crosses volume↔weight automatically).')
  md.push('')
  md.push('| Product | Rate | Cost | Uses | Note |')
  md.push('|---------|------|------|------|------|')
  for (const u of a.unitConversionBlockers) {
    md.push(`| ${u.productName} | ${u.rate} | ${u.costBasis} | ${u.programUses} | ${u.message ?? '—'} |`)
  }
  md.push('')
  md.push('## How to act on these recommendations')
  md.push('')
  md.push('1. **Inventory-side candidates:** confirm whether the inventory product')
  md.push('   really is the same physical product as the proposed program name.')
  md.push('   If yes, the cleanest path is to either (a) update the inventory row')
  md.push('   name to match the program name verbatim, or (b) link the program')
  md.push('   items via their `inventory_item_id` (planner UI). Either makes the')
  md.push('   existing cost basis flow into the estimator on the next run.')
  md.push('2. **Program-side recommendations:** same options — rename the')
  md.push('   inventory row to match the program spelling, or link by id.')
  md.push('3. **DO NOT MERGE pairs:** confirm in the catalog that the pair are')
  md.push('   genuinely separate; price each independently.')
  md.push('4. **Unit-conversion blockers:** these need a manual conversion factor')
  md.push('   (e.g. a lb-per-fl-oz figure for Manzate Max), not a name change.')
  md.push('')
  md.push('No automatic merge has occurred. No inventory cost basis has been')
  md.push('changed. Inventory stock + usage are unaffected.')
  return md.join('\n')
}

// ── Main ──────────────────────────────────────────────────────────────────
const review = await buildReview()

if (AS_JSON) {
  process.stdout.write(JSON.stringify(review, null, 2) + '\n')
} else {
  process.stdout.write(renderConsole(review) + '\n')
}

if (WRITE_DOC) {
  writeFileSync(DOC_FILE, renderDoc(review), 'utf8')
  process.stderr.write(`\nWrote ${DOC_FILE}\n`)
}
