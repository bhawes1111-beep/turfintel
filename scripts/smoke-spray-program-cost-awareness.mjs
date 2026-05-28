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
  normalizeProgramRateUnit,
  estimatePlannedQuantityFromRate,
  resolveProgramArea,
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

  // Phase 7V.1 — cost on file but cost unit is a per-area unit (lb/acre,
  // not gal or lb) → cannot convert safely → 'unsupported-cost-unit'.
  // (inv-3 Barricade has costUnit lb/acre.) Never $0, never hidden.
  const unitMismatch = estimateProgramItemCost(
    { id: 'i8', inventoryItemId: 'inv-3', rateValue: 1.0, rateUnit: 'oz/1000 sq ft' },
    context,
  )
  assert(unitMismatch.status === 'unsupported-cost-unit',
    'cost on file + non-gal/lb cost unit → unsupported-cost-unit', unitMismatch.status)
  assert(unitMismatch.estimatedCost == null, 'unsupported-cost-unit has null estimatedCost')

  // Cost on file + missing planned rateUnit → conversion-needed.
  const noPlannedUnit = estimateProgramItemCost(
    { id: 'i9', inventoryItemId: 'inv-1', rateValue: 1.0, rateUnit: '' },
    context,
  )
  assert(noPlannedUnit.status === 'cost-basis-found-unit-conversion-needed',
    'cost on file + missing rateUnit → cost-basis-found-unit-conversion-needed')

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

  // ── Phase 7U.4 — name-match fallback (NULL inventoryItemId) ──────────────
  // Seeded/imported program items carry no inventory link. The estimator
  // falls back to an EXACT product_name match within the same course.
  const nameCtx = { inventoryProducts: [
    { id: 'inv-cw', name: 'Pendant SC', unit: 'gal', costUnit: 'gal', costPerUnit: 574.6, courseId: 'crossroads-gc' },
    { id: 'inv-other', name: 'Pendant SC', unit: 'gal', costUnit: 'gal', costPerUnit: 999, courseId: 'other-course' },
  ] }
  // Same course, comparable unit → estimated via name.
  const byNameEst = estimateProgramItemCost(
    { id: 'n1', productName: 'Pendant SC', courseId: 'crossroads-gc', rateValue: 2, rateUnit: 'gal' },
    nameCtx,
  )
  assert(byNameEst.status === 'estimated' && byNameEst.matchedVia === 'name',
    'NULL link + exact name + same course + comparable unit → estimated via name', byNameEst.status)
  assert(Math.abs(byNameEst.estimatedCost - 1149.2) < 1e-9, 'name-matched estimate = 574.6 * 2')

  // Phase 7V.1 — same course, per-area rate (oz/1000 sq ft) vs gal cost,
  // WITH area available → SAFE conversion → estimated via name.
  // 1.46 oz/1000 sq ft × (174240/1000) = 254.4 floz ÷ 128 = 1.9875 gal.
  const nameCtxArea = {
    inventoryProducts: nameCtx.inventoryProducts,
    program: { id: 'p', notes: 'Default acres: ~4 acres.' },
  }
  const byNameConv = estimateProgramItemCost(
    { id: 'n2', productName: 'Pendant SC', courseId: 'crossroads-gc', rateValue: 1.46, rateUnit: 'oz/1000 sq ft' },
    nameCtxArea,
  )
  assert(byNameConv.status === 'estimated' && byNameConv.matchedVia === 'name',
    'NULL link + name match + convertible unit + area → estimated via name', byNameConv.status)
  assert(Math.abs(byNameConv.estimatedQuantity - 1.99) < 0.01, 'oz/1000→gal qty ≈ 1.99 gal', byNameConv.estimatedQuantity)

  // Same item but NO area available → area-needed-for-estimate (not $0).
  const byNameNoArea = estimateProgramItemCost(
    { id: 'n2b', productName: 'Pendant SC', courseId: 'crossroads-gc', rateValue: 1.46, rateUnit: 'oz/1000 sq ft' },
    nameCtx,
  )
  assert(byNameNoArea.status === 'area-needed-for-estimate',
    'NULL link + name match + convertible unit but NO area → area-needed-for-estimate')
  assert(byNameNoArea.estimatedCost == null, 'area-needed has null estimatedCost (no fake $0)')

  // Course isolation: an item scoped to a course with no matching name
  // does NOT borrow another course's row.
  const wrongCourse = estimateProgramItemCost(
    { id: 'n3', productName: 'Pendant SC', courseId: 'no-such-course', rateValue: 2, rateUnit: 'gal' },
    { inventoryProducts: [{ id: 'inv-x', name: 'Pendant SC', unit: 'gal', costUnit: 'gal', costPerUnit: 100, courseId: 'crossroads-gc' }] },
  )
  assert(wrongCourse.status === 'missing-cost-basis',
    'name match in a DIFFERENT course is not borrowed → missing-cost-basis')

  // An explicit-but-unresolvable inventoryItemId does NOT silently fall
  // back to name (a bad link is a stewardship signal, not a guess).
  const badLink = estimateProgramItemCost(
    { id: 'n4', inventoryItemId: 'does-not-exist', productName: 'Pendant SC', courseId: 'crossroads-gc', rateValue: 2, rateUnit: 'gal' },
    nameCtx,
  )
  assert(badLink.status === 'missing-cost-basis',
    'explicit unresolvable inventoryItemId does NOT name-fallback')
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
    { id: 'i5', inventoryItemId: 'inv-3', rateValue: 1,    rateUnit: 'oz/1000 sq ft' }, // cost on file but lb/acre cost unit → unsupported-cost-unit
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
  assert(summary.notComparableUnits === 0,    'summary counts not-comparable-unit (superseded)', summary.notComparableUnits)
  assert(summary.conversionNeeded === 0,       'summary counts conversion-needed', summary.conversionNeeded)
  assert(summary.unsupportedUnit === 1,        'summary counts unsupported-unit (i5: lb/acre cost unit)', summary.unsupportedUnit)

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

// ── 5b. Phase 7V.1 — rate→quantity unit conversion helpers ───────────────
console.log('— Phase 7V.1 conversion helpers')
{
  const ACRE_SQFT = 43560

  // normalizeProgramRateUnit.
  assert(JSON.stringify(normalizeProgramRateUnit('gal/acre')) === JSON.stringify({ measure: 'gal', per: 'acre' }),
    'gal/acre → { gal, acre }')
  assert(JSON.stringify(normalizeProgramRateUnit('oz/1000 sq ft')) === JSON.stringify({ measure: 'floz', per: '1000sqft' }),
    'oz/1000 sq ft → { floz, 1000sqft }')
  assert(JSON.stringify(normalizeProgramRateUnit('lb/acre')) === JSON.stringify({ measure: 'lb', per: 'acre' }),
    'lb/acre → { lb, acre }')
  assert(JSON.stringify(normalizeProgramRateUnit('lbs/1000 sq ft')) === JSON.stringify({ measure: 'lb', per: '1000sqft' }),
    'lbs/1000 sq ft → { lb, 1000sqft }')
  assert(normalizeProgramRateUnit('bottles') === null, 'bottles → null (unsupported)')
  assert(normalizeProgramRateUnit('gal') === null, 'bare gal (no per-area) → null')

  // Conversions with area = 4 acres.
  const acres = 4, sqFt = 4 * ACRE_SQFT
  const conv = (rateValue, rateUnit, costUnit) =>
    estimatePlannedQuantityFromRate({ rateValue, rateUnit, costUnit, areaAcres: acres, areaSqFt: sqFt })

  // gal/acre → gal
  let r = conv(1.25, 'gal/acre', 'gal')
  assert(r.ok && r.unit === 'gal' && Math.abs(r.quantity - 5) < 1e-9, 'gal/acre × 4 = 5 gal')
  // oz/acre → gal (÷128)
  r = conv(32, 'oz/acre', 'gal')
  assert(r.ok && r.unit === 'gal' && Math.abs(r.quantity - 1) < 1e-9, 'oz/acre 32×4=128 oz ÷128 = 1 gal')
  // oz/1000 sq ft → gal
  r = conv(3.67, 'oz/1000 sq ft', 'gal')
  assert(r.ok && r.unit === 'gal' && Math.abs(r.quantity - (3.67 * (sqFt / 1000) / 128)) < 1e-9,
    'oz/1000 sq ft → gal via (sqFt/1000) ÷128', r.quantity)
  // lb/acre → lb
  r = conv(4, 'lb/acre', 'lb')
  assert(r.ok && r.unit === 'lb' && Math.abs(r.quantity - 16) < 1e-9, 'lb/acre × 4 = 16 lb')
  // lb/1000 sq ft → lb
  r = conv(10, 'lb/1000 sq ft', 'lb')
  assert(r.ok && r.unit === 'lb' && Math.abs(r.quantity - (10 * sqFt / 1000)) < 1e-9,
    'lb/1000 sq ft → lb via (sqFt/1000)', r.quantity)

  // Unsupported: bottles / cases / bags.
  for (const u of ['bottles', 'cases', 'bags', 'pack']) {
    assert(conv(1, u, 'gal').status === 'unsupported-rate-unit', `${u} → unsupported-rate-unit`)
  }

  // Volume↔weight refusal (never cross).
  assert(conv(1, 'gal/acre', 'lb').ok === false, 'gal rate vs lb cost → not ok (no cross)')
  assert(conv(1, 'lb/acre', 'gal').ok === false, 'lb rate vs gal cost → not ok (no cross)')

  // Missing area → area-needed.
  const noArea = estimatePlannedQuantityFromRate({ rateValue: 1, rateUnit: 'gal/acre', costUnit: 'gal', areaAcres: null, areaSqFt: null })
  assert(noArea.status === 'area-needed-for-estimate' && noArea.ok === false,
    'missing area → area-needed-for-estimate (no fake $0)')

  // No fake zero: ok=false never carries a numeric quantity.
  assert(noArea.quantity === null, 'area-needed has null quantity (no fake zero)')

  // resolveProgramArea from notes.
  const area = resolveProgramArea({ program: { notes: 'Default acres: ~4 acres (assumption).' } })
  assert(area.acres === 4 && area.sqFt === 174240 && area.source === 'program.notes',
    'resolveProgramArea parses "Default acres: ~4 acres" → 4 acres / 174240 sqft')
  const noAreaResolve = resolveProgramArea({ program: { notes: 'no acreage here' } })
  assert(noAreaResolve.acres === null && noAreaResolve.source === null,
    'resolveProgramArea returns null when no area source exists')
  // Structured field wins over notes.
  const structured = resolveProgramArea({ program: { defaultAcres: 6, notes: 'Default acres: ~4 acres.' } })
  assert(structured.acres === 6 && structured.source === 'program.defaultAcres',
    'structured program.defaultAcres takes precedence over notes')
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
