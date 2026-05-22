// Display Board privacy + weather-impacts smoke test.
//
//   node scripts/smoke-display-board-privacy.mjs
//
// Two guarantees for the crew-facing Display Board:
//   1. PRIVACY — the board source must never reference the course condition
//      log or any private-notes field. Private superintendent notes live in
//      course_condition_logs and must not be reachable from the crew board.
//   2. weatherImpacts() produces correct crew-facing impact chips.

import { readFileSync } from 'fs'
import { weatherImpacts } from '../src/utils/weather/weatherImpacts.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. PRIVACY — static scan of the Display Board source ──────────────────
{
  const src = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
  // Forbidden: any wiring of the condition log or private notes into the board.
  const FORBIDDEN = [
    'conditionLogStore',
    'conditionLog/',
    'private_notes',
    'privateNotes',
    'course_condition',
    'course-condition',
    '/api/condition-logs',
  ]
  for (const term of FORBIDDEN) {
    assert(!src.includes(term), `Display Board does not reference "${term}"`)
  }
  // The shared panel the board renders must also stay clean.
  const panel = readFileSync('src/components/shared/OperationalIntelligencePanel.jsx', 'utf8')
  for (const term of ['conditionLog', 'private_notes', 'privateNotes', 'course_condition']) {
    assert(!panel.includes(term), `OperationalIntelligencePanel does not reference "${term}"`)
  }
}

// ── 2. weatherImpacts ─────────────────────────────────────────────────────
{
  assert(weatherImpacts({}, []).length === 0, 'no data → no impacts (honest clear state)')

  const frost = weatherImpacts({ currentTemp: 33 }, [])
  assert(frost.some(i => i.key === 'frost' && i.severity === 'alert'), 'cold current → frost alert', frost)

  const frostFc = weatherImpacts({ currentTemp: 55 }, [{ low: 34 }])
  assert(frostFc.some(i => i.key === 'frost'), 'forecast low ≤36 → frost', frostFc)

  const wind = weatherImpacts({ currentTemp: 60, wind: 18 }, [])
  assert(wind.some(i => i.key === 'wind'), 'wind ≥15 → high wind', wind)

  const heat = weatherImpacts({ currentTemp: 90, humidity: 40, wind: 5 }, [])
  assert(heat.some(i => i.key === 'heat'), 'temp ≥85 → heat', heat)

  const rain = weatherImpacts({ currentTemp: 60 }, [{ rainfall: 0.8 }])
  assert(rain.some(i => i.key === 'rain'), 'rainfall ≥0.5 → heavy rain', rain)

  const mild = weatherImpacts({ currentTemp: 68, humidity: 55, wind: 6 }, [{ low: 50, rainfall: 0 }])
  assert(mild.length === 0, 'mild conditions → no impacts', mild)
}

// ── 3. PERMISSION LAYER — private notes restricted to authorized roles ─────
{
  const { can } = await import('../src/utils/auth/permissions.js')
  // Crew-tier roles must never have the private-notes permission.
  assert(!can('crew', 'canViewPrivateNotes'), 'crew denied private notes')
  assert(!can('crew_lead', 'canViewPrivateNotes'), 'crew_lead denied private notes')
  assert(!can('read_only', 'canViewPrivateNotes'), 'read_only denied private notes')
  assert(!can('assistant_super', 'canViewPrivateNotes'), 'assistant denied private notes (no override)')
  // Authorized roles keep access.
  assert(can('superintendent', 'canViewPrivateNotes'), 'superintendent retains private notes')
  assert(can('owner_admin', 'canViewPrivateNotes'), 'owner_admin retains private notes')

  // The condition-log editor must gate the field on the permission, and must
  // not hydrate/save it for unauthorized sessions.
  const tab = readFileSync('src/pages/Operations/ConditionLogTab.jsx', 'utf8')
  assert(tab.includes('canViewPrivateNotes'), 'ConditionLogTab checks canViewPrivateNotes')
  assert(tab.includes('delete payload.privateNotes'), 'ConditionLogTab strips privateNotes from unauthorized save')
}

// ── 4. SERVER-SIDE private_notes enforcement (Phase 2 P1) ──────────────────
{
  // The API gate must resolve the actor and pass canViewPrivateNotes into the
  // condition-log reads — so private_notes is stripped server-side, not just
  // hidden in the UI.
  const idx = readFileSync('worker/index.js', 'utf8')
  assert(idx.includes("actorHasPermission(actor, 'canViewPrivateNotes')"), 'worker resolves canViewPrivateNotes for condition-log reads')
  assert(/listConditionLogs\(env, courseId, \{ days \}, canViewPrivate\)/.test(idx), 'list read threads canViewPrivate')
  assert(/getConditionLogByDate\(env, courseId, date, canViewPrivate\)/.test(idx), 'by-date read threads canViewPrivate')

  // The serializer omits the field for unauthorized actors.
  const api = readFileSync('worker/api/conditionLog.js', 'utf8')
  assert(/if \(canViewPrivate\) out\.privateNotes = row\.private_notes/.test(api), 'serializer omits privateNotes unless authorized')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
