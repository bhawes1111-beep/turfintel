// Phase 7I (1/?) — Spray Program cost-awareness smoke.
//
//   node scripts/smoke-spray-program-cost-awareness.mjs
//
// Locks:
//   - helper exports the spec'd functions
//   - helper has no react/fetch/store imports + no mutation verbs
//   - item-level estimate covers: estimated / missing-cost-basis /
//     missing-quantity / not-comparable-unit
//   - estimate never mutates the input item or inventory row
//   - program summary counts statuses and totals correctly
//   - buildProgramCostSummaries walks all programs (no silent drops)
//   - formatEstimatedCost returns "—" for missing values
//   - planner mounts ProgramCostHeader + ItemCostChip
//   - planner CSS exposes the cost classes
//   - calendar drawer renders Cost-awareness section
//   - no createSpray / recordInventoryUsage / calendar-event writes
//   - no product_catalog mutation route added
//   - no recommendation / judgment vocabulary anywhere

import { readFileSync } from 'fs'
import {
  estimateProgramItemCost,
  buildProgramCostSummary,
  buildProgramCostSummaries,
  formatEstimatedCost,
} from '../src/utils/sprayPrograms/programCostAwareness.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Helper source contracts ────────────────────────────────────────────
console.log('— src/utils/sprayPrograms/programCostAwareness.js (source)')
{
  const src = readFileSync('src/utils/sprayPrograms/programCostAwareness.js', 'utf8')

  for (const name of [
    'estimateProgramItemCost',
    'buildProgramCostSummary',
    'buildProgramCostSummaries',
    'formatEstimatedCost',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  // Purity — strip comments first.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/from\s+['"]react['"]/.test(codeOnly),     'helper does not import react')
  assert(!/fetch\(/.test(codeOnly),                   'helper does not call fetch()')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'helper does not import any *Store module')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'helper code-only contains no write method strings')

  for (const verb of [
    'createSpray', 'recordInventoryUsage', 'createCalendarEvent',
    'setProgramItemCompletedLink',
    'createSprayProgramItem', 'updateSprayProgramItem', 'deleteSprayProgramItem',
    'createSprayProgram', 'updateSprayProgram', 'archiveSprayProgram',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `helper code-only never references ${verb}`)
  }

  for (const word of [
    'recommend','correct','incorrect','pass','fail','score','grade',
    'safe','unsafe','apply now','do not apply','rotate to',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `helper code-only avoids "${word}"`)
  }
}

// ── 2. estimateProgramItemCost — runtime behavior ────────────────────────
console.log('— estimateProgramItemCost runtime behavior')
{
  const inv = [
    { id: 'inv-1', name: 'Daconil',  unit: 'oz/1000 sq ft', costPerUnit: 4.25, quantity: 200 },
    { id: 'inv-2', name: 'Heritage', unit: 'oz/1000 sq ft', costPerUnit: null, quantity: 50 },
    { id: 'inv-3', name: 'Barricade', unit: 'lb/acre',      costPerUnit: 12.00, quantity: 30 },
  ]
  const context = { inventoryProducts: inv }

  // Happy path — same unit on both sides.
  const okItem = {
    id: 'i1', inventoryItemId: 'inv-1',
    rateValue: 3.0, rateUnit: 'oz/1000 sq ft',
  }
  const ok = estimateProgramItemCost(okItem, context)
  assert(ok.status === 'estimated',                         'happy path → estimated')
  assert(Math.abs(ok.estimatedCost - 12.75) < 1e-9,         'estimated cost = 4.25 * 3.0', ok.estimatedCost)
  assert(ok.basis === 'inventory',                          'basis = inventory')
  assert(ok.currency === 'USD',                             'default currency USD')
  assert(/Estimated from inventory/.test(ok.message),       'message references inventory unit cost')

  // No-mutation guarantee.
  const itemSnap = JSON.stringify(okItem)
  const invSnap  = JSON.stringify(inv)
  estimateProgramItemCost(okItem, context)
  assert(JSON.stringify(okItem) === itemSnap, 'estimateProgramItemCost does not mutate the item')
  assert(JSON.stringify(inv) === invSnap,     'estimateProgramItemCost does not mutate inventory')

  // Missing cost basis — no inventoryItemId.
  const noInv = estimateProgramItemCost(
    { id: 'i2', inventoryItemId: null, rateValue: 1.0, rateUnit: 'oz/1000 sq ft' },
    context,
  )
  assert(noInv.status === 'missing-cost-basis', 'no inventory link → missing-cost-basis')
  assert(noInv.estimatedCost == null,            'missing basis has null estimatedCost')

  // Missing cost basis — inventory row has no costPerUnit.
  const noCost = estimateProgramItemCost(
    { id: 'i3', inventoryItemId: 'inv-2', rateValue: 1.0, rateUnit: 'oz/1000 sq ft' },
    context,
  )
  assert(noCost.status === 'missing-cost-basis', 'inv with no costPerUnit → missing-cost-basis')

  // Missing cost basis — id refers to an inventory row not present.
  const stale = estimateProgramItemCost(
    { id: 'i4', inventoryItemId: 'inv-ghost', rateValue: 1.0, rateUnit: 'oz/1000 sq ft' },
    context,
  )
  assert(stale.status === 'missing-cost-basis', 'unknown inventoryItemId → missing-cost-basis')

  // Missing quantity — rateValue null or zero or negative.
  const missingQty = estimateProgramItemCost(
    { id: 'i5', inventoryItemId: 'inv-1', rateValue: null, rateUnit: 'oz/1000 sq ft' },
    context,
  )
  assert(missingQty.status === 'missing-quantity', 'null rateValue → missing-quantity')

  const zeroQty = estimateProgramItemCost(
    { id: 'i6', inventoryItemId: 'inv-1', rateValue: 0, rateUnit: 'oz/1000 sq ft' },
    context,
  )
  assert(zeroQty.status === 'missing-quantity', '0 rateValue → missing-quantity')

  const negQty = estimateProgramItemCost(
    { id: 'i7', inventoryItemId: 'inv-1', rateValue: -2, rateUnit: 'oz/1000 sq ft' },
    context,
  )
  assert(negQty.status === 'missing-quantity', 'negative rateValue → missing-quantity')

  // Not-comparable-unit — planned unit differs from inventory unit.
  const unitMismatch = estimateProgramItemCost(
    { id: 'i8', inventoryItemId: 'inv-3', rateValue: 1.0, rateUnit: 'oz/1000 sq ft' },
    context,
  )
  assert(unitMismatch.status === 'not-comparable-unit', 'mismatched units → not-comparable-unit')
  assert(unitMismatch.estimatedCost == null,             'not-comparable has null estimatedCost')

  // Not-comparable-unit — missing planned rateUnit.
  const noPlannedUnit = estimateProgramItemCost(
    { id: 'i9', inventoryItemId: 'inv-1', rateValue: 1.0, rateUnit: '' },
    context,
  )
  assert(noPlannedUnit.status === 'not-comparable-unit', 'missing rateUnit → not-comparable-unit')

  // Whitespace + casing normalization should NOT cause a false mismatch.
  const normalized = estimateProgramItemCost(
    { id: 'i10', inventoryItemId: 'inv-1', rateValue: 2.0, rateUnit: '  OZ/1000 SQ FT  ' },
    context,
  )
  assert(normalized.status === 'estimated', 'unit normalization treats case/whitespace as equal')
  assert(Math.abs(normalized.estimatedCost - 8.5) < 1e-9, 'normalized estimate = 4.25 * 2.0')

  // Defensive — null item.
  const noItem = estimateProgramItemCost(null, context)
  assert(noItem.status === 'missing-cost-basis', 'null item → missing-cost-basis')

  // Defensive — null context.
  const noCtx = estimateProgramItemCost(okItem, null)
  assert(noCtx.status === 'missing-cost-basis', 'null context → missing-cost-basis')
}

// ── 3. buildProgramCostSummary — runtime behavior ─────────────────────────
console.log('— buildProgramCostSummary runtime behavior')
{
  const inv = [
    { id: 'inv-1', unit: 'oz/1000 sq ft', costPerUnit: 4.25 },
    { id: 'inv-2', unit: 'oz/1000 sq ft', costPerUnit: null },
    { id: 'inv-3', unit: 'lb/acre',       costPerUnit: 12.00 },
  ]
  const context = { inventoryProducts: inv }

  const program = { id: 'p1', name: 'Greens' }
  const items = [
    { id: 'i1', inventoryItemId: 'inv-1', rateValue: 2,    rateUnit: 'oz/1000 sq ft' }, // estimated → 8.50
    { id: 'i2', inventoryItemId: 'inv-1', rateValue: 3.25, rateUnit: 'oz/1000 sq ft' }, // estimated → 13.8125 → 13.81
    { id: 'i3', inventoryItemId: 'inv-2', rateValue: 1,    rateUnit: 'oz/1000 sq ft' }, // missing-cost-basis
    { id: 'i4', inventoryItemId: 'inv-1', rateValue: null, rateUnit: 'oz/1000 sq ft' }, // missing-quantity
    { id: 'i5', inventoryItemId: 'inv-3', rateValue: 1,    rateUnit: 'oz/1000 sq ft' }, // not-comparable-unit
    { id: 'i6', inventoryItemId: null,    rateValue: 1,    rateUnit: 'oz/1000 sq ft' }, // missing-cost-basis
  ]

  // No-mutation guards.
  const itemsSnap = JSON.stringify(items)
  const invSnap   = JSON.stringify(inv)
  const summary = buildProgramCostSummary(program, items, context)
  assert(JSON.stringify(items) === itemsSnap, 'summary does not mutate items')
  assert(JSON.stringify(inv) === invSnap,     'summary does not mutate inventory')

  assert(summary.programId === 'p1',          'summary carries programId')
  assert(summary.totalItems === 6,            'summary counts total items', summary.totalItems)
  assert(summary.estimatedItems === 2,        'summary counts estimated items', summary.estimatedItems)
  assert(summary.missingCostBasis === 2,      'summary counts missing-cost-basis', summary.missingCostBasis)
  assert(summary.missingQuantity === 1,       'summary counts missing-quantity', summary.missingQuantity)
  assert(summary.notComparableUnits === 1,    'summary counts not-comparable-unit', summary.notComparableUnits)

  // Total = round(8.50 + 13.8125) = 22.31 (each estimate rounded to cents).
  // 4.25 * 2 = 8.50; 4.25 * 3.25 = 13.8125 → 13.81; total = 22.31.
  assert(Math.abs(summary.estimatedTotal - 22.31) < 1e-9,
    'summary estimatedTotal sums rounded item estimates', summary.estimatedTotal)
  assert(summary.currency === 'USD', 'summary currency USD')

  // Items array carries per-row estimates.
  assert(Array.isArray(summary.items) && summary.items.length === 6,
    'summary.items aligns with input length')
  assert(summary.items[0].estimate.status === 'estimated',
    'summary.items[0] is estimated')
  assert(summary.items[0].itemId === 'i1', 'summary.items[0].itemId preserved')
}

// ── 4. buildProgramCostSummaries — runtime ────────────────────────────────
console.log('— buildProgramCostSummaries runtime')
{
  const inv = [
    { id: 'inv-1', unit: 'oz/1000 sq ft', costPerUnit: 5.0 },
  ]
  const programs = [
    { id: 'p1', name: 'A' },
    { id: 'p2', name: 'B' },
    null,                             // skipped silently
  ]
  const itemsByProgramId = {
    p1: [{ id: 'i1', inventoryItemId: 'inv-1', rateValue: 1, rateUnit: 'oz/1000 sq ft' }],
    // p2 intentionally absent → lazy cache miss → summary against [].
  }
  const summaries = buildProgramCostSummaries(programs, itemsByProgramId, { inventoryProducts: inv })
  assert(summaries.length === 2,                          'null programs are skipped')
  assert(summaries[0].programId === 'p1',                 'first summary is p1')
  assert(summaries[0].estimatedItems === 1,               'p1 has 1 estimated item')
  assert(summaries[1].programId === 'p2',                 'second summary is p2 (lazy miss)')
  assert(summaries[1].totalItems === 0,                   'p2 cache miss → 0 items')
  assert(summaries[1].estimatedTotal === 0,               'p2 total = 0')
}

// ── 5. formatEstimatedCost — runtime ──────────────────────────────────────
console.log('— formatEstimatedCost runtime')
{
  assert(formatEstimatedCost(null) === '—',           'null → em-dash')
  assert(formatEstimatedCost(undefined) === '—',      'undefined → em-dash')
  assert(formatEstimatedCost(NaN) === '—',            'NaN → em-dash')
  const fmt = formatEstimatedCost(12.5)
  assert(typeof fmt === 'string' && fmt.length > 0 && /12\.50/.test(fmt),
    `formatted "$12.50" contains 12.50 (got "${fmt}")`)
}

// ── 6. Planner UI wiring ──────────────────────────────────────────────────
console.log('— SprayProgramPlanner UI wiring')
{
  const src = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.jsx', 'utf8')

  assert(/from\s+['"]\.\.\/\.\.\/\.\.\/utils\/sprayPrograms\/programCostAwareness['"]/.test(src),
    'planner imports programCostAwareness helpers')
  for (const sym of ['estimateProgramItemCost', 'buildProgramCostSummary', 'formatEstimatedCost']) {
    assert(new RegExp(`\\b${sym}\\b`).test(src), `planner references ${sym}`)
  }

  assert(/function\s+ProgramCostHeader\s*\(/.test(src), 'planner defines ProgramCostHeader')
  assert(/function\s+ItemCostChip\s*\(/.test(src),      'planner defines ItemCostChip')
  assert(/<ProgramCostHeader\b/.test(src),              'planner mounts <ProgramCostHeader>')
  assert(/<ItemCostChip\b/.test(src),                   'planner mounts <ItemCostChip>')

  // Boundary copy verbatim.
  const norm = src.replace(/\s+/g, ' ')
  for (const phrase of [
    'Cost awareness is an estimate.',
    'Planning estimates do not create budget entries.',
    'Inventory is not deducted from planned items.',
    'Missing cost basis means no inventory cost is available.',
  ]) {
    assert(norm.includes(phrase), `boundary copy verbatim: "${phrase}"`)
  }

  // No write call sites in the cost surface — code-only scan.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  // The planner does (legitimately) reference some write verbs for its
  // existing edit flows — those are scoped to non-cost code. Constrain
  // the assertion to the cost-component scope by checking the cost
  // helpers' source only.
  const costSlice = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .match(/function\s+(?:ProgramCostHeader|ItemCostChip|labelForStatus)\s*\([\s\S]*?(?=function\s+\w+\s*\(|$)/g)
  assert(costSlice && costSlice.length >= 2,
    'cost components are defined as standalone functions')
  for (const slice of costSlice ?? []) {
    for (const verb of [
      'createSpray', 'recordInventoryUsage', 'createCalendarEvent',
      'setProgramItemCompletedLink',
      'createSprayProgramItem', 'updateSprayProgramItem', 'deleteSprayProgramItem',
      'createSprayProgram', 'updateSprayProgram', 'archiveSprayProgram',
    ]) {
      assert(!new RegExp(`\\b${verb}\\b`).test(slice),
        `cost component never references ${verb}`)
    }
    assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(slice),
      'cost component issues no direct POST/PATCH/DELETE')
    assert(!/\/api\/product-catalog\b/.test(slice),
      'cost component never references /api/product-catalog')
  }

  // No new recommendation/judgment language in the planner.
  // (The planner already passes its own vocabulary lock in earlier
  // smokes — we just ensure this commit didn't introduce new words.)
  for (const word of [
    'recommend','correct','incorrect','grade',
    'safe','unsafe','apply now','do not apply','rotate to',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `no "${word}" wording in planner code`)
  }
}

// ── 7. Planner CSS contracts ──────────────────────────────────────────────
console.log('— SprayProgramPlanner.module.css cost classes')
{
  const css = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.module.css', 'utf8')
  for (const cls of [
    'costHeader', 'costHeaderChips', 'costBoundaryNote',
    'costChip', 'costChipLabel', 'costChipEstimate', 'costChipWarn',
    'itemCostRow', 'itemCostNote',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
}

// ── 8. Calendar drawer wiring ─────────────────────────────────────────────
console.log('— ProgramCalendarItemDrawer wires cost-awareness section')
{
  const drawer = readFileSync('src/pages/Spray/tabs/components/ProgramCalendarItemDrawer.jsx', 'utf8')
  assert(/programCostAwareness/.test(drawer),
    'drawer imports programCostAwareness')
  assert(/estimateProgramItemCost/.test(drawer),
    'drawer references estimateProgramItemCost')
  assert(/formatEstimatedCost/.test(drawer),
    'drawer references formatEstimatedCost')
  assert(/Cost awareness/.test(drawer),
    'drawer renders "Cost awareness" section title')

  const norm = drawer.replace(/\s+/g, ' ')
  for (const phrase of [
    'Cost awareness is an estimate.',
    'Planning estimates do not create budget entries.',
    'Inventory is not deducted from planned items.',
    'Missing cost basis means no inventory cost is available.',
  ]) {
    assert(norm.includes(phrase), `drawer carries boundary copy: "${phrase}"`)
  }

  // Drawer remains read-only — no write verbs.
  const codeOnly = drawer
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'createSpray', 'recordInventoryUsage', 'createCalendarEvent',
    'setProgramItemCompletedLink',
    'createSprayProgramItem', 'updateSprayProgramItem', 'deleteSprayProgramItem',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `drawer code-only never references ${verb}`)
  }
}

// ── 9. Forbidden-write invariants across surfaces ─────────────────────────
console.log('— Phase 7F.4 completed-link route still wired (regression guard)')
{
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
