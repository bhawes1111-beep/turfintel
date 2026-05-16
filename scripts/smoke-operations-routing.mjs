// Phase 25A — Crew routing + task-execution awareness smoke test.
//
// Verifies each detector triggers under its intended condition and stays
// silent otherwise. Six spec scenarios + clean state + severity ordering
// + partial-input safety.
//
//   node scripts/smoke-operations-routing.mjs

import {
  buildRoutingItems,
  highestRoutingSeverity,
  ROUTING_THRESHOLDS,
  ROUTING_SEVERITY,
} from '../src/utils/operations/routingAwareness.js'

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

// ── Fixture helpers ─────────────────────────────────────────────────────

function ev(overrides = {}) {
  return {
    id:             'e-' + Math.random().toString(36).slice(2, 6),
    title:          overrides.title          ?? 'Routine task',
    category:       overrides.category       ?? 'mowing',
    priority:       overrides.priority       ?? 'medium',
    startTime:      overrides.startTime      ?? '08:00',
    location:       overrides.location       ?? '',
    tags:           overrides.tags           ?? [],
    assignedStaff:  overrides.assignedStaff  ?? ['Operator A'],
    equipment:      overrides.equipment      ?? [],
    ...overrides,
  }
}

function ctx(overrides = {}) {
  return {
    weatherCurrent:      { wind: 4, currentTemp: 65, rainfall24h: 0 },
    calendarEventsToday: [],
    oosEquipmentNames:   [],
    ...overrides,
  }
}

// ── 1. Clean state ──────────────────────────────────────────────────────
section('Clean state')

const clean = buildRoutingItems(ctx({
  calendarEventsToday: [
    ev({ title: 'Mow Fairways', assignedStaff: ['Op A'] }),
    ev({ title: 'Bunker rake',  assignedStaff: ['Op B'] }),
  ],
}))
assert(clean.length === 0, 'no routing items on a clean morning')
assert(highestRoutingSeverity(clean) === null, 'no severity when clean')

// ── 2. Frost + greens work ─────────────────────────────────────────────
section('Frost risk + greens work scheduled')

const frostGreens = buildRoutingItems(ctx({
  weatherCurrent: { wind: 4, currentTemp: 28, rainfall24h: 0 },
  calendarEventsToday: [
    ev({ title: 'Mow Greens', location: 'All greens' }),
    ev({ title: 'Mow Fairways' }),
  ],
}))
const fg = frostGreens.find(i => i.code === 'routing-frost-greens')
assert(fg, 'frost-greens detector fires')
assert(fg.severity === ROUTING_SEVERITY.HIGH, 'frost-greens is high severity')
assert(fg.title.includes('1 greens task'), 'title counts greens tasks (singular)')
assert(fg.title.includes('28°F'), 'title includes temperature')
assert(fg.quickAction?.route === '/crew/assignments', 'frost-greens routes to /crew/assignments')

// Greens scheduled but warm — silent.
const warmGreens = buildRoutingItems(ctx({
  weatherCurrent: { wind: 4, currentTemp: 50, rainfall24h: 0 },
  calendarEventsToday: [ ev({ title: 'Mow Greens' }) ],
}))
assert(!warmGreens.find(i => i.code === 'routing-frost-greens'),
  'frost-greens silent when above frost threshold')

// Frost but no greens work — silent.
const frostFairway = buildRoutingItems(ctx({
  weatherCurrent: { wind: 4, currentTemp: 28, rainfall24h: 0 },
  calendarEventsToday: [ ev({ title: 'Mow Fairways' }) ],
}))
assert(!frostFairway.find(i => i.code === 'routing-frost-greens'),
  'frost-greens silent when no greens events')

// Match via tags + location
const frostByTag = buildRoutingItems(ctx({
  weatherCurrent: { wind: 4, currentTemp: 30, rainfall24h: 0 },
  calendarEventsToday: [ ev({ title: 'Cup change', tags: ['greens'] }) ],
}))
assert(frostByTag.find(i => i.code === 'routing-frost-greens'),
  'frost-greens matches greens tag')

// ── 3. Rainfall + bunker/cleanup priority ──────────────────────────────
section('Rain + bunker/cleanup work')

const rainBunker = buildRoutingItems(ctx({
  weatherCurrent: { wind: 4, currentTemp: 60, rainfall24h: 0.72 },
  calendarEventsToday: [
    ev({ title: 'Bunker rake' }),
    ev({ title: 'Course cleanup' }),
  ],
}))
const rb = rainBunker.find(i => i.code === 'routing-rain-bunker')
assert(rb, 'rain-bunker detector fires')
assert(rb.severity === ROUTING_SEVERITY.WARN, 'rain-bunker is warn severity')
assert(rb.title.includes('0.72'), 'title includes rainfall amount')
assert(rb.title.includes('2 bunker/cleanup task'), 'title counts both bunker+cleanup tasks')

// Rain but no bunker/cleanup — silent.
const rainMowing = buildRoutingItems(ctx({
  weatherCurrent: { wind: 4, currentTemp: 60, rainfall24h: 0.72 },
  calendarEventsToday: [ ev({ title: 'Mow Fairways' }) ],
}))
assert(!rainMowing.find(i => i.code === 'routing-rain-bunker'),
  'rain-bunker silent without bunker/cleanup events')

// Bunker work but no rain — silent.
const dryBunker = buildRoutingItems(ctx({
  weatherCurrent: { wind: 4, currentTemp: 60, rainfall24h: 0.05 },
  calendarEventsToday: [ ev({ title: 'Bunker rake' }) ],
}))
assert(!dryBunker.find(i => i.code === 'routing-rain-bunker'),
  'rain-bunker silent below rainfall threshold')

// ── 4. Wind + spray routing ─────────────────────────────────────────────
section('Wind + spray routing')

const windSpray = buildRoutingItems(ctx({
  weatherCurrent: { wind: 18, currentTemp: 60, rainfall24h: 0 },
  calendarEventsToday: [
    ev({ title: 'Spray Greens', category: 'spray', startTime: '09:00' }),
  ],
}))
const ws = windSpray.find(i => i.code === 'routing-wind-spray')
assert(ws, 'wind-spray routing fires')
assert(ws.severity === ROUTING_SEVERITY.HIGH, 'wind-spray routing is high')
assert(ws.title.includes('18 mph'), 'title includes wind speed')
assert(ws.title.includes('1 spray task'), 'title counts spray events')
assert(ws.quickAction?.route === '/spray', 'wind-spray routes to /spray')

// High wind but no sprays — silent.
const windNoSpray = buildRoutingItems(ctx({
  weatherCurrent: { wind: 18, currentTemp: 60, rainfall24h: 0 },
  calendarEventsToday: [ ev({ title: 'Mow Fairways' }) ],
}))
assert(!windNoSpray.find(i => i.code === 'routing-wind-spray'),
  'wind-spray silent without spray events')

// ── 5. Equipment shortage ──────────────────────────────────────────────
section('Equipment shortage impacting assigned work')

const eqShort = buildRoutingItems(ctx({
  calendarEventsToday: [
    ev({ title: 'Mow Greens', equipment: ['Greens Mower #2'] }),
    ev({ title: 'Mow Fairways', equipment: ['Fairway Mower'] }),
  ],
  oosEquipmentNames: ['Greens Mower #2', 'Roller'],
}))
const es = eqShort.find(i => i.code === 'routing-equipment-shortage')
assert(es, 'equipment-shortage detector fires')
assert(es.severity === ROUTING_SEVERITY.WARN, 'equipment-shortage is warn')
assert(es.title.includes('1 task'), 'title counts impacted tasks')
assert(es.detail.includes('Greens Mower #2'), 'detail names OOS equipment')

// Same OOS but no task uses it — silent.
const eqNoImpact = buildRoutingItems(ctx({
  calendarEventsToday: [ ev({ title: 'Spray', equipment: ['Spray Rig #1'] }) ],
  oosEquipmentNames: ['Greens Mower #2'],
}))
assert(!eqNoImpact.find(i => i.code === 'routing-equipment-shortage'),
  'equipment-shortage silent when no scheduled task uses OOS gear')

// Case-insensitive matching
const eqCase = buildRoutingItems(ctx({
  calendarEventsToday: [ ev({ title: 'Spray', equipment: ['spray rig #1'] }) ],
  oosEquipmentNames: ['Spray Rig #1'],
}))
assert(eqCase.find(i => i.code === 'routing-equipment-shortage'),
  'equipment-shortage matches case-insensitively')

// ── 6. Unassigned high-priority tasks ──────────────────────────────────
section('Unassigned high-priority task detection')

const unHigh = buildRoutingItems(ctx({
  calendarEventsToday: [
    ev({ title: 'Hand water 7th green', priority: 'high', assignedStaff: [] }),
    ev({ title: 'Routine mowing', priority: 'medium', assignedStaff: [] }),
  ],
}))
const uh = unHigh.find(i => i.code === 'routing-unassigned-high-priority')
assert(uh, 'unassigned-high-priority detector fires')
assert(uh.severity === ROUTING_SEVERITY.HIGH, 'is high severity')
assert(uh.title.includes('1 high-priority'), 'title counts high-priority unassigned')
assert(uh.detail.includes('Hand water 7th green'), 'detail mentions example task')

// All high-priority tasks assigned — silent.
const allAssigned = buildRoutingItems(ctx({
  calendarEventsToday: [
    ev({ title: 'Hand water 7th green', priority: 'high', assignedStaff: ['Op A'] }),
  ],
}))
assert(!allAssigned.find(i => i.code === 'routing-unassigned-high-priority'),
  'silent when all high-priority tasks have a staffer')

// Unassigned medium-priority — silent.
const unMed = buildRoutingItems(ctx({
  calendarEventsToday: [
    ev({ title: 'Routine mowing', priority: 'medium', assignedStaff: [] }),
  ],
}))
assert(!unMed.find(i => i.code === 'routing-unassigned-high-priority'),
  'silent for unassigned medium-priority work')

// ── 7. Crew imbalance ───────────────────────────────────────────────────
section('Crew imbalance')

const events = []
// Operator A gets 5 tasks (above threshold of 4).
for (let i = 0; i < 5; i++) events.push(ev({ title: `Task ${i}`, assignedStaff: ['Operator A'] }))
// Plus an unassigned task.
events.push(ev({ title: 'Lonely task', assignedStaff: [] }))

const imbal = buildRoutingItems(ctx({ calendarEventsToday: events }))
const im = imbal.find(i => i.code === 'routing-crew-imbalance')
assert(im, 'crew-imbalance detector fires')
assert(im.severity === ROUTING_SEVERITY.WARN, 'crew-imbalance is warn')
assert(im.title.includes('Operator A'), 'title names the heaviest operator')
assert(im.title.includes('5 tasks'), 'title states task count')
assert(im.title.includes('1 task remains unassigned'),
  `title mentions unassigned (got: "${im.title}")`)

// Heavy but no unassigned — silent.
const heavyNoGap = buildRoutingItems(ctx({
  calendarEventsToday: events.filter(e => e.title !== 'Lonely task'),
}))
assert(!heavyNoGap.find(i => i.code === 'routing-crew-imbalance'),
  'crew-imbalance silent when no unassigned tasks remain')

// Below threshold + unassigned — silent.
const lightLoad = buildRoutingItems(ctx({
  calendarEventsToday: [
    ev({ assignedStaff: ['A'] }),
    ev({ assignedStaff: ['A'] }),
    ev({ assignedStaff: [] }),
  ],
}))
assert(!lightLoad.find(i => i.code === 'routing-crew-imbalance'),
  'crew-imbalance silent below heavy threshold')

// ── 8. Spray before/after operational window ───────────────────────────
section('Spray scheduling vs operational window')

const earlySpray = buildRoutingItems(ctx({
  calendarEventsToday: [
    ev({ title: 'Spray Greens', category: 'spray', startTime: '05:30' }),
  ],
}))
const early = earlySpray.find(i => i.code === 'routing-spray-before-window')
assert(early, 'early spray detector fires')
assert(early.severity === ROUTING_SEVERITY.INFO, 'early-spray is info')
assert(early.title.includes('07:00'), 'title includes window start')

const lateSpray = buildRoutingItems(ctx({
  calendarEventsToday: [
    ev({ title: 'Spray Greens', category: 'spray', startTime: '16:30' }),
  ],
}))
const late = lateSpray.find(i => i.code === 'routing-spray-after-window')
assert(late, 'late-spray detector fires')
assert(late.severity === ROUTING_SEVERITY.INFO, 'late-spray is info')

const inWindow = buildRoutingItems(ctx({
  calendarEventsToday: [
    ev({ title: 'Spray Greens', category: 'spray', startTime: '09:00' }),
  ],
}))
assert(!inWindow.find(i => i.code === 'routing-spray-before-window'),
  'in-window spray does not trigger early detector')
assert(!inWindow.find(i => i.code === 'routing-spray-after-window'),
  'in-window spray does not trigger late detector')

// ── 9. Severity ordering ───────────────────────────────────────────────
section('Severity ordering')

const mixed = buildRoutingItems(ctx({
  weatherCurrent: { wind: 18, currentTemp: 28, rainfall24h: 0.8 },
  calendarEventsToday: [
    ev({ title: 'Mow Greens' }),                          // frost-greens (high)
    ev({ title: 'Bunker rake' }),                          // rain-bunker (warn)
    ev({ title: 'Spray Greens', category: 'spray', startTime: '05:30' }), // wind-spray (high) + early (info)
  ],
}))
assert(mixed.length >= 3, `mixed scenario produces ≥3 items (got ${mixed.length})`)
const severities = mixed.map(i => i.severity)
const SEV_RANK = { high: 2, warn: 1, info: 0 }
for (let i = 1; i < severities.length; i++) {
  assert(SEV_RANK[severities[i - 1]] >= SEV_RANK[severities[i]],
    `severity descending at index ${i}: ${severities[i - 1]} ≥ ${severities[i]}`)
}
assert(highestRoutingSeverity(mixed) === ROUTING_SEVERITY.HIGH, 'roll-up returns HIGH when present')

// ── 10. Partial/empty input safety ─────────────────────────────────────
section('Empty / partial input safety')

assert(buildRoutingItems().length >= 0, 'no-input does not throw')
assert(buildRoutingItems({}).length === 0, 'empty-object input → no items')

// Missing weather but greens scheduled → frost detector silent (good).
const noWeather = buildRoutingItems({
  calendarEventsToday: [ ev({ title: 'Mow Greens' }) ],
})
assert(!noWeather.find(i => i.code === 'routing-frost-greens'),
  'no weather data → frost detector silent (no false positive)')

// Threshold constants exposed for tuning.
assert(ROUTING_THRESHOLDS.HIGH_WIND_MPH === 15, 'wind threshold exported')
assert(ROUTING_THRESHOLDS.FROST_TEMP_F === 33, 'frost threshold exported')

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
