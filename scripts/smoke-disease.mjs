// Disease Pressure Awareness smoke test.
//
//   node scripts/smoke-disease.mjs
//
// Guarantees: (1) the module is AWARENESS, never prediction — isPrediction is
// always false and the source never claims to forecast; (2) every elevated
// level is backed by a named, plain-English reason (explainable); (3) honest
// empty/low states when nothing is favorable; (4) the strongest of the
// weather / moisture / observation factors wins.

import { readFileSync } from 'fs'
import { computeDiseasePressureAwareness } from '../src/utils/disease/diseasePressureAwareness.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── Empty input → low, honest, never a prediction ──────────────────────────
{
  const r = computeDiseasePressureAwareness({})
  assert(r.level === 'low', 'empty input → low', r)
  assert(r.isPrediction === false, 'empty input not a prediction')
  assert(r.summary.includes('No disease-favorable'), 'empty input → honest summary', r.summary)
  assert(Array.isArray(r.factors), 'factors is an array')
}

// ── Warm + humid + tight spread → elevated weather factor, explained ───────
{
  const r = computeDiseasePressureAwareness({
    weather: { currentTemp: 80, humidity: 90, dewPoint: 78 }, // spread 2°F
  })
  assert(r.level === 'critical', 'near-saturated air → critical', r)
  assert(r.isPrediction === false, 'still not a prediction')
  const w = r.factors.find(f => f.key === 'weather')
  assert(!!w && w.reasons.length > 0, 'weather factor carries a reason')
  assert(w.reasons.some(x => /spread|humid/i.test(x)), 'weather reason names the driver', w.reasons)
  assert(/elevated/i.test(r.summary), 'summary marks something elevated', r.summary)
}

// ── Dry, cool → low, weather factor reports not-favorable honestly ─────────
{
  const r = computeDiseasePressureAwareness({
    weather: { currentTemp: 55, humidity: 40, dewPoint: 30 },
  })
  assert(r.level === 'low', 'cool + dry → low', r)
  const w = r.factors.find(f => f.key === 'weather')
  assert(w.reasons.some(x => /not currently disease-favorable/i.test(x)), 'low weather explained honestly', w.reasons)
}

// ── Moisture flags elevate, and are explained by the matching flag text ────
{
  const r = computeDiseasePressureAwareness({
    weather: { currentTemp: 55, humidity: 40, dewPoint: 30 }, // weather low
    moistureFlags: ['Standing water #6', 'Wet low area #12'],
  })
  const m = r.factors.find(f => f.key === 'moisture')
  assert(m.level === 'high', 'two wet flags → high moisture factor', m)
  assert(m.reasons[0].includes('wet-surface flag'), 'moisture reason names wet flags', m.reasons)
  assert(r.level === 'high', 'strongest factor (moisture) wins overall', r)
}

// ── No wet flags → moisture honest-low (flags exist but none are wet) ──────
{
  const r = computeDiseasePressureAwareness({ moistureFlags: ['Firm greens', 'Good color'] })
  const m = r.factors.find(f => f.key === 'moisture')
  assert(m.level === 'low', 'non-wet flags → moisture low', m)
  assert(m.reasons[0].includes('no recent wet-surface flags'), 'moisture honest empty', m.reasons)
}

// ── Confirmed observation is the strongest signal (observed reality) ───────
{
  const r = computeDiseasePressureAwareness({
    weather: { currentTemp: 55, humidity: 40, dewPoint: 30 },
    observations: [
      { status: 'confirmed', diseaseName: 'Dollar Spot' },
      { status: 'resolved',  diseaseName: 'Brown Patch' }, // ignored
    ],
  })
  const o = r.factors.find(f => f.key === 'observations')
  assert(!!o, 'observation factor present when open obs exist')
  assert(o.level === 'high', 'confirmed obs → high', o)
  assert(o.reasons[0].includes('Dollar Spot'), 'observation reason names the disease', o.reasons)
  assert(r.level === 'high', 'confirmed obs drives overall level', r)
}

// ── Resolved-only observations contribute nothing ──────────────────────────
{
  const r = computeDiseasePressureAwareness({
    observations: [{ status: 'resolved', diseaseName: 'Pythium' }],
  })
  assert(!r.factors.find(f => f.key === 'observations'), 'resolved-only → no observation factor')
}

// ── SOURCE GUARANTEE: never claims to predict/forecast ─────────────────────
{
  const src = readFileSync('src/utils/disease/diseasePressureAwareness.js', 'utf8')
  // The word "predict"/"forecast" may appear only in negation (the contract).
  // Assert isPrediction:false is hard-coded and no return claims a forecast.
  assert(src.includes('isPrediction: false'), 'source hard-codes isPrediction:false')
  assert(!/forecast\s*:/.test(src), 'source exposes no forecast field')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
