// Phase 7I (2/?) — Cost-basis stewardship review smoke.
//
//   node scripts/smoke-spray-program-cost-basis-review.mjs
//
// Locks:
//   - helper exports the spec'd functions
//   - helper has no react/fetch/store imports
//   - helper does not mutate inputs
//   - evaluateInventoryCostBasis emits each expected status
//   - findProgramItemsMissingCostBasis surfaces only non-ready items
//   - buildCostBasisReview groups planned items per inventory item
//   - totals (linked / ready / missingCostBasis / missingUnit /
//     invalidCost / unusedInPrograms / affectedPlannedItems) are
//     correct on a representative fixture
//   - summarizeCostBasisReview returns the clean / non-clean shapes
//   - planner mounts CostBasisReviewPanel + boundary copy verbatim
//   - planner CSS exposes the panel classes
//   - planner re-uses existing inventory navigation pattern
//     (navigate('/inventory', { state: { activeTab: 'Products',
//     productId } }))
//   - panel exposes "Open inventory item" affordance
//   - no inventory cost-field write call added
//   - no budget / invoice / ledger write call added
//   - no inventory deduction / completed-spray creation calls
//   - no product_catalog mutation route added
//   - no recommendation / judgment vocabulary anywhere

import { readFileSync } from 'fs'
import {
  buildCostBasisReview,
  evaluateInventoryCostBasis,
  findProgramItemsMissingCostBasis,
  summarizeCostBasisReview,
} from '../src/utils/sprayPrograms/costBasisReview.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Helper source contracts ────────────────────────────────────────────
console.log('— src/utils/sprayPrograms/costBasisReview.js (source)')
{
  const src = readFileSync('src/utils/sprayPrograms/costBasisReview.js', 'utf8')

  for (const name of [
    'evaluateInventoryCostBasis',
    'findProgramItemsMissingCostBasis',
    'buildCostBasisReview',
    'summarizeCostBasisReview',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

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
    'createSprayProgram',     'updateSprayProgram',     'archiveSprayProgram',
    'createInventoryItem',    'updateInventoryItem',    'deleteInventoryItem',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `helper code-only never references ${verb}`)
  }

  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `helper code-only avoids "${word}"`)
  }
}

// ── 2. evaluateInventoryCostBasis — runtime ───────────────────────────────
console.log('— evaluateInventoryCostBasis runtime behavior')
{
  assert(evaluateInventoryCostBasis(null).status === 'missing-inventory-item',
    'null inventory item → missing-inventory-item')
  assert(evaluateInventoryCostBasis({ id: 'x' }).status === 'missing-cost-per-unit',
    'no cost field → missing-cost-per-unit')
  assert(evaluateInventoryCostBasis({ id: 'x', costPerUnit: 0 }).status === 'invalid-cost',
    'zero costPerUnit → invalid-cost')
  assert(evaluateInventoryCostBasis({ id: 'x', costPerUnit: -3 }).status === 'invalid-cost',
    'negative costPerUnit → invalid-cost')
  assert(evaluateInventoryCostBasis({ id: 'x', costPerUnit: 'abc' }).status === 'invalid-cost',
    'non-numeric costPerUnit → invalid-cost')
  assert(evaluateInventoryCostBasis({ id: 'x', costPerUnit: 4.25 }).status === 'missing-unit',
    'positive cost but no unit → missing-unit')
  assert(evaluateInventoryCostBasis({ id: 'x', costPerUnit: 4.25, unit: '   ' }).status === 'missing-unit',
    'whitespace-only unit → missing-unit')
  assert(evaluateInventoryCostBasis({ id: 'x', costPerUnit: 4.25, unit: 'oz/1000 sq ft' }).status === 'ready',
    'cost + unit present → ready')
  // unitCost alias is also accepted.
  assert(evaluateInventoryCostBasis({ id: 'x', unitCost: 1, unit: 'lb' }).status === 'ready',
    'unitCost alias is accepted')
  // pricePerUnit alias.
  assert(evaluateInventoryCostBasis({ id: 'x', pricePerUnit: 1, unit: 'lb' }).status === 'ready',
    'pricePerUnit alias is accepted')
}

// ── 3. findProgramItemsMissingCostBasis — runtime ─────────────────────────
console.log('— findProgramItemsMissingCostBasis runtime')
{
  const inv = [
    { id: 'inv-1', name: 'Daconil',  unit: 'oz/1000 sq ft', costPerUnit: 4.25 }, // ready
    { id: 'inv-2', name: 'Heritage', unit: 'oz/1000 sq ft', costPerUnit: null }, // missing cost
    { id: 'inv-3', name: 'Barricade', costPerUnit: 12.00 },                       // missing unit
  ]
  const items = [
    { id: 'i1', productName: 'Daconil', inventoryItemId: 'inv-1' },
    { id: 'i2', productName: 'Heritage', inventoryItemId: 'inv-2' },
    { id: 'i3', productName: 'Barricade', inventoryItemId: 'inv-3' },
    { id: 'i4', productName: 'Ghost',  inventoryItemId: 'inv-ghost' },   // missing-inventory-item
    { id: 'i5', productName: 'Unlinked', inventoryItemId: null },        // missing-inventory-link
  ]
  const itemsSnap = JSON.stringify(items)
  const invSnap = JSON.stringify(inv)

  const issues = findProgramItemsMissingCostBasis(items, inv)
  assert(JSON.stringify(items) === itemsSnap, 'findProgramItemsMissingCostBasis does not mutate items')
  assert(JSON.stringify(inv) === invSnap,     'findProgramItemsMissingCostBasis does not mutate inventory')

  assert(issues.length === 4, 'one issue per non-ready planned item', issues.length)
  const byId = Object.fromEntries(issues.map(i => [i.itemId, i.status]))
  assert(byId.i2 === 'missing-cost-per-unit',  'i2 → missing-cost-per-unit')
  assert(byId.i3 === 'missing-unit',           'i3 → missing-unit')
  assert(byId.i4 === 'missing-inventory-item', 'i4 → missing-inventory-item')
  assert(byId.i5 === 'missing-inventory-link', 'i5 → missing-inventory-link')
  assert(byId.i1 === undefined,                'i1 (ready) is omitted')

  // Defensive bad input.
  assert(findProgramItemsMissingCostBasis(null, inv).length === 0,
    'null items input → []')
  // With a null inventory list every linked item becomes
  // missing-inventory-item; the unlinked item stays
  // missing-inventory-link. i1..i4 + i5 = 5 issues.
  assert(findProgramItemsMissingCostBasis(items, null).length === 5,
    'null inventory still classifies items (missing-inventory-link / missing-inventory-item)')
}

// ── 4. buildCostBasisReview — runtime ─────────────────────────────────────
console.log('— buildCostBasisReview runtime behavior')
{
  const inv = [
    { id: 'inv-1', name: 'Daconil',  unit: 'oz/1000 sq ft', costPerUnit: 4.25 }, // ready
    { id: 'inv-2', name: 'Heritage', unit: 'oz/1000 sq ft', costPerUnit: null }, // missing cost
    { id: 'inv-3', name: 'Barricade', costPerUnit: 12.00 },                       // missing unit
    { id: 'inv-4', name: 'Specticle', unit: 'lb/acre', costPerUnit: 0 },          // invalid cost
    { id: 'inv-5', name: 'Unused', unit: 'lb/acre', costPerUnit: 1 },             // unused — no planned item references it
  ]
  const programs = [
    { id: 'p1', name: 'Greens — Summer' },
    { id: 'p2', name: 'Tees — Pre-emerge' },
  ]
  const itemsByProgramId = {
    p1: [
      { id: 'i1', productName: 'Daconil',  inventoryItemId: 'inv-1' },
      { id: 'i2', productName: 'Heritage', inventoryItemId: 'inv-2' },
      { id: 'i3', productName: 'Heritage 2', inventoryItemId: 'inv-2' }, // dup → grouped
    ],
    p2: [
      { id: 'i4', productName: 'Barricade', inventoryItemId: 'inv-3' },
      { id: 'i5', productName: 'Specticle', inventoryItemId: 'inv-4' },
      { id: 'i6', productName: 'Ghost',     inventoryItemId: 'inv-ghost' }, // missing-inventory-item
      { id: 'i7', productName: 'Unlinked',  inventoryItemId: null },        // missing-inventory-link
    ],
  }
  const progSnap = JSON.stringify(programs)
  const mapSnap  = JSON.stringify(itemsByProgramId)
  const invSnap  = JSON.stringify(inv)

  const review = buildCostBasisReview(programs, itemsByProgramId, inv)
  assert(JSON.stringify(programs) === progSnap,    'buildCostBasisReview does not mutate programs')
  assert(JSON.stringify(itemsByProgramId) === mapSnap, 'buildCostBasisReview does not mutate itemsByProgramId')
  assert(JSON.stringify(inv) === invSnap,          'buildCostBasisReview does not mutate inventory')

  const t = review.totals
  assert(t.linkedInventoryItems === 5, 'linkedInventoryItems counts unique references', t.linkedInventoryItems)
  assert(t.ready === 1,                'one inventory item is ready (inv-1)', t.ready)
  assert(t.missingCostBasis === 2,     'missingCostBasis = inv-2 + inv-ghost', t.missingCostBasis)
  assert(t.missingUnit === 1,          'missingUnit = inv-3', t.missingUnit)
  assert(t.invalidCost === 1,          'invalidCost = inv-4', t.invalidCost)
  assert(t.unusedInPrograms === 1,     'unusedInPrograms = inv-5', t.unusedInPrograms)
  // 3 inventory-side issues (inv-2, inv-3, inv-4, inv-ghost) → 5 planned issues
  // i2 + i3 (both inv-2), i4 (inv-3), i5 (inv-4), i6 (inv-ghost), i7 (missing-link) = 6
  assert(t.affectedPlannedItems === 6, 'affectedPlannedItems counts every non-ready planned item', t.affectedPlannedItems)

  // Inventory grouping: inv-2 should appear once with two affected planned items.
  const inv2 = review.inventoryIssues.find(x => x.inventoryItemId === 'inv-2')
  assert(inv2 && inv2.affectedProgramItems.length === 2,
    'inv-2 grouped with both i2 and i3 planned items', inv2 && inv2.affectedProgramItems.length)
  assert(inv2.status === 'missing-cost-per-unit', 'inv-2 status = missing-cost-per-unit')

  // inv-ghost has a stable id but no inventory row.
  const ghost = review.inventoryIssues.find(x => x.inventoryItemId === 'inv-ghost')
  assert(ghost && ghost.status === 'missing-inventory-item',
    'inv-ghost surfaces missing-inventory-item')

  // plannedItemIssues includes one row per non-ready planned item.
  assert(review.plannedItemIssues.length === 6,
    'plannedItemIssues row count matches affectedPlannedItems')
  const planById = Object.fromEntries(review.plannedItemIssues.map(p => [p.itemId, p]))
  assert(planById.i7.status === 'missing-inventory-link', 'i7 → missing-inventory-link')
  assert(planById.i1 === undefined, 'ready item (i1) is not in plannedItemIssues')
  // Carries the program name + product name so the UI can render
  // affected-row context without re-walking.
  assert(planById.i2.programName === 'Greens — Summer', 'plannedItemIssues row carries programName')
  assert(planById.i2.productName === 'Heritage',         'plannedItemIssues row carries productName')
}

// ── 5. summarizeCostBasisReview ───────────────────────────────────────────
console.log('— summarizeCostBasisReview runtime')
{
  const clean = summarizeCostBasisReview({
    totals: {
      linkedInventoryItems: 2, ready: 2,
      missingCostBasis: 0, missingUnit: 0, invalidCost: 0,
      unusedInPrograms: 0, affectedPlannedItems: 0,
    },
    inventoryIssues: [],
    plannedItemIssues: [],
  })
  assert(clean.isClean === true,                          'clean review → isClean=true')
  assert(/All linked inventory items/.test(clean.message), 'clean review → ok message')

  const dirty = summarizeCostBasisReview({
    totals: {
      linkedInventoryItems: 3, ready: 1,
      missingCostBasis: 1, missingUnit: 1, invalidCost: 0,
      unusedInPrograms: 0, affectedPlannedItems: 4,
    },
    inventoryIssues: [],
    plannedItemIssues: [],
  })
  assert(dirty.isClean === false,                              'dirty review → isClean=false')
  assert(dirty.totalIssues === 2,                              'totalIssues sums cost-basis + unit + invalid')
  assert(dirty.affectedPlannedItems === 4,                     'summary carries affectedPlannedItems')
  assert(/2 inventory issues/.test(dirty.message),             'message describes 2 issues')
  assert(/4 planned items/.test(dirty.message),                'message describes 4 affected planned items')

  // Defensive null.
  const empty = summarizeCostBasisReview(null)
  assert(empty.isClean === true && empty.totalIssues === 0,
    'null review → clean empty-state')
}

// ── 6. Planner UI wiring ──────────────────────────────────────────────────
console.log('— SprayProgramPlanner mounts CostBasisReviewPanel')
{
  const src = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.jsx', 'utf8')

  assert(/from\s+['"]\.\.\/\.\.\/\.\.\/utils\/sprayPrograms\/costBasisReview['"]/.test(src),
    'planner imports costBasisReview helpers')
  for (const sym of [
    'buildCostBasisReview',
    'summarizeCostBasisReview',
  ]) {
    assert(new RegExp(`\\b${sym}\\b`).test(src), `planner references ${sym}`)
  }

  assert(/function\s+CostBasisReviewPanel\s*\(/.test(src),
    'planner defines CostBasisReviewPanel')
  assert(/<CostBasisReviewPanel\b/.test(src),
    'planner mounts <CostBasisReviewPanel>')

  // Re-uses the existing inventory navigation pattern (no new route).
  assert(/useNavigate/.test(src) && /from\s+['"]react-router-dom['"]/.test(src),
    'planner imports useNavigate from react-router-dom')
  assert(/navigate\(['"]\/inventory['"]\s*,\s*\{[\s\S]*activeTab:\s*['"]Products['"][\s\S]*productId:\s*\w+/m.test(src),
    'planner navigates to /inventory with Products tab + productId state')

  // "Open inventory item" affordance is exposed.
  assert(/Open inventory item/.test(src),
    'panel renders "Open inventory item" button')

  // Boundary copy verbatim.
  const norm = src.replace(/\s+/g, ' ')
  for (const phrase of [
    'Cost basis review helps explain missing estimates.',
    'This does not create budget entries.',
    'Inventory is not deducted from planned items.',
    'Product Catalog is not used as a price source.',
  ]) {
    assert(norm.includes(phrase), `boundary copy verbatim: "${phrase}"`)
  }

  // The new panel function must not contain any inventory cost-field
  // write or budget/invoice/ledger create calls. Scope to the panel
  // body so the legitimate write verbs elsewhere in the planner do
  // not produce false positives.
  const panelMatch = src.match(/function\s+CostBasisReviewPanel\s*\(([\s\S]*?)\n\}\n/)
  assert(!!panelMatch, 'CostBasisReviewPanel body is extractable for scoped scan')
  if (panelMatch) {
    const body = panelMatch[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const verb of [
      'createSpray', 'recordInventoryUsage', 'createCalendarEvent',
      'setProgramItemCompletedLink',
      'createSprayProgramItem', 'updateSprayProgramItem', 'deleteSprayProgramItem',
      'createSprayProgram',     'updateSprayProgram',     'archiveSprayProgram',
      'createInventoryItem',    'updateInventoryItem',    'deleteInventoryItem',
      'createBudgetEntry',      'createInvoice',          'createLedgerEntry',
    ]) {
      assert(!new RegExp(`\\b${verb}\\b`).test(body),
        `CostBasisReviewPanel body never references ${verb}`)
    }
    assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(body),
      'CostBasisReviewPanel body issues no direct POST/PATCH/DELETE')
    assert(!/\/api\/product-catalog\b/.test(body),
      'CostBasisReviewPanel body never references /api/product-catalog')
  }

  // No new recommendation/judgment language added anywhere in planner.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `no "${word}" wording in planner code`)
  }
}

// ── 7. Planner CSS classes ────────────────────────────────────────────────
console.log('— SprayProgramPlanner.module.css cost-basis classes')
{
  const css = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.module.css', 'utf8')
  for (const cls of [
    'costBasisPanel', 'costBasisHeader', 'costBasisTitle',
    'costBasisStatusChip', 'costBasisStatusOk', 'costBasisStatusWarn',
    'costBasisCounters', 'costBasisList',
    'costBasisIssue', 'costBasisIssueMain', 'costBasisIssueTitle', 'costBasisIssueSub',
    'costBasisAffected', 'costBasisAffectedRow',
    'costBasisAffectedProgram', 'costBasisAffectedItem',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
}

// ── 8. Forbidden-write invariants across surfaces ─────────────────────────
console.log('— Phase 7F.4 + Phase 7C.2 regression guards')
{
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')

  // The cost-basis helper must not have introduced a back-door write
  // path into inventory or product_catalog.
  const helper = readFileSync('src/utils/sprayPrograms/costBasisReview.js', 'utf8')
  assert(!/\/api\/inventory\b/.test(helper),
    'helper never references /api/inventory')
  assert(!/\/api\/product-catalog\b/.test(helper),
    'helper never references /api/product-catalog')
  assert(!/\/api\/budget\b|\/api\/invoices?\b|\/api\/ledger\b/.test(helper),
    'helper never references budget/invoice/ledger routes')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
