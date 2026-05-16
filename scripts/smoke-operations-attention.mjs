// Phase 24B — Daily Operations attention engine smoke test.
//
// Verifies each detector triggers under its intended condition and stays
// silent otherwise. Six headline scenarios from the spec + a couple of
// additional regression cases for the equipment/spray detectors.
//
//   node scripts/smoke-operations-attention.mjs

import {
  buildAttentionItems,
  highestAttentionSeverity,
  THRESHOLDS,
  SEVERITY,
} from '../src/utils/operations/attentionEngine.js'

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

// Minimal "operationally clean" context — used as the baseline so each
// scenario only changes the field under test.
function cleanContext(overrides = {}) {
  return {
    weather: { current: { wind: 4, currentTemp: 65, rainfall24h: 0 } },
    crewSnapshot:    { scheduled: 6, assignments: 8, unassigned: 0, activeTotal: 6 },
    spraySchedule:   { todayCount: 0, pending: 0 },
    equipmentAlerts: { outOfService: 0, overdue: 0, conflicts: 0 },
    cartStatus:      'open',
    priorityCount:   3,
    ...overrides,
  }
}

// ── 1. Clean state ──────────────────────────────────────────────────────
section('Clean state')

const clean = buildAttentionItems(cleanContext())
assert(clean.length === 0, 'no attention items on a clean morning')
assert(highestAttentionSeverity(clean) === null, 'no severity when clean')

// ── 2. Wind + spray conflict ────────────────────────────────────────────
section('Wind + planned sprays today')

const windHi = buildAttentionItems(cleanContext({
  weather: { current: { wind: 18, currentTemp: 65, rainfall24h: 0 } },
  spraySchedule: { todayCount: 2, pending: 0 },
}))
const wind = windHi.find(i => i.code === 'wind-spray-conflict')
assert(wind, 'wind+spray detector fires')
assert(wind.severity === SEVERITY.HIGH, 'wind+spray is high severity')
assert(wind.title.includes('18 mph'), 'title includes mph reading')
assert(wind.title.includes('2 planned spray'), 'title includes spray count')
assert(wind.action?.route === '/spray', 'action routes to /spray')

// No spray today — detector must stay silent even with high wind.
const windNoSpray = buildAttentionItems(cleanContext({
  weather: { current: { wind: 18, currentTemp: 65, rainfall24h: 0 } },
  spraySchedule: { todayCount: 0, pending: 0 },
}))
assert(!windNoSpray.find(i => i.code === 'wind-spray-conflict'),
  'wind+spray silent without scheduled sprays')

// Below threshold — silent even with sprays.
const windLow = buildAttentionItems(cleanContext({
  weather: { current: { wind: THRESHOLDS.HIGH_WIND_MPH - 1, currentTemp: 65, rainfall24h: 0 } },
  spraySchedule: { todayCount: 2, pending: 0 },
}))
assert(!windLow.find(i => i.code === 'wind-spray-conflict'),
  'wind+spray silent below wind threshold')

// ── 3. Rain + open carts ────────────────────────────────────────────────
section('Rainfall > 0.5" with carts Open')

const rainOpen = buildAttentionItems(cleanContext({
  weather: { current: { wind: 4, currentTemp: 65, rainfall24h: 0.85 } },
  cartStatus: 'open',
}))
const rain = rainOpen.find(i => i.code === 'rain-carts-open')
assert(rain, 'rain+carts detector fires')
assert(rain.severity === SEVERITY.WARN, 'rain+carts is warn severity')
assert(rain.title.includes('0.85'), 'title includes rainfall amount')

// Same rain but carts already restricted — detector silent.
const rainPath = buildAttentionItems(cleanContext({
  weather: { current: { wind: 4, currentTemp: 65, rainfall24h: 0.85 } },
  cartStatus: 'cart-path-only',
}))
assert(!rainPath.find(i => i.code === 'rain-carts-open'),
  'rain+carts silent when cart status is already restricted')

// Below threshold — silent.
const drizzle = buildAttentionItems(cleanContext({
  weather: { current: { wind: 4, currentTemp: 65, rainfall24h: 0.2 } },
  cartStatus: 'open',
}))
assert(!drizzle.find(i => i.code === 'rain-carts-open'),
  'rain+carts silent below rainfall threshold')

// ── 4. Frost + scheduled crew ───────────────────────────────────────────
section('Frost risk with scheduled crew')

const frost = buildAttentionItems(cleanContext({
  weather: { current: { wind: 4, currentTemp: 28, rainfall24h: 0 } },
  crewSnapshot: { scheduled: 4, assignments: 5, unassigned: 0, activeTotal: 6 },
}))
const frostItem = frost.find(i => i.code === 'frost-crew-conflict')
assert(frostItem, 'frost+crew detector fires')
assert(frostItem.severity === SEVERITY.HIGH, 'frost+crew is high severity')
assert(frostItem.title.includes('28°F'), 'title includes temperature')

// Cold but no crew scheduled — silent.
const frostNoCrew = buildAttentionItems(cleanContext({
  weather: { current: { wind: 4, currentTemp: 28, rainfall24h: 0 } },
  crewSnapshot: { scheduled: 0, assignments: 0, unassigned: 0, activeTotal: 0 },
}))
assert(!frostNoCrew.find(i => i.code === 'frost-crew-conflict'),
  'frost+crew silent without scheduled work')

// Warm temp — silent regardless of crew.
const warm = buildAttentionItems(cleanContext({
  weather: { current: { wind: 4, currentTemp: 50, rainfall24h: 0 } },
}))
assert(!warm.find(i => i.code === 'frost-crew-conflict'),
  'frost+crew silent above frost threshold')

// ── 5. Unassigned crew threshold ────────────────────────────────────────
section('Unassigned crew threshold')

// 6 active, 1/3 threshold = 2 → warn when unassigned ≥ 2.
const unassigned = buildAttentionItems(cleanContext({
  crewSnapshot: { scheduled: 4, assignments: 5, unassigned: 2, activeTotal: 6 },
}))
const un = unassigned.find(i => i.code === 'unassigned-crew')
assert(un, 'unassigned-crew detector fires at threshold')
assert(un.severity === SEVERITY.WARN, 'unassigned is warn severity')
assert(un.title.includes('2 of 6'), 'title reports unassigned of active')

// 1 of 6 unassigned (below threshold of 2) → silent.
const unBelow = buildAttentionItems(cleanContext({
  crewSnapshot: { scheduled: 5, assignments: 5, unassigned: 1, activeTotal: 6 },
}))
assert(!unBelow.find(i => i.code === 'unassigned-crew'),
  'unassigned silent below threshold')

// No active crew at all — detector silent (avoid divide-by-zero noise).
const unZero = buildAttentionItems(cleanContext({
  crewSnapshot: { scheduled: 0, assignments: 0, unassigned: 0, activeTotal: 0 },
}))
assert(!unZero.find(i => i.code === 'unassigned-crew'),
  'unassigned silent with zero active crew')

// ── 6. No priorities set ────────────────────────────────────────────────
section('No priorities set')

const noPri = buildAttentionItems(cleanContext({ priorityCount: 0 }))
const noPriItem = noPri.find(i => i.code === 'no-priorities')
assert(noPriItem, 'no-priorities detector fires')
assert(noPriItem.severity === SEVERITY.INFO, 'no-priorities is info severity')
assert(!noPriItem.action, 'no-priorities item has no route (managed inline)')

const withPri = buildAttentionItems(cleanContext({ priorityCount: 1 }))
assert(!withPri.find(i => i.code === 'no-priorities'),
  'no-priorities silent when at least one priority exists')

// ── 7. Equipment OOS + overdue + conflicts ──────────────────────────────
section('Equipment alerts')

const eq = buildAttentionItems(cleanContext({
  equipmentAlerts: { outOfService: 2, overdue: 1, conflicts: 1 },
}))
const oos      = eq.find(i => i.code === 'equipment-oos')
const overdue  = eq.find(i => i.code === 'maintenance-overdue')
const conflict = eq.find(i => i.code === 'reservation-conflicts')
assert(oos && oos.severity === SEVERITY.HIGH, 'equipment-oos is high')
assert(overdue && overdue.severity === SEVERITY.WARN, 'maintenance-overdue is warn')
assert(conflict && conflict.severity === SEVERITY.WARN, 'reservation-conflicts is warn')

// Plural-ization
assert(oos.title.includes('2 pieces'), 'OOS title pluralizes correctly')

// ── 8. Pending sprays ───────────────────────────────────────────────────
section('Pending sprays')

const pending = buildAttentionItems(cleanContext({
  spraySchedule: { todayCount: 0, pending: 3 },
}))
const pendingItem = pending.find(i => i.code === 'pending-sprays')
assert(pendingItem, 'pending-sprays detector fires')
assert(pendingItem.severity === SEVERITY.INFO, 'pending-sprays is info')
assert(pendingItem.action?.route === '/spray', 'pending-sprays action routes to /spray')

// ── 9. Severity roll-up + ordering ──────────────────────────────────────
section('Severity ordering + roll-up')

const mixed = buildAttentionItems(cleanContext({
  weather: { current: { wind: 18, currentTemp: 28, rainfall24h: 0.8 } },
  spraySchedule: { todayCount: 2, pending: 4 },
  crewSnapshot: { scheduled: 4, assignments: 4, unassigned: 3, activeTotal: 6 },
  equipmentAlerts: { outOfService: 1, overdue: 2, conflicts: 1 },
  cartStatus: 'open',
  priorityCount: 0,
}))
assert(mixed.length >= 7, `mixed scenario produces a stack of warnings (got ${mixed.length})`)
const severities = mixed.map(i => i.severity)
const SEV_RANK = { high: 2, warn: 1, info: 0 }
for (let i = 1; i < severities.length; i++) {
  assert(SEV_RANK[severities[i - 1]] >= SEV_RANK[severities[i]],
    `severity descending at index ${i} (${severities[i - 1]} ≥ ${severities[i]})`)
}
assert(highestAttentionSeverity(mixed) === SEVERITY.HIGH,
  'roll-up returns HIGH when high items present')

// ── 10. Missing/partial input safety ────────────────────────────────────
section('Empty / partial input safety')

assert(buildAttentionItems().length >= 0, 'no-input does not throw')
assert(buildAttentionItems({}).length >= 0, 'empty-object input does not throw')

const partial = buildAttentionItems({
  weather: { current: { wind: 18 } },
  spraySchedule: { todayCount: 1 },
  priorityCount: 2,
})
// Wind + spray still detected even with sparse weather data.
assert(partial.find(i => i.code === 'wind-spray-conflict'),
  'partial input still detects wind+spray')

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
