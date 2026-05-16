// Phase 24C — Morning Operations Brief smoke test.
//
// Verifies text generation, weather summary variants, cart status
// rendering, attention-item inclusion, priority inclusion, CSV row
// flattening, empty-state handling, and filename helper.
//
//   node scripts/smoke-operations-morning-brief.mjs

import {
  buildMorningBrief,
  buildBriefCsvRows,
  defaultBriefFilename,
} from '../src/utils/operations/morningBrief.js'

let passed = 0
let failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`) }
  else {
    failed += 1
    console.error(`  ✗ ${label}`)
    if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx, null, 2))
  }
}
function section(name) { console.log(`\n— ${name} —`) }

// ── Fixture builders ────────────────────────────────────────────────────

function makeAttention(scenarios = []) {
  return scenarios.map(s => ({
    severity: s.severity,
    code:     s.code,
    title:    s.title,
    detail:   s.detail ?? '',
  }))
}

// ── 1. Headline structure ───────────────────────────────────────────────
section('Headline structure')

const brief = buildMorningBrief({
  weatherCurrent: { wind: 16, currentTemp: 28, rainfall24h: 0.72 },
  cartStatus:     'cart-path-only',
  todayNote:      'Cup change before 7am',
  crewSnapshot:   { scheduled: 18, assignments: 22, unassigned: 4, activeTotal: 22 },
  spraySchedule:  { todayCount: 2, upcoming: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], pending: 1 },
  equipmentAlerts:{ outOfService: 1, overdue: 0, conflicts: 1 },
  priorities:     [{ id: 'p1', text: 'Greens cleanup', done: false }, { id: 'p2', text: 'Bunker washout repair', done: true }],
  attentionItems: makeAttention([
    { severity: 'high', code: 'wind-spray-conflict', title: 'Wind 16 mph with 2 planned sprays today' },
    { severity: 'warn', code: 'reservation-conflicts', title: '1 equipment reservation conflict' },
  ]),
}, { courseName: 'Crosswinds Golf Club', generatedAt: '2026-05-16' })

assert(brief.generatedAt === '2026-05-16', 'generatedAt round-trips')
assert(brief.courseName === 'Crosswinds Golf Club', 'courseName preserved')
assert(typeof brief.textVersion === 'string', 'textVersion is a string')
assert(brief.textVersion.startsWith('Crosswinds Golf Club\nMorning Operations Brief — May 16'),
  `heading reads correctly (got: "${brief.textVersion.split('\n').slice(0, 2).join(' | ')}")`)

// Every section heading present.
for (const heading of ['Conditions', 'Operations', 'Crew', 'Sprays', 'Equipment', 'Priorities', 'Needs Attention']) {
  assert(brief.textVersion.includes(heading), `text includes "${heading}" section`)
}

// ── 2. Weather summary variants ─────────────────────────────────────────
section('Weather summary variants')

const rainBrief = buildMorningBrief({
  weatherCurrent: { wind: 4, currentTemp: 60, rainfall24h: 0.72 },
  cartStatus:     'open',
}, { generatedAt: '2026-05-16' })
assert(rainBrief.weatherSummary.bullets.some(b => b.includes('0.72″ rainfall')),
  'rainfall bullet rendered when ≥ 0.5″')
assert(rainBrief.weatherSummary.bullets.some(b => /Carts: Open/.test(b)),
  'cart status echoed in weather summary')

const frostBrief = buildMorningBrief({
  weatherCurrent: { wind: 4, currentTemp: 28, rainfall24h: 0 },
  cartStatus:     'open',
}, { generatedAt: '2026-05-16' })
assert(frostBrief.weatherSummary.bullets.some(b => b.includes('Frost risk')),
  'frost bullet rendered at ≤ 33°F')

const breezyBrief = buildMorningBrief({
  weatherCurrent: { wind: 10, currentTemp: 65, rainfall24h: 0 },
  cartStatus:     'open',
}, { generatedAt: '2026-05-16' })
assert(breezyBrief.weatherSummary.bullets.some(b => /Breezy/i.test(b)),
  'breezy bullet rendered between 8–14 mph')

const highWindBrief = buildMorningBrief({
  weatherCurrent: { wind: 22, currentTemp: 65, rainfall24h: 0 },
  cartStatus:     'open',
}, { generatedAt: '2026-05-16' })
assert(highWindBrief.weatherSummary.bullets.some(b => /High wind/.test(b)),
  'high wind bullet rendered ≥ 15 mph')

const calmBrief = buildMorningBrief({
  weatherCurrent: { wind: 4, currentTemp: 65, rainfall24h: 0 },
  cartStatus:     'open',
}, { generatedAt: '2026-05-16' })
assert(calmBrief.weatherSummary.bullets.some(b => /Calm/.test(b)),
  'calm bullet rendered when temp normal + wind light')

const noWeatherBrief = buildMorningBrief({
  weatherCurrent: null,
  cartStatus:     'closed',
}, { generatedAt: '2026-05-16' })
assert(noWeatherBrief.weatherSummary.bullets.some(b => /No live weather/.test(b)),
  'no-data weather bullet rendered when current=null')
assert(noWeatherBrief.weatherSummary.bullets.some(b => /Carts: Closed/.test(b)),
  'cart status still rendered without weather data')

// ── 3. Cart status rendering ────────────────────────────────────────────
section('Cart status rendering')

for (const [code, label] of [
  ['open',           'Open'],
  ['cart-path-only', 'Cart-path only'],
  ['walking-only',   'Walking only'],
  ['closed',         'Closed'],
]) {
  const b = buildMorningBrief({
    weatherCurrent: { wind: 4, currentTemp: 60, rainfall24h: 0 },
    cartStatus:     code,
  }, { generatedAt: '2026-05-16' })
  assert(b.operationsSummary.bullets.some(x => x === `Course status: ${label}`),
    `operations summary renders cart "${label}"`)
}

// Unknown cart status → operations section silent.
const unknownCart = buildMorningBrief({
  weatherCurrent: { wind: 4, currentTemp: 60, rainfall24h: 0 },
  cartStatus:     'bogus',
}, { generatedAt: '2026-05-16' })
assert(!unknownCart.operationsSummary.bullets.some(x => /Course status/.test(x)),
  'unknown cart code: no "Course status" line emitted')

// ── 4. Crew / Spray / Equipment sections ────────────────────────────────
section('Crew / spray / equipment bullets')

const opBrief = buildMorningBrief({
  weatherCurrent: { wind: 4, currentTemp: 60, rainfall24h: 0 },
  cartStatus:     'open',
  crewSnapshot:   { scheduled: 18, assignments: 22, unassigned: 4, activeTotal: 22 },
  spraySchedule:  { todayCount: 2, upcoming: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], pending: 1 },
  equipmentAlerts:{ outOfService: 1, overdue: 0, conflicts: 1 },
}, { generatedAt: '2026-05-16' })

assert(opBrief.crewSummary.bullets.includes('18 scheduled'), 'crew: scheduled line')
assert(opBrief.crewSummary.bullets.includes('22 tasks today'), 'crew: tasks line')
assert(opBrief.crewSummary.bullets.includes('4 unassigned'), 'crew: unassigned line')

assert(opBrief.spraySummary.bullets.some(b => b.includes('2 planned application')),
  'spray: today count rendered')
assert(opBrief.spraySummary.bullets.some(b => b.includes('1 more in next 3 days')),
  'spray: upcoming-after-today rendered')
assert(opBrief.spraySummary.bullets.some(b => /1 pending spray record/.test(b)),
  'spray: pending records rendered')

assert(opBrief.equipmentSummary.bullets.some(b => b.includes('1 out of service')),
  'equipment: OOS line')
assert(opBrief.equipmentSummary.bullets.some(b => b.includes('1 reservation conflict')),
  'equipment: conflict line (singular)')

// Pluralization sanity
const eqPlural = buildMorningBrief({
  weatherCurrent: null,
  equipmentAlerts: { outOfService: 0, overdue: 0, conflicts: 3 },
}, {})
assert(eqPlural.equipmentSummary.bullets.some(b => /3 reservation conflicts/.test(b)),
  'equipment: conflict line pluralizes')

// ── 5. Priority inclusion ──────────────────────────────────────────────
section('Priority inclusion')

const priBrief = buildMorningBrief({
  weatherCurrent: null,
  priorities: [
    { id: 'p1', text: 'Greens cleanup', done: false },
    { id: 'p2', text: 'Bunker washout repair', done: true },
    { id: 'p3', text: '', done: false },           // bad row
    { id: 'p4', text: 'Range mowing' },
  ],
}, { generatedAt: '2026-05-16' })

assert(priBrief.priorities.bullets.length === 3, `3 valid priorities (got ${priBrief.priorities.bullets.length})`)
assert(priBrief.priorities.bullets.includes('Greens cleanup'), 'first priority text')
assert(priBrief.priorities.bullets.some(b => b === 'Bunker washout repair ✓'),
  'done priority shows ✓')
assert(priBrief.textVersion.includes('• Greens cleanup'), 'priority appears in textVersion with bullet')

// Empty list → section omitted from text.
const noPri = buildMorningBrief({ weatherCurrent: null, priorities: [] }, { generatedAt: '2026-05-16' })
assert(!noPri.textVersion.includes('Priorities'), 'no Priorities heading when list empty')

// ── 6. Attention item inclusion ────────────────────────────────────────
section('Attention items')

const attBrief = buildMorningBrief({
  weatherCurrent: null,
  attentionItems: makeAttention([
    { severity: 'high', code: 'wind-spray-conflict', title: 'Wind 18 mph with 2 planned sprays today' },
    { severity: 'warn', code: 'unassigned-crew',     title: '3 of 8 crew unassigned' },
  ]),
}, { generatedAt: '2026-05-16' })

assert(attBrief.attentionItems.bullets.length === 2, '2 attention bullets')
assert(attBrief.attentionItems.bullets[0].startsWith('[HIGH]'),
  'attention bullet prefixed with [SEVERITY]')
assert(attBrief.textVersion.includes('Needs Attention'), 'attention section in textVersion')
assert(attBrief.textVersion.includes('[HIGH] Wind 18 mph'),
  'attention severity tag visible in textVersion')

// ── 7. Empty-state handling ────────────────────────────────────────────
section('Empty-state handling')

const empty = buildMorningBrief({}, { generatedAt: '2026-05-16' })
assert(typeof empty.textVersion === 'string', 'empty input → textVersion still string')
assert(empty.weatherSummary.bullets.some(b => /No live weather/.test(b)),
  'empty: weather fallback bullet')
assert(empty.crewSummary.bullets.some(b => /No active crew/.test(b)),
  'empty: crew fallback bullet')
assert(empty.spraySummary.bullets.some(b => /No spray events/.test(b)),
  'empty: spray fallback bullet')
assert(empty.equipmentSummary.bullets.some(b => /No equipment alerts/.test(b)),
  'empty: equipment fallback bullet')
assert(empty.priorities.bullets.length === 0, 'empty: priorities array empty')
assert(empty.attentionItems.bullets.length === 0, 'empty: attention array empty')
// Trailing-blank-line trim
assert(!empty.textVersion.endsWith('\n'), 'empty textVersion does not end with blank line')

// ── 8. CSV row flattening ──────────────────────────────────────────────
section('CSV row flattening')

const { headers, rows } = buildBriefCsvRows(opBrief)
assert(JSON.stringify(headers) === '["section","line"]', 'CSV headers shape')
assert(rows.length >= 6, `at least 6 rows for a populated brief (got ${rows.length})`)
assert(rows[0][0] === 'header', 'first row is header section')
assert(rows.some(r => r[0] === 'Crew'), 'CSV includes Crew section rows')
assert(rows.some(r => r[0] === 'Equipment'), 'CSV includes Equipment section rows')
const emptyRows = buildBriefCsvRows(buildMorningBrief({}, { generatedAt: '2026-05-16' }))
assert(emptyRows.rows.length >= 2, 'CSV still emits header rows even when brief is empty (header + generated)')
// Sections with only fallback bullets should still appear (e.g. "No spray events.")
assert(emptyRows.rows.some(r => r[0] === 'Conditions'),
  'CSV includes Conditions fallback when weather null')

// ── 9. Filename helper ──────────────────────────────────────────────────
section('Filename helper')

const fn1 = defaultBriefFilename({ courseName: 'Crosswinds Golf Club', generatedAt: '2026-05-16' })
assert(fn1 === 'crosswinds-golf-club-morning-brief-2026-05-16.csv',
  `slug-safe filename (got: ${fn1})`)
const fn2 = defaultBriefFilename({})
assert(fn2.startsWith('turfintel-morning-brief-'), `fallback prefix (got: ${fn2})`)
assert(fn2.endsWith('.csv'), 'fallback ends with .csv')

// ── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
