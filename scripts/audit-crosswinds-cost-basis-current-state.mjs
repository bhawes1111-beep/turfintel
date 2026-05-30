// Phase 7X.4 — Crosswinds cost-basis CURRENT-STATE audit.
//
//   node scripts/audit-crosswinds-cost-basis-current-state.mjs            (console)
//   node scripts/audit-crosswinds-cost-basis-current-state.mjs --json     (raw JSON)
//   node scripts/audit-crosswinds-cost-basis-current-state.mjs --write-doc (write md)
//
// READ-ONLY stewardship report over the live production state. Pulls:
//   - /api/spray-programs?status=active     (public GET)
//   - /api/spray-programs/{id}/items        (public GET)
//   - /api/inventory                        (public GET; course-scoped)
//   - inventory_cost_basis_audit            (SELECT via wrangler d1)
// Uses the existing programCostAwareness estimator to classify each
// program item. Never PATCH/POST/PUT/DELETE; never writes D1; only
// writes the doc when --write-doc is explicitly passed.

import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import {
  estimateProgramItemCost,
  resolveProgramArea,
} from '../src/utils/sprayPrograms/programCostAwareness.js'

const PROGRAM_ID = 'sp-crosswinds-greens-2026'
const DOC_FILE   = 'docs/crosswinds-cost-basis-current-state.md'

const args = process.argv.slice(2)
const AS_JSON   = args.includes('--json')
const WRITE_DOC = args.includes('--write-doc')

// ── Env / API helpers ─────────────────────────────────────────────────────
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

// ── D1 SELECT (read-only) ──────────────────────────────────────────────────
// Used for the audit table since there is no public list endpoint for
// it. We pass --json and parse the wrangler output. NO mutation here.
function selectFromD1(sql) {
  if (!/^\s*SELECT\b/i.test(sql)) {
    throw new Error('selectFromD1 only allows SELECT statements')
  }
  // Use --command (which returns actual row data — --file only returns
  // bookkeeping). Quote the SQL for the platform shell. The SQL itself
  // is gated above to SELECT only, so it can never run a mutation even
  // if a quoting bug allowed an unexpected split.
  let out = ''
  try {
    const quoted = process.platform === 'win32'
      // cmd.exe: wrap in double quotes, escape internal double quotes.
      ? `"${sql.replace(/"/g, '""')}"`
      // posix: single quotes, escape inner single quotes.
      : `'${sql.replace(/'/g, `'\\''`)}'`
    out = execSync(
      `npx wrangler d1 execute turfintel-db --remote --json --command ${quoted}`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (e) {
    process.stderr.write('(warning: d1 SELECT failed — audit table sections will be empty)\n')
    return []
  }
  try {
    const start = out.indexOf('[')
    if (start < 0) return []
    const j = JSON.parse(out.slice(start))
    return (Array.isArray(j) ? j[0] : j)?.results ?? []
  } catch { return [] }
}

// ── Build the audit model ─────────────────────────────────────────────────
function normName(n) { return n == null ? '' : String(n).trim().toLowerCase() }
function roundCents(n) {
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

async function buildAudit() {
  if (!API) throw new Error('TURFINTEL_API_URL not set (in env or .env.local).')

  const [programs, programItems, inventory] = await Promise.all([
    getJson('/api/spray-programs?status=active'),
    getJson(`/api/spray-programs/${PROGRAM_ID}/items`),
    getJson('/api/inventory'),
  ])
  const program   = (Array.isArray(programs) ? programs : []).find(p => p?.id === PROGRAM_ID) ?? null
  const items     = Array.isArray(programItems) ? programItems : []
  const inventoryAll = Array.isArray(inventory) ? inventory : []
  // Only products are in scope for cost basis (parts/fuel excluded).
  const invList = inventoryAll.filter(i => i && i.kind !== 'part' && i.kind !== 'fuel')

  const area = resolveProgramArea({ program })

  // 1. Inventory rows with cost basis on file.
  const costed = invList.filter(i => i.costPerUnit != null && Number(i.costPerUnit) > 0)
  // 2. Build a program-item index by normalized product_name so we can
  //    count uses per inventory item.
  const itemsByName = new Map()
  for (const it of items) {
    const n = normName(it?.productName)
    if (!n) continue
    if (!itemsByName.has(n)) itemsByName.set(n, [])
    itemsByName.get(n).push(it)
  }

  // 3. Estimator status per program item.
  const ctx = { inventoryProducts: invList, program }
  const perItem = items.map(it => ({ item: it, est: estimateProgramItemCost(it, ctx) }))

  // Aggregate estimator totals + per-product contribution.
  let estimatedItems = 0
  let estimatedTotal = 0
  const contributingByName = new Map() // name → { uses, totalCost }
  const statusCounts = {
    estimated: 0,
    'cost-basis-found-unit-conversion-needed': 0,
    'area-needed-for-estimate': 0,
    'unsupported-rate-unit': 0,
    'unsupported-cost-unit': 0,
    'missing-cost-basis': 0,
    'missing-quantity': 0,
    'not-comparable-unit': 0,
  }
  for (const { item, est } of perItem) {
    statusCounts[est.status] = (statusCounts[est.status] ?? 0) + 1
    if (est.status === 'estimated' && Number.isFinite(est.estimatedCost)) {
      estimatedItems++
      estimatedTotal += est.estimatedCost
      const n = normName(item.productName)
      const row = contributingByName.get(n) ?? { name: item.productName, uses: 0, totalCost: 0 }
      row.uses++
      row.totalCost += est.estimatedCost
      contributingByName.set(n, row)
    }
  }
  estimatedTotal = roundCents(estimatedTotal)

  // 4. Costed + contributing vs costed + not-contributing.
  // "not-contributing" splits into two stewardship signals:
  //   - off-program: the inventory name doesn't match any program item
  //     (e.g. 13-2-13 — costed but never used by Crosswinds)
  //   - in-program-blocked: the name does match, but no item resolves
  //     to 'estimated' (typically conversion-needed: weight cost vs
  //     volume rate, like Manzate Max)
  const costedReport = costed.map(inv => {
    const n = normName(inv.name)
    const programItemsForInv = itemsByName.get(n) ?? []
    const inProgram = programItemsForInv.length > 0
    const contrib = contributingByName.get(n)
    const contribution = contrib ? roundCents(contrib.totalCost) : 0
    let stewardship = null
    if (contribution > 0) stewardship = 'contributing'
    else if (!inProgram)  stewardship = 'off-program'
    else                  stewardship = 'in-program-blocked'
    return {
      id: inv.id,
      name: inv.name,
      costPerUnit: inv.costPerUnit,
      costUnit:    inv.costUnit ?? inv.unit ?? null,
      costSource:  inv.costSource ?? null,
      costUpdatedAt: inv.costUpdatedAt ?? null,
      inProgram,
      uses: programItemsForInv.length,
      estimatedContribution: contribution,
      stewardship,
    }
  })
  const contributing      = costedReport.filter(r => r.stewardship === 'contributing')
  const costedNotContrib  = costedReport.filter(r => r.stewardship !== 'contributing')

  // 5. Still missing cost basis — bucket by estimator status across
  //    program items, then dedupe by inventory id (or by program name
  //    when no inventory match).
  const missingBuckets = {
    exactMissing:    [],   // missing-cost-basis: no inventory row OR inventory has no cost
    conversionNeeded: [],  // cost-basis-found-unit-conversion-needed
    areaNeeded:      [],
    unsupportedUnit: [],
    nameReconcile:   [],   // heuristic: known names (e.g. Prothioconazole) + status missing
    standalonePrice: [],   // heuristic: bundled / by-bottle in the doc, by name
  }
  // Hints reused from the in-app tab.
  const STANDALONE_HINTS = new Set([
    'appear', 'appear ii', 'ascernity', 'daconil action', 'secure action',
    'fosetyl al', 'segway',
  ])
  const NAME_RECONCILE_HINTS = new Set(['prothioconazole'])
  const seenByName = new Set()
  for (const { item, est } of perItem) {
    const productName = item.productName ?? '(unnamed item)'
    const norm = normName(productName)
    if (seenByName.has(norm)) continue   // one entry per unique program name
    let bucket = null
    if (est.status === 'cost-basis-found-unit-conversion-needed') bucket = 'conversionNeeded'
    else if (est.status === 'area-needed-for-estimate') bucket = 'areaNeeded'
    else if (est.status === 'unsupported-rate-unit' || est.status === 'unsupported-cost-unit') bucket = 'unsupportedUnit'
    else if (est.status === 'missing-cost-basis') {
      if (NAME_RECONCILE_HINTS.has(norm)) bucket = 'nameReconcile'
      else if (STANDALONE_HINTS.has(norm)) bucket = 'standalonePrice'
      else bucket = 'exactMissing'
    }
    if (bucket) {
      seenByName.add(norm)
      missingBuckets[bucket].push({
        productName,
        uses: itemsByName.get(norm)?.length ?? 0,
        rateUnit: item.rateUnit ?? null,
        status:   est.status,
        message:  est.message ?? null,
      })
    }
  }
  for (const k of Object.keys(missingBuckets)) {
    missingBuckets[k].sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0))
  }

  // 6. Audit table (read-only SELECT). Bucket by change_source + count
  //    no-op rows (null → null cost) which are stewardship signals.
  const auditRows = selectFromD1(
    "SELECT inventory_item_id, previous_cost_per_unit, new_cost_per_unit, " +
    "new_cost_unit, new_cost_source, change_source, changed_at, changed_by " +
    "FROM inventory_cost_basis_audit ORDER BY changed_at DESC LIMIT 200;"
  )
  const auditByChangeSource = {}
  let auditNoOps = 0
  for (const r of auditRows) {
    const s = r.change_source ?? 'unknown'
    auditByChangeSource[s] = (auditByChangeSource[s] ?? 0) + 1
    if (r.previous_cost_per_unit == null && r.new_cost_per_unit == null) auditNoOps++
  }
  const recentApplied = auditRows
    .filter(r => r.new_cost_per_unit != null)
    .slice(0, 10)
    .map(r => ({
      inventoryItemId: r.inventory_item_id,
      newCost:   r.new_cost_per_unit,
      newUnit:   r.new_cost_unit,
      changeSource: r.change_source,
      changedAt: r.changed_at,
    }))

  // 7. Top estimated contributions (the products driving program cost).
  const topContributors = Array.from(contributingByName.values())
    .map(r => ({ ...r, totalCost: roundCents(r.totalCost) }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 10)

  return {
    generatedAt: new Date().toISOString(),
    program: {
      id: program?.id ?? PROGRAM_ID,
      name: program?.name ?? null,
      areaAcres: area.acres,
      areaSource: area.source,
    },
    totals: {
      programItems: items.length,
      inventoryRowsInScope: invList.length,
      inventoryWithCostBasis: costed.length,
      contributing: contributing.length,
      costedNotContributing: costedNotContrib.length,
      estimatedItems,
      estimatedTotal,
      missingCostBasis: statusCounts['missing-cost-basis'],
      conversionNeeded: statusCounts['cost-basis-found-unit-conversion-needed'],
      areaNeeded:       statusCounts['area-needed-for-estimate'],
      unsupportedUnit:  (statusCounts['unsupported-rate-unit'] ?? 0) + (statusCounts['unsupported-cost-unit'] ?? 0),
    },
    inventoryWithCost: costedReport.sort((a, b) => a.name.localeCompare(b.name)),
    contributing:      contributing.sort((a, b) => b.estimatedContribution - a.estimatedContribution),
    costedNotContributing: costedNotContrib,
    missingBuckets,
    topContributors,
    audit: {
      totalRows: auditRows.length,
      byChangeSource: auditByChangeSource,
      noOpRows: auditNoOps,
      recentApplied,
    },
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
  L.push('— Crosswinds Greens Program 2026 — cost-basis CURRENT-STATE audit')
  L.push('')
  L.push(`Program:                       ${a.program.name ?? a.program.id}`)
  L.push(`Area basis:                    ${a.program.areaAcres != null ? a.program.areaAcres + ' acres (' + a.program.areaSource + ')' : 'NOT AVAILABLE'}`)
  L.push('')
  L.push('Totals:')
  L.push(`  program items:               ${a.totals.programItems}`)
  L.push(`  inventory rows in scope:     ${a.totals.inventoryRowsInScope}`)
  L.push(`  with cost basis:             ${a.totals.inventoryWithCostBasis}`)
  L.push(`     of which CONTRIBUTING:    ${a.totals.contributing}`)
  L.push(`     of which NOT contributing: ${a.totals.costedNotContributing}`)
  L.push(`  estimated items:             ${a.totals.estimatedItems}`)
  L.push(`  estimated total:             ${fmtMoney(a.totals.estimatedTotal)}`)
  L.push(`  missing cost basis:          ${a.totals.missingCostBasis}`)
  L.push(`  conversion needed:           ${a.totals.conversionNeeded}`)
  L.push(`  area needed:                 ${a.totals.areaNeeded}`)
  L.push(`  unsupported unit:            ${a.totals.unsupportedUnit}`)
  L.push('')
  L.push('Top estimated contributors:')
  for (const c of a.topContributors) {
    L.push(`  • ${c.name}: ${c.uses} use${c.uses !== 1 ? 's' : ''} → ${fmtMoney(c.totalCost)}`)
  }
  L.push('')
  L.push(`Costed but NOT contributing (${a.costedNotContributing.length}):`)
  const offProgram     = a.costedNotContributing.filter(r => r.stewardship === 'off-program')
  const inProgBlocked  = a.costedNotContributing.filter(r => r.stewardship === 'in-program-blocked')
  if (offProgram.length) {
    L.push(`  off-program (no program item by this name — ${offProgram.length}):`)
    for (const r of offProgram) L.push(`     • ${r.name} ($${r.costPerUnit}/${r.costUnit}, ${r.costSource})`)
  }
  if (inProgBlocked.length) {
    L.push(`  in-program but blocked (${inProgBlocked.length}) — typically volume↔weight conversion needed:`)
    for (const r of inProgBlocked) L.push(`     • ${r.name} ($${r.costPerUnit}/${r.costUnit}) — ${r.uses} program use${r.uses !== 1 ? 's' : ''}`)
  }
  L.push('')
  L.push('Still missing cost basis — buckets:')
  L.push(`  exact missing:               ${a.missingBuckets.exactMissing.length} unique products`)
  L.push(`  conversion needed:           ${a.missingBuckets.conversionNeeded.length}`)
  L.push(`  area needed:                 ${a.missingBuckets.areaNeeded.length}`)
  L.push(`  unsupported unit:            ${a.missingBuckets.unsupportedUnit.length}`)
  L.push(`  standalone price needed:     ${a.missingBuckets.standalonePrice.length}`)
  L.push(`  name reconciliation needed:  ${a.missingBuckets.nameReconcile.length}`)
  L.push('')
  L.push('Top 10 missing (by program use):')
  for (const r of a.missingBuckets.exactMissing.slice(0, 10)) {
    L.push(`  • ${r.productName} (${r.uses} use${r.uses !== 1 ? 's' : ''}, ${r.rateUnit ?? '?'})`)
  }
  L.push('')
  L.push('Audit table (Phase 7M.1):')
  L.push(`  total rows (last 200 fetched): ${a.audit.totalRows}`)
  L.push(`  by change_source:`)
  for (const [k, v] of Object.entries(a.audit.byChangeSource)) L.push(`     ${k}: ${v}`)
  L.push(`  no-op rows (null → null):    ${a.audit.noOpRows}`)
  L.push('')
  L.push('Recent applied (last 10 non-null new cost):')
  for (const r of a.audit.recentApplied) {
    L.push(`  • ${r.changedAt}  ${r.inventoryItemId}  $${r.newCost}/${r.newUnit}  [${r.changeSource}]`)
  }
  return L.join('\n')
}

function renderDoc(a) {
  const md = []
  md.push('# Crosswinds Greens Program 2026 — Cost Basis Current State')
  md.push('')
  md.push('Generated by [`scripts/audit-crosswinds-cost-basis-current-state.mjs`](../scripts/audit-crosswinds-cost-basis-current-state.mjs).')
  md.push('Read-only stewardship report over the live production state at the')
  md.push('time of generation. Re-run the script to refresh.')
  md.push('')
  md.push(`- Generated at: \`${a.generatedAt}\``)
  md.push(`- Program: **${a.program.name ?? a.program.id}**`)
  md.push(`- Area basis: **${a.program.areaAcres != null ? a.program.areaAcres + ' acres' : 'NOT AVAILABLE'}**${a.program.areaSource ? ` (${a.program.areaSource})` : ''}`)
  md.push('')
  md.push('## Totals')
  md.push('')
  md.push(`- Program items: **${a.totals.programItems}**`)
  md.push(`- Inventory rows in scope: **${a.totals.inventoryRowsInScope}**`)
  const offProg     = a.costedNotContributing.filter(r => r.stewardship === 'off-program').length
  const inProgBlock = a.costedNotContributing.filter(r => r.stewardship === 'in-program-blocked').length
  md.push(`- Inventory with cost basis: **${a.totals.inventoryWithCostBasis}**`)
  md.push(`  - contributing to estimates: **${a.totals.contributing}**`)
  md.push(`  - not contributing (off-program): **${offProg}**`)
  md.push(`  - not contributing (in-program but blocked, e.g. volume↔weight): **${inProgBlock}**`)
  md.push(`- Estimated items: **${a.totals.estimatedItems}**`)
  md.push(`- **Estimated total: ${fmtMoney(a.totals.estimatedTotal)}**`)
  md.push(`- Missing cost basis: **${a.totals.missingCostBasis}**`)
  md.push(`- Conversion needed: **${a.totals.conversionNeeded}**`)
  md.push(`- Unsupported unit: **${a.totals.unsupportedUnit}**`)
  md.push('')
  md.push('## Inventory with cost basis')
  md.push('')
  md.push('| Name | Cost | Source | Updated | In program? | Uses | Est. contribution |')
  md.push('|------|------|--------|---------|-------------|------|-------------------|')
  for (const r of a.inventoryWithCost) {
    md.push(`| ${r.name} | $${r.costPerUnit}/${r.costUnit ?? '—'} | ${r.costSource ?? '—'} | ${r.costUpdatedAt ?? '—'} | ${r.inProgram ? 'yes' : 'no'} | ${r.uses} | ${fmtMoney(r.estimatedContribution)} |`)
  }
  md.push('')
  md.push('## Top contributors')
  md.push('')
  md.push('| Product | Uses | Total |')
  md.push('|---------|------|-------|')
  for (const c of a.topContributors) md.push(`| ${c.name} | ${c.uses} | ${fmtMoney(c.totalCost)} |`)
  md.push('')
  if (a.costedNotContributing.length) {
    md.push('## Costed but not contributing (stewardship)')
    md.push('')
    md.push('These inventory rows carry a cost basis but don\'t match a program item by exact name. They may be name-mismatches, or simply off-program purchases.')
    md.push('')
    for (const r of a.costedNotContributing) {
      md.push(`- **${r.name}** — $${r.costPerUnit}/${r.costUnit ?? '—'} (${r.costSource ?? '—'})`)
    }
    md.push('')
  }
  md.push('## Still missing cost basis — buckets')
  md.push('')
  for (const [label, key] of [
    ['Exact missing',           'exactMissing'],
    ['Conversion needed',       'conversionNeeded'],
    ['Area needed',             'areaNeeded'],
    ['Unsupported unit',        'unsupportedUnit'],
    ['Standalone price needed', 'standalonePrice'],
    ['Name reconciliation',     'nameReconcile'],
  ]) {
    const rows = a.missingBuckets[key]
    if (!rows.length) continue
    md.push(`### ${label} (${rows.length})`)
    md.push('')
    md.push('| Product | Uses | Rate unit | Status |')
    md.push('|---------|------|-----------|--------|')
    for (const r of rows) md.push(`| ${r.productName} | ${r.uses} | ${r.rateUnit ?? '—'} | ${r.status} |`)
    md.push('')
  }
  md.push('## Audit table (Phase 7M.1)')
  md.push('')
  md.push(`- Total rows (last 200 fetched): **${a.audit.totalRows}**`)
  md.push('- By change_source:')
  for (const [k, v] of Object.entries(a.audit.byChangeSource)) md.push(`  - ${k}: ${v}`)
  md.push(`- No-op rows (null → null): **${a.audit.noOpRows}**`)
  md.push('')
  md.push('### Recent applied (last 10)')
  md.push('')
  md.push('| Changed at | Inventory id | New cost | Change source |')
  md.push('|------------|--------------|----------|---------------|')
  for (const r of a.audit.recentApplied) {
    md.push(`| ${r.changedAt} | ${r.inventoryItemId} | $${r.newCost}/${r.newUnit ?? '—'} | ${r.changeSource} |`)
  }
  md.push('')
  return md.join('\n')
}

// ── Main ────────────────────────────────────────────────────────────────────
const audit = await buildAudit()

if (AS_JSON) {
  process.stdout.write(JSON.stringify(audit, null, 2) + '\n')
} else {
  process.stdout.write(renderConsole(audit) + '\n')
}

if (WRITE_DOC) {
  writeFileSync(DOC_FILE, renderDoc(audit), 'utf8')
  process.stderr.write(`\nWrote ${DOC_FILE}\n`)
}
