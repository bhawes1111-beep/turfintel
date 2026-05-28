// Phase 7T.1 — Crosswinds Greens Program 2026 product + cost-basis audit.
//
//   node scripts/audit-crosswinds-greens-program-products.mjs
//   node scripts/audit-crosswinds-greens-program-products.mjs --json
//
// READ-ONLY stewardship report. This script never touches the database
// and never mutates anything on disk except (optionally) the audit doc
// when run with --write-doc. It parses two committed migration files:
//
//   - worker/migrations/0047_crosswinds_greens_program_2026_seed.sql
//       the 153 spray_program_items (the program)
//   - worker/migrations/0021_greens_program_inventory_refresh.sql
//       the crossroads-gc inventory_items refreshed for the 2026 lineup
//
// It answers, per unique program product:
//   A. program summary (uses, first/last date, rate/unit patterns, totals)
//   B. catalog/inventory match status (+ cost basis)
//   C. manual stewardship flags
//   D. known manual alias-review hints (NEVER auto-merged)
//
// Cost basis: cost lives on inventory_items.cost_per_unit (migration
// 0004 + 0045 stewardship fields). The 0021 refresh inserts every
// crossroads-gc program product with cost_per_unit = NULL, so the audit
// reports "matched inventory, missing cost basis" for them — exactly the
// gap Bryan needs to fill manually. No product_catalog seed ships in the
// repo, so catalog matches are reported as "no catalog seed on disk".

import { readFileSync, writeFileSync } from 'fs'

const SEED_FILE = 'worker/migrations/0047_crosswinds_greens_program_2026_seed.sql'
const INV_FILE  = 'worker/migrations/0021_greens_program_inventory_refresh.sql'
const DOC_FILE  = 'docs/crosswinds-greens-program-2026-product-audit.md'

const args = process.argv.slice(2)
const AS_JSON   = args.includes('--json')
const WRITE_DOC = args.includes('--write-doc')

// ── Name normalization ────────────────────────────────────────────────────
// Mirrors the spirit of programCostAwareness.normalizeUnit: lowercase,
// collapse whitespace, strip punctuation that varies between spellings.
// This is for AUDIT MATCHING ONLY — it never rewrites stored data and
// never auto-merges. Two names sharing a normalized key are *candidates*
// for the steward to confirm, not a merge.
function normalizeName(name) {
  if (name == null) return ''
  return String(name)
    .toLowerCase()
    .replace(/[®™]/g, '')
    .replace(/[^a-z0-9.+/ -]/g, ' ')   // keep digits, dot, plus, slash, hyphen
    .replace(/\s+/g, ' ')
    .trim()
}

// A looser key for alias detection: also drop common suffix noise so e.g.
// "kickdrum 0-0-29 k acetate" and "kickdrum 0-0-29" collapse.
function aliasKey(name) {
  return normalizeName(name)
    .replace(/\b(k acetate|greens grade|sc|g|ii|plus|max|action)\b/g, '')
    .replace(/[0-9]+\.?[0-9]*-[0-9]+\.?[0-9]*-[0-9]+\.?[0-9]*/g, '') // strip N-P-K
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Tolerant VALUES-row parser ──────────────────────────────────────────
// Splits a single SQL tuple `( 'a', 1, NULL, 'b, c' )` into raw cell
// strings, respecting single-quoted strings (with '' escapes). Good
// enough for these hand-authored seeds — we are not building a SQL engine.
function splitTuple(tuple) {
  const cells = []
  let i = 0
  let cur = ''
  let inStr = false
  while (i < tuple.length) {
    const ch = tuple[i]
    if (inStr) {
      if (ch === "'") {
        if (tuple[i + 1] === "'") { cur += "'"; i += 2; continue }
        inStr = false; i++; continue
      }
      cur += ch; i++; continue
    }
    if (ch === "'") { inStr = true; i++; continue }
    if (ch === ',') { cells.push(cur.trim()); cur = ''; i++; continue }
    cur += ch; i++
  }
  cells.push(cur.trim())
  return cells
}

function cellIsNull(c) {
  return c == null || /^null$/i.test(c.trim())
}

// Extract every top-level `( ... )` tuple that follows a `VALUES`
// keyword. Walks character by character so parentheses INSIDE quoted
// string cells (e.g. notes like "(~4 A)" or "(generic Densicor)") do
// not prematurely close a tuple. Returns arrays of raw cells.
function extractValueTuples(sql) {
  const tuples = []
  const valuesRe = /\bVALUES\b/gi
  let vm
  while ((vm = valuesRe.exec(sql)) != null) {
    let i = vm.index + vm[0].length
    // Scan tuples until we hit the statement terminator ';' at depth 0
    // and outside a string.
    let depth = 0
    let inStr = false
    let cur = ''
    for (; i < sql.length; i++) {
      const ch = sql[i]
      if (inStr) {
        cur += ch
        if (ch === "'") {
          if (sql[i + 1] === "'") { cur += "'"; i++; continue }
          inStr = false
        }
        continue
      }
      if (ch === "'") { inStr = true; cur += ch; continue }
      if (ch === '(') {
        depth++
        if (depth === 1) { cur = ''; continue }  // start fresh tuple body
        cur += ch
        continue
      }
      if (ch === ')') {
        depth--
        if (depth === 0) { tuples.push(splitTuple(cur)); cur = ''; continue }
        cur += ch
        continue
      }
      if (ch === ';' && depth === 0) break       // end of this VALUES block
      if (depth >= 1) cur += ch
    }
  }
  return tuples
}

// ── Parse program items from the 0047 seed ────────────────────────────────
// Columns: id, program_id, target_area, planned_start_date,
//          planned_end_date, product_name, rate_value, rate_unit,
//          application_notes, sort_order, status
function parseProgramItems() {
  const sql = readFileSync(SEED_FILE, 'utf8')
  // Only the spray_program_items INSERT block — slice from its INSERT to EOF.
  const insertIdx = sql.search(/INSERT\s+OR\s+IGNORE\s+INTO\s+spray_program_items/i)
  const itemSql = insertIdx >= 0 ? sql.slice(insertIdx) : sql
  const tuples = extractValueTuples(itemSql)
  const items = []
  for (const c of tuples) {
    if (c.length < 11) continue
    const [id, programId, targetArea, startDate, endDate, productName,
           rateValue, rateUnit, notes, , status] = c
    if (!id || !/^spi-cw26-/.test(id)) continue
    items.push({
      id,
      programId,
      targetArea,
      startDate: cellIsNull(startDate) ? null : startDate,
      endDate:   cellIsNull(endDate)   ? null : endDate,
      productName,
      rateValue: cellIsNull(rateValue) ? null : Number(rateValue),
      rateUnit:  cellIsNull(rateUnit)  ? null : rateUnit,
      notes:     cellIsNull(notes)     ? '' : notes,
      status,
    })
  }
  return items
}

// ── Parse crossroads-gc inventory from the 0021 refresh ───────────────────
// We only need (name, unit, cost_per_unit). The migration uses several
// column orders, but `name` is always the 3rd cell and `unit` the 5th in
// every INSERT block here; cost_per_unit is the 10th. To stay robust we
// detect by column header comment is overkill — instead we read the
// product NAME (cell index 2) and treat cost as present only if a numeric
// cost cell appears. Since 0021 sets every program cost to NULL, we report
// cost-basis as "not in this migration" and rely on name presence only.
function parseInventoryNames() {
  const sql = readFileSync(INV_FILE, 'utf8')
  const tuples = extractValueTuples(sql)
  const rows = []
  for (const c of tuples) {
    if (c.length < 3) continue
    const id   = c[0]
    const name = c[2]
    if (!id || !name) continue
    // Skip non-inventory tuples defensively.
    if (!/^[a-z]+-/.test(id)) continue
    rows.push({ id, name })
  }
  return rows
}

// ── Known manual alias-review hints (Phase 7T.1 spec) ─────────────────────
// These are HINTS for Bryan's manual review only. The audit never merges.
const ALIAS_REVIEW = [
  { group: 'Prize Phiter / Prize Phyter',                          members: ['Prize Phiter', 'Prize Phyter'] },
  { group: 'Harmony / Root Harmony',                               members: ['Harmony', 'Root Harmony'] },
  { group: 'Daconil Action / Chlorothalonil / Chlorothalonil 720', members: ['Daconil Action', 'Chlorothalonil', 'Chlorothalonil 720'] },
  { group: 'Prothioconazole / Generic Densicor',                   members: ['Prothioconazole', 'Densicor'] },
  { group: 'Ampliphy 18 / Veriphy 18 — DO NOT MERGE',              members: ['Ampliphy 18', 'Veriphy 18'], doNotMerge: true },
  { group: 'Appear / Appear II',                                   members: ['Appear', 'Appear II'] },
  { group: 'Rain Pigment / Rain Green Pigment',                    members: ['Rain Pigment', 'Rain Green Pigment'] },
  { group: 'CalNitrate / Calcium Nitrate',                         members: ['CalNitrate', 'Calcium Nitrate', 'Calcium Nitrate 15.5-0-0'] },
  { group: 'Kickdrum / KickDrum',                                  members: ['Kickdrum', 'KickDrum', 'Kickdrum 0-0-29 K Acetate', 'KickDrum 0-0-29'] },
  { group: 'BioRhythym spelling variants',                         members: ['BioRhythym', 'BioRhythm', 'Bio Rhythm', 'BioRhythem'] },
]

// ── Build the audit model ─────────────────────────────────────────────────
function buildAudit() {
  const items = parseProgramItems()
  const inv   = parseInventoryNames()

  // Inventory lookup by normalized name.
  const invByNorm = new Map()
  for (const r of inv) {
    const k = normalizeName(r.name)
    if (!invByNorm.has(k)) invByNorm.set(k, [])
    invByNorm.get(k).push(r)
  }
  const invByAlias = new Map()
  for (const r of inv) {
    const k = aliasKey(r.name)
    if (!invByAlias.has(k)) invByAlias.set(k, [])
    invByAlias.get(k).push(r)
  }

  // Group program items by unique product name (verbatim spelling).
  const byProduct = new Map()
  for (const it of items) {
    const name = it.productName
    if (!byProduct.has(name)) {
      byProduct.set(name, {
        productName: name,
        uses: 0,
        dates: [],
        rateValues: new Set(),
        rateUnits: new Set(),
        hasNullRate: false,
        hasNullUnit: false,
        bottleCountOnly: false,
        notesSamples: [],
      })
    }
    const p = byProduct.get(name)
    p.uses++
    if (it.startDate) p.dates.push(it.startDate)
    if (it.rateValue == null) p.hasNullRate = true
    else p.rateValues.add(it.rateValue)
    if (it.rateUnit == null) p.hasNullUnit = true
    else p.rateUnits.add(it.rateUnit)
    if (/\bbottles?\b/i.test(it.notes) && it.rateValue == null) p.bottleCountOnly = true
    if (p.notesSamples.length < 1 && it.notes) p.notesSamples.push(it.notes)
  }

  // Per-product match + flags.
  const products = []
  for (const p of byProduct.values()) {
    const norm  = normalizeName(p.productName)
    const alias = aliasKey(p.productName)
    const exactInv = invByNorm.get(norm) ?? []
    const aliasInv = (invByAlias.get(alias) ?? []).filter(r => !exactInv.includes(r))

    const flags = []
    if (exactInv.length === 0 && aliasInv.length === 0) flags.push('missing-inventory-product')
    if (exactInv.length === 0 && aliasInv.length > 0)   flags.push('inventory-name-mismatch')
    // No product_catalog seed ships on disk — every product is "catalog unknown".
    flags.push('missing-catalog-product')
    // Cost basis: the 0021 refresh sets cost_per_unit = NULL for every
    // program product, so a matched inventory row still lacks cost basis.
    if (exactInv.length > 0 || aliasInv.length > 0) flags.push('missing-cost-basis')
    if (p.hasNullRate || p.hasNullUnit) flags.push('null-rate-or-unit')
    if (p.bottleCountOnly) flags.push('bottle-count-only-total')
    if (p.rateUnits.size > 1) flags.push('inconsistent-unit-across-items')

    const sortedDates = p.dates.slice().sort()
    products.push({
      productName: p.productName,
      normalizedName: norm,
      uses: p.uses,
      firstDate: sortedDates[0] ?? null,
      lastDate: sortedDates[sortedDates.length - 1] ?? null,
      rateValues: Array.from(p.rateValues).sort((a, b) => a - b),
      rateUnits: Array.from(p.rateUnits),
      exactInventoryMatch: exactInv.map(r => r.name),
      aliasInventoryCandidates: aliasInv.map(r => r.name),
      catalogMatch: null,            // no catalog seed on disk to match against
      costBasisFound: false,         // 0021 sets all cost_per_unit = NULL
      flags,
    })
  }
  products.sort((a, b) => a.productName.localeCompare(b.productName))

  // Alias review: which members actually appear in the program.
  const programNamesNorm = new Set(products.map(p => p.normalizedName))
  const aliasReview = ALIAS_REVIEW.map(g => ({
    group: g.group,
    doNotMerge: !!g.doNotMerge,
    presentInProgram: g.members.filter(m => programNamesNorm.has(normalizeName(m))),
  }))

  // Roll-ups.
  const totalUnique = products.length
  const matchedInventory = products.filter(p => p.exactInventoryMatch.length > 0).length
  const aliasOnlyInventory = products.filter(p => p.exactInventoryMatch.length === 0 && p.aliasInventoryCandidates.length > 0).length
  const missingInventory = products.filter(p => p.flags.includes('missing-inventory-product')).length
  const missingCostBasis = products.filter(p => p.flags.includes('missing-cost-basis') || p.flags.includes('missing-inventory-product')).length
  const nullRateUnit = products.filter(p => p.flags.includes('null-rate-or-unit')).length
  const bottleOnly = products.filter(p => p.flags.includes('bottle-count-only-total')).length
  const inconsistentUnit = products.filter(p => p.flags.includes('inconsistent-unit-across-items')).length

  return {
    generatedAt: new Date().toISOString(),
    totalProgramItems: items.length,
    totalUniqueProducts: totalUnique,
    inventoryRowsOnDisk: inv.length,
    rollup: {
      matchedInventory,
      aliasOnlyInventory,
      missingInventory,
      missingCostBasis,
      nullRateUnit,
      bottleOnly,
      inconsistentUnit,
    },
    products,
    aliasReview,
  }
}

// ── Render: console ─────────────────────────────────────────────────────────
function renderConsole(a) {
  const L = []
  L.push('— Crosswinds Greens Program 2026 — Product + Cost Basis Audit')
  L.push('')
  L.push(`Program items parsed:        ${a.totalProgramItems}`)
  L.push(`Unique program products:     ${a.totalUniqueProducts}`)
  L.push(`Inventory rows on disk:      ${a.inventoryRowsOnDisk} (crossroads-gc, migration 0021)`)
  L.push('')
  L.push('Roll-up:')
  L.push(`  matched inventory (exact name):  ${a.rollup.matchedInventory}`)
  L.push(`  alias-only inventory candidates: ${a.rollup.aliasOnlyInventory}`)
  L.push(`  missing inventory product:       ${a.rollup.missingInventory}`)
  L.push(`  missing cost basis:              ${a.rollup.missingCostBasis}`)
  L.push(`  NULL rate/unit:                  ${a.rollup.nullRateUnit}`)
  L.push(`  bottle-count-only total:         ${a.rollup.bottleOnly}`)
  L.push(`  inconsistent unit across items:  ${a.rollup.inconsistentUnit}`)
  L.push('')
  L.push('Per-product (A + B + C):')
  for (const p of a.products) {
    const inv = p.exactInventoryMatch.length
      ? `inv: ${p.exactInventoryMatch.join(', ')}`
      : (p.aliasInventoryCandidates.length ? `inv?: ${p.aliasInventoryCandidates.join(', ')}` : 'inv: —')
    L.push(`  • ${p.productName}`)
    L.push(`      uses=${p.uses}  dates=${p.firstDate ?? '?'}→${p.lastDate ?? '?'}  units=[${p.rateUnits.join(', ') || '—'}]`)
    L.push(`      ${inv}`)
    if (p.flags.length) L.push(`      flags: ${p.flags.join(', ')}`)
  }
  L.push('')
  L.push('Manual alias review (D) — HINTS ONLY, never auto-merged:')
  for (const g of a.aliasReview) {
    const present = g.presentInProgram.length ? g.presentInProgram.join(' / ') : '(none present)'
    L.push(`  • ${g.group}${g.doNotMerge ? '  [DO NOT MERGE]' : ''}`)
    L.push(`      present in program: ${present}`)
  }
  return L.join('\n')
}

// ── Render: markdown doc body (returned, written only with --write-doc) ─────
function renderDoc(a) {
  const md = []
  md.push('# Crosswinds Greens Program 2026 — Product + Cost Basis Audit')
  md.push('')
  md.push('Generated by [`scripts/audit-crosswinds-greens-program-products.mjs`](../scripts/audit-crosswinds-greens-program-products.mjs).')
  md.push('Read-only stewardship report — no database writes, no auto-merges,')
  md.push('no inventory creation. Re-run the script to regenerate.')
  md.push('')
  md.push('## Summary')
  md.push('')
  md.push(`- Program items: **${a.totalProgramItems}**`)
  md.push(`- Unique program products: **${a.totalUniqueProducts}**`)
  md.push(`- Crossroads-gc inventory rows on disk (migration 0021): **${a.inventoryRowsOnDisk}**`)
  md.push(`- Matched inventory (exact name): **${a.rollup.matchedInventory}**`)
  md.push(`- Alias-only inventory candidates: **${a.rollup.aliasOnlyInventory}**`)
  md.push(`- Missing inventory product: **${a.rollup.missingInventory}**`)
  md.push(`- Missing cost basis: **${a.rollup.missingCostBasis}**`)
  md.push(`- Products with NULL rate/unit: **${a.rollup.nullRateUnit}**`)
  md.push(`- Bottle-count-only totals: **${a.rollup.bottleOnly}**`)
  md.push(`- Inconsistent unit across items: **${a.rollup.inconsistentUnit}**`)
  md.push('')
  md.push('> Cost basis lives on `inventory_items.cost_per_unit`. Migration 0021')
  md.push('> inserted every crossroads-gc program product with `cost_per_unit =')
  md.push('> NULL`, so even products that match an inventory row still need a')
  md.push('> cost basis set manually (Inventory → Products → cost field, Phase')
  md.push('> 7J.1). No `product_catalog` seed ships in the repo, so catalog')
  md.push('> matches cannot be computed offline and are left blank.')
  md.push('')
  md.push('## Per-product audit')
  md.push('')
  md.push('| Product | Uses | First | Last | Units | Inventory match | Flags |')
  md.push('|---------|------|-------|------|-------|-----------------|-------|')
  for (const p of a.products) {
    const inv = p.exactInventoryMatch.length
      ? p.exactInventoryMatch.join('; ')
      : (p.aliasInventoryCandidates.length ? `? ${p.aliasInventoryCandidates.join('; ')}` : '—')
    md.push(`| ${p.productName} | ${p.uses} | ${p.firstDate ?? '—'} | ${p.lastDate ?? '—'} | ${p.rateUnits.join(', ') || '—'} | ${inv} | ${p.flags.join(', ')} |`)
  }
  md.push('')
  md.push('## Manual alias review (hints only — never auto-merged)')
  md.push('')
  md.push('The catalog resolver does not auto-merge names. Confirm each pair')
  md.push('manually via Inventory → Link Review before linking.')
  md.push('')
  md.push('| Alias group | Present in program | Note |')
  md.push('|-------------|--------------------|------|')
  for (const g of a.aliasReview) {
    const present = g.presentInProgram.length ? g.presentInProgram.join(' / ') : '(none)'
    md.push(`| ${g.group} | ${present} | ${g.doNotMerge ? '**DO NOT MERGE**' : 'confirm via catalog'} |`)
  }
  md.push('')
  md.push('## Recommended manual cleanup order')
  md.push('')
  md.push('1. **Set cost basis on matched inventory rows.** Every matched')
  md.push('   product has `cost_per_unit = NULL`. Use the vendor figures in')
  md.push('   [crosswinds-greens-program-2026.md](crosswinds-greens-program-2026.md)')
  md.push('   (Vendor spend + rebate reference) as the source numbers.')
  md.push('2. **Create the missing inventory products** flagged')
  md.push('   `missing-inventory-product` via Inventory → Products →')
  md.push('   + Add product manually (Phase 7Q.1).')
  md.push('3. **Resolve alias name mismatches** flagged')
  md.push('   `inventory-name-mismatch` so the program spelling and the')
  md.push('   inventory spelling line up (e.g. Kickdrum vs KickDrum).')
  md.push('4. **Fill NULL rate/unit + bottle-count-only items** so the cost')
  md.push('   estimator can compute (Serata, Indemnify, Segway by-bottle).')
  md.push('5. **Confirm DO-NOT-MERGE pairs** (Ampliphy 18 / Veriphy 18) stay')
  md.push('   separate inventory rows.')
  md.push('')
  return md.join('\n')
}

// ── Main ────────────────────────────────────────────────────────────────────
const audit = buildAudit()

if (AS_JSON) {
  process.stdout.write(JSON.stringify(audit, null, 2) + '\n')
} else {
  process.stdout.write(renderConsole(audit) + '\n')
}

if (WRITE_DOC) {
  writeFileSync(DOC_FILE, renderDoc(audit), 'utf8')
  process.stderr.write(`\nWrote ${DOC_FILE}\n`)
}
