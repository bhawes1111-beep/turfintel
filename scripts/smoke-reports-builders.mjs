// Reports — Phase 6C.2 pure-builder smoke test.
//
//   node scripts/smoke-reports-builders.mjs
//
// Imports each new builder (no DOM, no React, no server) and asserts the
// envelope shape (id stamp, module/type tagging, sections with valid types)
// on both empty and populated fixtures.

import {
  buildMaintenanceSummaryReport,
  buildMorningBriefReport,
  buildNutritionSummaryReport,
  buildCulturalHistoryReport,
  buildDiseaseLogReport,
  buildMoistureTrendReport,
} from '../src/utils/reports/reportBuilder.js'
import {
  REPORT_MODULE,
  REPORT_TYPE,
  SECTION_TYPE,
} from '../src/utils/reports/reportSchemas.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

function assertEnvelope(r, mod, type, label) {
  assert(r && typeof r === 'object',                                  `${label}: returns an object`)
  assert(typeof r?.id === 'string' && r.id.startsWith('rpt-'),        `${label}: id stamped`, r?.id)
  assert(r?.module === mod,                                            `${label}: module = ${mod}`, r?.module)
  assert(r?.type   === type,                                           `${label}: type = ${type}`,  r?.type)
  assert(typeof r?.title === 'string' && r.title.length > 0,           `${label}: has title`, r?.title)
  assert(typeof r?.createdAt === 'string' && r.createdAt.length > 0,   `${label}: createdAt timestamp`)
  assert(Array.isArray(r?.sections) && r.sections.length > 0,          `${label}: has ≥1 section`, r?.sections?.length)
  for (const s of (r?.sections ?? [])) {
    assert(typeof s.title === 'string' && s.title.length > 0,          `${label}: section title is non-empty string`, s?.title)
    assert(Object.values(SECTION_TYPE).includes(s.type),               `${label}: section type valid`, s?.type)
  }
  assert(Array.isArray(r?.exportFormats) && r.exportFormats.length > 0, `${label}: exportFormats set`)
  assert(r?.metadata && typeof r.metadata === 'object',                `${label}: metadata is object`)
}

// ── 1. Maintenance Summary ────────────────────────────────────────────────────
console.log('— buildMaintenanceSummaryReport')
{
  const empty = buildMaintenanceSummaryReport()
  assertEnvelope(empty, REPORT_MODULE.EQUIPMENT, REPORT_TYPE.MAINTENANCE_SUMMARY, 'maintenance-summary empty')
  assert(empty.metadata.recordCount === 0, 'maintenance-summary empty: recordCount = 0')
  assert(empty.metadata.totalCost   === 0, 'maintenance-summary empty: totalCost = 0')

  const populated = buildMaintenanceSummaryReport([
    { status: 'completed', cost: 120, category: 'mower',   technician: 'Joe' },
    { status: 'completed', cost: 45,  category: 'mower',   technician: 'Joe' },
    { status: 'pending',   cost: 0,   category: 'tractor', technician: 'Mike' },
  ], { dateRange: '2026-05-01 – 2026-05-24' })
  assertEnvelope(populated, REPORT_MODULE.EQUIPMENT, REPORT_TYPE.MAINTENANCE_SUMMARY, 'maintenance-summary populated')
  assert(populated.sections.some(s => s.title === 'By Category'),    'maintenance-summary: includes By Category')
  assert(populated.sections.some(s => s.title === 'By Technician'),  'maintenance-summary: includes By Technician')
  assert(populated.metadata.totalCost   === 165, 'maintenance-summary: totalCost computed', populated.metadata.totalCost)
  assert(populated.metadata.recordCount === 3,   'maintenance-summary: recordCount = 3')
}

// ── 2. Morning Brief ──────────────────────────────────────────────────────────
console.log('— buildMorningBriefReport')
{
  const empty = buildMorningBriefReport(null)
  assertEnvelope(empty, REPORT_MODULE.OPERATIONS, REPORT_TYPE.MORNING_BRIEF, 'morning-brief null')
  assert(empty.sections.length === 1 && empty.sections[0].title === 'Brief', 'morning-brief null: single fallback section')

  const populated = buildMorningBriefReport({
    generatedAt:  '2026-05-24',
    courseName:   'Pine Valley',
    courseStatus: { bullets: ['Course open'],         hasData: true },
    crewSummary:  { bullets: ['8 on, 0 off'],         hasData: true },
    priorities:   { bullets: ['Mow greens'],          hasData: true },
    weatherSummary: { bullets: [],                    hasData: false }, // omitted
  })
  assertEnvelope(populated, REPORT_MODULE.OPERATIONS, REPORT_TYPE.MORNING_BRIEF, 'morning-brief populated')
  assert(populated.metadata.courseName  === 'Pine Valley', 'morning-brief: courseName in metadata')
  assert(populated.metadata.generatedAt === '2026-05-24',  'morning-brief: generatedAt in metadata')
  assert(populated.sections.length === 3, 'morning-brief: 3 non-empty sections (weather omitted)', populated.sections.length)
  assert(populated.sections.every(s => s.type === SECTION_TYPE.TEXT), 'morning-brief: all sections TEXT')
  assert(populated.sections[0].data.startsWith('• '), 'morning-brief: bullets formatted')
}

// ── 3. Nutrition Summary ──────────────────────────────────────────────────────
console.log('— buildNutritionSummaryReport')
{
  const empty = buildNutritionSummaryReport()
  assertEnvelope(empty, REPORT_MODULE.AGRONOMY, REPORT_TYPE.NUTRITION_SUMMARY, 'nutrition-summary empty')
  assert(empty.metadata.counts.soil === 0, 'nutrition-summary empty: counts.soil = 0')

  const populated = buildNutritionSummaryReport({
    soilReports:     [{ date: '2026-05-01', area: 'Greens', lab: 'Brookside', ph: 6.4, om: 3.1 }],
    tissueReports:   [{ date: '2026-05-10', area: 'Greens', lab: 'Brookside', n: 3.5, p: 0.4, k: 2.1 }],
    waterReports:    [{ date: '2026-05-15', source: 'Pond 1', lab: 'Brookside', ph: 7.2, ec: 0.4, sar: 1.1 }],
    recommendations: [{ area: 'Greens', priority: 'high', summary: 'Apply K' }],
  })
  assertEnvelope(populated, REPORT_MODULE.AGRONOMY, REPORT_TYPE.NUTRITION_SUMMARY, 'nutrition-summary populated')
  assert(populated.sections.some(s => s.title === 'Soil Reports'),     'nutrition-summary: includes Soil Reports')
  assert(populated.sections.some(s => s.title === 'Tissue Reports'),   'nutrition-summary: includes Tissue Reports')
  assert(populated.sections.some(s => s.title === 'Water Reports'),    'nutrition-summary: includes Water Reports')
  assert(populated.sections.some(s => s.title === 'Recommendations'),  'nutrition-summary: includes Recommendations')
  assert(populated.metadata.counts.tissue === 1, 'nutrition-summary: counts.tissue = 1')
}

// ── 4. Cultural Practices History ─────────────────────────────────────────────
// Fixtures mirror the /api/cultural-practices shape (one flat row per event,
// discriminated by practiceType). See worker/api/culturalPractices.js.
console.log('— buildCulturalHistoryReport')
{
  const empty = buildCulturalHistoryReport()
  assertEnvelope(empty, REPORT_MODULE.OPERATIONS, REPORT_TYPE.CULTURAL_HISTORY, 'cultural-history empty')
  assert(empty.metadata.totalEvents === 0, 'cultural-history empty: totalEvents = 0')

  const populated = buildCulturalHistoryReport([
    { id: 'a', practiceType: 'aerification', practiceDate: '2026-05-01', targetArea: 'Greens',  depth: '4in', status: 'completed', recoveryStatus: 'recovering' },
    { id: 'b', practiceType: 'topdressing',  practiceDate: '2026-05-02', targetArea: 'Greens',  materialUsed: 'sand', materialRate: '1/8 in', status: 'completed' },
    { id: 'c', practiceType: 'rolling',      practiceDate: '2026-05-03', targetArea: 'Fairways', status: 'planned' },
  ])
  assertEnvelope(populated, REPORT_MODULE.OPERATIONS, REPORT_TYPE.CULTURAL_HISTORY, 'cultural-history populated')
  assert(populated.metadata.totalEvents === 3,                       'cultural-history: totalEvents = 3', populated.metadata.totalEvents)
  assert(populated.sections.some(s => s.title === 'Aerification'),   'cultural-history: includes Aerification')
  assert(populated.sections.some(s => s.title === 'Topdressing'),    'cultural-history: includes Topdressing')
  assert(populated.sections.some(s => s.title === 'Rolling'),        'cultural-history: includes Rolling')
  assert(!populated.sections.some(s => s.title === 'Verticutting'),  'cultural-history: omits absent practice sections')
}

// ── 5. Disease Log ────────────────────────────────────────────────────────────
// Fixtures mirror the /api/disease shape (observedAt, diseaseName, location, …).
console.log('— buildDiseaseLogReport')
{
  const empty = buildDiseaseLogReport()
  assertEnvelope(empty, REPORT_MODULE.DISEASE, REPORT_TYPE.DISEASE_LOG, 'disease-log empty')
  assert(empty.metadata.observationCount === 0, 'disease-log empty: observationCount = 0')

  const populated = buildDiseaseLogReport([
    { observedAt: '2026-05-10', location: 'Green 5', diseaseName: 'Dollar Spot', severity: 'low',  status: 'monitoring' },
    { observedAt: '2026-05-12', location: 'Green 8', diseaseName: 'Brown Patch', severity: 'high', status: 'confirmed'  },
    { observedAt: '2026-05-08', location: 'Green 2', diseaseName: 'Dollar Spot', severity: 'low',  status: 'resolved'   },
  ])
  assertEnvelope(populated, REPORT_MODULE.DISEASE, REPORT_TYPE.DISEASE_LOG, 'disease-log populated')
  assert(populated.sections.some(s => s.title === 'Active Observations'),   'disease-log: includes Active Observations')
  assert(populated.sections.some(s => s.title === 'Resolved Observations'), 'disease-log: includes Resolved Observations')
  assert(populated.sections.some(s => s.title === 'By Severity'),           'disease-log: includes By Severity')
  assert(populated.metadata.observationCount === 3,                         'disease-log: observationCount = 3')
}

// ── 6. Moisture Trend ─────────────────────────────────────────────────────────
// Fixtures mirror the /api/moisture shape (observedAt, location, moisturePct, flags).
console.log('— buildMoistureTrendReport')
{
  const empty = buildMoistureTrendReport()
  assertEnvelope(empty, REPORT_MODULE.MOISTURE, REPORT_TYPE.MOISTURE_TREND, 'moisture-trend empty')
  assert(empty.metadata.readingCount === 0,  'moisture-trend empty: readingCount = 0')
  assert(empty.metadata.average      === null,'moisture-trend empty: average = null')

  const populated = buildMoistureTrendReport([
    { observedAt: '2026-05-20', location: 'Green 1', moisturePct: 18.5, wiltStress: false, drySpot: false },
    { observedAt: '2026-05-21', location: 'Green 1', moisturePct: 22.0, wiltStress: false, drySpot: false },
    { observedAt: '2026-05-22', location: 'Green 2', moisturePct: 14.0, wiltStress: true,  drySpot: true  },
  ], { location: 'Green 1', dateRange: 'last 7d' })
  assertEnvelope(populated, REPORT_MODULE.MOISTURE, REPORT_TYPE.MOISTURE_TREND, 'moisture-trend populated')
  assert(populated.metadata.location     === 'Green 1', 'moisture-trend: location in metadata')
  assert(populated.metadata.readingCount === 2,         'moisture-trend: filtered to location', populated.metadata.readingCount)
  assert(Math.abs(populated.metadata.average - 20.25) < 0.01, 'moisture-trend: average correct', populated.metadata.average)
}

// ── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
