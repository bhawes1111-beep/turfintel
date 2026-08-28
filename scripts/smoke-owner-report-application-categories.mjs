import fs from 'node:fs'
import { buildAgronomyProgressReport } from '../src/utils/reports/reportBuilder.js'

const builder = fs.readFileSync('src/utils/reports/reportBuilder.js', 'utf8')
const checks = [
  [!builder.includes("'Payroll Basis':"), 'payroll basis is removed'],
  [builder.includes("explicitType === 'granular'"), 'explicit granular type takes precedence'],
  [builder.includes("explicitType === 'liquid'"), 'explicit liquid type takes precedence'],
  [builder.includes('plannedLiquidApplications'), 'planned liquid applications are categorized'],
  [builder.includes('plannedGranularApplications'), 'planned granular applications are categorized'],
  [builder.includes("'Planned Liquid Applications'"), 'planned liquid section is rendered'],
  [builder.includes("'Planned Granular Applications'"), 'planned granular section is rendered'],
  [builder.includes("'In Progress Liquid Applications'"), 'in-progress liquid section is rendered'],
  [builder.includes("'In Progress Granular Applications'"), 'in-progress granular section is rendered'],
]

const report = buildAgronomyProgressReport({
  sprays: [
    {
      id: 'planned-granular', date: '2026-08-03', status: 'planned',
      applicationType: 'granular', applicationName: 'Custom application', products: [],
    },
    {
      id: 'planned-liquid', date: '2026-08-04', status: 'planned',
      applicationType: 'liquid', applicationName: 'Granular-looking name', products: [],
    },
  ],
}, {
  startDate: '2026-08-03', endDate: '2026-08-16',
  include: {
    weeklyGoals: false, labor: false, hours: true, maintenance: false,
    irrigation: false, plannedApplications: true, sprays: false,
    fertilizer: false, tasks: false,
  },
})
const sectionTitles = report.sections.map(section => section.title)
checks.push(
  [sectionTitles.includes('Planned Liquid Applications'), 'explicit liquid record lands in planned liquid'],
  [sectionTitles.includes('Planned Granular Applications'), 'explicit granular record lands in planned granular'],
  [!JSON.stringify(report.sections).includes('Payroll Basis'), 'generated report omits payroll basis'],
)

const granularReport = buildAgronomyProgressReport({
  sprays: [
    {
      id: 'completed-granular-lb', date: '2026-08-05', status: 'completed',
      applicationType: 'granular', applicator: 'Bryan', totalCostSnapshot: 4.47,
      areas: [{ name: 'Custom', acreage: 0.09370982552800734 }],
      products: [{
        name: '21-7-14', type: 'Fertilizer', rate: '.25 lb N / 1,000 sq ft',
        quantityUsed: 4.859523809523809, unit: 'lb', totalCostSnapshot: 4.47,
      }],
    },
    {
      id: 'completed-granular-oz', date: '2026-08-04', status: 'completed',
      applicationType: 'granular', totalCostSnapshot: 2,
      areas: [{ name: 'Test', acreage: 1 }],
      products: [{
        name: 'DRY', type: 'Fertilizer', rate: '8 oz / acre',
        quantityUsed: 8, unit: 'oz', totalCostSnapshot: 2,
      }],
    },
  ],
}, {
  startDate: '2026-08-01', endDate: '2026-08-10',
  include: {
    weeklyGoals: false, labor: false, hours: false, maintenance: false,
    irrigation: false, plannedApplications: false, sprays: false,
    fertilizer: true, tasks: false,
  },
})
const granularSummary = granularReport.sections.find(section => section.title === 'Granular Applications')
const granularLog = granularReport.sections.find(section => section.title === 'Granular Application Log')
checks.push(
  [granularSummary?.data?.['Total Product Used'] === '5.3595 lb (85.75 oz)', 'granular summary totals pounds and dry ounces together'],
  [granularLog?.data?.columns?.includes('Total Product'), 'granular log includes total product used'],
  [granularLog?.data?.columns?.includes('Product Rate'), 'granular log includes calculated product rate'],
  [granularLog?.data?.rows?.[0]?.[5] === '1.1905 lb product / 1,000 sq ft', 'granular log calculates product rate from nutrient rate'],
  [granularLog?.data?.rows?.[0]?.[6] === '4.8595 lb', 'granular log preserves saved row quantity'],
)

for (const [passed, label] of checks) console.log(`${passed ? 'OK' : 'NO'} ${label}`)
const failures = checks.filter(([passed]) => !passed)
console.log(`\n${failures.length ? 'FAIL' : 'PASS'} ${checks.length - failures.length} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
