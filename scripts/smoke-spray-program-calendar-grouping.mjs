// Phase 7R.4 — Spray Program Calendar event grouping smoke.
//
//   node scripts/smoke-spray-program-calendar-grouping.mjs
//
// Locks:
//   - grouping helpers are pure (no react/fetch/store/mutation)
//   - groupProgramItemsForCalendar collapses program × date × area ×
//     application_type into one event per bucket
//   - notes "Water in app." → 'water-in', "Granular only" → 'granular',
//     "Aeration" → 'aeration', else → 'spray'
//   - runtime: Jan 3 Crosswinds rows group into ONE Greens event with
//     4 products; Jan 24 → ONE Greens Water In event with 7 products;
//     June 23 → ONE Greens Aeration event
//   - underlying spray_program_items count for the 2026 seed is still
//     153 (NO schema or item count change)
//   - SprayProgramCalendar.jsx uses the new helpers + mounts the new
//     application drawer; per-item drawer remains the drill-into-product
//     surface, not the primary click target
//   - ProgramCalendarApplicationDrawer.jsx has no edit / mutation /
//     deduction / spray-record affordances
//   - no new inventory or sprayPrograms routes added; no deduction
//     vocabulary in the new drawer

import { readFileSync } from 'fs'
import { pathToFileURL } from 'url'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Helper source contracts ─────────────────────────────────────────
console.log('— src/utils/sprayPrograms/programCalendar.js (source)')
{
  const src = readFileSync('src/utils/sprayPrograms/programCalendar.js', 'utf8')

  for (const name of [
    'groupProgramItemsForCalendar',
    'groupCalendarEventsByDate',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  assert(!/from\s+['"]react['"]/.test(codeOnly), 'helper does not import react')
  assert(!/fetch\(/.test(codeOnly),               'helper does not call fetch()')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'helper does not import any *Store module')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'helper does not issue mutations')

  // Mutation / deduction / spray-record vocabulary forbidden in this
  // pure-projection helper.
  for (const verb of [
    'createSpray', 'recordInventoryUsage', 'deductInventory',
    'createCalendarEvent', 'setProgramItemCompletedLink',
    'createSprayProgramItem', 'updateSprayProgramItem',
    'deleteSprayProgramItem',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `helper never references ${verb}`)
  }
}

// ── 2. Runtime: deriveApplicationType + grouping over a Crosswinds-shaped fixture ──
console.log('— grouping runtime')
{
  const mod = await import(pathToFileURL('src/utils/sprayPrograms/programCalendar.js').href)
  const { buildProgramCalendarItems, groupProgramItemsForCalendar, groupCalendarEventsByDate, __TEST } = mod

  // 2a. deriveApplicationType priority + cases.
  const t = __TEST.deriveApplicationType
  assert(t(null)                                === 'spray',    'null → spray')
  assert(t('')                                  === 'spray',    'empty → spray')
  assert(t('Spray app. Nutrient summary: ...') === 'spray',    'spray-only note → spray')
  assert(t('Water in app. Total amount: ...')  === 'water-in', '"Water in" → water-in')
  assert(t('Granular only. Total amount: ...') === 'granular', '"Granular only" → granular')
  assert(t('Aeration window June 23–25. ...')  === 'aeration', 'Aeration → aeration')
  // Aeration WINS over "water in" suffix (matches the seed June 23 notes).
  assert(t('Aeration window June 23–25. Spray on sand. Water in multiple cycles to flush.')
    === 'aeration', 'aeration beats water-in when both mentioned')

  // 2b. extractNutrientSummary.
  assert(__TEST.extractNutrientSummary('Spray app. Nutrient summary: 0.03 lbs K/1000.') === '0.03 lbs K/1000',
    'extractNutrientSummary strips label + trailing dot')
  assert(__TEST.extractNutrientSummary('no nutrient line here') === null,
    'extractNutrientSummary returns null when no nutrient line')

  // 2c. groupProgramItemsForCalendar over a 12-row mini-Crosswinds fixture
  //     mirroring the actual seed: Jan 3 spray (4), Jan 24 water-in (7),
  //     Jun 23 aeration (1). Builds the calendar items via the same
  //     buildProgramCalendarItems entry point the UI uses, so we exercise
  //     applicationNotes propagation too.
  const programs = [{ id: 'sp-x', name: 'Crosswinds Greens Program 2026', status: 'planned' }]
  const items = [
    // Jan 3 — spray
    { id: 'a1', programId: 'sp-x', targetArea: 'Greens', plannedStartDate: '2026-01-03', plannedEndDate: '2026-01-03', productName: 'Secure Action',  applicationNotes: 'Spray app. Nutrient summary: 0.03 lbs K/1000.', status: 'planned' },
    { id: 'a2', programId: 'sp-x', targetArea: 'Greens', plannedStartDate: '2026-01-03', plannedEndDate: '2026-01-03', productName: 'Rain Green Pigment', applicationNotes: 'Total amount: 64 oz total (~4 A).', status: 'planned' },
    { id: 'a3', programId: 'sp-x', targetArea: 'Greens', plannedStartDate: '2026-01-03', plannedEndDate: '2026-01-03', productName: 'Harmony',        applicationNotes: 'Total amount: 2.5 gal total (~4 A).', status: 'planned' },
    { id: 'a4', programId: 'sp-x', targetArea: 'Greens', plannedStartDate: '2026-01-03', plannedEndDate: '2026-01-03', productName: 'Prize Phiter',   applicationNotes: 'Total amount: 2.5 gal total (~4 A).', status: 'planned' },
    // Jan 24 — water-in (7 rows)
    { id: 'b1', programId: 'sp-x', targetArea: 'Greens', plannedStartDate: '2026-01-24', plannedEndDate: '2026-01-24', productName: 'Segway',          applicationNotes: 'Water in app. Total amount: 4 bottles total. Nutrient summary: 0.08 lbs N/1000, 0.16 lbs K/1000.', status: 'planned' },
    { id: 'b2', programId: 'sp-x', targetArea: 'Greens', plannedStartDate: '2026-01-24', plannedEndDate: '2026-01-24', productName: 'Prize Phiter',    applicationNotes: 'Water in app. Total amount: 2.5 gal total (~4 A).', status: 'planned' },
    { id: 'b3', programId: 'sp-x', targetArea: 'Greens', plannedStartDate: '2026-01-24', plannedEndDate: '2026-01-24', productName: 'Potassium Nitrate 13.5-0-46', applicationNotes: 'Water in app. Total amount: 50 lb total (~4 A).', status: 'planned' },
    { id: 'b4', programId: 'sp-x', targetArea: 'Greens', plannedStartDate: '2026-01-24', plannedEndDate: '2026-01-24', productName: 'Calcium Nitrate 15.5-0-0', applicationNotes: 'Water in app. Total amount: 50 lb total (~4 A).', status: 'planned' },
    { id: 'b5', programId: 'sp-x', targetArea: 'Greens', plannedStartDate: '2026-01-24', plannedEndDate: '2026-01-24', productName: 'Magnesium Sulfate', applicationNotes: 'Water in app. Total amount: 50 lb.', status: 'planned' },
    { id: 'b6', programId: 'sp-x', targetArea: 'Greens', plannedStartDate: '2026-01-24', plannedEndDate: '2026-01-24', productName: 'Soluble Iron',    applicationNotes: 'Water in app. Total amount: 5 lb.', status: 'planned' },
    { id: 'b7', programId: 'sp-x', targetArea: 'Greens', plannedStartDate: '2026-01-24', plannedEndDate: '2026-01-24', productName: 'Humic Acid',      applicationNotes: 'Water in app. Total amount: 5 gal.', status: 'planned' },
    // Jun 23 — aeration window
    { id: 'c1', programId: 'sp-x', targetArea: 'Greens', plannedStartDate: '2026-06-23', plannedEndDate: '2026-06-25', productName: 'Ecolite',         applicationNotes: 'Aeration window June 23–25. Incorporated into holes pre-sand.', status: 'planned' },
  ]
  const calendarItems = buildProgramCalendarItems(programs, { 'sp-x': items })
  assert(calendarItems.length === items.length,
    'buildProgramCalendarItems returns one row per input item', calendarItems.length)
  assert(calendarItems.every(ci => 'applicationNotes' in ci),
    'calendar items carry applicationNotes through')

  const events = groupProgramItemsForCalendar(calendarItems)

  // Jan 3 → one event, 4 products, type spray.
  const jan3 = events.filter(e => e.plannedStartDate === '2026-01-03')
  assert(jan3.length === 1, 'Jan 3 collapses to ONE event', jan3.length)
  assert(jan3[0]?.productCount === 4, 'Jan 3 event holds 4 products', jan3[0]?.productCount)
  assert(jan3[0]?.applicationType === 'spray', 'Jan 3 event type = spray')
  assert(jan3[0]?.title === 'Greens', 'Jan 3 event title = "Greens"', jan3[0]?.title)

  // Jan 24 → one event, 7 products, type water-in.
  const jan24 = events.filter(e => e.plannedStartDate === '2026-01-24')
  assert(jan24.length === 1, 'Jan 24 collapses to ONE event', jan24.length)
  assert(jan24[0]?.productCount === 7, 'Jan 24 event holds 7 products', jan24[0]?.productCount)
  assert(jan24[0]?.applicationType === 'water-in', 'Jan 24 event type = water-in')
  assert(jan24[0]?.typeLabel === 'Water In', 'Jan 24 typeLabel = "Water In"')

  // Jun 23 → aeration.
  const jun23 = events.filter(e => e.plannedStartDate === '2026-06-23')
  assert(jun23.length === 1, 'Jun 23 collapses to ONE event', jun23.length)
  assert(jun23[0]?.applicationType === 'aeration', 'Jun 23 event type = aeration')
  assert(jun23[0]?.plannedEndDate === '2026-06-25', 'Jun 23 event preserves end date 06-25')

  // Total events = 3 (one per application bucket).
  assert(events.length === 3,
    'three grouped events from 12 product rows', events.length)

  // Nutrient summary surfaces dedup'd from the items.
  assert(jan24[0]?.nutrientSummary.length === 1 && jan24[0].nutrientSummary[0].includes('0.08 lbs N/1000'),
    'Jan 24 event surfaces the Segway nutrient summary once')

  // Underlying items array is the source rows — drilling stays possible.
  for (const ev of events) {
    for (const ci of ev.items) {
      assert(ci.itemId != null, `event ${ev.id} preserves itemId for drill-into-product`)
    }
  }

  // groupCalendarEventsByDate spreads the Jun 23 event across its
  // 3-day window AND keeps the same id on each day.
  const { byDay, unscheduled } = groupCalendarEventsByDate(events)
  assert(Array.isArray(byDay['2026-06-23']) && byDay['2026-06-23'].length === 1,
    'byDay[2026-06-23] has the aeration event')
  assert(Array.isArray(byDay['2026-06-25']) && byDay['2026-06-25'][0]?.id === jun23[0].id,
    'aeration event also appears under 2026-06-25 (range expansion)')
  assert(unscheduled.length === 0,
    'no dated events fall into unscheduled')

  // Pass-through invariant: events with no dates land in unscheduled,
  // never silently dropped.
  const undatedFixture = groupProgramItemsForCalendar(buildProgramCalendarItems(
    [{ id: 'sp-y', name: 'P', status: 'planned' }],
    { 'sp-y': [{ id: 'u1', programId: 'sp-y', targetArea: 'Greens', productName: 'X', applicationNotes: 'spray app', status: 'planned' }] },
  ))
  const u = groupCalendarEventsByDate(undatedFixture)
  assert(u.unscheduled.length === 1,
    'undated event lands in unscheduled')
}

// ── 3. Crosswinds seed item count remains 153 (no schema change) ──
console.log('— Crosswinds 2026 seed — item count invariant')
{
  const seed = readFileSync('worker/migrations/0047_crosswinds_greens_program_2026_seed.sql', 'utf8')
  const itemRows = seed.match(/^\(['"]spi-cw26-/gm) ?? []
  assert(itemRows.length === 153,
    `seed still defines exactly 153 spray_program_items rows`,
    itemRows.length)
}

// ── 4. UI wiring: SprayProgramCalendar.jsx uses the new helpers + drawer ──
console.log('— src/pages/Spray/tabs/SprayProgramCalendar.jsx (wiring)')
{
  const jsx = readFileSync('src/pages/Spray/tabs/SprayProgramCalendar.jsx', 'utf8')

  // New helpers imported.
  assert(/groupProgramItemsForCalendar/.test(jsx),
    'imports groupProgramItemsForCalendar')
  assert(/groupCalendarEventsByDate/.test(jsx),
    'imports groupCalendarEventsByDate')

  // New drawer mounted.
  assert(/import\s+ProgramCalendarApplicationDrawer/.test(jsx),
    'imports the new application drawer')
  assert(/<ProgramCalendarApplicationDrawer\b/.test(jsx),
    'mounts the application drawer')

  // Per-item drawer still present (drilling target).
  assert(/<ProgramCalendarItemDrawer\b/.test(jsx),
    'per-item drawer still mounted as the drill-into-product surface')

  // Selection: event id is the primary calendar-chip target.
  assert(/selectedEventId/.test(jsx),
    'has selectedEventId state')
  assert(/setSelectedEventId/.test(jsx),
    'has setSelectedEventId setter')

  // Forbidden surfaces remain absent (no auto-link / deduction).
  const code = jsx
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'createSpray', 'recordInventoryUsage', 'deductInventory',
    'createCalendarEvent', 'setProgramItemCompletedLink',
    'createSprayProgramItem', 'updateSprayProgramItem',
    'deleteSprayProgramItem',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(code),
      `SprayProgramCalendar.jsx never references ${verb}`)
  }
}

// ── 5. New application drawer source contract ─────────────────────────
console.log('— src/pages/Spray/tabs/components/ProgramCalendarApplicationDrawer.jsx')
{
  const src = readFileSync(
    'src/pages/Spray/tabs/components/ProgramCalendarApplicationDrawer.jsx', 'utf8')

  assert(/SideDrawer/.test(src),                       'uses the SideDrawer primitive')
  assert(/Application Summary/.test(src),              'renders the Application Summary section')
  assert(/Products in this application/.test(src),     'renders the Products section')
  assert(/Nutrient Summary/.test(src),                 'renders the Nutrient Summary section')
  assert(/Notes/.test(src),                            'renders the Notes section')
  assert(/onSelectItem\?\.\(/.test(src),               'product rows call onSelectItem (drill into per-item drawer)')

  // Read-only invariants — no edit / save / mutation routes.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/fetch\(/.test(code),
    'drawer never calls fetch()')
  assert(!/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/.test(code),
    'drawer never issues a mutating HTTP method')
  for (const verb of [
    'createSpray', 'recordInventoryUsage', 'deductInventory',
    'createCalendarEvent', 'setProgramItemCompletedLink',
    'createSprayProgramItem', 'updateSprayProgramItem',
    'deleteSprayProgramItem',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(code),
      `drawer never references ${verb}`)
  }

  // Boundary copy pins the no-deduction + grouping-only intent.
  assert(/Inventory is not deducted from planned items/.test(src),
    'drawer pins the "Inventory is not deducted" boundary copy')
  assert(/Grouping is a calendar presentation only/.test(src),
    'drawer pins the "grouping is presentation only" boundary copy')
}

// ── 6. No new inventory/sprayPrograms routes added (cross-surface) ───
console.log('— cross-surface route invariants')
{
  const inv = readFileSync('worker/api/inventory.js', 'utf8')
  const sp  = readFileSync('worker/api/sprayPrograms.js', 'utf8')
  // The grouping is read-only on the client — neither worker surface
  // should have grown a "grouping" or "application" mutation route.
  assert(!/application\/group/i.test(inv) && !/application\/group/i.test(sp),
    'no new "application/group" route added')
  assert(!/calendar\/group/i.test(inv) && !/calendar\/group/i.test(sp),
    'no new "calendar/group" route added')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
