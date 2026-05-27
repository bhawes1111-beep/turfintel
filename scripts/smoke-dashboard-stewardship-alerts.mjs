// Phase 7N (1/?) — Dashboard Stewardship Alerts smoke.
//
//   node scripts/smoke-dashboard-stewardship-alerts.mjs
//
// Locks:
//   - helper exports the spec'd functions
//   - helper has no react / fetch / store imports
//   - helper does not mutate inputs
//   - missing-catalog-links counts inventory rows of kind 'chemical' /
//     'product' that lack a productCatalogId
//   - cost-basis-issues defers to Phase 7I.2 buildCostBasisReview so
//     totals never drift from the planner panel
//   - stale-completed-links flags planned items whose
//     linkedSprayRecordId is not present in the sprays cache
//   - unlinked-planned-items counts status === 'planned' rows with
//     no linked spray
//   - upcoming-spray-windows respects a configurable lookahead +
//     deterministic `now` anchor
//   - unscheduled-planned-items counts rows with no planned start
//     and no planned end
//   - archived programs are excluded from every summarizer
//   - top-level buildStewardshipAlerts emits one alert per non-zero
//     bucket, sorted by severity then count
//   - dashboard card source contracts: read-only, no fetch, no
//     mutation, only Review-navigation affordance
//   - Dashboard.jsx mounts <StewardshipAlerts />
//   - no fix / apply / commit / save / edit button in the card
//   - no new endpoint added in worker, no inventory deduction call,
//     no completed spray creation, no product_catalog mutation, no
//     budget / invoice / ledger workflow added
//   - Phase 7F.4 + Phase 7J.1 + Phase 7M.1 regression guards hold

import { readFileSync } from 'fs'
import {
  buildStewardshipAlerts,
  summarizeMissingCatalogLinks,
  summarizeCostBasisIssues,
  summarizeStaleCompletedLinks,
  summarizeUnlinkedPlannedItems,
  summarizeUpcomingSprayWindows,
  summarizeUnscheduledPlannedItems,
  __TEST,
} from '../src/utils/dashboard/stewardshipAlerts.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Helper source contracts ────────────────────────────────────────────
console.log('— src/utils/dashboard/stewardshipAlerts.js (source)')
{
  const src = readFileSync('src/utils/dashboard/stewardshipAlerts.js', 'utf8')

  for (const name of [
    'buildStewardshipAlerts',
    'summarizeMissingCatalogLinks',
    'summarizeCostBasisIssues',
    'summarizeStaleCompletedLinks',
    'summarizeUnlinkedPlannedItems',
    'summarizeUpcomingSprayWindows',
    'summarizeUnscheduledPlannedItems',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/from\s+['"]react['"]/.test(codeOnly),
    'helper does not import react')
  assert(!/fetch\(/.test(codeOnly),
    'helper does not call fetch()')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'helper does not import any *Store module')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'helper code-only contains no write method strings')

  // Reuses Phase 7I.2 buildCostBasisReview as the canonical source.
  assert(/from\s+['"]\.\.\/sprayPrograms\/costBasisReview\.js['"]/.test(src),
    'helper imports buildCostBasisReview from costBasisReview.js')

  // No write verbs / no recommendation language.
  for (const verb of [
    'createSpray', 'recordInventoryUsage', 'createCalendarEvent',
    'setProgramItemCompletedLink',
    'createSprayProgramItem', 'updateSprayProgramItem', 'deleteSprayProgramItem',
    'createSprayProgram',     'updateSprayProgram',     'archiveSprayProgram',
    'createInventoryItem',    'updateInventoryItem',    'deleteInventoryItem',
    'setInventoryCostBasis',  'patchInventoryCostBasis',
    'createBudgetEntry',      'createInvoice',          'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `helper code-only never references ${verb}`)
  }
  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
    'safe','pass','fail','score',
    'budget entry created','actual expense','spend authorization',
    'invoice processing','invoice parser','ledger entry',
    'pdf parser','ai extraction','OCR','tesseract','openai',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `helper code-only avoids "${word}"`)
  }

  // __TEST surface.
  assert(typeof __TEST?.DAY_MS === 'number', '__TEST.DAY_MS exposed as a number')
}

// ── 2. summarizeMissingCatalogLinks ───────────────────────────────────────
console.log('— summarizeMissingCatalogLinks behavior')
{
  const inv = [
    { id: 'i1', kind: 'chemical', name: 'Daconil', productCatalogId: null },  // missing
    { id: 'i2', kind: 'chemical', name: 'Heritage', productCatalogId: 'pc-1' }, // linked
    { id: 'i3', kind: 'product',  name: 'Phosphite', productCatalogId: null }, // missing
    { id: 'i4', kind: 'fertilizer', name: 'Urea', productCatalogId: null },    // ignored
    { id: 'i5', kind: 'fuel',     name: 'Diesel', productCatalogId: null },    // ignored
    null,                                                                       // defensive
  ]
  const snap = JSON.stringify(inv)
  const r = summarizeMissingCatalogLinks(inv)
  assert(JSON.stringify(inv) === snap, 'inputs not mutated')
  assert(r.total === 2, 'counts chemicals + products missing a catalog link', r.total)
  assert(r.items.find(x => x.id === 'i1') && r.items.find(x => x.id === 'i3'),
    'surfaces i1 + i3 by id')
  assert(!r.items.find(x => x.id === 'i4' || x.id === 'i5'),
    'never surfaces fertilizer / fuel rows')

  assert(summarizeMissingCatalogLinks(null).total === 0,
    'null inventory returns total = 0')
}

// ── 3. summarizeCostBasisIssues + archived exclusion ──────────────────────
console.log('— summarizeCostBasisIssues defers to buildCostBasisReview')
{
  const inv = [
    { id: 'inv-1', name: 'Daconil', unit: 'oz/1000 sq ft', costPerUnit: 4.25 }, // ready
    { id: 'inv-2', name: 'Heritage', unit: 'oz/1000 sq ft', costPerUnit: null }, // missing
    { id: 'inv-3', name: 'Barricade', costPerUnit: 12.00 },                       // missing unit
    { id: 'inv-4', name: 'Specticle', unit: 'lb/acre', costPerUnit: 0 },          // invalid cost
  ]
  const programs = [
    { id: 'p1', name: 'Greens', status: 'active' },
    { id: 'pX', name: 'Old',    status: 'archived' },
  ]
  const itemsByProgramId = {
    p1: [
      { id: 'i1', productName: 'Heritage',  inventoryItemId: 'inv-2' }, // missing-cost-per-unit
      { id: 'i2', productName: 'Barricade', inventoryItemId: 'inv-3' }, // missing-unit
      { id: 'i3', productName: 'Specticle', inventoryItemId: 'inv-4' }, // invalid-cost
      { id: 'i4', productName: 'Daconil',   inventoryItemId: 'inv-1' }, // ready
    ],
    // pX is archived → not counted, even if items existed.
    pX: [{ id: 'iX', productName: 'Ghost', inventoryItemId: 'inv-99' }],
  }

  const r = summarizeCostBasisIssues(programs, itemsByProgramId, inv)
  assert(r.missingCostBasis === 1, 'missingCostBasis = 1 (inv-2)', r.missingCostBasis)
  assert(r.missingUnit === 1,      'missingUnit = 1 (inv-3)',       r.missingUnit)
  assert(r.invalidCost === 1,      'invalidCost = 1 (inv-4)',       r.invalidCost)
  assert(r.total === 3,            'total = sum of issue buckets',  r.total)
  assert(r.affectedItems === 3,    'affectedItems = 3 planned items', r.affectedItems)
}

// ── 4. summarizeStaleCompletedLinks ───────────────────────────────────────
console.log('— summarizeStaleCompletedLinks behavior')
{
  const programs = [{ id: 'p1', status: 'active' }]
  const items = [
    { id: 'i1', productName: 'A', linkedSprayRecordId: 'sr-1' },  // live
    { id: 'i2', productName: 'B', linkedSprayRecordId: 'sr-9' },  // stale
    { id: 'i3', productName: 'C', linkedSprayRecordId: null },    // ignored (unlinked)
  ]
  const sprays = [{ id: 'sr-1' }]

  const r = summarizeStaleCompletedLinks(programs, { p1: items }, sprays)
  assert(r.total === 1, 'total = 1 stale link', r.total)
  assert(r.items[0]?.itemId === 'i2' && r.items[0]?.linkedId === 'sr-9',
    'surfaces i2 with the stranded sr-9 id')

  // No items leak from archived programs.
  const archived = summarizeStaleCompletedLinks(
    [{ id: 'pX', status: 'archived' }],
    { pX: items },
    sprays,
  )
  assert(archived.total === 0, 'archived programs are skipped')
}

// ── 5. summarizeUnlinkedPlannedItems ──────────────────────────────────────
console.log('— summarizeUnlinkedPlannedItems behavior')
{
  const programs = [{ id: 'p1', status: 'active' }]
  const items = [
    { id: 'i1', status: 'planned',   linkedSprayRecordId: null },    // surfaced
    { id: 'i2', status: 'planned',   linkedSprayRecordId: 'sr-1' },  // ignored (linked)
    { id: 'i3', status: 'completed', linkedSprayRecordId: null },    // ignored (not planned)
    { id: 'i4', status: 'skipped',   linkedSprayRecordId: null },    // ignored
  ]
  const r = summarizeUnlinkedPlannedItems(programs, { p1: items })
  assert(r.total === 1 && r.items[0]?.itemId === 'i1',
    'only status=planned + linkedSprayRecordId=null surfaces')
}

// ── 6. summarizeUpcomingSprayWindows ──────────────────────────────────────
console.log('— summarizeUpcomingSprayWindows behavior')
{
  const programs = [{ id: 'p1', status: 'active' }]
  const NOW = Date.UTC(2026, 4, 26) // 2026-05-26
  const items = [
    { id: 'i1', status: 'planned',   plannedStartDate: '2026-05-26' }, // today → in window
    { id: 'i2', status: 'planned',   plannedStartDate: '2026-06-01' }, // 6 days out → in window
    { id: 'i3', status: 'planned',   plannedStartDate: '2026-06-05' }, // 10 days out → out
    { id: 'i4', status: 'planned',   plannedStartDate: '2026-05-25' }, // yesterday → out
    { id: 'i5', status: 'completed', plannedStartDate: '2026-05-27' }, // wrong status → out
    { id: 'i6', status: 'planned',   plannedStartDate: null },         // unscheduled → out
  ]
  const r = summarizeUpcomingSprayWindows(programs, { p1: items }, { now: NOW })
  assert(r.total === 2,
    'counts items within the next 7 days (i1 today, i2 +6 days)',
    r.items.map(x => x.itemId))

  // Configurable lookahead.
  const r14 = summarizeUpcomingSprayWindows(programs, { p1: items }, { now: NOW, lookaheadDays: 14 })
  assert(r14.total === 3, 'lookaheadDays=14 picks up i1 + i2 + i3', r14.items.map(x => x.itemId))
}

// ── 7. summarizeUnscheduledPlannedItems ───────────────────────────────────
console.log('— summarizeUnscheduledPlannedItems behavior')
{
  const programs = [{ id: 'p1', status: 'active' }]
  const items = [
    { id: 'i1', plannedStartDate: '2026-05-26', plannedEndDate: '2026-05-26' }, // scheduled
    { id: 'i2', plannedStartDate: null,         plannedEndDate: null         }, // unscheduled
    { id: 'i3', plannedStartDate: '2026-06-01', plannedEndDate: null         }, // partial → scheduled (start present)
    { id: 'i4', plannedStartDate: null,         plannedEndDate: '2026-06-10' }, // partial → scheduled (end present)
  ]
  const r = summarizeUnscheduledPlannedItems(programs, { p1: items })
  assert(r.total === 1 && r.items[0]?.itemId === 'i2',
    'only items with neither start nor end surface')
}

// ── 8. buildStewardshipAlerts top-level ───────────────────────────────────
console.log('— buildStewardshipAlerts top-level rollup')
{
  const NOW = Date.UTC(2026, 4, 26)
  const inv = [
    { id: 'inv-1', kind: 'chemical', name: 'Daconil',  unit: 'oz', costPerUnit: 4.25 }, // ready cost
    { id: 'inv-2', kind: 'chemical', name: 'Heritage', unit: 'oz', costPerUnit: null }, // missing cost
    { id: 'inv-3', kind: 'product',  name: 'Phosphite', productCatalogId: null },       // missing catalog
  ]
  const programs = [{ id: 'p1', name: 'Greens', status: 'active' }]
  const itemsByProgramId = {
    p1: [
      { id: 'i1', productName: 'Daconil',  inventoryItemId: 'inv-1', status: 'planned',
        plannedStartDate: '2026-05-28', plannedEndDate: '2026-05-28' },     // upcoming + unlinked
      { id: 'i2', productName: 'Heritage', inventoryItemId: 'inv-2', status: 'planned',
        plannedStartDate: '2026-05-30', plannedEndDate: '2026-05-30' },     // upcoming + unlinked + cost
      { id: 'i3', productName: 'Phantom',  inventoryItemId: 'inv-1', status: 'planned',
        linkedSprayRecordId: 'sr-ghost' }, // stale link + unscheduled
    ],
  }
  const sprays = [{ id: 'sr-existing' }]

  // No-mutation guard.
  const invSnap  = JSON.stringify(inv)
  const progSnap = JSON.stringify(programs)
  const mapSnap  = JSON.stringify(itemsByProgramId)
  const sprSnap  = JSON.stringify(sprays)

  const out = buildStewardshipAlerts({
    inventoryProducts: inv,
    programs,
    itemsByProgramId,
    sprays,
    now: NOW,
  })

  assert(JSON.stringify(inv) === invSnap,           'inventory inputs untouched')
  assert(JSON.stringify(programs) === progSnap,     'programs inputs untouched')
  assert(JSON.stringify(itemsByProgramId) === mapSnap, 'itemsByProgramId untouched')
  assert(JSON.stringify(sprays) === sprSnap,        'sprays inputs untouched')

  const types = out.alerts.map(a => a.type)
  for (const t of [
    'missing-catalog-links',
    'cost-basis-issues',
    'stale-completed-links',
    'unlinked-planned-items',
    'upcoming-spray-windows',
    'unscheduled-planned-items',
  ]) {
    assert(types.includes(t), `alert types include "${t}"`, types)
  }

  // Severity order: attention first, then warning, then info.
  const sevSeq = out.alerts.map(a => a.severity)
  const attnIdx = sevSeq.indexOf('attention')
  const warnIdx = sevSeq.indexOf('warning')
  const infoIdx = sevSeq.indexOf('info')
  assert(attnIdx === 0,                         'first alert has severity=attention')
  assert(attnIdx < warnIdx && warnIdx < infoIdx,
    'alerts sorted attention < warning < info',
    { attnIdx, warnIdx, infoIdx })

  // Every alert carries a route + the spec'd model fields.
  for (const a of out.alerts) {
    for (const key of ['id', 'type', 'severity', 'title', 'count', 'summary', 'route', 'routeState', 'itemsPreview']) {
      assert(key in a, `alert.${key} present (type=${a.type})`)
    }
    assert(typeof a.route === 'string' && a.route.startsWith('/'),
      `alert ${a.type} has a sensible route`,
      a.route)
  }

  // Totals object exists + matches the alerts array.
  assert(out.totals.activeAlerts === out.alerts.length,
    'totals.activeAlerts matches alerts.length')
  assert(out.totals.attentionAlerts === out.alerts.filter(a => a.severity === 'attention').length,
    'totals.attentionAlerts matches severity filter')
}

// ── 9. Empty / no-data behavior ───────────────────────────────────────────
console.log('— buildStewardshipAlerts with no data')
{
  const out = buildStewardshipAlerts({})
  assert(Array.isArray(out.alerts) && out.alerts.length === 0,
    'no inputs → empty alerts array')
  assert(out.totals.activeAlerts === 0,
    'no inputs → totals.activeAlerts = 0')
}

// ── 10. StewardshipAlerts UI source contracts ─────────────────────────────
console.log('— src/pages/Dashboard/StewardshipAlerts.jsx (source)')
{
  const src = readFileSync('src/pages/Dashboard/StewardshipAlerts.jsx', 'utf8')

  assert(/export\s+default\s+function\s+StewardshipAlerts/.test(src),
    'default exports StewardshipAlerts')

  // Imports the pure helper.
  assert(/from\s+['"]\.\.\/\.\.\/utils\/dashboard\/stewardshipAlerts['"]/.test(src),
    'imports buildStewardshipAlerts from the helper')
  // Subscribes to live stores via the existing hooks.
  for (const hook of [
    'useInventoryData', 'useProductCatalog',
    'useSprayPrograms', 'useSpraysData',
  ]) {
    assert(new RegExp(`\\b${hook}\\b`).test(src),
      `subscribes to ${hook}`)
  }

  // Renders title + subtitle + "Review →" button label.
  assert(/Stewardship Alerts/.test(src),
    'header renders "Stewardship Alerts" title')
  assert(/Setup and planning items that need review\./.test(src),
    'header renders the spec\'d subtitle')
  assert(/>Review\s*→<|>Review →</.test(src) || src.includes('Review →'),
    'rows render the "Review →" link label')

  // Read-only: no fetch, no /api/, no method strings, no mutation
  // verbs.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/\bfetch\(/.test(codeOnly),
    'card does not call fetch() directly')
  assert(!/\/api\//.test(codeOnly),
    'card never references any /api/ endpoint')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'card issues no direct POST/PATCH/DELETE')

  for (const verb of [
    'setInventoryCostBasis',
    'recordInventoryUsage',
    'createInventoryItem', 'updateInventoryItem', 'deleteInventoryItem',
    'createSpray',         'createCalendarEvent',
    'createSprayProgramItem', 'updateSprayProgramItem', 'deleteSprayProgramItem',
    'createSprayProgram',     'updateSprayProgram',     'archiveSprayProgram',
    'createBudgetEntry',   'createInvoice',     'createLedgerEntry',
    'patchInventoryCostBasis', 'patchInventoryCatalogLink',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `card never references ${verb}`)
  }

  // No fix / apply / commit / save / edit button labels — the ONLY
  // affordance is "Review →".
  for (const phrase of ['Fix automatically', 'Apply All', 'Apply Now', 'Save', 'Commit', 'Edit', 'Delete']) {
    const re = new RegExp(`>\\s*${phrase}\\s*<`)
    assert(!re.test(src),
      `no >${phrase}< JSX text on the card`)
  }
  // Stewardship vocabulary lock — covers the new card.
  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
    'safe','pass','fail','score',
    'budget entry created','actual expense','spend authorization',
    'invoice processing','invoice parser','ledger entry',
    'pdf parser','ai extraction','OCR','tesseract','openai',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `card code-only avoids "${word}"`)
  }
}

// ── 11. CSS module surface ────────────────────────────────────────────────
console.log('— StewardshipAlerts.module.css contracts')
{
  const css = readFileSync('src/pages/Dashboard/StewardshipAlerts.module.css', 'utf8')
  for (const cls of [
    'card', 'header', 'title', 'subtitle', 'empty',
    'list', 'row', 'row_attention', 'row_warning', 'row_info',
    'rowMain', 'rowHeader', 'icon',
    'icon_attention', 'icon_warning', 'icon_info',
    'rowTitle', 'rowCount', 'rowSummary', 'reviewBtn',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
  assert(/@media\s*\(max-width:\s*700px\)/.test(css),
    'CSS defines the mobile breakpoint at 700px')
}

// ── 12. Dashboard mounts <StewardshipAlerts /> ───────────────────────────
console.log('— Dashboard.jsx mounts the card')
{
  const src = readFileSync('src/pages/Dashboard/Dashboard.jsx', 'utf8')
  assert(/import\s+StewardshipAlerts\s+from\s+['"]\.\/StewardshipAlerts['"]/.test(src),
    'Dashboard imports StewardshipAlerts')
  assert(/<StewardshipAlerts\s*\/>/.test(src),
    'Dashboard mounts <StewardshipAlerts />')
  // Wrapped in a DashboardCard with the canonical title.
  assert(/title="Stewardship Alerts"[^>]*>\s*<StewardshipAlerts/.test(src.replace(/\s+/g, ' ')) ||
         /<DashboardCard\s+title="Stewardship Alerts"/.test(src),
    'Dashboard renders <DashboardCard title="Stewardship Alerts">')
}

// ── 13. Boundary regression guards across surfaces ────────────────────────
console.log('— cross-surface regression guards')
{
  // Phase 7F.4 still wired.
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')

  // No new worker endpoint introduced by this commit.
  const worker = readFileSync('worker/index.js', 'utf8')
  for (const route of [
    '/dashboard/stewardship', '/stewardship-alerts',
    '/cost-import', '/cost-import/commit', '/cost-import/apply',
    '/cost-basis/bulk', '/cost-basis/import',
  ]) {
    assert(!worker.includes(route),
      `worker/index.js never wires ${route}`)
  }
  // Phase 7J.1 + Phase 7M.1 still wired (regression).
  assert(/patchInventoryCostBasis/.test(worker),
    'worker still wires patchInventoryCostBasis')
  assert(/listInventoryCostBasisAudit/.test(worker),
    'worker still wires listInventoryCostBasisAudit')

  // worker/api/inventory.js avoids PDF / AI / budget / invoice / ledger.
  const api = readFileSync('worker/api/inventory.js', 'utf8')
  const apiCode = api
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'parsePdf', 'parseInvoice', 'extractWithAi', 'tesseract', 'openai',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`, 'i').test(apiCode),
      `worker/api/inventory.js never references ${verb}`)
  }
  assert(!/UPDATE\s+product_catalog|INSERT\s+INTO\s+product_catalog/i.test(apiCode),
    'worker/api/inventory.js never writes product_catalog')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
