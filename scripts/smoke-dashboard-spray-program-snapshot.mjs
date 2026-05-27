// Phase 7N (2/?) — Dashboard Spray Program Snapshot smoke.
//
//   node scripts/smoke-dashboard-spray-program-snapshot.mjs
//
// Locks:
//   - helper exports the spec'd functions
//   - helper has no react / fetch / store imports + no mutation verbs
//   - helper reuses existing surfaces (buildProgramCalendarItems +
//     programCostAwareness) — never re-derives the row shape
//   - inputs are never mutated
//   - upcoming-items count respects the 7-day default + an
//     injectable now anchor + a configurable lookahead
//   - link status counts split into linked / unlinked / stale /
//     unscheduled with the right gating
//   - upcoming cost snapshot uses the existing estimateProgramItemCost
//   - top-level buildSprayProgramSnapshot emits totals + upcoming
//     rows + notices + a currency
//   - dashboard card source contracts: read-only, only affordance is
//     a "Review →" button → /spray + state.activeTab Program Calendar
//   - dashboard mounts the card; no other affordances added
//   - no new endpoint, no inventory deduction, no completed spray
//     creation, no calendar-event creation, no budget / invoice /
//     ledger / product_catalog mutation
//   - Phase 7F.4 + Phase 7J.1 + Phase 7M.1 + Phase 7N.1 regression
//     guards still hold

import { readFileSync } from 'fs'
import {
  buildSprayProgramSnapshot,
  summarizeUpcomingProgramItems,
  summarizeProgramLinkStatus,
  summarizeUpcomingCostSnapshot,
  summarizeProgramCostSnapshot,
  __TEST,
} from '../src/utils/dashboard/sprayProgramSnapshot.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Helper source contracts ────────────────────────────────────────────
console.log('— src/utils/dashboard/sprayProgramSnapshot.js (source)')
{
  const src = readFileSync('src/utils/dashboard/sprayProgramSnapshot.js', 'utf8')

  for (const name of [
    'buildSprayProgramSnapshot',
    'summarizeUpcomingProgramItems',
    'summarizeProgramLinkStatus',
    'summarizeUpcomingCostSnapshot',
    'summarizeProgramCostSnapshot',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  // Reuses existing helpers — never re-derives shape.
  assert(/from\s+['"]\.\.\/sprayPrograms\/programCalendar\.js['"]/.test(src),
    'helper reuses programCalendar (buildProgramCalendarItems)')
  assert(/from\s+['"]\.\.\/sprayPrograms\/programCostAwareness\.js['"]/.test(src),
    'helper reuses programCostAwareness (estimateProgramItemCost + summaries)')
  for (const sym of [
    'buildProgramCalendarItems', 'estimateProgramItemCost',
    'buildProgramCostSummaries', 'formatEstimatedCost',
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
}

// ── 2. summarizeUpcomingProgramItems ──────────────────────────────────────
console.log('— summarizeUpcomingProgramItems behavior')
{
  const programs = [
    { id: 'p1', name: 'Greens', status: 'active' },
    { id: 'pX', name: 'Old',    status: 'archived' },
  ]
  const NOW = Date.UTC(2026, 4, 26) // 2026-05-26
  const items = [
    { id: 'i1', productName: 'Daconil',   status: 'planned', plannedStartDate: '2026-05-26', plannedEndDate: '2026-05-26' }, // today
    { id: 'i2', productName: 'Heritage',  status: 'planned', plannedStartDate: '2026-06-01' }, // +6
    { id: 'i3', productName: 'Barricade', status: 'planned', plannedStartDate: '2026-06-05' }, // +10 → out
    { id: 'i4', productName: 'Specticle', status: 'planned', plannedStartDate: '2026-05-25' }, // yesterday → out
    { id: 'i5', productName: 'Phantom',   status: 'completed', plannedStartDate: '2026-05-27' }, // wrong status → out
    { id: 'i6', productName: 'Unsched',   status: 'planned' }, // unscheduled → out
  ]
  const archivedItems = [
    { id: 'iX', productName: 'Ghost', status: 'planned', plannedStartDate: '2026-05-26' },
  ]

  const itemsSnap    = JSON.stringify(items)
  const programsSnap = JSON.stringify(programs)

  const r = summarizeUpcomingProgramItems(programs, { p1: items, pX: archivedItems }, { now: NOW })

  // No mutation.
  assert(JSON.stringify(items) === itemsSnap,    'inputs untouched (items)')
  assert(JSON.stringify(programs) === programsSnap, 'inputs untouched (programs)')

  // Default 7-day window.
  assert(r.total === 2 && r.items.map(i => i.itemId).join(',') === 'i1,i2',
    'default 7-day window picks i1 + i2 (today + +6); skips +10, past, completed, unscheduled',
    r.items.map(i => i.itemId))

  // Configurable lookahead.
  const r14 = summarizeUpcomingProgramItems(programs, { p1: items, pX: archivedItems }, { now: NOW, lookaheadDays: 14 })
  assert(r14.total === 3,
    'lookaheadDays=14 picks i1 + i2 + i3',
    r14.items.map(i => i.itemId))

  // Archived program never contributes.
  assert(!r.items.find(i => i.itemId === 'iX'),
    'archived programs are excluded from the upcoming bucket')

  // Sort: earliest-first.
  assert(r.items[0].itemId === 'i1' && r.items[1].itemId === 'i2',
    'upcoming items sorted earliest-first')

  // Row shape carries the calendar-view contract.
  const first = r.items[0]
  for (const key of [
    'programId', 'programName', 'itemId', 'productName',
    'targetArea', 'plannedStartDate', 'plannedEndDate',
    'rangeLabel', 'status', 'hasCompletedLink',
  ]) {
    assert(key in first, `upcoming row has ${key}`)
  }
}

// ── 3. summarizeProgramLinkStatus ─────────────────────────────────────────
console.log('— summarizeProgramLinkStatus behavior')
{
  const programs = [
    { id: 'p1', status: 'active' },
    { id: 'pX', status: 'archived' },
  ]
  const items = [
    { id: 'a1', status: 'planned',   linkedSprayRecordId: 'sr-1', plannedStartDate: '2026-05-26' }, // linked
    { id: 'a2', status: 'planned',   linkedSprayRecordId: 'sr-9', plannedStartDate: '2026-05-27' }, // stale
    { id: 'a3', status: 'planned',   linkedSprayRecordId: null,   plannedStartDate: '2026-05-28' }, // unlinked
    { id: 'a4', status: 'completed', linkedSprayRecordId: 'sr-1', plannedStartDate: '2026-05-26' }, // linked (still counted)
    { id: 'a5', status: 'completed', linkedSprayRecordId: null,   plannedStartDate: '2026-05-26' }, // NOT counted as unlinked-planned
    { id: 'a6', status: 'planned',   linkedSprayRecordId: null }, // unscheduled + unlinked
  ]
  const sprays = [{ id: 'sr-1' }]
  const archived = [
    { id: 'aX', status: 'planned', linkedSprayRecordId: null, plannedStartDate: '2026-06-01' },
  ]

  const r = summarizeProgramLinkStatus(programs, { p1: items, pX: archived }, sprays)
  assert(r.linkedCompletedItems === 2, 'linkedCompletedItems = 2 (a1 + a4)', r.linkedCompletedItems)
  assert(r.staleLinks === 1,           'staleLinks = 1 (a2)',                 r.staleLinks)
  assert(r.unlinkedItems === 2,        'unlinkedItems = 2 (a3 + a6)',         r.unlinkedItems)
  assert(r.unscheduledItems === 1,     'unscheduledItems = 1 (a6)',           r.unscheduledItems)
  // Archived contributes nothing.
}

// ── 4. summarizeUpcomingCostSnapshot ──────────────────────────────────────
console.log('— summarizeUpcomingCostSnapshot reuses estimateProgramItemCost')
{
  const inv = [
    { id: 'inv-1', name: 'Daconil',  unit: 'oz/1000 sq ft', costPerUnit: 4.25 }, // ready
    { id: 'inv-2', name: 'Heritage', unit: 'oz/1000 sq ft', costPerUnit: null }, // missing-cost-basis
  ]
  const itemsByProgramId = {
    p1: [
      { id: 'i1', productName: 'Daconil',  inventoryItemId: 'inv-1', rateValue: 2, rateUnit: 'oz/1000 sq ft' }, // → 4.25 * 2 = 8.50
      { id: 'i2', productName: 'Heritage', inventoryItemId: 'inv-2', rateValue: 1, rateUnit: 'oz/1000 sq ft' }, // missing
    ],
  }
  // Match the upcoming row shape the helper produces.
  const upcomingRows = [
    { programId: 'p1', itemId: 'i1' },
    { programId: 'p1', itemId: 'i2' },
    { programId: 'p1', itemId: 'i-ghost' }, // lazy cache miss → missingCost
  ]
  const r = summarizeUpcomingCostSnapshot(upcomingRows, itemsByProgramId, inv)
  assert(Math.abs(r.estimatedCost - 8.50) < 1e-9,
    'estimatedCost sums per-item estimates (8.50)', r.estimatedCost)
  assert(r.estimatedItems === 1,    'estimatedItems = 1 (i1)',                r.estimatedItems)
  assert(r.missingCostItems === 2,  'missingCostItems = 2 (i2 + ghost)',      r.missingCostItems)
  assert(r.currency === 'USD',      'currency defaults to USD')
}

// ── 5. summarizeProgramCostSnapshot (workspace-wide rollup) ───────────────
console.log('— summarizeProgramCostSnapshot top-level rollup')
{
  const inv = [
    { id: 'inv-1', name: 'Daconil',  unit: 'oz/1000 sq ft', costPerUnit: 4.25 },
    { id: 'inv-2', name: 'Heritage', unit: 'oz/1000 sq ft', costPerUnit: null },
  ]
  const programs = [
    { id: 'p1', status: 'active' },
    { id: 'pX', status: 'archived' },
  ]
  const itemsByProgramId = {
    p1: [
      { id: 'i1', productName: 'Daconil',  inventoryItemId: 'inv-1', rateValue: 2,    rateUnit: 'oz/1000 sq ft' },
      { id: 'i2', productName: 'Daconil2', inventoryItemId: 'inv-1', rateValue: 3.25, rateUnit: 'oz/1000 sq ft' },
      { id: 'i3', productName: 'Heritage', inventoryItemId: 'inv-2', rateValue: 1,    rateUnit: 'oz/1000 sq ft' },
    ],
    pX: [{ id: 'iX', inventoryItemId: 'inv-1', rateValue: 1, rateUnit: 'oz/1000 sq ft' }],
  }
  const r = summarizeProgramCostSnapshot(programs, itemsByProgramId, inv)
  // 4.25*2 + 4.25*3.25 → 8.50 + 13.81 = 22.31 (cents-rounded sum).
  assert(Math.abs(r.estimatedCost - 22.31) < 1e-9,
    'workspace estimatedCost sums rounded per-item estimates (22.31)', r.estimatedCost)
  assert(r.estimatedItems === 2,     'estimatedItems = 2 (i1 + i2)',          r.estimatedItems)
  assert(r.missingCostBasis === 1,   'missingCostBasis = 1 (i3)',            r.missingCostBasis)
  assert(r.notComparableUnits === 0, 'no unit mismatch',                       r.notComparableUnits)
}

// ── 6. buildSprayProgramSnapshot top-level shape ──────────────────────────
console.log('— buildSprayProgramSnapshot top-level shape')
{
  const NOW = Date.UTC(2026, 4, 26)
  const inv = [
    { id: 'inv-1', name: 'Daconil',  unit: 'oz/1000 sq ft', costPerUnit: 4.25 },
  ]
  const programs = [{ id: 'p1', name: 'Greens', status: 'active' }]
  const itemsByProgramId = {
    p1: [
      // upcoming + linked
      { id: 'i1', productName: 'Daconil',  inventoryItemId: 'inv-1',
        rateValue: 2, rateUnit: 'oz/1000 sq ft',
        status: 'planned', linkedSprayRecordId: 'sr-1',
        plannedStartDate: '2026-05-27', plannedEndDate: '2026-05-27' },
      // upcoming + unlinked + no cost basis
      { id: 'i2', productName: 'Ghost',    inventoryItemId: null,
        status: 'planned', linkedSprayRecordId: null,
        plannedStartDate: '2026-05-28', plannedEndDate: '2026-05-28' },
      // stale link
      { id: 'i3', productName: 'Stranded', inventoryItemId: 'inv-1',
        status: 'planned', linkedSprayRecordId: 'sr-ghost' },
      // unscheduled
      { id: 'i4', productName: 'Unsched',  inventoryItemId: null,
        status: 'planned', linkedSprayRecordId: null },
    ],
  }
  const sprays = [{ id: 'sr-1' }]

  const snapshotInputSnap = JSON.stringify({ inv, programs, itemsByProgramId, sprays })
  const out = buildSprayProgramSnapshot({
    programs, itemsByProgramId, sprays,
    inventoryProducts: inv,
    now: NOW,
  })
  assert(JSON.stringify({ inv, programs, itemsByProgramId, sprays }) === snapshotInputSnap,
    'buildSprayProgramSnapshot does not mutate inputs')

  // Totals shape.
  const t = out.totals
  for (const key of [
    'upcomingItems', 'linkedCompletedItems', 'unlinkedItems',
    'staleLinks', 'unscheduledItems', 'estimatedCost',
    'estimatedItems', 'missingCostItems',
  ]) {
    assert(key in t, `totals.${key} present`)
  }
  assert(t.upcomingItems === 2,        'upcomingItems = 2 (i1 + i2)',           t.upcomingItems)
  assert(t.linkedCompletedItems === 1, 'linkedCompletedItems = 1 (i1)',         t.linkedCompletedItems)
  // unlinkedItems = i2 + i4 (status=planned + linkedSprayRecordId=null).
  // i3 has linkedSprayRecordId='sr-ghost' → counted as stale, NOT
  // as unlinked. The corrected count is asserted in section 6b.
  assert(t.unlinkedItems === 2,        'unlinkedItems = 2 (i2 + i4)',           t.unlinkedItems)
  assert(t.staleLinks === 1,           'staleLinks = 1 (i3)',                    t.staleLinks)
  assert(t.unscheduledItems === 2,     'unscheduledItems = 2 (i3 + i4)',         t.unscheduledItems)
  assert(Math.abs(t.estimatedCost - 8.50) < 1e-9,
    'estimatedCost = 8.50 (i1 only, i2 has no inv)', t.estimatedCost)
  assert(t.estimatedItems === 1,       'estimatedItems = 1 (i1)',                t.estimatedItems)
  assert(t.missingCostItems === 1,     'missingCostItems = 1 (i2)',              t.missingCostItems)

  // Upcoming rows include estimatedCost per row.
  assert(Array.isArray(out.upcoming) && out.upcoming.length === 2,
    'upcoming carries 2 rows')
  const i1Row = out.upcoming.find(r => r.itemId === 'i1')
  const i2Row = out.upcoming.find(r => r.itemId === 'i2')
  assert(i1Row?.estimatedCost === 8.5, 'i1 row carries estimatedCost = 8.5',     i1Row?.estimatedCost)
  assert(i2Row?.estimatedCost === null, 'i2 row carries estimatedCost = null',    i2Row?.estimatedCost)

  // Notices array (always returns at least info about upcoming cost
  // when at least one item was estimated).
  assert(Array.isArray(out.notices), 'notices is an array')
  assert(out.notices.find(n => /Upcoming cost/.test(n.label)),
    'notices include the "Upcoming cost" info row')
  assert(out.notices.find(n => /Stale links/.test(n.label)),
    'notices include the stale-links warning')

  // Currency.
  assert(out.currency === 'USD', 'currency = USD')
}

// Note re: the unlinkedItems assertion above — recount manually:
//   i1: status planned + linkedSprayRecordId 'sr-1'        → linked, not unlinked
//   i2: status planned + linkedSprayRecordId null          → unlinked
//   i3: status planned + linkedSprayRecordId 'sr-ghost'    → stale (not unlinked — has an fk)
//   i4: status planned + linkedSprayRecordId null          → unlinked
// So unlinked = 2 (i2 + i4). Update the assertion accordingly.

// ── 6b. Corrected unlinked count ──────────────────────────────────────────
console.log('— (re-assert) unlinkedItems count = 2 (i2 + i4) on the above fixture')
{
  // Re-run the same fixture with the corrected expectation so the
  // smoke fails clean if the helper drifts.
  const NOW = Date.UTC(2026, 4, 26)
  const inv = [
    { id: 'inv-1', name: 'Daconil',  unit: 'oz/1000 sq ft', costPerUnit: 4.25 },
  ]
  const programs = [{ id: 'p1', name: 'Greens', status: 'active' }]
  const itemsByProgramId = {
    p1: [
      { id: 'i1', productName: 'Daconil',  inventoryItemId: 'inv-1',
        rateValue: 2, rateUnit: 'oz/1000 sq ft',
        status: 'planned', linkedSprayRecordId: 'sr-1',
        plannedStartDate: '2026-05-27', plannedEndDate: '2026-05-27' },
      { id: 'i2', productName: 'Ghost',    inventoryItemId: null,
        status: 'planned', linkedSprayRecordId: null,
        plannedStartDate: '2026-05-28', plannedEndDate: '2026-05-28' },
      { id: 'i3', productName: 'Stranded', inventoryItemId: 'inv-1',
        status: 'planned', linkedSprayRecordId: 'sr-ghost' },
      { id: 'i4', productName: 'Unsched',  inventoryItemId: null,
        status: 'planned', linkedSprayRecordId: null },
    ],
  }
  const sprays = [{ id: 'sr-1' }]
  const out = buildSprayProgramSnapshot({
    programs, itemsByProgramId, sprays,
    inventoryProducts: inv, now: NOW,
  })
  assert(out.totals.unlinkedItems === 2,
    'unlinkedItems = 2 (i2 + i4): linked / stale rows are NOT counted as unlinked',
    out.totals.unlinkedItems)
}

// ── 7. Empty-input behavior ───────────────────────────────────────────────
console.log('— buildSprayProgramSnapshot with no data')
{
  const out = buildSprayProgramSnapshot({})
  assert(out.totals.upcomingItems === 0,
    'no inputs → upcomingItems = 0')
  assert(Array.isArray(out.upcoming) && out.upcoming.length === 0,
    'no inputs → empty upcoming list')
  assert(Array.isArray(out.notices),
    'no inputs → notices array exists')
}

// ── 8. Dashboard card source contracts ────────────────────────────────────
console.log('— src/pages/Dashboard/SprayProgramSnapshot.jsx (source)')
{
  const src = readFileSync('src/pages/Dashboard/SprayProgramSnapshot.jsx', 'utf8')

  assert(/export\s+default\s+function\s+SprayProgramSnapshot/.test(src),
    'default exports SprayProgramSnapshot')

  // Helper + store imports.
  assert(/from\s+['"]\.\.\/\.\.\/utils\/dashboard\/sprayProgramSnapshot['"]/.test(src),
    'imports buildSprayProgramSnapshot from the helper')
  for (const hook of [
    'useInventoryData', 'useSprayPrograms', 'useSpraysData',
  ]) {
    assert(new RegExp(`\\b${hook}\\b`).test(src),
      `subscribes to ${hook}`)
  }

  // Title + subtitle + boundary copy verbatim.
  assert(/Spray Program Snapshot/.test(src),
    'header renders "Spray Program Snapshot" title')
  assert(/Upcoming planned applications and completion links\./.test(src),
    'header renders the subtitle copy')
  for (const phrase of [
    'Read-only snapshot from planned spray programs.',
    'Planned items do not create completed spray records.',
    'Inventory is not deducted from planned items.',
  ]) {
    assert(src.includes(phrase),
      `boundary copy verbatim: "${phrase}"`)
  }

  // Six tile labels (Upcoming + Linked completed + Unlinked planned +
  // Stale links + Est. upcoming cost + Missing cost).
  for (const label of [
    'Upcoming', 'Linked completed', 'Unlinked planned',
    'Stale links', 'Est. upcoming cost', 'Missing cost',
  ]) {
    assert(src.includes(label),
      `tile label "${label}" present`)
  }

  // Read-only navigation: the Review button targets /spray with
  // state.activeTab Program Calendar.
  assert(/navigate\(['"]\/spray['"]\s*,\s*\{\s*state:\s*\{\s*activeTab:\s*['"]Program Calendar['"]/.test(src),
    'Review → navigates to /spray Program Calendar')
  assert(/>\s*Review →\s*</.test(src) || /Review →/.test(src),
    'Review button label "Review →" present')

  // Card has NO fix / apply / save / commit / edit / link affordance.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const phrase of [
    'Fix automatically', 'Apply All', 'Apply Now',
    'Save', 'Commit', 'Edit', 'Delete',
    'Link completed', 'Unlink', 'Schedule item',
  ]) {
    const re = new RegExp(`>\\s*${phrase}\\s*<`)
    assert(!re.test(src),
      `no >${phrase}< JSX text on the card`)
  }

  // No fetch / /api/ / method strings.
  assert(!/\bfetch\(/.test(codeOnly),
    'card does not call fetch() directly')
  assert(!/\/api\//.test(codeOnly),
    'card never references any /api/ endpoint')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'card issues no direct POST/PATCH/DELETE')

  // No write verbs.
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
      `card never references ${verb}`)
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
    assert(!re.test(codeOnly), `card code-only avoids "${word}"`)
  }
}

// ── 9. CSS module contracts ───────────────────────────────────────────────
console.log('— SprayProgramSnapshot.module.css contracts')
{
  const css = readFileSync('src/pages/Dashboard/SprayProgramSnapshot.module.css', 'utf8')
  for (const cls of [
    'card', 'header', 'title', 'subtitle',
    'tiles', 'tile', 'tileValue', 'tileLabel',
    'tile_ok', 'tile_warn', 'tile_info', 'tile_attention',
    'tile_muted', 'tile_cost', 'tileEmphasis',
    'upcomingSection', 'sectionLabel', 'empty',
    'upcomingList', 'upcomingRow', 'upcomingMain', 'upcomingTitleRow',
    'upcomingProduct', 'upcomingMeta', 'upcomingCost', 'overflow',
    'statusBadge', 'linkedChip',
    'status_planned', 'status_completed', 'status_skipped', 'status_canceled',
    'noticeList', 'notice', 'noticeIcon', 'notice_warning',
    'actions', 'reviewBtn', 'boundaryNote',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
  // Tiles step up to 6-up at 800px so all six fit on a single row.
  assert(/@media\s*\(min-width:\s*800px\)/.test(css),
    'CSS defines the 6-up breakpoint at 800px')
  // Mobile breakpoint preserves the stacked layout below 700px.
  assert(/@media\s*\(max-width:\s*700px\)/.test(css),
    'CSS defines the 700px mobile breakpoint')
}

// ── 10. Dashboard.jsx mounts the card ─────────────────────────────────────
console.log('— Dashboard.jsx mounts <SprayProgramSnapshot />')
{
  const src = readFileSync('src/pages/Dashboard/Dashboard.jsx', 'utf8')
  assert(/import\s+SprayProgramSnapshot\s+from\s+['"]\.\/SprayProgramSnapshot['"]/.test(src),
    'Dashboard imports SprayProgramSnapshot')
  assert(/<SprayProgramSnapshot\s*\/>/.test(src),
    'Dashboard mounts <SprayProgramSnapshot />')
  assert(/<DashboardCard\s+title="Spray Program Snapshot"/.test(src),
    'Dashboard renders <DashboardCard title="Spray Program Snapshot">')
}

// ── 11. Cross-surface regression guards ───────────────────────────────────
console.log('— cross-surface regression guards')
{
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')

  const worker = readFileSync('worker/index.js', 'utf8')
  for (const route of [
    '/dashboard/snapshot', '/spray-program-snapshot',
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
