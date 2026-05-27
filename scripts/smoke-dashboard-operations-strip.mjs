// Phase 7N (3/?) — Dashboard Operations Strip smoke.
//
//   node scripts/smoke-dashboard-operations-strip.mjs
//
// Locks:
//   - helper exports the spec'd functions
//   - helper has no react / fetch / store imports + no mutation verbs
//   - helper reuses Phase 7H buildProgramCalendarItems and Phase 7I
//     estimateProgramItemCost; never re-derives row shape or cost math
//   - inputs are never mutated
//   - today / this-week buckets use UTC-day windowing with the supplied
//     `now` anchor (status === 'planned' only, archived programs
//     excluded)
//   - overdue counts items whose planned window has passed AND status
//     is still 'planned' AND no resolvable linked spray
//   - unscheduled = no plannedStartDate AND no plannedEndDate
//   - weekly cost uses estimateProgramItemCost; lazy cache misses are
//     counted as missingCostItems (never invented)
//   - top-level buildOperationsStrip emits today / week / overdue /
//     unscheduled / notices / currency
//   - dashboard card source contracts: read-only, only affordance is
//     per-tile Calendar → / Planner → navigation
//   - dashboard mounts the card
//   - no new endpoint, no inventory deduction, no completed spray
//     creation, no calendar-event creation, no budget / invoice /
//     ledger / product_catalog mutation
//   - Phase 7F.4 + Phase 7J.1 + Phase 7M.1 + Phase 7N.1 + Phase 7N.2
//     regression guards still hold

import { readFileSync } from 'fs'
import {
  buildOperationsStrip,
  summarizeTodayProgramItems,
  summarizeWeekProgramItems,
  summarizeOverdueProgramItems,
  summarizeWeeklyCost,
  __TEST,
} from '../src/utils/dashboard/operationsStrip.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Helper source contracts ────────────────────────────────────────────
console.log('— src/utils/dashboard/operationsStrip.js (source)')
{
  const src = readFileSync('src/utils/dashboard/operationsStrip.js', 'utf8')

  for (const name of [
    'buildOperationsStrip',
    'summarizeTodayProgramItems',
    'summarizeWeekProgramItems',
    'summarizeOverdueProgramItems',
    'summarizeWeeklyCost',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  // Reuses existing helpers — never re-derives shape or cost math.
  assert(/from\s+['"]\.\.\/sprayPrograms\/programCalendar\.js['"]/.test(src),
    'helper reuses programCalendar (buildProgramCalendarItems)')
  assert(/from\s+['"]\.\.\/sprayPrograms\/programCostAwareness\.js['"]/.test(src),
    'helper reuses programCostAwareness (estimateProgramItemCost + formatEstimatedCost)')
  for (const sym of [
    'buildProgramCalendarItems', 'estimateProgramItemCost', 'formatEstimatedCost',
  ]) {
    assert(new RegExp(`\\b${sym}\\b`).test(src),
      `helper references ${sym}`)
  }

  // Purity.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/from\s+['"]react['"]/.test(codeOnly), 'helper does not import react')
  assert(!/fetch\(/.test(codeOnly),               'helper does not call fetch()')
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

  assert(typeof __TEST?.DAY_MS === 'number', '__TEST.DAY_MS exposed')
  assert(typeof __TEST?.startOfDayUTC === 'function',
    '__TEST.startOfDayUTC exposed')
}

// ── 2. summarizeTodayProgramItems ────────────────────────────────────────
console.log('— summarizeTodayProgramItems behavior')
{
  const programs = [
    { id: 'p1', name: 'Greens', status: 'active' },
    { id: 'pX', name: 'Old',    status: 'archived' },
  ]
  const NOW = Date.UTC(2026, 4, 26) // 2026-05-26 00:00Z
  const items = [
    { id: 'i1', productName: 'Daconil',  status: 'planned', plannedStartDate: '2026-05-26' }, // today
    { id: 'i2', productName: 'Heritage', status: 'planned', plannedStartDate: '2026-05-27' }, // tomorrow
    { id: 'i3', productName: 'Barricade',status: 'planned', plannedStartDate: '2026-05-25' }, // yesterday
    { id: 'i4', productName: 'CompletedToday', status: 'completed', plannedStartDate: '2026-05-26' }, // wrong status
    { id: 'i5', productName: 'NoDate',   status: 'planned' }, // unscheduled
  ]
  const itemsSnap    = JSON.stringify(items)
  const programsSnap = JSON.stringify(programs)

  const r = summarizeTodayProgramItems(programs, { p1: items, pX: items }, { now: NOW })
  assert(JSON.stringify(items) === itemsSnap,    'no mutation (items)')
  assert(JSON.stringify(programs) === programsSnap, 'no mutation (programs)')
  assert(r.total === 1 && r.items[0].itemId === 'i1',
    'today bucket = exactly i1 (planned + today)',
    r.items.map(i => i.itemId))
}

// ── 3. summarizeWeekProgramItems ─────────────────────────────────────────
console.log('— summarizeWeekProgramItems behavior')
{
  const programs = [{ id: 'p1', name: 'Greens', status: 'active' }]
  const NOW = Date.UTC(2026, 4, 26)
  const items = [
    { id: 'i1', status: 'planned', plannedStartDate: '2026-05-26' }, // today
    { id: 'i2', status: 'planned', plannedStartDate: '2026-06-01' }, // +6
    { id: 'i3', status: 'planned', plannedStartDate: '2026-06-02' }, // +7 → excluded (exclusive end)
    { id: 'i4', status: 'planned', plannedStartDate: '2026-05-25' }, // yesterday
    { id: 'i5', status: 'completed', plannedStartDate: '2026-05-27' }, // wrong status
  ]
  const r = summarizeWeekProgramItems(programs, { p1: items }, { now: NOW })
  assert(r.total === 2 && r.items.map(i => i.itemId).join(',') === 'i1,i2',
    'week bucket = i1 + i2 (today + +6); +7 day excluded (end-exclusive)',
    r.items.map(i => i.itemId))
}

// ── 4. summarizeOverdueProgramItems ──────────────────────────────────────
console.log('— summarizeOverdueProgramItems behavior')
{
  const programs = [{ id: 'p1', status: 'active' }]
  const NOW = Date.UTC(2026, 4, 26)
  const items = [
    { id: 'o1', status: 'planned', plannedEndDate: '2026-05-20' },                          // overdue
    { id: 'o2', status: 'planned', plannedStartDate: '2026-05-20', plannedEndDate: null },  // start present, no end → overdue via fallback
    { id: 'o3', status: 'planned', plannedEndDate: '2026-05-26' },                          // today → NOT overdue
    { id: 'o4', status: 'planned', plannedEndDate: '2026-05-20', linkedSprayRecordId: 'sr-1' }, // linked + resolvable → NOT overdue
    { id: 'o5', status: 'planned', plannedEndDate: '2026-05-20', linkedSprayRecordId: 'sr-9' }, // stale FK → still overdue
    { id: 'o6', status: 'completed', plannedEndDate: '2026-05-20' },                        // wrong status
    { id: 'o7', status: 'planned' },                                                         // unscheduled
  ]
  const sprays = [{ id: 'sr-1' }]
  const r = summarizeOverdueProgramItems(programs, { p1: items }, sprays, { now: NOW })
  // o1 + o2 + o5; o4 is resolved-linked, o3 is today (>= today), o6 is wrong status, o7 has no date.
  const ids = r.items.map(i => i.itemId).sort().join(',')
  assert(r.total === 3 && ids === 'o1,o2,o5',
    'overdue = past-window planned rows with no resolvable link (o1 + o2 + o5)',
    r.items.map(i => i.itemId))
  // Earliest-end-first sort.
  assert(r.items[0].itemId === 'o1' || r.items[0].itemId === 'o2' || r.items[0].itemId === 'o5',
    'sort key is the planned end (most overdue first)')
}

// ── 5. summarizeWeeklyCost reuses estimateProgramItemCost ────────────────
console.log('— summarizeWeeklyCost behavior')
{
  const inv = [
    { id: 'inv-1', name: 'Daconil',  unit: 'oz/1000 sq ft', costPerUnit: 4.25 }, // ready
    { id: 'inv-2', name: 'Heritage', unit: 'oz/1000 sq ft', costPerUnit: null }, // missing
  ]
  const NOW = Date.UTC(2026, 4, 26)
  const itemsByProgramId = {
    p1: [
      { id: 'i1', productName: 'Daconil',  inventoryItemId: 'inv-1', rateValue: 2, rateUnit: 'oz/1000 sq ft', status: 'planned', plannedStartDate: '2026-05-27' }, // → 8.50
      { id: 'i2', productName: 'Heritage', inventoryItemId: 'inv-2', rateValue: 1, rateUnit: 'oz/1000 sq ft', status: 'planned', plannedStartDate: '2026-05-28' }, // missing
      { id: 'i3', productName: 'Outside',  inventoryItemId: 'inv-1', rateValue: 5, rateUnit: 'oz/1000 sq ft', status: 'planned', plannedStartDate: '2026-06-15' }, // outside week
    ],
  }
  const r = summarizeWeeklyCost(
    [{ id: 'p1', status: 'active' }],
    itemsByProgramId,
    inv,
    { now: NOW },
  )
  assert(Math.abs(r.estimatedCost - 8.50) < 1e-9,
    'weekly cost = 8.50 (only i1 within the 7-day window AND estimable)',
    r.estimatedCost)
  assert(r.estimatedItems === 1,    'estimatedItems = 1', r.estimatedItems)
  assert(r.missingCostItems === 1,  'missingCostItems = 1 (i2)', r.missingCostItems)
  assert(r.currency === 'USD',      'currency = USD')
}

// ── 6. buildOperationsStrip top-level rollup ─────────────────────────────
console.log('— buildOperationsStrip top-level shape')
{
  const NOW = Date.UTC(2026, 4, 26)
  const inv = [
    { id: 'inv-1', name: 'Daconil',  unit: 'oz/1000 sq ft', costPerUnit: 4.25 },
  ]
  const programs = [{ id: 'p1', name: 'Greens', status: 'active' }]
  const itemsByProgramId = {
    p1: [
      // today + planned + estimable
      { id: 'i1', productName: 'Daconil', inventoryItemId: 'inv-1',
        rateValue: 2, rateUnit: 'oz/1000 sq ft',
        status: 'planned', plannedStartDate: '2026-05-26', plannedEndDate: '2026-05-26' },
      // tomorrow + linked-completed for this week's count
      { id: 'i2', productName: 'Heritage', inventoryItemId: 'inv-1',
        rateValue: 1, rateUnit: 'oz/1000 sq ft',
        status: 'planned', plannedStartDate: '2026-05-27',
        linkedSprayRecordId: 'sr-1' },
      // overdue: window past + status=planned + no link
      { id: 'i3', productName: 'Stranded', status: 'planned',
        plannedStartDate: '2026-05-20', plannedEndDate: '2026-05-20' },
      // unscheduled
      { id: 'i4', productName: 'NoDate', status: 'planned' },
    ],
  }
  const sprays = [{ id: 'sr-1' }]

  const out = buildOperationsStrip({
    programs, itemsByProgramId, sprays,
    inventoryProducts: inv,
    now: NOW,
  })

  // Today bucket.
  assert(out.today.plannedItems === 1, 'today.plannedItems = 1 (i1)',     out.today.plannedItems)
  assert(out.today.linkedCompleted === 0, 'today.linkedCompleted = 0',     out.today.linkedCompleted)
  assert(Math.abs(out.today.estimatedCost - 8.50) < 1e-9,
    'today.estimatedCost = 8.50 (i1 only)', out.today.estimatedCost)

  // Week bucket.
  // i1 (today, planned) + i2 (tomorrow, status=planned) → 2 planned items
  // i2 is linked-and-resolved AND falls in this week → linkedCompleted = 1
  // estimated items in week: i1 (8.50) + i2 (4.25*1=4.25) = 12.75
  assert(out.week.plannedItems === 2,        'week.plannedItems = 2 (i1 + i2)', out.week.plannedItems)
  assert(out.week.linkedCompleted === 1,     'week.linkedCompleted = 1 (i2)',   out.week.linkedCompleted)
  assert(Math.abs(out.week.estimatedCost - 12.75) < 1e-9,
    'week.estimatedCost = 12.75', out.week.estimatedCost)
  assert(out.week.estimatedItems === 2,      'week.estimatedItems = 2', out.week.estimatedItems)
  assert(out.week.missingCostItems === 0,    'week.missingCostItems = 0', out.week.missingCostItems)

  // Overdue bucket.
  assert(out.overdue.count === 1 && out.overdue.itemsPreview[0]?.itemId === 'i3',
    'overdue.count = 1 (i3)', out.overdue.itemsPreview.map(x => x.itemId))

  // Unscheduled.
  assert(out.unscheduled.count === 1, 'unscheduled.count = 1 (i4)', out.unscheduled.count)

  // Currency + notices.
  assert(out.currency === 'USD',                       'currency = USD')
  assert(Array.isArray(out.notices),                    'notices is an array')
  assert(out.notices.find(n => n.label === 'Today'),    'notices include Today')
  assert(out.notices.find(n => n.label === 'Week cost'),'notices include Week cost')
  assert(out.notices.find(n => n.label === 'Overdue'),  'notices include Overdue')
  assert(out.notices.find(n => n.label === 'Unscheduled'),
    'notices include Unscheduled')
}

// ── 7. Empty-input behavior ──────────────────────────────────────────────
console.log('— buildOperationsStrip with no data')
{
  const out = buildOperationsStrip({})
  assert(out.today.plannedItems === 0 && out.week.plannedItems === 0,
    'no inputs → today + week counts = 0')
  assert(out.overdue.count === 0 && out.unscheduled.count === 0,
    'no inputs → overdue + unscheduled = 0')
  assert(Array.isArray(out.notices) && out.notices.length === 0,
    'no inputs → notices empty')
}

// ── 8. Dashboard card source contracts ───────────────────────────────────
console.log('— src/pages/Dashboard/DashboardOperationsStrip.jsx (source)')
{
  const src = readFileSync('src/pages/Dashboard/DashboardOperationsStrip.jsx', 'utf8')

  assert(/export\s+default\s+function\s+DashboardOperationsStrip/.test(src),
    'default exports DashboardOperationsStrip')

  // Helper + store imports.
  assert(/from\s+['"]\.\.\/\.\.\/utils\/dashboard\/operationsStrip['"]/.test(src),
    'imports buildOperationsStrip from the helper')
  for (const hook of [
    'useInventoryData', 'useSprayPrograms', 'useSpraysData',
  ]) {
    assert(new RegExp(`\\b${hook}\\b`).test(src),
      `subscribes to ${hook}`)
  }

  // Title + subtitle + boundary copy verbatim.
  assert(/Today and this week at a glance\./.test(src),
    'header renders the subtitle copy')
  for (const phrase of [
    'Read-only operations snapshot.',
    'Planned items do not create completed spray records.',
    'Inventory is not deducted from planned items.',
  ]) {
    assert(src.includes(phrase),
      `boundary copy verbatim: "${phrase}"`)
  }

  // All five tile labels.
  for (const label of [
    'Today', 'This week', 'Overdue', 'Unscheduled', 'Est. week cost',
  ]) {
    assert(src.includes(label),
      `tile label "${label}" present`)
  }

  // Per-tile routing — Calendar and Planner deep-links via useNavigate.
  assert(/navigate\(['"]\/spray['"]\s*,\s*\{\s*state:\s*\{\s*activeTab:\s*['"]Program Calendar['"]/.test(src),
    'Calendar tiles → /spray Program Calendar')
  assert(/navigate\(['"]\/spray['"]\s*,\s*\{\s*state:\s*\{\s*activeTab:\s*['"]Program Planner['"]/.test(src),
    'Planner tiles → /spray Program Planner')

  // Route labels live on the tiles.
  assert(/routeLabel="Calendar"/.test(src),
    'at least one tile carries routeLabel="Calendar"')
  assert(/routeLabel="Planner"/.test(src),
    'at least one tile carries routeLabel="Planner"')

  // No fix / apply / save / commit / edit / status affordances.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const phrase of [
    'Fix automatically', 'Apply All', 'Apply Now',
    'Save', 'Commit', 'Edit', 'Delete',
    'Link completed', 'Unlink', 'Schedule item',
    'Mark complete', 'Mark skipped',
  ]) {
    const re = new RegExp(`>\\s*${phrase}\\s*<`)
    assert(!re.test(src),
      `no >${phrase}< JSX text on the strip`)
  }

  // No fetch / /api/ / method strings / write verbs.
  assert(!/\bfetch\(/.test(codeOnly),
    'strip does not call fetch() directly')
  assert(!/\/api\//.test(codeOnly),
    'strip never references any /api/ endpoint')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'strip issues no direct POST/PATCH/DELETE')

  for (const verb of [
    'setInventoryCostBasis',
    'recordInventoryUsage',
    'createInventoryItem', 'updateInventoryItem', 'deleteInventoryItem',
    'createSpray',         'createCalendarEvent',
    'setProgramItemCompletedLink',
    'createSprayProgramItem', 'updateSprayProgramItem', 'deleteSprayProgramItem',
    'createSprayProgram',     'updateSprayProgram',     'archiveSprayProgram',
    'createBudgetEntry',   'createInvoice',     'createLedgerEntry',
    'patchInventoryCostBasis', 'patchInventoryCatalogLink',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `strip never references ${verb}`)
  }

  // Stewardship vocabulary lock.
  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
    'safe','pass','fail','score',
    'budget entry created','actual expense','spend authorization',
    'invoice processing','invoice parser','ledger entry',
    'pdf parser','ai extraction','OCR','tesseract','openai',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `strip code-only avoids "${word}"`)
  }
}

// ── 9. CSS module contracts ──────────────────────────────────────────────
console.log('— DashboardOperationsStrip.module.css contracts')
{
  const css = readFileSync('src/pages/Dashboard/DashboardOperationsStrip.module.css', 'utf8')
  for (const cls of [
    'strip', 'header', 'title', 'subtitle',
    'tiles', 'tile', 'tileValue', 'tileLabel', 'tileSub', 'tileBtn',
    'tile_ok', 'tile_warn', 'tile_info', 'tile_attention',
    'tile_muted', 'tile_cost', 'tileEmphasis',
    'noticeList', 'notice', 'noticeIcon', 'notice_warning',
    'boundaryNote',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
  // 5-up breakpoint for desktop.
  assert(/@media\s*\(min-width:\s*800px\)/.test(css),
    'CSS defines 5-up breakpoint at 800px')
  // Mobile breakpoint.
  assert(/@media\s*\(max-width:\s*700px\)/.test(css),
    'CSS defines mobile breakpoint at 700px')
}

// ── 10. Dashboard.jsx mounts the strip ───────────────────────────────────
console.log('— Dashboard.jsx mounts <DashboardOperationsStrip />')
{
  const src = readFileSync('src/pages/Dashboard/Dashboard.jsx', 'utf8')
  assert(/import\s+DashboardOperationsStrip\s+from\s+['"]\.\/DashboardOperationsStrip['"]/.test(src),
    'Dashboard imports DashboardOperationsStrip')
  assert(/<DashboardOperationsStrip\s*\/>/.test(src),
    'Dashboard mounts <DashboardOperationsStrip />')
  // Wrapped in a DashboardCard titled "Operations".
  assert(/<DashboardCard\s+title="Operations"/.test(src),
    'Dashboard renders <DashboardCard title="Operations">')
}

// ── 11. Cross-surface regression guards ──────────────────────────────────
console.log('— cross-surface regression guards')
{
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')

  const worker = readFileSync('worker/index.js', 'utf8')
  for (const route of [
    '/dashboard/operations', '/operations-strip',
    '/cost-import', '/cost-basis/bulk',
  ]) {
    assert(!worker.includes(route),
      `worker/index.js never wires ${route}`)
  }
  assert(/patchInventoryCostBasis/.test(worker),  'worker still wires patchInventoryCostBasis')
  assert(/listInventoryCostBasisAudit/.test(worker), 'worker still wires listInventoryCostBasisAudit')

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
