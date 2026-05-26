// Phase 7H (1/?) — Spray Program Calendar smoke.
//
//   node scripts/smoke-spray-program-calendar.mjs
//
// Locks the visualization-only invariants:
//   - helper exports the spec'd functions
//   - helper has no React/fetch/store imports + no mutation verbs
//   - inputs are never mutated
//   - window math (range / single-day / missing-date) is correct
//   - grouping spans every day in the range inclusive
//   - missing-date items go to unscheduled, never silently dropped
//   - archived programs excluded by default
//   - linked-completed indicator is read-only
//   - calendar tab/view renders + boundary copy appears
//   - no createSpray / recordInventoryUsage / calendar-event writes
//   - no product_catalog mutation route added
//   - no recommendation / judgment vocabulary anywhere

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Helper source contracts ────────────────────────────────────────────
console.log('— src/utils/sprayPrograms/programCalendar.js (source)')
{
  const src = readFileSync('src/utils/sprayPrograms/programCalendar.js', 'utf8')

  for (const name of [
    'buildProgramCalendarItems',
    'groupProgramItemsByDate',
    'getProgramItemWindow',
    'formatProgramCalendarRange',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  // Purity — code-only scan so comments may discuss what we don't import.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/from\s+['"]react['"]/.test(codeOnly),     'helper does not import react')
  assert(!/fetch\(/.test(codeOnly),                   'helper does not call fetch()')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'helper does not import any *Store module')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'helper does not issue mutations')

  // No recommendation / judgment vocabulary.
  for (const word of [
    'recommend', 'correct', 'incorrect', 'pass', 'fail',
    'score', 'grade', 'safe', 'unsafe',
    'apply now', 'do not apply', 'rotate to',
  ]) {
    assert(!new RegExp(`\\b${word}\\b`, 'i').test(codeOnly),
      `no "${word}" wording in helper code`)
  }
}

// ── 2. Helper behavior ────────────────────────────────────────────────────
console.log('— programCalendar behavior')
{
  const mod = await import('../src/utils/sprayPrograms/programCalendar.js')

  // ── getProgramItemWindow ──────────────────────────────────────────
  {
    const range = mod.getProgramItemWindow({
      plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-03',
    })
    assert(range.hasAnyDate === true && range.isRange === true,
      'range window: hasAnyDate + isRange')
    assert(typeof range.start === 'number' && typeof range.end === 'number',
      'range window: start + end are epoch ms')

    const single = mod.getProgramItemWindow({ plannedStartDate: '2026-06-01' })
    assert(single.hasAnyDate === true && single.isRange === false,
      'single date: hasAnyDate true, isRange false')

    const endOnly = mod.getProgramItemWindow({ plannedEndDate: '2026-06-05' })
    assert(endOnly.hasAnyDate === true && endOnly.isRange === false,
      'end-only date treated as single anchor')

    const none = mod.getProgramItemWindow({})
    assert(none.hasAnyDate === false && none.start === null && none.end === null,
      'no dates → hasAnyDate false')

    const invalid = mod.getProgramItemWindow({
      plannedStartDate: 'banana', plannedEndDate: 'also-bad',
    })
    assert(invalid.hasAnyDate === false,
      'invalid date strings → hasAnyDate false (no throw)')

    // Inverted dates are normalized rather than producing a negative range.
    const inverted = mod.getProgramItemWindow({
      plannedStartDate: '2026-06-07', plannedEndDate: '2026-06-01',
    })
    assert(inverted.start < inverted.end && inverted.isRange === true,
      'inverted dates normalize lo→hi')
  }

  // ── formatProgramCalendarRange ────────────────────────────────────
  {
    const r1 = mod.formatProgramCalendarRange({
      plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-07',
    })
    assert(r1 === '2026-06-01 → 2026-06-07',
      'range label uses ASCII arrow', r1)

    const r2 = mod.formatProgramCalendarRange({
      plannedStartDate: '2026-06-05', plannedEndDate: '2026-06-05',
    })
    assert(r2 === '2026-06-05',
      'same start+end collapses to single day')

    const r3 = mod.formatProgramCalendarRange({ plannedStartDate: '2026-06-05' })
    assert(r3 === '2026-06-05',
      'start-only → single day')

    const r4 = mod.formatProgramCalendarRange({ plannedWindowLabel: 'Early April' })
    assert(r4 === 'Early April',
      'falls back to plannedWindowLabel when no dates')

    const r5 = mod.formatProgramCalendarRange({})
    assert(r5 === '',
      'no signals → empty string')
  }

  // ── buildProgramCalendarItems ─────────────────────────────────────
  {
    const programs = [
      { id: 'p1', name: 'Greens',  status: 'active'  },
      { id: 'p2', name: 'Archived', status: 'archived' },
      null,
    ]
    const itemsByProgramId = {
      p1: [
        { id: 'i1', plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-03',
          productName: 'Heritage', targetArea: 'Greens', status: 'planned',
          linkedSprayRecordId: 's1' },
        { id: 'i2', plannedWindowLabel: 'Mid-June touch-up', status: 'skipped',
          productName: 'Iron supplement' },
      ],
      p2: [
        { id: 'i3', plannedStartDate: '2026-07-01', status: 'planned',
          productName: 'Archived item' },
      ],
      // p2 archived → its items must be excluded by default.
    }

    const out = mod.buildProgramCalendarItems(programs, itemsByProgramId)
    assert(out.length === 2,
      'archived program excluded by default (2 items, not 3)', out.map(o => o.itemId))
    const byItemId = Object.fromEntries(out.map(o => [o.itemId, o]))
    assert(byItemId['i1'].hasCompletedLink === true,
      'i1 → hasCompletedLink true')
    assert(byItemId['i1'].rangeLabel === '2026-06-01 → 2026-06-03',
      'i1 → rangeLabel = 2026-06-01 → 2026-06-03')
    assert(byItemId['i1'].displayLabel === 'Heritage',
      'i1 → displayLabel = productName')
    assert(byItemId['i2'].isStaleOrMissingDate === true,
      'i2 (no date) → isStaleOrMissingDate true')
    assert(byItemId['i2'].rangeLabel === 'Mid-June touch-up',
      'i2 → rangeLabel falls back to plannedWindowLabel')
    assert(byItemId['i2'].hasCompletedLink === false,
      'i2 → hasCompletedLink false (no FK)')

    // includeArchived: true surfaces archived program items.
    const withArchived = mod.buildProgramCalendarItems(programs, itemsByProgramId,
      { includeArchived: true })
    assert(withArchived.length === 3,
      'includeArchived=true surfaces archived items too')

    // Programs whose items aren't cached are silently skipped (lazy
    // store cache miss).
    const cacheMiss = mod.buildProgramCalendarItems(
      [{ id: 'p3', name: 'No cache', status: 'active' }], {})
    assert(cacheMiss.length === 0,
      'program with no cached items → no rows (cache miss)')
  }

  // ── groupProgramItemsByDate ───────────────────────────────────────
  {
    const programs = [{ id: 'p1', name: 'P', status: 'active' }]
    const items = {
      p1: [
        // 3-day range — should appear under every day inclusive.
        { id: 'r1', plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-03',
          productName: 'Range item', status: 'planned' },
        // Single day.
        { id: 'r2', plannedStartDate: '2026-06-05', productName: 'Single', status: 'planned' },
        // No date → unscheduled.
        { id: 'r3', plannedWindowLabel: 'TBD', productName: 'Unscheduled', status: 'planned' },
      ],
    }
    const calItems = mod.buildProgramCalendarItems(programs, items)
    const { byDay, unscheduled } = mod.groupProgramItemsByDate(calItems)

    assert(Array.isArray(byDay['2026-06-01']) &&
           byDay['2026-06-01'].some(i => i.itemId === 'r1'),
      'range item appears on day 1')
    assert(byDay['2026-06-02']?.some(i => i.itemId === 'r1'),
      'range item appears on day 2 (middle of window)')
    assert(byDay['2026-06-03']?.some(i => i.itemId === 'r1'),
      'range item appears on day 3 (end of window)')
    assert(!byDay['2026-06-04']?.some(i => i.itemId === 'r1'),
      'range item does NOT appear on day 4 (just outside window)')
    assert(byDay['2026-06-05']?.some(i => i.itemId === 'r2'),
      'single-day item appears on its day')
    assert(unscheduled.length === 1 && unscheduled[0].itemId === 'r3',
      'unscheduled item goes to unscheduled bucket')

    // Sort: linked-completed first, then by status, then by name.
    const programs2 = [{ id: 'p1', name: 'P', status: 'active' }]
    const items2 = {
      p1: [
        { id: 'a', plannedStartDate: '2026-06-10', productName: 'A',
          status: 'canceled' },
        { id: 'b', plannedStartDate: '2026-06-10', productName: 'B',
          status: 'planned', linkedSprayRecordId: 's1' },
        { id: 'c', plannedStartDate: '2026-06-10', productName: 'C',
          status: 'planned' },
      ],
    }
    const cal2 = mod.buildProgramCalendarItems(programs2, items2)
    const { byDay: bd2 } = mod.groupProgramItemsByDate(cal2)
    const day = bd2['2026-06-10']
    assert(day[0].itemId === 'b',
      'sort: linked-completed first', day.map(i => i.itemId))
    // Remaining are planned then canceled, both ordered by name.
    assert(day[1].itemId === 'c' && day[2].itemId === 'a',
      'sort: by status (planned before canceled), then name', day.map(i => i.itemId))

    // Defensive null safety.
    const empty = mod.groupProgramItemsByDate([])
    assert(Object.keys(empty.byDay).length === 0 && empty.unscheduled.length === 0,
      'empty input → empty result')
    const nullSafe = mod.groupProgramItemsByDate(null)
    assert(Object.keys(nullSafe.byDay).length === 0,
      'null input → empty result, no throw')

    // Pathological range cap: a 5-year window doesn't explode by-day.
    const longCal = mod.buildProgramCalendarItems(
      [{ id: 'p', name: 'P', status: 'active' }],
      { p: [{ id: 'huge', plannedStartDate: '2026-01-01',
              plannedEndDate: '2031-01-01', productName: 'Huge', status: 'planned' }] },
    )
    const grp = mod.groupProgramItemsByDate(longCal)
    assert(grp.unscheduled.some(i => i.itemId === 'huge'),
      'pathological range falls back to unscheduled too')
    assert(Object.keys(grp.byDay).length === 1,
      'pathological range only emits its anchor day (366-day cap)')
  }

  // ── Purity ────────────────────────────────────────────────────────
  {
    const programs = [{ id: 'p1', name: 'P', status: 'active' }]
    const items = { p1: [{ id: 'i1', plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-03', productName: 'X', status: 'planned' }] }
    const before = JSON.stringify({ programs, items })
    const cal = mod.buildProgramCalendarItems(programs, items)
    mod.groupProgramItemsByDate(cal)
    mod.getProgramItemWindow(items.p1[0])
    mod.formatProgramCalendarRange(items.p1[0])
    assert(JSON.stringify({ programs, items }) === before,
      'helpers do not mutate programs / items inputs')
  }

  // ── Test seam sanity ─────────────────────────────────────────────
  {
    assert(mod.__TEST.isValidDate('2026-06-01') === true, 'isValidDate true')
    assert(mod.__TEST.isValidDate('banana') === false,    'isValidDate false')
    assert(mod.__TEST.isValidDate(null) === false,        'isValidDate null')
    assert(mod.__TEST.MAX_RANGE_DAYS === 366,             'MAX_RANGE_DAYS = 366')
  }
}

// ── 3. Tab body source contracts ─────────────────────────────────────────
console.log('— SprayProgramCalendar.jsx (tab body)')
{
  const src = readFileSync('src/pages/Spray/tabs/SprayProgramCalendar.jsx', 'utf8')

  assert(/export\s+default\s+function\s+SprayProgramCalendar\b/.test(src),
    'default exports SprayProgramCalendar')
  // Reuses the store + the helper.
  assert(/useSprayPrograms\b/.test(src),
    'reads useSprayPrograms()')
  assert(/listSprayProgramItems\b/.test(src),
    'invokes listSprayProgramItems to fill the per-program cache')
  for (const fn of ['buildProgramCalendarItems', 'groupProgramItemsByDate']) {
    assert(new RegExp(`\\b${fn}\\b`).test(src), `tab imports ${fn}`)
  }

  // Renders title + agenda + grid + unscheduled.
  assert(/Spray Program Calendar/.test(src),
    'tab body title "Spray Program Calendar"')
  // Boundary copy lines per spec.
  const srcNorm = src.replace(/\s+/g, ' ')
  for (const phrase of [
    'Calendar view is read-only.',
    'Planned windows do not create completed spray records.',
    'Moving items on this view is not enabled yet.',
    'Inventory is not deducted from planned items.',
  ]) {
    assert(srcNorm.includes(phrase),
      `boundary copy present: "${phrase}"`)
  }

  // Status badge labels are present.
  for (const s of ['Planned', 'Completed', 'Skipped', 'Canceled']) {
    assert(new RegExp(`\\b${s}\\b`).test(src),
      `status label "${s}" present`)
  }
  // Linked completed indicator.
  assert(/Linked completed/.test(src),
    'linked-completed indicator copy present')
  // Unscheduled bucket header.
  assert(/Unscheduled \/ no date/.test(src),
    'unscheduled bucket header present')

  // No mutations / no calendar-event writes / no spray-record creation.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/createSpray\s*\(/.test(codeOnly),
    'tab never calls createSpray(...)')
  assert(!/recordInventoryUsage/.test(codeOnly),
    'tab never calls recordInventoryUsage')
  assert(!/createCalendarEvent\s*\(/.test(codeOnly),
    'tab never calls createCalendarEvent (no auto-calendar)')
  assert(!/setProgramItemCompletedLink/.test(codeOnly),
    'tab never writes linked_spray_record_id (read-only view)')
  assert(!/createSprayProgramItem|updateSprayProgramItem|deleteSprayProgramItem/.test(codeOnly),
    'tab never writes spray_program_items')
  assert(!/createSprayProgram|updateSprayProgram|archiveSprayProgram/.test(codeOnly),
    'tab never writes spray_programs')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'tab issues no direct POST/PATCH/DELETE')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(codeOnly),
    'tab never POSTs/PATCHes/DELETEs /api/product-catalog')

  // No recommendation / judgment vocabulary.
  for (const word of [
    'recommend', 'correct', 'incorrect', 'pass', 'fail',
    'score', 'grade', 'safe', 'unsafe',
    'apply now', 'do not apply', 'rotate to',
  ]) {
    assert(!new RegExp(`\\b${word}\\b`, 'i').test(codeOnly),
      `no "${word}" wording in tab body`)
  }
}

// ── 4. Spray workspace wires the tab ──────────────────────────────────────
console.log('— Sprays workspace registers Program Calendar tab')
{
  const shell = readFileSync('src/pages/Spray/Spray.jsx', 'utf8')

  assert(/from\s+['"]\.\/tabs\/SprayProgramCalendar['"]/.test(shell),
    'Sprays imports SprayProgramCalendar tab')

  const tabsMatch = shell.match(/const\s+TABS\s*=\s*\[([^\]]+)\]/)
  assert(tabsMatch && /'Program Calendar'/.test(tabsMatch[1]),
    "'Program Calendar' present in TABS array")

  assert(/activeTab\s*===\s*'Program Calendar'\s*&&\s*<SprayProgramCalendar/.test(shell),
    "Program Calendar tab body wired to activeTab === 'Program Calendar'")

  // Pre-existing tabs still present (regression guard).
  for (const t of ['Overview', 'Spray Calendar', 'New Application', 'Spray Records',
                   'Planned Programs', 'Program Planner', 'Mix Calculator',
                   'Reports', 'Program Intelligence']) {
    assert(tabsMatch && new RegExp(`'${t}'`).test(tabsMatch[1]),
      `pre-existing tab '${t}' still in TABS`)
  }
}

// ── 5. CSS contracts ──────────────────────────────────────────────────────
console.log('— SprayProgramCalendar.module.css')
{
  const css = readFileSync('src/pages/Spray/tabs/SprayProgramCalendar.module.css', 'utf8')
  for (const cls of [
    'boundaryNote', 'toolbarRow', 'navBtn', 'monthHeader',
    'gridWrap', 'weekdayRow', 'weekdayCell', 'grid',
    'dayCell', 'dayCell_outMonth', 'dayCell_hasItems', 'dayNum',
    'dayItem', 'status_planned', 'status_completed', 'status_skipped', 'status_canceled',
    'dayOverflow', 'completedDot',
    'agendaSection', 'sectionLabel', 'agendaList', 'agendaItem',
    'agendaStatus_planned', 'agendaStatus_completed', 'agendaStatus_skipped', 'agendaStatus_canceled',
    'agendaLinkedChip', 'agendaMeta',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
  // Mobile-first guard.
  assert(/@media\s*\(max-width:\s*\d+px\)/.test(css),
    'CSS has a mobile-first max-width @media breakpoint')
}

// ── 6. Spray save + forbidden-write invariants ───────────────────────────
console.log('— spray save payload + forbidden-write invariants')
{
  const sprayBuilder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
  const payload = sprayBuilder.match(/products:\s*enrichedRows\.map\([\s\S]*?\)\),/)?.[0] ?? ''
  assert(payload.length > 0, 'spray save payload block found')
  assert(!/productCatalogId|catalogId|intel\b|intelligence|recommendation|rotation|interval|programId|program\b/i.test(payload),
    'spray save payload omits program/intel/catalog keys')

  const idx = readFileSync('worker/index.js', 'utf8')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(idx)
      && !/(POST|PATCH|DELETE)[^\n]{0,80}['"]\/api\/product-catalog['"]/.test(idx),
    'still no POST/PATCH/DELETE on /api/product-catalog')

  // No new write routes on spray-program-items beyond Phase 7F/7G.
  assert(/patchSprayProgramItemCompletedLink/.test(idx),
    'Phase 7F.4 completed-link route still wired (regression guard)')
}

// ── Result ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
