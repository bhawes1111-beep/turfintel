// Phase 29 / 29.1 — Operational Command engine smoke test.
//
// Exercises composeOperationalPriorities() against the scenarios the
// Phase 29 spec calls out: rainy day, spray + window, irrigation overlap,
// low staffing, equipment double-book, equipment maintenance conflict,
// routing conflict (spray vs mow on same area), REI × routing conflict,
// and the missing-data degradation path.
//
//   node scripts/smoke-operational-command.mjs

import {
  composeOperationalPriorities,
  computeMorningReadiness,
  computeNextTwelveHours,
} from '../src/utils/operationalCommand/operationalCommand.js'

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

// Anchor "now" so date math is deterministic.
const NOW = Date.parse('2026-05-19T08:00:00')
const TODAY = '2026-05-19'

function p(id) { return out => out.priorities.find(x => x.id === id) }
function has(id) { return out => out.priorities.some(x => x.id === id) }

// ────────────────────────────────────────────────────────────────────────
section('Empty inputs degrade honestly')
{
  const out = composeOperationalPriorities({ now: NOW })
  assert(Array.isArray(out.priorities) && out.priorities.length === 0, 'no priorities when nothing supplied')
  assert(out.readiness && out.readiness.spray === 'unknown', 'spray readiness = unknown without sprayWindow')
  assert(out.readiness.labor === 'unknown', 'labor readiness = unknown without assignments')
  assert(out.sourceCoverage.weather === false, 'sourceCoverage flags missing weather')
}

// ────────────────────────────────────────────────────────────────────────
section('Rainy day — frost, cart, rain-ops, calendar-vs-weather')
{
  const out = composeOperationalPriorities({
    now: NOW,
    weather: { current: {}, forecast: [{ day: 'Tue', high: 60, low: 30, rainfall: 0.75 }] },
    irrigation: { rainfall24hClass: { category: 'soaking', why: '0.8" past 24h' } },
    calendarEvents: [
      { id: 'cal-mow', date: TODAY, title: 'Mow fairways', category: 'mowing', status: 'planned' },
    ],
  })
  assert(has('weather-frost')(out), 'frost priority fires at 30°F')
  assert(p('weather-frost')(out).severity === 'critical', 'frost at 30°F is critical')
  assert(has('weather-cart-restrict')(out), 'cart restriction fires on soaking 24h rain')
  assert(has('weather-rain-ops')(out), 'rain-ops priority fires at 0.75"')
  const why = p('weather-rain-ops')(out).why
  assert(/Mow fairways/.test(why), 'rain-ops why-string names the actual calendar event', { why })
  assert(has('calrain-cal-mow')(out), 'calendar × weather conflict fires for mow event')
}

// ────────────────────────────────────────────────────────────────────────
section('Spray window — planned today + poor rating')
{
  const out = composeOperationalPriorities({
    now: NOW,
    weather: { forecast: [{ rainfall: 0 }] },
    sprays: [{
      id: 's1', date: TODAY, status: 'planned',
      applicationName: 'Heritage', area: 'Greens',
      areas: [{ name: 'Greens' }], products: [{ name: 'Heritage' }],
    }],
    sprayWindow: {
      current: { rating: 'poor', reasons: [{ why: 'Wind 18 mph above 10 mph cap' }] },
      rainRisks: [],
    },
  })
  assert(has('spraywindow-poor-s1')(out), 'poor window + planned spray emits WARNING')
  assert(p('spraywindow-poor-s1')(out).severity === 'warning', 'rating poor → severity warning')
}

// ────────────────────────────────────────────────────────────────────────
section('Spray × rain cross-conflict')
{
  const out = composeOperationalPriorities({
    now: NOW,
    weather: { forecast: [{ rainfall: 0.4 }] },
    sprays: [{
      id: 's2', date: TODAY, status: 'planned', area: 'Tees',
      areas: [{ name: 'Tees' }], products: [{ name: 'Daconil' }],
    }],
  })
  assert(has('sprayrain-Tees')(out), 'spray + forecast rain → cross priority')
}

// ────────────────────────────────────────────────────────────────────────
section('Irrigation — saturation, overlap, deficit streak, wilt')
{
  const out = composeOperationalPriorities({
    now: NOW,
    irrigation: {
      saturation: { message: '1.5" past 48h', recommendedAction: 'Skip tonight' },
      overlap:    { why: 'Tonight\'s planned cycle + 0.3" rain forecast' },
      consecutive:{ kind: 'known', streakDays: 4, why: '4 consecutive zero-ET days' },
      wilt:       { rating: 'high', why: 'ET 0.32" + wind 8 mph + RH 28%' },
    },
  })
  assert(has('irrigation-saturation')(out), 'saturation fires')
  assert(has('irrigation-overlap')(out), 'overlap fires')
  assert(has('irrigation-deficit')(out), 'deficit fires at 4-day streak')
  assert(has('irrigation-wilt-high')(out), 'high wilt fires')
  // Severity ordering — wilt-high (warning) should outrank deficit (caution).
  const wiltIdx = out.priorities.findIndex(p => p.id === 'irrigation-wilt-high')
  const defIdx  = out.priorities.findIndex(p => p.id === 'irrigation-deficit')
  assert(wiltIdx >= 0 && defIdx >= 0 && wiltIdx < defIdx,
    'wilt-high sorts above deficit (warning before caution)', { wiltIdx, defIdx })
}

// ────────────────────────────────────────────────────────────────────────
section('Equipment — double-booked today')
{
  const out = composeOperationalPriorities({
    now: NOW,
    calendarEvents: [
      { id: 'e1', date: TODAY, title: 'Mow fwys', status: 'planned' },
      { id: 'e2', date: TODAY, title: 'Mow greens', status: 'planned' },
    ],
    equipmentReservations: [
      { id: 'r1', calendarEventId: 'e1', equipmentId: 'mower-7' },
      { id: 'r2', calendarEventId: 'e2', equipmentId: 'mower-7' },
    ],
  })
  assert(has('equipdouble-mower-7')(out), 'same unit reserved twice today → double-book')
}

// ────────────────────────────────────────────────────────────────────────
section('Equipment maintenance — reserved unit out-of-service')
{
  const out = composeOperationalPriorities({
    now: NOW,
    calendarEvents: [{ id: 'e3', date: TODAY, title: 'Aerate', status: 'planned' }],
    equipmentReservations: [{ id: 'r3', calendarEventId: 'e3', equipmentId: 'aerator-2' }],
    equipment: [{ id: 'aerator-2', name: 'ProCore aerator', status: 'out-of-service' }],
    serviceLog: [],
  })
  assert(has('equip-maint-aerator-2')(out), 'out-of-service equipment reserved today fires')
  const why = p('equip-maint-aerator-2')(out).why
  assert(/ProCore aerator/.test(why), 'why-string names the equipment', { why })
}

// ────────────────────────────────────────────────────────────────────────
section('Equipment maintenance — overdue service-log row')
{
  const out = composeOperationalPriorities({
    now: NOW,
    calendarEvents: [{ id: 'e4', date: TODAY, title: 'Topdress', status: 'planned' }],
    equipmentReservations: [{ id: 'r4', calendarEventId: 'e4', equipmentId: 'spreader-1' }],
    equipment: [{ id: 'spreader-1', name: 'Lely spreader', status: 'available' }],
    serviceLog: [{ id: 'sl1', equipmentId: 'spreader-1', status: 'overdue', priority: 'high' }],
  })
  assert(has('equip-maint-spreader-1')(out), 'overdue service-log blocks reservation')
}

// ────────────────────────────────────────────────────────────────────────
section('Crew — heavy assignment load')
{
  const out = composeOperationalPriorities({
    now: NOW,
    calendarEvents: [
      { id: 'c1', date: TODAY, title: 'Cup change', status: 'planned' },
      { id: 'c2', date: TODAY, title: 'Bunker rake', status: 'planned' },
      { id: 'c3', date: TODAY, title: 'Hand water', status: 'planned' },
      { id: 'c4', date: TODAY, title: 'Trim',     status: 'planned' },
    ],
    crewAssignments: [
      { id: 'a1', calendarEventId: 'c1', employeeId: 'emp-9' },
      { id: 'a2', calendarEventId: 'c2', employeeId: 'emp-9' },
      { id: 'a3', calendarEventId: 'c3', employeeId: 'emp-9' },
      { id: 'a4', calendarEventId: 'c4', employeeId: 'emp-9' },
    ],
  })
  assert(has('crewload-emp-9')(out), 'employee with 4+ assignments fires')
}

// ────────────────────────────────────────────────────────────────────────
section('Routing conflict — spray vs mow on same area')
{
  const out = composeOperationalPriorities({
    now: NOW,
    sprays: [{
      id: 's3', date: TODAY, status: 'planned',
      applicationName: 'Tebuconazole', area: 'Greens',
      areas: [{ name: 'Greens' }], products: [{ name: 'Tebu' }],
    }],
    calendarEvents: [
      { id: 'cm', date: TODAY, title: 'Mow greens', category: 'mowing',
        location: 'Greens', status: 'planned' },
    ],
  })
  assert(has('routing-s3-cm')(out), 'spray on Greens + mow on Greens → routing conflict')
}

// ────────────────────────────────────────────────────────────────────────
section('Routing conflict — singular/plural normalization')
{
  const out = composeOperationalPriorities({
    now: NOW,
    sprays: [{
      id: 's4', date: TODAY, status: 'planned',
      applicationName: 'Tebuconazole',
      areas: [{ name: 'Green' }], products: [{ name: 'Tebu' }],
    }],
    calendarEvents: [
      { id: 'cm2', date: TODAY, title: 'Mow greens', location: 'Greens', status: 'planned' },
    ],
  })
  assert(has('routing-s4-cm2')(out), '"Green" spray matches "Greens" calendar location')
}

// ────────────────────────────────────────────────────────────────────────
section('REI × routing conflict')
{
  const reiEndMs = NOW + 4 * 60 * 60 * 1000
  const out = composeOperationalPriorities({
    now: NOW,
    agronomic: {
      activeREI: [{
        sprayId: 's5', area: 'Fairways',
        endsAt: reiEndMs, hoursRemaining: 4,
        why: 'REI 12h, ends 12:00',
      }],
    },
    calendarEvents: [
      { id: 'cfwy', date: TODAY, title: 'Mow fairways', location: 'Fairways', status: 'planned' },
    ],
  })
  assert(has('rei-routing-s5-cfwy')(out), 'active REI + work scheduled in same area fires cross priority')
  assert(p('rei-routing-s5-cfwy')(out).severity === 'warning', 'REI × routing is WARNING')
  assert(/time unconfirmed/.test(p('rei-routing-s5-cfwy')(out).why),
    'timeless event warns but flags timing as unconfirmed', { why: p('rei-routing-s5-cfwy')(out).why })
}

// ────────────────────────────────────────────────────────────────────────
section('REI × routing — time gate (suppress after REI lifts, warn in-window)')
{
  // REI ends 4h from NOW (08:00) → expires 12:00.
  const reiEndMs = NOW + 4 * 60 * 60 * 1000
  const reiAgronomic = {
    activeREI: [{
      sprayId: 's6', area: 'Greens',
      endsAt: reiEndMs, hoursRemaining: 4,
      why: 'REI 12h, ends 12:00',
    }],
  }

  // Event at 14:00 — starts after the REI has lifted → must NOT warn.
  const afterOut = composeOperationalPriorities({
    now: NOW,
    agronomic: reiAgronomic,
    calendarEvents: [
      { id: 'pm', date: TODAY, title: 'Mow greens', location: 'Greens', startTime: '14:00', status: 'planned' },
    ],
  })
  assert(!has('rei-routing-s6-pm')(afterOut), 'event after REI lifts does NOT warn (no false positive)')

  // Event at 09:00 — inside the REI window → must warn, timing confirmed.
  const inOut = composeOperationalPriorities({
    now: NOW,
    agronomic: reiAgronomic,
    calendarEvents: [
      { id: 'am', date: TODAY, title: 'Mow greens', location: 'Greens', startTime: '09:00', status: 'planned' },
    ],
  })
  assert(has('rei-routing-s6-am')(inOut), 'event inside REI window warns')
  assert(/09:00, within the REI window/.test(p('rei-routing-s6-am')(inOut).why),
    'in-window why-string confirms the scheduled time', { why: p('rei-routing-s6-am')(inOut)?.why })
}

// ────────────────────────────────────────────────────────────────────────
section('Morning readiness + Next 12h timeline')
{
  const readiness = computeMorningReadiness({
    now: NOW,
    weather: { forecast: [{ low: 28, rainfall: 0.6 }] },
    sprayWindow: { current: { rating: 'poor' } },
    irrigation: { wilt: { rating: 'high' }, rainfall24hClass: { category: 'runoffRisk' } },
    crewAssignments: [
      { calendarEventId: 'k1' }, { calendarEventId: 'k2' },
      { calendarEventId: 'k3' }, { calendarEventId: 'k4' },
      { calendarEventId: 'k5' },
    ],
    calendarEvents: [
      { id: 'k1', date: TODAY }, { id: 'k2', date: TODAY }, { id: 'k3', date: TODAY },
      { id: 'k4', date: TODAY }, { id: 'k5', date: TODAY },
    ],
    sprays: [],
  })
  assert(readiness.frostRisk === 'critical', 'frostRisk critical at 28°F')
  assert(readiness.mowing === 'delayed', 'mowing delayed under frost')
  assert(readiness.spray === 'poor', 'spray poor mirrors window rating')
  assert(readiness.irrigationPressure === 'elevated', 'irrigation elevated on high wilt')
  assert(readiness.cart === 'path-only', 'cart path-only on runoff risk')
  assert(readiness.labor === 'moderate', 'labor moderate at 5 assignments today', { labor: readiness.labor })

  const timeline = computeNextTwelveHours({
    now: NOW,
    weather: { forecast: [{ day: 'Tue', high: 65, rainfall: 0.05 }] },
    sprays: [{ id: 's-tl', date: TODAY, startTime: '10:00', applicationName: 'Daconil', area: 'Greens' }],
    calendarEvents: [{ id: 'k-tl', date: TODAY, startTime: '09:00', title: 'Cup change' }],
  })
  assert(timeline.length >= 3, 'timeline shows weather + spray + calendar (≥3 items)', { timeline })
  assert(timeline[0].atMs <= timeline[timeline.length - 1].atMs, 'timeline sorted ascending')
}

// ────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
