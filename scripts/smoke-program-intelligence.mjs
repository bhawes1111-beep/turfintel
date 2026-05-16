// Phase 23A — Spray Program Intelligence smoke test.
//
// Runs the analytics / sequence / drift / summary helpers against
// representative seasonal fixtures. Run with:
//
//   node scripts/smoke-program-intelligence.mjs
//
// Exits 0 on success, 1 on first failed assertion. Not bundled.

import {
  tallyByGroup,
  tallyByFamily,
  tallyBySurface,
  multiSiteRate,
  longestStreaksByFrac,
  diversityScore,
  highPressureGroups,
  chronologicalChain,
  surfaceSequences,
  longestStreaks,
  gapsBetween,
  compareToPlannedRotation,
  dependencyConcentration,
  diversityDegradation,
  analyzeProgramDrift,
  buildProgramSummary,
} from '../src/utils/programIntelligence/index.js'

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

// ── Fixture: representative season on Greens + Fairways ─────────────────
// FRAC 11 hit Greens four times consecutively (high-pressure single-site
// reliance). M5 multi-site partner used on Greens twice. Fairways saw
// FRAC 3. Six total applications.

const labelsByItemId = {
  // QoI molecules (FRAC 11)
  'inv-heritage':   { fracGroup: '11',  activeIngredients: 'Azoxystrobin 22.9%' },
  'inv-insignia':   { fracGroup: '11',  activeIngredients: 'Pyraclostrobin 23.6%' },
  'inv-disarm':     { fracGroup: '11',  activeIngredients: 'Fluoxastrobin 40.3%' },
  // Multi-site
  'inv-daconil':    { fracGroup: 'M5',  activeIngredients: 'Chlorothalonil 54%' },
  // DMI
  'inv-banner':     { fracGroup: '3',   activeIngredients: 'Propiconazole 41.8%' },
  // SDHI
  'inv-emerald':    { fracGroup: '7',   activeIngredients: 'Boscalid 70%' },
}

const records = [
  { id: 'r1', date: '2026-04-01', area: 'Greens',   products: [{ inventoryItemId: 'inv-heritage', name: 'Heritage' }] },
  { id: 'r2', date: '2026-04-08', area: 'Greens',   products: [{ inventoryItemId: 'inv-insignia', name: 'Insignia' }] },
  { id: 'r3', date: '2026-04-15', area: 'Greens',   products: [{ inventoryItemId: 'inv-disarm',   name: 'Disarm' }] },
  { id: 'r4', date: '2026-04-22', area: 'Greens',   products: [{ inventoryItemId: 'inv-heritage', name: 'Heritage' }] },
  { id: 'r5', date: '2026-04-29', area: 'Greens',   products: [{ inventoryItemId: 'inv-daconil',  name: 'Daconil' }] },
  { id: 'r6', date: '2026-05-06', area: 'Fairway #1', products: [{ inventoryItemId: 'inv-banner', name: 'Banner Maxx' }] },
]

// ── 1. Group tallies ────────────────────────────────────────────────────
section('Group tallies')

const g = tallyByGroup(records, labelsByItemId)
assert(g.totalApplications === 6, 'total applications')
assert(g.FRAC.find(e => e.code === '11')?.applications === 4, 'FRAC 11 applied 4×')
assert(g.FRAC.find(e => e.code === 'M5')?.applications === 1, 'FRAC M5 applied 1×')
assert(g.FRAC.find(e => e.code === '3')?.applications === 1, 'FRAC 3 applied 1×')
assert(g.FRAC[0].code === '11', 'FRAC list sorted by applications (11 first)')

// ── 2. Family tallies ───────────────────────────────────────────────────
section('Family tallies')

const fam = tallyByFamily(records, labelsByItemId)
assert(fam.totalApplications === 6, 'family total apps')
const qoiFam = fam.families.find(f => f.code === 'QOI')
assert(qoiFam?.applications === 4, 'QOI family seen in 4 apps (3 distinct molecules)')
const multiFam = fam.families.find(f => f.code === 'MULTI')
assert(multiFam?.applications === 1, 'MULTI family in 1 app')
const dmiFam = fam.families.find(f => f.code === 'DMI')
assert(dmiFam?.applications === 1, 'DMI family in 1 app')

// ── 3. Surface tallies ──────────────────────────────────────────────────
section('Surface tallies')

const surf = tallyBySurface(records)
assert(surf.totalApplications === 6, 'surface tally total')
const greens = surf.surfaces.find(s => s.surface === 'greens')
assert(greens?.applications === 5, 'greens = 5')
const fairways = surf.surfaces.find(s => s.surface === 'fairways')
assert(fairways?.applications === 1, 'fairways = 1')

// ── 4. Multi-site rate ──────────────────────────────────────────────────
section('Multi-site rate')

const ms = multiSiteRate(records, labelsByItemId)
assert(ms.withPartner === 1, '1 app included a multi-site partner')
assert(Math.abs(ms.rate - 1/6) < 0.001, `multi-site rate ≈ 1/6 (got ${ms.rate})`)

// ── 5. Diversity score ──────────────────────────────────────────────────
section('Diversity score')

const div = diversityScore(records, labelsByItemId)
assert(div.distinctCodes === 3, '3 distinct FRAC codes (11, M5, 3)')
assert(div.score > 0 && div.score < 1, `0 < score < 1 (got ${div.score})`)
// Pure monoculture
const mono = diversityScore(
  [
    { id: 'a', date: '2026-04-01', area: 'Greens', products: [{ inventoryItemId: 'inv-heritage' }] },
    { id: 'b', date: '2026-04-08', area: 'Greens', products: [{ inventoryItemId: 'inv-heritage' }] },
  ],
  labelsByItemId,
)
assert(mono.score === 0, 'single-code program has score 0')
assert(diversityScore([], {}).score === null, 'empty records → null score')

// ── 6. Longest FRAC streaks ─────────────────────────────────────────────
section('Longest streaks')

const streaks = longestStreaksByFrac(records, labelsByItemId)
const f11Streak = streaks.find(s => s.code === '11')
assert(f11Streak?.streak === 4, `FRAC 11 streak = 4 on Greens (got ${f11Streak?.streak})`)
assert(f11Streak?.surface === 'greens', 'streak surface = greens')

// generic longestStreaks (FRAC/HRAC/IRAC)
const all = longestStreaks(records, labelsByItemId, { minStreak: 2 })
const all11 = all.find(s => s.type === 'FRAC' && s.code === '11')
assert(all11?.streak === 4, 'general streak: FRAC 11 = 4')
const m5Streak = all.find(s => s.code === 'M5')
assert(!m5Streak, 'M5 had only 1 app — no streak (>= minStreak=2)')

// ── 7. Gaps between applications ────────────────────────────────────────
section('Gaps between applications')

const gaps = gapsBetween(records, labelsByItemId)
const gap11 = gaps.find(g => g.type === 'FRAC' && g.code === '11')
assert(gap11, 'FRAC 11 has gap data')
assert(gap11.gaps.length === 3, 'three intervals between 4 FRAC 11 apps')
assert(gap11.minGapDays === 7, 'min gap is 7 days')

// ── 8. Chronological + surface chains ──────────────────────────────────
section('Chronological + surface sequences')

const chain = chronologicalChain(records, labelsByItemId)
assert(chain.length === 6, 'chain length = 6')
assert(chain[0].date === '2026-04-01', 'first entry is April 1')
assert(chain[chain.length - 1].date === '2026-05-06', 'last entry is May 6')

const surfChains = surfaceSequences(records, labelsByItemId)
const greensChain = surfChains.find(s => s.surface === 'greens')
assert(greensChain?.entries.length === 5, '5 greens entries in surface sequence')

// ── 9. High-pressure groups ─────────────────────────────────────────────
section('High-pressure groups')

const hp = highPressureGroups(records, labelsByItemId)
const hp11 = hp.find(h => h.code === '11')
assert(hp11, 'FRAC 11 flagged as high-pressure')
assert(hp11.share > 0.5, `FRAC 11 share > 50% (got ${hp11.share})`)

// ── 10. Drift findings ──────────────────────────────────────────────────
section('Drift detection')

const planFindings = compareToPlannedRotation(records, ['M5', '11', '3', '7', '12'], labelsByItemId)
const missing7  = planFindings.find(f => f.code === 'planned-not-applied' && f.evidence.code === '7')
const missing12 = planFindings.find(f => f.code === 'planned-not-applied' && f.evidence.code === '12')
assert(missing7 && missing12, 'planned-but-missing detected for FRAC 7 and 12')
assert(missing7.severity === 'warn', 'missing planned → warn severity')

const concentration = dependencyConcentration(records, labelsByItemId)
const conc11 = concentration.find(c => c.evidence.code === '11')
assert(conc11, 'concentration finding on FRAC 11')
assert(conc11.severity === 'high', 'FRAC 11 at >= 50% → high severity')

const drift = analyzeProgramDrift(records, labelsByItemId, {
  plannedFracCodes: ['M5', '11', '3', '7'],
})
assert(drift.length > 0, 'drift findings present')
assert(drift[0].severity === 'high', 'drift findings sorted high → low')

// Diversity degradation requires both seasons.
const prior = [
  { id: 'p1', date: '2025-04-01', area: 'Greens', products: [{ inventoryItemId: 'inv-heritage' }] },
  { id: 'p2', date: '2025-04-08', area: 'Greens', products: [{ inventoryItemId: 'inv-daconil'  }] },
  { id: 'p3', date: '2025-04-15', area: 'Greens', products: [{ inventoryItemId: 'inv-banner'   }] },
  { id: 'p4', date: '2025-04-22', area: 'Greens', products: [{ inventoryItemId: 'inv-emerald'  }] },
]
const dd = diversityDegradation(records, prior, labelsByItemId)
// Prior season is perfectly diverse (4 codes, 1 app each → score 1.0).
// Current season is concentrated on FRAC 11 → much lower. Delta should be negative.
assert(dd, 'diversity degradation returned a finding')
assert(dd.evidence.delta < -0.10, `delta negative & <= -0.10 (got ${dd.evidence?.delta})`)

const driftFull = analyzeProgramDrift(records, labelsByItemId, {
  plannedFracCodes:   ['M5', '11', '3', '7'],
  priorSeasonRecords: prior,
})
const ddFinding = driftFull.find(f => f.code === 'diversity-degradation')
assert(ddFinding, 'diversity-degradation surfaced via analyzeProgramDrift')

// ── 11. Unified summary builder ─────────────────────────────────────────
section('Unified summary')

const summary = buildProgramSummary(records, labelsByItemId, {
  plannedFracCodes:   ['M5', '11', '3', '7'],
  priorSeasonRecords: prior,
})
assert(summary.totalApplications === 6, 'summary totalApplications = 6')
assert(summary.fracUsage[0].code === '11', 'summary fracUsage top = 11')
assert(Array.isArray(summary.familyUsage.families), 'summary.familyUsage.families is an array')
assert(summary.diversity.score != null, 'summary carries diversity score')
assert(Array.isArray(summary.drift), 'summary.drift is an array')
assert(summary.drift.some(f => f.code === 'dependency-concentration'), 'summary drift includes concentration')

// ── 12. Empty-input safety ──────────────────────────────────────────────
section('Empty-input safety')

const empty = buildProgramSummary([], {})
assert(empty.totalApplications === 0, 'empty: 0 apps')
assert(empty.fracUsage.length === 0, 'empty: no FRAC usage')
assert(empty.diversity.score === null, 'empty: null diversity score')
assert(empty.drift.length === 0, 'empty: no drift findings')

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
