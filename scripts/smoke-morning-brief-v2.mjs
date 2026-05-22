// Morning Operations Brief v2 — section + PRIVACY smoke test.
//
//   node scripts/smoke-morning-brief-v2.mjs
//
// The critical guarantee: a condition log's private_notes must NEVER appear
// in the brief's text/CSV output (the brief is super-facing but its content
// — and the Send-to-Display-Board path — must stay crew-safe). Also verifies
// the new v2 sections (Course Status, Weather Impacts, Watch Areas) render.

import { readFileSync } from 'fs'
import {
  buildMorningBrief,
  buildBriefCsvRows,
} from '../src/utils/operations/morningBrief.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

const SECRET = 'SUPERINTENDENT_PRIVATE_SECRET_XYZ'

const snapshot = {
  weatherCurrent: { currentTemp: 90, humidity: 35, wind: 16 },
  cartStatus: 'cart-path-only',
  conditionLog: {
    overallRating: 'good',
    greensCondition: 'firm',
    fairwaysCondition: 'dry',
    playabilityNotes: 'pace good, bunkers wet',
    followupNotes: 'recheck #6',
    privateNotes: SECRET,   // <-- must NEVER surface
  },
  weatherImpacts: [
    { key: 'heat', label: 'Heat — hydrate', detail: '90°F', severity: 'warn' },
    { key: 'wind', label: 'High wind', detail: '16 mph', severity: 'warn' },
  ],
  watchAreas: [
    { id: '1', location: 'Green 7', flags: ['Handwater'] },
    { id: '2', location: 'Green 3', flags: ['Wilt', 'Dry spot'] },
  ],
  crewSnapshot: { scheduled: 12, assignments: 14, unassigned: 0, activeTotal: 12 },
  spraySchedule: { todayCount: 1, upcoming: [{ id: 'a' }], pending: 0 },
  equipmentAlerts: { outOfService: 1, overdue: 0, conflicts: 0 },
}

const brief = buildMorningBrief(snapshot, { courseName: 'Crosswinds', generatedAt: '2026-05-22' })

// ── PRIVACY: private_notes must not appear anywhere in the output ──────────
{
  assert(!brief.textVersion.includes(SECRET), 'textVersion excludes private_notes')
  const csv = buildBriefCsvRows(brief)
  const csvFlat = JSON.stringify(csv)
  assert(!csvFlat.includes(SECRET), 'CSV export excludes private_notes')
  // The whole serialized brief object must not carry it either.
  assert(!JSON.stringify(brief).includes(SECRET), 'serialized brief object excludes private_notes')
}

// ── New v2 sections present ────────────────────────────────────────────────
{
  assert(brief.courseStatus.hasData, 'Course Status section has data')
  assert(brief.textVersion.includes('Course Status'), 'textVersion includes Course Status heading')
  assert(brief.textVersion.includes('Overall: good'), 'Course Status shows overall rating')
  assert(brief.textVersion.includes('pace good, bunkers wet'), 'Course Status shows playability (safe field)')

  assert(brief.weatherImpacts.hasData, 'Weather Impacts section has data')
  assert(brief.textVersion.includes('Heat — hydrate'), 'Weather Impacts rendered')

  assert(brief.watchAreas.hasData, 'Watch Areas section has data')
  assert(brief.textVersion.includes('Green 7 — Handwater'), 'Watch Areas rendered with flags')
}

// ── Empty inputs degrade honestly ──────────────────────────────────────────
{
  const empty = buildMorningBrief({}, { generatedAt: '2026-05-22' })
  assert(empty.courseStatus.hasData === false, 'no condition log → Course Status empty')
  assert(empty.watchAreas.hasData === false, 'no moisture → Watch Areas empty')
  assert(!empty.textVersion.includes('Course Status'), 'empty sections omitted from text')
}

// ── PRIVACY (source): the brief module never references privateNotes ───────
{
  const src = readFileSync('src/utils/operations/morningBrief.js', 'utf8')
  assert(!src.includes('privateNotes'), 'morningBrief.js source never references privateNotes')
  assert(!src.includes('private_notes'), 'morningBrief.js source never references private_notes')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
