// Phase 25B — Operational Timeline smoke test.
//
// Verifies deterministic chronological ordering + per-source coverage
// (frost, spray, equipment, priority) + empty-state fallback.
//
//   node scripts/smoke-operations-timeline.mjs

import { readFileSync } from 'fs'
import {
  buildOperationalTimeline,
  TIMELINE_SEVERITY,
} from '../src/utils/operations/operationalTimeline.js'

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
    title:          overrides.title    ?? 'Routine task',
    category:       overrides.category ?? 'mowing',
    priority:       overrides.priority ?? 'medium',
    startTime:      overrides.startTime ?? '08:00',
    location:       overrides.location ?? '',
    tags:           overrides.tags     ?? [],
    assignedStaff:  overrides.assignedStaff ?? ['Operator A'],
    equipment:      overrides.equipment ?? [],
    ...overrides,
  }
}

function ctx(overrides = {}) {
  return {
    weatherCurrent:      { wind: 4, currentTemp: 65, rainfall24h: 0 },
    calendarEventsToday: [],
    equipmentAlerts:     { outOfService: 0, overdue: 0, conflicts: 0 },
    priorities:          [],
    attentionItems:      [],
    routingItems:        [],
    ...overrides,
  }
}

// ── 1. Empty/clean timeline ─────────────────────────────────────────────
section('Empty/clean fallback')

const clean = buildOperationalTimeline(ctx())
// Crew dispatch checkpoint ALWAYS renders (it's the morning anchor).
assert(clean.length >= 1, 'always emits the crew dispatch checkpoint')
assert(clean.some(t => t.sourceCode === 'timeline-dispatch-review'),
  'dispatch checkpoint present in clean state')
assert(clean.every(t => t.category && t.severity && t.time && t.title),
  'every emitted item carries required fields')

const empty = buildOperationalTimeline()
assert(empty.length >= 1, 'no-input still emits the dispatch checkpoint')
assert(empty[0].time === '06:00', 'no-input timeline starts at 06:00 dispatch')

// ── 2. Chronological sorting ────────────────────────────────────────────
section('Chronological sort')

const sortFixture = buildOperationalTimeline(ctx({
  weatherCurrent: { wind: 18, currentTemp: 28, rainfall24h: 0.6 },
  calendarEventsToday: [
    ev({ title: 'Spray Greens', category: 'spray', startTime: '08:00' }),
    ev({ title: 'High priority', priority: 'high', startTime: '10:00' }),
  ],
  equipmentAlerts: { outOfService: 1, overdue: 0, conflicts: 0 },
  priorities: [{ id: 'p1', text: 'Cleanup', done: false }],
  routingItems: [{ severity: 'warn', code: 'routing-rain-bunker' }],
}))
const times = sortFixture.map(t => t.time)
for (let i = 1; i < times.length; i++) {
  assert(times[i - 1] <= times[i],
    `times sorted ascending at index ${i} (${times[i - 1]} ≤ ${times[i]})`)
}

// ── 3. Frost timeline item ──────────────────────────────────────────────
section('Frost weather item')

const frostT = buildOperationalTimeline(ctx({
  weatherCurrent: { wind: 4, currentTemp: 28, rainfall24h: 0 },
}))
const frost = frostT.find(t => t.sourceCode === 'timeline-frost-risk')
assert(frost, 'frost item emitted at ≤ 33°F')
assert(frost.time === '05:30', 'frost anchored at 05:30')
assert(frost.severity === TIMELINE_SEVERITY.HIGH, 'frost is high severity')
assert(frost.category === 'weather', 'frost category=weather')
assert(frost.title.includes('28°F'), 'frost title includes temp')

// Warm morning — no frost item.
const warmT = buildOperationalTimeline(ctx({
  weatherCurrent: { wind: 4, currentTemp: 50, rainfall24h: 0 },
}))
assert(!warmT.find(t => t.sourceCode === 'timeline-frost-risk'),
  'no frost item when temp > threshold')

// Rainfall + wind items
const stormy = buildOperationalTimeline(ctx({
  weatherCurrent: { wind: 22, currentTemp: 65, rainfall24h: 0.85 },
}))
assert(stormy.find(t => t.sourceCode === 'timeline-rainfall'),
  'rainfall item emitted at ≥ 0.5″')
assert(stormy.find(t => t.sourceCode === 'timeline-high-wind'),
  'high-wind item emitted at ≥ 15 mph')

// ── 4. Spray event timeline item ────────────────────────────────────────
section('Spray timeline item')

const sprayT = buildOperationalTimeline(ctx({
  calendarEventsToday: [
    ev({ title: 'Greens Fungicide', category: 'spray', startTime: '08:30', location: 'All greens' }),
  ],
}))
const spray = sprayT.find(t => t.category === 'spray' && /Spray event/.test(t.title))
assert(spray, 'spray timeline item emitted')
assert(spray.time === '08:30', 'spray uses event startTime')
assert(spray.title.includes('Greens Fungicide'), 'title includes event name')
assert(spray.detail.includes('All greens'), 'detail surfaces location')
assert(spray.severity === TIMELINE_SEVERITY.INFO,
  'spray severity defaults to info without wind signal')

// Wind-attention signal escalates spray severity.
const windySpray = buildOperationalTimeline(ctx({
  calendarEventsToday: [
    ev({ title: 'Greens Fungicide', category: 'spray', startTime: '08:30' }),
  ],
  attentionItems: [{ severity: 'high', code: 'wind-spray-conflict' }],
}))
const escalated = windySpray.find(t => t.category === 'spray' && /Spray event/.test(t.title))
assert(escalated.severity === TIMELINE_SEVERITY.HIGH,
  'spray severity escalates to high when wind-spray attention present')

// Routing wind-spray also escalates.
const routedSpray = buildOperationalTimeline(ctx({
  calendarEventsToday: [
    ev({ title: 'Greens Fungicide', category: 'spray', startTime: '08:30' }),
  ],
  routingItems: [{ severity: 'high', code: 'routing-wind-spray' }],
}))
assert(routedSpray.find(t => /Spray event/.test(t.title))?.severity === TIMELINE_SEVERITY.HIGH,
  'spray severity escalates to high when routing-wind-spray present')

// Default fallback time when no startTime
const noStart = buildOperationalTimeline(ctx({
  calendarEventsToday: [
    ev({ title: 'Foliar feed', category: 'spray', startTime: undefined }),
  ],
}))
const fallback = noStart.find(t => /Spray event/.test(t.title))
assert(fallback?.time === '08:00', `spray fallback time = 08:00 (got ${fallback?.time})`)

// ── 5. Equipment conflict item ──────────────────────────────────────────
section('Equipment review item')

const eqOOS = buildOperationalTimeline(ctx({
  equipmentAlerts: { outOfService: 2, overdue: 0, conflicts: 1 },
}))
const eqRow = eqOOS.find(t => t.sourceCode === 'timeline-equipment-review')
assert(eqRow, 'equipment review item emitted when alerts present')
assert(eqRow.time === '09:00', 'equipment review anchored at 09:00')
assert(eqRow.severity === TIMELINE_SEVERITY.HIGH, 'OOS escalates to high')
assert(eqRow.detail.includes('2 out of service'), 'detail counts OOS')
assert(eqRow.detail.includes('1 reservation conflict'), 'detail counts conflict (singular)')

const eqOverdueOnly = buildOperationalTimeline(ctx({
  equipmentAlerts: { outOfService: 0, overdue: 2, conflicts: 0 },
}))
assert(eqOverdueOnly.find(t => t.sourceCode === 'timeline-equipment-review')?.severity === TIMELINE_SEVERITY.WARN,
  'overdue-only → warn severity')

const noEq = buildOperationalTimeline(ctx({
  equipmentAlerts: { outOfService: 0, overdue: 0, conflicts: 0 },
}))
assert(!noEq.find(t => t.sourceCode === 'timeline-equipment-review'),
  'no equipment item when nothing flagged')

// ── 6. Priority checkpoint ──────────────────────────────────────────────
section('Priority checkpoint')

const priT = buildOperationalTimeline(ctx({
  priorities: [
    { id: 'p1', text: 'Greens cleanup', done: false },
    { id: 'p2', text: 'Bunker washout', done: true },
  ],
}))
const pri = priT.find(t => t.sourceCode === 'timeline-priority-checkpoint')
assert(pri, 'priority checkpoint emitted when priorities exist')
assert(pri.time === '11:00', 'priority checkpoint anchored at 11:00')
assert(pri.category === 'priority', 'category=priority')
assert(pri.detail.includes('1 of 2'), 'detail shows done-of-total')
assert(pri.detail.includes('1 open'), 'detail shows open count')

const noPri = buildOperationalTimeline(ctx({ priorities: [] }))
assert(!noPri.find(t => t.sourceCode === 'timeline-priority-checkpoint'),
  'no priority checkpoint when list empty')

// ── 7. Afternoon routing review ─────────────────────────────────────────
section('Afternoon routing review')

const afternoon = buildOperationalTimeline(ctx({
  routingItems: [
    { severity: 'high', code: 'routing-frost-greens' },
    { severity: 'warn', code: 'routing-rain-bunker' },
  ],
}))
const aft = afternoon.find(t => t.sourceCode === 'timeline-afternoon-routing')
assert(aft, 'afternoon routing item emitted when routing items exist')
assert(aft.time === '14:00', 'afternoon review anchored at 14:00')
assert(aft.category === 'routing', 'category=routing')
assert(aft.severity === TIMELINE_SEVERITY.HIGH, 'inherits highest routing severity')
assert(aft.detail.includes('2 routing impacts'), 'detail counts routing items')

const noRouting = buildOperationalTimeline(ctx({ routingItems: [] }))
assert(!noRouting.find(t => t.sourceCode === 'timeline-afternoon-routing'),
  'no afternoon review when no routing items')

// ── 8. High-priority calendar event ─────────────────────────────────────
section('High-priority event item')

const hpEvent = buildOperationalTimeline(ctx({
  calendarEventsToday: [
    ev({ title: 'Hand water 7th', priority: 'high', startTime: '10:00', assignedStaff: [] }),
  ],
}))
const hp = hpEvent.find(t => /High-priority/.test(t.title))
assert(hp, 'high-priority event surfaces a timeline row')
assert(hp.time === '10:00', 'uses event startTime')
assert(hp.severity === TIMELINE_SEVERITY.HIGH, 'unassigned high-priority → high severity')

const staffed = buildOperationalTimeline(ctx({
  calendarEventsToday: [
    ev({ title: 'Hand water 7th', priority: 'high', startTime: '10:00', assignedStaff: ['Op A'] }),
  ],
}))
const staffedHp = staffed.find(t => /High-priority/.test(t.title))
assert(staffedHp.severity === TIMELINE_SEVERITY.WARN, 'staffed high-priority → warn severity')
assert(staffedHp.detail.includes('Op A'), 'detail names assigned staffer')

// ── 9. Dispatch checkpoint escalation ───────────────────────────────────
section('Dispatch checkpoint escalation')

const dispatchClean = buildOperationalTimeline(ctx())
const cleanDispatch = dispatchClean.find(t => t.sourceCode === 'timeline-dispatch-review')
assert(cleanDispatch.severity === TIMELINE_SEVERITY.INFO, 'clean dispatch is info')

const dispatchHot = buildOperationalTimeline(ctx({
  attentionItems: [
    { severity: 'high', code: 'frost-crew-conflict' },
    { severity: 'warn', code: 'unassigned-crew' },
  ],
}))
const hotDispatch = dispatchHot.find(t => t.sourceCode === 'timeline-dispatch-review')
assert(hotDispatch.severity === TIMELINE_SEVERITY.HIGH, 'dispatch escalates with frost-crew attention')
assert(hotDispatch.detail.includes('frost'), 'dispatch detail names frost issue')
assert(hotDispatch.detail.includes('unassigned crew'), 'dispatch detail names unassigned')

// ── 10. Categories cover the spec vocabulary ────────────────────────────
section('Category vocabulary coverage')

const full = buildOperationalTimeline(ctx({
  weatherCurrent: { wind: 4, currentTemp: 28, rainfall24h: 0 },
  calendarEventsToday: [
    ev({ title: 'Spray', category: 'spray', startTime: '08:00' }),
    ev({ title: 'Cup change', priority: 'high', startTime: '10:00' }),
  ],
  equipmentAlerts: { outOfService: 1, overdue: 0, conflicts: 0 },
  priorities: [{ id: 'p1', text: 'Cleanup' }],
  routingItems: [{ severity: 'warn', code: 'routing-equipment-shortage' }],
}))
const cats = new Set(full.map(t => t.category))
for (const expected of ['weather', 'crew', 'spray', 'equipment', 'priority', 'routing']) {
  assert(cats.has(expected), `category "${expected}" represented`)
}

// ── Phase 7Y.1 — OperationsBoard density default persistence ────────────
// Source-only checks against OperationsBoard.jsx: the localStorage key,
// the allowed value set, the persistence wiring, the new toggle in the
// settings panel, AND the regression guard that the OTHER three
// settings sections still render "Coming soon".
section('Phase 7Y.1 — Operations Board density default')

const OB = readFileSync('src/pages/Operations/OperationsBoard.jsx', 'utf8')

assert(OB.includes(`'turfintel:operations:densityDefault/v1'`),
  'OperationsBoard declares the densityDefault localStorage key')
for (const v of ['compact', 'comfortable', 'expanded']) {
  assert(new RegExp(`['"]${v}['"]`).test(OB),
    `allowed density value "${v}" present in source`)
}
assert(/loadDensityDefault\b/.test(OB) && /saveDensityDefault\b/.test(OB),
  'OperationsBoard defines load/save helpers for the density default')
assert(/useState\(\s*loadDensityDefault\s*\)/.test(OB),
  'density state is initialized from loadDensityDefault on mount')
assert(/useEffect\(\s*\(\)\s*=>\s*\{\s*saveDensityDefault\(density\)\s*\}\s*,\s*\[\s*density\s*\]\s*\)/.test(OB),
  'persist effect writes density to localStorage on change')

// The settings panel must wire the toggle for "Density Defaults" and
// NOT render a "Coming soon" badge for that section. The exact branch
// keys off sec.title === 'Density Defaults'.
assert(/sec\.title === 'Density Defaults' \?/.test(OB),
  'settings panel branches on Density Defaults to render the toggle')
assert(/obDensityToggle[\s\S]{0,400}DENSITY_OPTIONS\.map/.test(OB),
  'Density Defaults section renders the existing DENSITY_OPTIONS toggle')

// Regression guard: the remaining two placeholder sections still
// exist and still show "Coming soon". (Phase 7Y.2 makes
// "Timeline Options" a real toggle, so it is no longer required to
// render "Coming soon".)
for (const title of ['Crew Display', 'Turf Operations Defaults']) {
  assert(OB.includes(`'${title}'`),
    `placeholder title "${title}" still present`)
}
assert(/Coming soon/.test(OB),
  'OperationsBoard still renders "Coming soon" for the remaining sections')

// ── Phase 7Y.2 — OperationsBoard Schedule Overview timeline default ─────
// Same shape as the Phase 7Y.1 density-default checks: the localStorage
// key, the allowed value set, the load/save helpers, the persistence
// wiring (init + write-through effect), and the new toggle in the
// settings panel.
section('Phase 7Y.2 — Operations Board timeline default')

assert(OB.includes(`'turfintel:operations:timelineDefault/v1'`),
  'OperationsBoard declares the timelineDefault localStorage key')
for (const v of ['open', 'collapsed']) {
  assert(new RegExp(`['"]${v}['"]`).test(OB),
    `allowed timeline value "${v}" present in source`)
}
assert(/loadTimelineDefault\b/.test(OB) && /saveTimelineDefault\b/.test(OB),
  'OperationsBoard defines load/save helpers for the timeline default')
assert(/useState\(\s*loadTimelineDefault\s*\)/.test(OB),
  'timelineOpen state is initialized from loadTimelineDefault on mount')
assert(/useEffect\(\s*\(\)\s*=>\s*\{\s*saveTimelineDefault\(timelineOpen\)\s*\}\s*,\s*\[\s*timelineOpen\s*\]\s*\)/.test(OB),
  'persist effect writes timelineOpen to localStorage on change')

// The settings panel must wire the toggle for "Timeline Options".
assert(/sec\.title === 'Timeline Options' \?/.test(OB),
  'settings panel branches on Timeline Options to render the toggle')

// ── Phase 8A.1 — Crosswinds course-aware routing options ────────────────
// Source-only checks against OperationsBoard.jsx + a routingTags
// "do-not-touch" guard. Crosswinds (courseId 'crossroads-gc') is
// limited to Front 9 First / Back 9 First; every other course
// keeps the original 5 options. Selection is persisted per course
// in localStorage under turfintel:operations:routing/<courseId>/v1.
section('Phase 8A.1 — Crosswinds routing options')

// Verified Crosswinds courseId guard literal.
assert(/CROSSWINDS_COURSE_ID\s*=\s*'crossroads-gc'/.test(OB),
  "Crosswinds courseId is 'crossroads-gc' (per courseStore default)")

// Crosswinds-specific options.
assert(/CROSSWINDS_ROUTING_OPTIONS\s*=\s*\[\s*'Front 9 First'\s*,\s*'Back 9 First'\s*\]/.test(OB),
  'Crosswinds branch returns only Front 9 First and Back 9 First')
for (const v of ['Front 9 First', 'Back 9 First']) {
  assert(new RegExp(`['"]${v}['"]`).test(OB),
    `routing option "${v}" present in source`)
}

// Non-Crosswinds default options preserved verbatim.
for (const v of ['Press & Roll', 'Hammer', 'Normal', 'Modified', 'Event Prep']) {
  assert(new RegExp(`['"]${v}['"]`).test(OB),
    `default routing option "${v}" preserved for non-Crosswinds courses`)
}

// Helper functions exist.
for (const fn of ['routingOptionsFor', 'defaultRoutingFor', 'routingStorageKey',
                  'loadRoutingForCourse', 'saveRoutingForCourse']) {
  assert(new RegExp(`function\\s+${fn}\\b`).test(OB),
    `OperationsBoard defines ${fn}() helper`)
}

// localStorage key format includes the per-course namespace.
assert(/`turfintel:operations:routing\/\$\{courseId\}\/v1`/.test(OB),
  'routing localStorage key is per-course: turfintel:operations:routing/<courseId>/v1')

// Crosswinds branch is the only one that returns the 2-option list;
// every other courseId falls back to the 5-option default.
assert(/courseId === CROSSWINDS_COURSE_ID\) return CROSSWINDS_ROUTING_OPTIONS/.test(OB),
  'routingOptionsFor branches on CROSSWINDS_COURSE_ID')
assert(/return DEFAULT_ROUTING_OPTIONS/.test(OB),
  'routingOptionsFor falls back to DEFAULT_ROUTING_OPTIONS for non-Crosswinds')

// Invalid saved routing must fall back safely (loader checks
// includes(raw) against the per-course list and returns the default).
assert(/routingOptionsFor\(courseId\)\.includes\(raw\)/.test(OB),
  'loadRoutingForCourse validates saved value against the per-course list')

// State wiring: routing state is initialized from loadRoutingForCourse,
// re-hydrated on course change, and persisted on each routing change.
assert(/useState\(\s*\(\)\s*=>\s*loadRoutingForCourse\(courseId\)\s*\)/.test(OB),
  'routing state initialized from loadRoutingForCourse(courseId)')
assert(/setRouting\(loadRoutingForCourse\(courseId\)\)/.test(OB),
  'routing re-hydrates when courseId changes')
assert(/saveRoutingForCourse\(courseId,\s*routing\)/.test(OB),
  'routing persists per course on change')

// The dropdown renders the course-aware list, not the legacy constant.
assert(/routingOptionsFor\(courseId\)\.map\(r =>/.test(OB),
  'routing <select> maps over routingOptionsFor(courseId)')

// "Do not touch routingTags" guard — Phase 8A.1 must not modify the
// separate event-tag system in src/utils/routing/routingTags.js.
const tagsSrc = readFileSync('src/utils/routing/routingTags.js', 'utf8')
for (const phrase of ['ROUTING_TAG_OPTIONS', 'routingChipsFromTags']) {
  assert(tagsSrc.includes(phrase),
    `routingTags.js still exports ${phrase} (Phase 8A.1 left it untouched)`)
}
assert(!tagsSrc.includes('Phase 8A.1'),
  'routingTags.js carries no Phase 8A.1 edits')

// ── Phase 8A.2 — Crosswinds defaults Operations to Assignments ──────────
// Source-only checks against OperationsBoard.jsx + a tiny cross-file
// guard on CrewAssignments.jsx. Crosswinds (courseId 'crossroads-gc')
// must land on the employee-first Assignments tab; every other course
// keeps the original Daily Operations Center default. The task-first
// 'board' tab must still exist (gated, not deleted) so non-Crosswinds
// courses and direct navigation continue to work.
section('Phase 8A.2 — default Crosswinds Operations to Assignments')

// activeTab initializer is function-based (computed default, not literal).
assert(/useState\(\(\)\s*=>\s*[\s\S]{0,200}\bCROSSWINDS_COURSE_ID\b[\s\S]{0,200}\)/.test(OB),
  'activeTab initializer is a function (computed default)')

// Crosswinds branch uses 'assignments'; non-Crosswinds falls back to 'center'.
assert(/courseId === CROSSWINDS_COURSE_ID \? 'assignments' : 'center'/.test(OB),
  "Crosswinds → 'assignments'; other courses → 'center'")

// Both literal tab IDs appear in source.
for (const tab of ['assignments', 'center']) {
  assert(new RegExp(`['"]${tab}['"]`).test(OB),
    `tab id "${tab}" present in source`)
}

// Reuse the Phase 8A.1 Crosswinds guard literal (couples 8A.1 + 8A.2).
assert(/CROSSWINDS_COURSE_ID\s*=\s*'crossroads-gc'/.test(OB),
  "Phase 8A.2 reuses the Phase 8A.1 CROSSWINDS_COURSE_ID ('crossroads-gc')")

// The task-first board tab must still be registered in TABS.
assert(/\{\s*id:\s*'board'\s*,\s*label:\s*'Operations Board'\s*\}/.test(OB),
  "task-first 'board' tab is still registered in TABS")

// The assignments tab still mounts <CrewAssignments />.
assert(/activeTab === 'assignments'\s*&&\s*<CrewAssignments \/>/.test(OB),
  "'assignments' tab still mounts <CrewAssignments />")

// Cross-file guard: CrewAssignments.jsx still imports DailyAssignmentBoard
// so the new default landing actually reaches the employee-first board.
const CA = readFileSync('src/pages/Crew/tabs/CrewAssignments.jsx', 'utf8')
assert(/import DailyAssignmentBoard from '\.\/DailyAssignmentBoard'/.test(CA),
  'CrewAssignments.jsx still imports DailyAssignmentBoard')

// ── Phase 8A.3a — Crosswinds Notes + Status per assignment row ──────────
// Source-only checks against DailyAssignmentBoard.jsx + the
// assignmentsStore. New columns are Crosswinds-gated (courseId
// 'crossroads-gc') and use existing crew_assignments columns
// (notes + status), so no DB or worker change is needed. DisplayBoard
// is explicitly NOT modified by this phase.
section('Phase 8A.3a — Crosswinds assignment notes + status')

const DAB = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')

// patchCrewAssignment is imported and used for both notes and status.
assert(/import\s*\{[^}]*\bpatchCrewAssignment\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/assignments\/assignmentsStore['"]/.test(DAB),
  'DailyAssignmentBoard imports patchCrewAssignment from assignmentsStore')
assert(/patchCrewAssignment\(assignment\.id,\s*\{\s*notes\s*:/.test(DAB),
  'notes save calls patchCrewAssignment(assignment.id, { notes: ... })')
assert(/patchCrewAssignment\(assignment\.id,\s*\{\s*status\s*:/.test(DAB),
  'status save calls patchCrewAssignment(assignment.id, { status: ... })')

// Crosswinds gate is wired via useSelectedCourseId + the verified slug.
assert(/import\s*\{\s*useSelectedCourseId\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\/courses\/courseStore['"]/.test(DAB),
  'DailyAssignmentBoard imports useSelectedCourseId')
assert(/CROSSWINDS_COURSE_ID\s*=\s*'crossroads-gc'/.test(DAB),
  "Crosswinds gate uses courseId 'crossroads-gc'")
assert(/const\s+isCrosswinds\s*=\s*courseId === CROSSWINDS_COURSE_ID/.test(DAB),
  'isCrosswinds boolean is derived from courseId === CROSSWINDS_COURSE_ID')

// Status options + legacy normalization.
for (const v of ['pending', 'in-progress', 'complete', 'blocked']) {
  assert(new RegExp(`['"]${v}['"]`).test(DAB),
    `status option "${v}" present in source`)
}
assert(/ASSIGNMENT_STATUS_OPTIONS\s*=\s*\[\s*'pending'\s*,\s*'in-progress'\s*,\s*'complete'\s*,\s*'blocked'\s*\]/.test(DAB),
  'ASSIGNMENT_STATUS_OPTIONS lists pending, in-progress, complete, blocked')
assert(/function\s+normalizeAssignmentStatus\b/.test(DAB),
  'normalizeAssignmentStatus helper is defined')
assert(/raw === 'assigned'[\s\S]{0,80}return ASSIGNMENT_STATUS_DEFAULT/.test(DAB),
  "legacy status 'assigned' normalizes to the default ('pending')")
assert(/ASSIGNMENT_STATUS_DEFAULT\s*=\s*'pending'/.test(DAB),
  "default assignment status is 'pending'")

// Notes input + Status select are rendered and Crosswinds-gated.
assert(/isCrosswinds\s*&&\s*<th>Notes<\/th>/.test(DAB),
  'Notes column header is Crosswinds-gated')
assert(/isCrosswinds\s*&&\s*<th>Status<\/th>/.test(DAB),
  'Status column header is Crosswinds-gated')
assert(/className=\{styles\.notesInput\}/.test(DAB),
  'Notes input uses styles.notesInput')
assert(/className=\{styles\.statusSelect\}/.test(DAB),
  'Status select uses styles.statusSelect')
assert(/onBlur=\{\(\)\s*=>\s*handleNotesBlur\(assignment\)\}/.test(DAB),
  'Notes input saves on blur (not every keystroke)')
assert(/onChange=\{e\s*=>\s*handleStatusChange\(assignment,\s*e\.target\.value\)\}/.test(DAB),
  'Status select saves immediately on change')

// CSS surface exists for the two new classes.
const CSS = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css', 'utf8')
assert(/\.notesInput\s*\{/.test(CSS),
  'DailyAssignmentBoard.module.css defines .notesInput')
assert(/\.statusSelect\s*\{/.test(CSS),
  'DailyAssignmentBoard.module.css defines .statusSelect')

// Regression: the original 4 columns are still present.
for (const col of ['Operator', 'Role', 'Task', 'Equipment']) {
  assert(new RegExp(`<th>${col}<\\/th>`).test(DAB),
    `existing column "${col}" still rendered`)
}

// Cross-file: assignmentsStore still exports patchCrewAssignment (couples the write path).
const STORE = readFileSync('src/utils/assignments/assignmentsStore.js', 'utf8')
assert(/export\s+async\s+function\s+patchCrewAssignment\b/.test(STORE),
  'assignmentsStore still exports patchCrewAssignment')

// Cross-file guard: DisplayBoard.jsx is NOT modified by Phase 8A.3a.
// Static check — the file carries no Phase 8A.3a marker. (Mutation
// checks here are limited to source-only; the spec promise is that
// DisplayBoard's data shape and renderer are untouched.)
const DB = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
assert(!DB.includes('Phase 8A.3a'),
  'DisplayBoard.jsx carries no Phase 8A.3a edits')

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
