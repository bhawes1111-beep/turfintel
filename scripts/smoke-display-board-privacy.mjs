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

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
