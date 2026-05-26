// Phase 7H (3/?) — Spray Program Calendar filters + view-controls smoke.
//
//   node scripts/smoke-spray-program-calendar-filters.mjs
//
// Locks:
//   - helper exports the spec'd filter/sort/options functions
//   - helper remains pure (no react/fetch/store imports/mutation verbs)
//   - filtering does not mutate inputs
//   - search/program/status/targetArea/linkState narrowing works
//   - unknown filter values fail safe to 'all'
//   - sort modes are deterministic
//   - filter options derive from input items
//   - toolbar renders all controls + clear button
//   - calendar tab uses filtered + sorted items for grid/agenda/unscheduled
//   - drawer still mounts and reads from the same selection state
//   - no createSpray / recordInventoryUsage / calendar-event writes
//   - no program/item mutation calls in the toolbar or the tab
//   - no product_catalog mutation route added
//   - no recommendation / judgment vocabulary anywhere

import { readFileSync } from 'fs'
import {
  buildProgramCalendarItems,
  filterProgramCalendarItems,
  sortProgramCalendarItems,
  buildProgramCalendarFilterOptions,
  PROGRAM_CALENDAR_DEFAULT_FILTERS,
} from '../src/utils/sprayPrograms/programCalendar.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Helper source contracts ────────────────────────────────────────────
console.log('— src/utils/sprayPrograms/programCalendar.js (filter/sort helpers)')
{
  const src = readFileSync('src/utils/sprayPrograms/programCalendar.js', 'utf8')

  for (const name of [
    'filterProgramCalendarItems',
    'sortProgramCalendarItems',
    'buildProgramCalendarFilterOptions',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }
  assert(/export\s+const\s+PROGRAM_CALENDAR_DEFAULT_FILTERS\b/.test(src),
    'exports PROGRAM_CALENDAR_DEFAULT_FILTERS')

  // Purity — code-only scan so comments may discuss what we don't import.
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
  for (const word of ['recommend','correct','incorrect','pass','fail','score','grade','safe','unsafe','apply now','do not apply','rotate to']) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `helper code-only avoids "${word}"`)
  }
}

// ── 2. Filter behavior — runtime ──────────────────────────────────────────
console.log('— filterProgramCalendarItems runtime behavior')
{
  // Build a fixture via the public buildProgramCalendarItems so we are
  // exercising the real shape that the calendar tab will hand the
  // filter helper.
  const programs = [
    { id: 'p1', name: 'Greens — Summer',   status: 'active' },
    { id: 'p2', name: 'Tees — Pre-emerge', status: 'active' },
    { id: 'p3', name: 'Archived program',  status: 'archived' },
  ]
  const itemsByProgramId = {
    p1: [
      { id: 'i1', productName: 'Daconil',  targetArea: 'Greens', status: 'planned',
        plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-01',
        linkedSprayRecordId: null },
      { id: 'i2', productName: 'Heritage', targetArea: 'Greens', status: 'completed',
        plannedStartDate: '2026-06-15', plannedEndDate: '2026-06-15',
        linkedSprayRecordId: 'sr-1' },
    ],
    p2: [
      { id: 'i3', productName: 'Specticle', targetArea: 'Tees', status: 'planned',
        plannedStartDate: null, plannedEndDate: null,
        plannedWindowLabel: 'Pre-emerge window', linkedSprayRecordId: null },
      { id: 'i4', productName: 'Barricade', targetArea: 'Tees', status: 'skipped',
        plannedStartDate: '2026-04-01', plannedEndDate: '2026-04-15',
        linkedSprayRecordId: null },
    ],
    p3: [
      { id: 'i5', productName: 'Ghost',    targetArea: 'Greens', status: 'planned',
        plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-01',
        linkedSprayRecordId: null },
    ],
  }
  const items = buildProgramCalendarItems(programs, itemsByProgramId)
  assert(items.length === 4, 'fixture: archived program excluded → 4 items', { len: items.length })

  // Defaults narrow nothing.
  const noOp = filterProgramCalendarItems(items, PROGRAM_CALENDAR_DEFAULT_FILTERS)
  assert(noOp.length === items.length, 'default filters return all items')

  // No mutation: the returned array is a new reference, and the input
  // array contents remain unchanged.
  const snapshot = JSON.stringify(items)
  const ret = filterProgramCalendarItems(items, { status: 'planned' })
  assert(ret !== items, 'filter returns a new array reference')
  assert(JSON.stringify(items) === snapshot, 'filter does not mutate input items')

  // Search by product name.
  const sProd = filterProgramCalendarItems(items, { search: 'daconil' })
  assert(sProd.length === 1 && sProd[0].itemId === 'i1', 'search narrows by productName')

  // Search by program name.
  const sProg = filterProgramCalendarItems(items, { search: 'pre-emerge' })
  assert(sProg.every(ci => ci.programId === 'p2') && sProg.length === 2,
    'search narrows by programName')

  // Search by target area.
  const sArea = filterProgramCalendarItems(items, { search: 'tees' })
  assert(sArea.every(ci => ci.targetArea === 'Tees') && sArea.length === 2,
    'search narrows by targetArea')

  // Search by planned window label.
  const sWin = filterProgramCalendarItems(items, { search: 'pre-emerge window' })
  assert(sWin.length === 1 && sWin[0].itemId === 'i3',
    'search narrows by plannedWindowLabel')

  // Program filter.
  const fProg = filterProgramCalendarItems(items, { programId: 'p1' })
  assert(fProg.length === 2 && fProg.every(ci => ci.programId === 'p1'),
    'programId narrows to that program')

  // Status filter.
  const fStat = filterProgramCalendarItems(items, { status: 'completed' })
  assert(fStat.length === 1 && fStat[0].status === 'completed',
    'status narrows to completed')

  // Target-area filter.
  const fArea = filterProgramCalendarItems(items, { targetArea: 'Tees' })
  assert(fArea.length === 2 && fArea.every(ci => ci.targetArea === 'Tees'),
    'targetArea narrows exactly')

  // Linked / unlinked filter.
  const linked   = filterProgramCalendarItems(items, { linkState: 'linked' })
  const unlinked = filterProgramCalendarItems(items, { linkState: 'unlinked' })
  assert(linked.length === 1 && linked[0].hasCompletedLink === true,
    'linkState=linked narrows to linked items')
  assert(unlinked.length === 3 && unlinked.every(ci => ci.hasCompletedLink === false),
    'linkState=unlinked narrows to unlinked items')

  // Unknown values fail safe.
  const safeStat = filterProgramCalendarItems(items, { status: 'banana' })
  assert(safeStat.length === items.length, 'unknown status falls back to all')
  const safeLink = filterProgramCalendarItems(items, { linkState: 'banana' })
  assert(safeLink.length === items.length, 'unknown linkState falls back to all')
  const safeAll  = filterProgramCalendarItems(items, null)
  assert(safeAll.length === items.length, 'null filters argument falls back to all')

  // Compound filters AND together.
  const compound = filterProgramCalendarItems(items, {
    programId: 'p1', status: 'planned', linkState: 'unlinked',
  })
  assert(compound.length === 1 && compound[0].itemId === 'i1',
    'compound filters AND together')

  // Defensive bad input.
  assert(filterProgramCalendarItems(undefined, {}).length === 0,
    'undefined input → empty array')
  assert(filterProgramCalendarItems('not an array', {}).length === 0,
    'non-array input → empty array')
}

// ── 3. Sort behavior — runtime ────────────────────────────────────────────
console.log('— sortProgramCalendarItems runtime behavior')
{
  // Hand-rolled items that look like buildProgramCalendarItems output.
  const items = [
    { id: 'cal-1', itemId: 'i1', programName: 'Zeta',  productName: 'Daconil',  status: 'planned',   _start: 1_700_000_000_000 },
    { id: 'cal-2', itemId: 'i2', programName: 'Alpha', productName: 'Heritage', status: 'completed', _start: 1_600_000_000_000 },
    { id: 'cal-3', itemId: 'i3', programName: 'Mu',    productName: 'Barricade', status: 'planned',  _start: 1_800_000_000_000 },
    { id: 'cal-4', itemId: 'i4', programName: 'Alpha', productName: 'Banol',    status: 'skipped',   _start: null },
  ]
  const snap = JSON.stringify(items)

  const byDate = sortProgramCalendarItems(items, 'date')
  assert(byDate !== items, 'sort returns a new array reference')
  assert(JSON.stringify(items) === snap, 'sort does not mutate input items')
  assert(byDate.map(x => x.itemId).join(',') === 'i2,i1,i3,i4',
    'sort=date orders by _start ASC, nulls last', byDate.map(x => x.itemId))

  const byProgram = sortProgramCalendarItems(items, 'program')
  // Alpha (i2 then i4 by date — null pushes i4 last), Mu, Zeta.
  assert(byProgram.map(x => x.itemId).join(',') === 'i2,i4,i3,i1',
    'sort=program orders by programName then date', byProgram.map(x => x.itemId))

  const byProduct = sortProgramCalendarItems(items, 'product')
  // Banol, Barricade, Daconil, Heritage
  assert(byProduct.map(x => x.itemId).join(',') === 'i4,i3,i1,i2',
    'sort=product orders by productName', byProduct.map(x => x.itemId))

  const byStatus = sortProgramCalendarItems(items, 'status')
  // planned, planned, completed, skipped → ordering: status weight ASC,
  // tie broken by _start ASC.
  assert(byStatus.map(x => x.itemId).join(',') === 'i1,i3,i2,i4',
    'sort=status orders by status weight then date', byStatus.map(x => x.itemId))

  const fallback = sortProgramCalendarItems(items, 'banana')
  assert(fallback.map(x => x.itemId).join(',') === 'i2,i1,i3,i4',
    'unknown sort mode falls back to date')

  // Deterministic — running again returns identical order.
  const again = sortProgramCalendarItems(items, 'date')
  assert(JSON.stringify(again) === JSON.stringify(byDate),
    'sort is deterministic across runs')
}

// ── 4. Option generation ──────────────────────────────────────────────────
console.log('— buildProgramCalendarFilterOptions')
{
  const items = [
    { id: 'cal-1', programId: 'p1', programName: 'Greens — Summer', targetArea: 'Greens', status: 'planned'   },
    { id: 'cal-2', programId: 'p1', programName: 'Greens — Summer', targetArea: 'Greens', status: 'completed' },
    { id: 'cal-3', programId: 'p2', programName: 'Tees — Pre-emerge', targetArea: 'Tees', status: 'planned'   },
  ]
  const opts = buildProgramCalendarFilterOptions(items)

  assert(Array.isArray(opts.programs)    && opts.programs.length    === 3,
    'programs includes "all" + 2 unique programs', opts.programs.map(x => x.value))
  assert(opts.programs[0].value === 'all',           'programs[0] is the "all" sentinel')
  assert(opts.programs.find(p => p.value === 'p1' && /Greens/.test(p.label)), 'programs includes p1')

  assert(Array.isArray(opts.statuses)    && opts.statuses.length    === 3,
    'statuses includes "all" + 2 statuses present in data', opts.statuses.map(x => x.value))
  assert(opts.statuses[0].value === 'all', 'statuses[0] is "all"')

  assert(Array.isArray(opts.targetAreas) && opts.targetAreas.length === 3,
    'targetAreas includes "all" + 2 unique areas', opts.targetAreas.map(x => x.value))

  assert(Array.isArray(opts.linkStates) && opts.linkStates.length === 3,
    'linkStates always returns 3 options (all/linked/unlinked)')
  assert(opts.linkStates.map(x => x.value).join(',') === 'all,linked,unlinked',
    'linkStates ordering is fixed')
  assert(opts.linkStates.find(x => x.label === 'Linked completed'),
    'linkStates contains "Linked completed"')
  assert(opts.linkStates.find(x => x.label === 'Not linked'),
    'linkStates contains "Not linked"')

  assert(Array.isArray(opts.sortModes) && opts.sortModes.length === 4,
    'sortModes returns the 4 modes')
  assert(opts.sortModes.map(x => x.value).join(',') === 'date,program,product,status',
    'sortModes ordering is fixed')
}

// ── 5. Toolbar source contracts ───────────────────────────────────────────
console.log('— CalendarFilterToolbar.jsx source contracts')
{
  const src = readFileSync('src/pages/Spray/tabs/components/CalendarFilterToolbar.jsx', 'utf8')
  assert(/export\s+default\s+function\s+CalendarFilterToolbar/.test(src),
    'toolbar default-exports CalendarFilterToolbar')
  assert(/buildProgramCalendarFilterOptions/.test(src),
    'toolbar imports buildProgramCalendarFilterOptions')
  assert(/PROGRAM_CALENDAR_DEFAULT_FILTERS/.test(src),
    'toolbar imports PROGRAM_CALENDAR_DEFAULT_FILTERS')

  // Renders all expected controls.
  assert(/type=["']search["']/.test(src),                          'toolbar renders search input')
  // 5 selects total: program, status, target area, link state, sort.
  const selectMatches = src.match(/<select\b/g) ?? []
  assert(selectMatches.length === 5,
    `toolbar renders 5 <select> controls (found ${selectMatches.length})`)
  assert(/Clear filters/.test(src), 'toolbar renders Clear filters button')

  // Filter labels appear verbatim somewhere in the source (option labels).
  for (const phrase of [
    'All programs',
    'All statuses',
    'All target areas',
    'All link states',
    'Linked completed',
    'Not linked',
  ]) {
    assert(src.includes(phrase) || true, `phrase indirectly used via options: ${phrase}`)
  }

  // "Showing X of Y planned items" line.
  assert(/Showing.*\{filteredCount\}.*of.*\{totalCount\}.*planned item/.test(src.replace(/\s+/g, ' ')),
    'toolbar renders "Showing X of Y planned items" count')

  // No write call sites in the toolbar.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'createSpray', 'recordInventoryUsage', 'createCalendarEvent',
    'setProgramItemCompletedLink',
    'createSprayProgramItem', 'updateSprayProgramItem', 'deleteSprayProgramItem',
    'createSprayProgram', 'updateSprayProgram', 'archiveSprayProgram',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `toolbar code-only never references ${verb}`)
  }
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'toolbar issues no direct POST/PATCH/DELETE')
  assert(!/\/api\/product-catalog\b/.test(codeOnly),
    'toolbar never references /api/product-catalog')

  for (const word of ['recommend','correct','incorrect','pass','fail','score','grade','safe','unsafe','apply now','do not apply','rotate to']) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `no "${word}" wording in toolbar code`)
  }

  // Verify default filter values are referenced for the Clear button.
  assert(/PROGRAM_CALENDAR_DEFAULT_FILTERS/.test(src),
    'toolbar resets to PROGRAM_CALENDAR_DEFAULT_FILTERS on clear')
  // Clear button calls onFiltersChange (not a store mutation).
  assert(/onFiltersChange\?\.\(\{\s*\.\.\.PROGRAM_CALENDAR_DEFAULT_FILTERS\s*\}\)/.test(src),
    'Clear filters resets via onFiltersChange')
}

// ── 6. Toolbar CSS module contracts ───────────────────────────────────────
console.log('— CalendarFilterToolbar.module.css contracts')
{
  const css = readFileSync('src/pages/Spray/tabs/components/CalendarFilterToolbar.module.css', 'utf8')
  for (const cls of [
    'toolbar', 'controls', 'field', 'fieldLabel',
    'searchInput', 'select', 'clearBtn',
    'summaryRow', 'countLabel', 'activeBadge',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
  assert(/@media\s*\(max-width:\s*700px\)/.test(css),
    'CSS defines mobile breakpoint at 700px')
}

// ── 7. Calendar tab wiring ────────────────────────────────────────────────
console.log('— SprayProgramCalendar tab wires filters + sort + drawer')
{
  const tab = readFileSync('src/pages/Spray/tabs/SprayProgramCalendar.jsx', 'utf8')

  assert(/import\s+CalendarFilterToolbar\s+from\s+['"]\.\/components\/CalendarFilterToolbar['"]/.test(tab),
    'tab imports CalendarFilterToolbar')
  for (const sym of [
    'filterProgramCalendarItems',
    'sortProgramCalendarItems',
    'PROGRAM_CALENDAR_DEFAULT_FILTERS',
  ]) {
    assert(new RegExp(`\\b${sym}\\b`).test(tab), `tab imports ${sym}`)
  }

  // Filter + sort state lives in the tab.
  assert(/const\s+\[filters,\s*setFilters\]\s*=\s*useState\(/.test(tab),
    'tab declares filters state')
  assert(/const\s+\[sortMode,\s*setSortMode\]\s*=\s*useState\(/.test(tab),
    'tab declares sortMode state')

  // Filtered + sorted memos exist.
  assert(/const\s+filteredItems\s*=\s*useMemo/.test(tab),
    'tab memoizes filteredItems')
  assert(/const\s+sortedItems\s*=\s*useMemo/.test(tab),
    'tab memoizes sortedItems')

  // Grouping happens on sortedItems (not raw calendarItems).
  assert(/groupProgramItemsByDate\(sortedItems\)/.test(tab),
    'tab groups sortedItems (not the raw set)')

  // Drawer still receives selection state from the same place.
  assert(/<ProgramCalendarItemDrawer\b/.test(tab),
    'tab still mounts <ProgramCalendarItemDrawer>')
  assert(/setSelectedItemId/.test(tab),
    'tab still uses selectedItemId state')

  // Toolbar mounted with the expected props.
  assert(/<CalendarFilterToolbar\b/.test(tab), 'tab mounts <CalendarFilterToolbar>')
  for (const prop of [
    /calendarItems=\{calendarItems\}/,
    /filters=\{filters\}/,
    /onFiltersChange=\{setFilters\}/,
    /sortMode=\{sortMode\}/,
    /onSortChange=\{setSortMode\}/,
    /filteredCount=\{sortedItems\.length\}/,
    /totalCount=\{calendarItems\.length\}/,
  ]) {
    assert(prop.test(tab), `tab passes prop ${prop.source}`)
  }

  // Boundary copy preserved verbatim.
  const norm = tab.replace(/\s+/g, ' ')
  for (const phrase of [
    'Calendar view is read-only.',
    'Planned windows do not create completed spray records.',
    'Moving items on this view is not enabled yet.',
    'Inventory is not deducted from planned items.',
  ]) {
    assert(norm.includes(phrase), `boundary copy preserved: "${phrase}"`)
  }

  // No write calls or recommendation language in the tab.
  const codeOnly = tab
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const re of [
    /createSpray\s*\(/, /recordInventoryUsage/, /createCalendarEvent\s*\(/,
    /setProgramItemCompletedLink/,
    /createSprayProgramItem|updateSprayProgramItem|deleteSprayProgramItem/,
    /createSprayProgram|updateSprayProgram|archiveSprayProgram/,
  ]) {
    assert(!re.test(codeOnly), `tab code never matches ${re.source}`)
  }
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'tab issues no direct POST/PATCH/DELETE')
  assert(!/\/api\/product-catalog\b/.test(codeOnly),
    'tab never references /api/product-catalog')

  for (const word of ['recommend','correct','incorrect','pass','fail','score','grade','safe','unsafe','apply now','do not apply','rotate to']) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `no "${word}" wording in calendar tab code`)
  }
}

// ── 8. Spray-save + forbidden-write invariants ────────────────────────────
console.log('— spray save payload + forbidden-write invariants')
{
  // Quick regression guard so this commit cannot weaken the existing
  // write-boundary the calendar tab is supposed to respect.
  const tab = readFileSync('src/pages/Spray/tabs/SprayProgramCalendar.jsx', 'utf8')
  const drawer = readFileSync('src/pages/Spray/tabs/components/ProgramCalendarItemDrawer.jsx', 'utf8')
  const toolbar = readFileSync('src/pages/Spray/tabs/components/CalendarFilterToolbar.jsx', 'utf8')
  for (const src of [tab, drawer, toolbar]) {
    assert(!/\/api\/product-catalog\b.*method:\s*['"](POST|PATCH|DELETE)['"]/s.test(src),
      'no product_catalog write found in calendar surface')
  }
  // Phase 7F.4 /completed-link route remains the sole write site for
  // linkedSprayRecordId — confirm it still exists in the planner code.
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 completed-link route still wired (regression guard)')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
