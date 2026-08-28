import fs from 'node:fs'

let passed = 0
let failed = 0

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function assertIncludes(source, needle, label) {
  if (source.includes(needle)) {
    passed += 1
    console.log(`  OK ${label}`)
  } else {
    failed += 1
    console.error(`  NO ${label}`)
  }
}

function assertNotIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    passed += 1
    console.log(`  OK ${label}`)
  } else {
    failed += 1
    console.error(`  NO ${label}`)
  }
}

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    passed += 1
    console.log(`  OK ${label}`)
  } else {
    failed += 1
    console.error(`  NO ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const reportsPage = read('src/pages/Reports/Reports.jsx')
const reportsCss = read('src/pages/Reports/Reports.module.css')
const reportBuilder = read('src/utils/reports/reportBuilder.js')
const schemas = read('src/utils/reports/reportSchemas.js')
const reportActions = read('src/components/reports/ReportActions.jsx')
const reportPreview = read('src/components/reports/ReportPreviewModal.jsx')
const exportUtils = read('src/utils/reports/exportUtils.js')
const formatter = read('src/utils/reports/reportFormatter.js')
const { defaultOwnerReportRange, ownerReportEndDate } = await import('../src/utils/reports/reportDateRange.js')

console.log('\nAgronomy progress report schema and builder')
assertIncludes(schemas, 'AGRONOMY_PROGRESS', 'report type exists')
assertIncludes(reportBuilder, 'buildAgronomyProgressReport', 'builder is exported')
assertIncludes(reportBuilder, 'Owner Summary', 'builder creates owner summary')
assertIncludes(reportBuilder, 'Task Assignments', 'builder can include tasks')
assertIncludes(reportBuilder, 'Planned Tasks', 'builder creates planned task section')
assertIncludes(reportBuilder, 'In Progress Tasks', 'builder creates in-progress task section')
assertIncludes(reportBuilder, 'Complete Tasks', 'builder creates complete task section')
assertIncludes(reportBuilder, 'Planned Applications', 'builder creates planned application section')
assertIncludes(reportBuilder, 'taskReportGroupRows', 'builder groups repeated task rows')
assertIncludes(reportBuilder, 'Liquid Applications', 'builder can include liquid applications')
assertIncludes(reportBuilder, 'Granular Applications', 'builder can include granular applications')
assertIncludes(reportBuilder, 'Equipment R&M', 'builder uses owner-facing equipment R&M label')
assertIncludes(reportBuilder, 'Labor / Payroll', 'builder can include payroll')
assertIncludes(reportBuilder, 'Hours Summary', 'builder can include hours')
assertIncludes(reportBuilder, 'printExtras', 'builder adds print/PDF summary extras')
assertIncludes(reportBuilder, 'assignmentReportStatus', 'builder normalizes assignment status vocabulary')
assertIncludes(reportBuilder, 'buildScheduleByEmployeeForDate', 'builder uses schedule merge for payroll hours')
assertIncludes(reportBuilder, 'Schedule Hours', 'builder reports schedule hours')
assertNotIncludes(reportBuilder, "'N-P-K'", 'owner fertilizer report omits nutrient column')
assertIncludes(reportBuilder, 'filteredApplications', 'builder starts from unified application records')
assertIncludes(reportBuilder, 'filteredApplicationRecords', 'builder separates all application records from completed application logs')
assertIncludes(reportBuilder, 'savedStatusApplicationEvent', 'builder converts saved application statuses into report events')
assertIncludes(reportBuilder, 'applicationHasStatus', 'builder buckets saved applications by status')
assertIncludes(reportBuilder, 'applicationIsGranular', 'builder classifies granular applications')
assertIncludes(reportBuilder, 'filteredGranularApplications', 'builder builds granular application rows')

console.log('\nReports page wiring')
assertIncludes(reportsPage, 'buildAgronomyProgressReport', 'page imports builder')
assertIncludes(reportsPage, 'useAssignmentsData', 'page loads assignments')
assertIncludes(reportsPage, 'useCalendarData', 'page loads calendar events')
assertIncludes(reportsPage, 'useCrewData', 'page loads employees')
assertIncludes(reportsPage, 'useTaskTemplatesData', 'page loads task library')
assertIncludes(reportsPage, 'useEmployeeSchedulesData', 'page loads weekly schedules')
assertIncludes(reportsPage, 'useScheduleOverridesData', 'page loads schedule overrides')
assertIncludes(reportsPage, 'weeklySchedules', 'page passes weekly schedules to builder')
assertIncludes(reportsPage, 'scheduleOverrides', 'page passes schedule overrides to builder')
assertIncludes(reportsPage, 'listSprayProgramItems', 'page preloads planned application items')
assertIncludes(reportsPage, 'plannedApplications', 'page exposes planned applications option')
assertIncludes(reportsPage, 'ownerReportGenerating', 'page waits while loading planned applications')
assertIncludes(reportsPage, 'Agronomy Progress Report', 'owner report panel renders')
assertIncludes(reportsPage, 'type="date"', 'date range controls exist')
assertIncludes(reportsPage, 'type="checkbox"', 'section chooser controls exist')
assertIncludes(reportsPage, 'Generate owner report', 'generate button exists')
assertIncludes(reportsPage, 'defaultOwnerReportRange', 'owner report uses the calendar-aligned default range')
const ownerRange = defaultOwnerReportRange('2026-08-05')
assertEqual(ownerRange.startDate, '2026-08-03', 'owner report starts on Monday of the current week')
assertEqual(ownerRange.endDate, '2026-08-16', 'owner report covers fourteen days through the following Sunday')
assertEqual(ownerReportEndDate('2026-08-10'), '2026-08-23', 'selecting a start date sets the end date thirteen days later')
assertIncludes(reportsPage, 'setOwnerStartDate(event.target.value)', 'start-date selection updates the owner report range')

console.log('\nReports page styling')
assertIncludes(reportsCss, '.ownerReportCard', 'owner report card is styled')
assertIncludes(reportsCss, '.ownerSectionPicker', 'section picker is styled')
assertIncludes(reportsCss, '.ownerCheckTile', 'section check tiles are styled')
assertIncludes(reportsCss, '.ownerNotes', 'owner notes are styled')

console.log('\nPDF preview')
assertIncludes(reportActions, 'View PDF', 'report actions show View PDF')
assertIncludes(reportActions, 'viewPDF(report, courseInfo)', 'View PDF opens PDF preview')
assertNotIncludes(reportPreview, 'className={styles.rpOverlay}\n      onClick={onClose}', 'report preview does not close when clicking outside the panel')
assertIncludes(exportUtils, 'export function viewPDF', 'PDF preview helper exists')
assertIncludes(formatter, 'pdf-toolbar', 'PDF preview has toolbar')
assertIncludes(formatter, '@page', 'print/PDF page sizing is defined')
assertIncludes(formatter, '@page { size: letter; margin: 0.35in; }', 'print/PDF uses compact page margins')
assertIncludes(formatter, 'print-color-adjust: exact', 'print preserves PDF preview colors')
assertIncludes(formatter, 'body            { padding: 0; background: #f6f7f1; color: #15251b; max-width: 900px; }', 'print keeps PDF preview page width and background')
assertIncludes(formatter, '.report-header  { margin-bottom: 10px; border-radius: 12px 12px 0 0; padding: 18px 22px 16px;', 'print keeps PDF preview header styling')
assertIncludes(formatter, '.section        { margin-bottom: 9px; padding: 10px 12px; background: #fffef9; break-inside: auto; }', 'print allows long sections to flow compactly')
assertIncludes(formatter, '.report-footer  { position: static;', 'print footer does not consume every page')

console.log('\nOwner report granular application coverage')
const { buildAgronomyProgressReport } = await import('../src/utils/reports/reportBuilder.js')
const ownerReport = buildAgronomyProgressReport({
  sprays: [
    {
      id: 'spray-liquid-1',
      applicationName: 'Liquid Spray - Greens - 2026-08-01',
      date: '2026-08-01',
      area: 'Greens',
      applicator: 'Bryan Hawes',
      totalCostSnapshot: 12,
      products: [{ name: 'Resilia', type: 'Fungicide', rate: '4 oz / 1,000 sq ft' }],
    },
    {
      id: 'app-granular-1',
      applicationName: 'Granular - Greens - 2026-08-02',
      date: '2026-08-02',
      area: 'Greens',
      areas: [{ name: 'Greens', acreage: 4 }],
      products: [{ name: '18-3-18', type: 'Fertilizer', rate: '0.207 lb N / 1,000 sq ft' }],
    },
    {
      id: 'spray-planned-1',
      applicationName: 'Liquid Spray - Fairways - 2026-08-03',
      status: 'planned ',
      date: '2026-08-03',
      area: 'Fairways',
      products: [{ name: 'T-Nex', type: 'PGR' }],
    },
    {
      id: 'spray-in-progress-1',
      applicationName: 'Liquid Spray - Tees - 2026-08-03',
      status: 'in progress',
      date: '2026-08-03',
      area: 'Tees',
      products: [{ name: 'Revolver', type: 'Herbicide' }],
    },
    {
      id: 'spray-pending-review-1',
      applicationName: 'Liquid Spray - Rough - 2026-08-03',
      status: 'pending review',
      date: '2026-08-03',
      area: 'Rough',
      products: [{ name: 'MSMA Plus', type: 'Herbicide' }],
    },
  ],
  nutritionApplications: [],
}, {
  startDate: '2026-08-01',
  endDate: '2026-08-03',
  include: { tasks: false, maintenance: false, irrigation: false, labor: false, hours: false },
})
const ownerSummary = ownerReport.sections.find(section => section.title === 'Owner Summary')
const granularLog = ownerReport.sections.find(section => section.title === 'Granular Application Log')
const liquidLog = ownerReport.sections.find(section => section.title === 'Liquid Application Log')
const inProgressLog = ownerReport.sections.find(section => section.title === 'In Progress Applications')
const pendingReviewLog = ownerReport.sections.find(section => section.title === 'Pending Review Applications')
assertEqual(ownerSummary?.data?.['Liquid Applications'], 1, 'owner summary counts liquid applications separately')
assertEqual(ownerSummary?.data?.['Planned Applications'], 1, 'owner summary counts saved planned applications separately from liquid logs')
assertEqual(ownerSummary?.data?.['In Progress Applications'], 1, 'owner summary counts saved in-progress applications by status')
assertEqual(ownerSummary?.data?.['Pending Review Applications'], 1, 'owner summary counts saved pending-review applications by status')
assertEqual(ownerSummary?.data?.['Granular Applications'], 1, 'owner summary counts granular applications separately')
assertEqual(granularLog?.data?.rows?.[0]?.[1], '18-3-18', 'granular log lists granular product')
assertEqual(liquidLog?.data?.rows?.[0]?.[1], 'Liquid Spray - Greens - 2026-08-01', 'liquid log keeps liquid application')
assertEqual(inProgressLog?.data?.rows?.[0]?.[2], 'In Progress', 'in-progress application section uses normalized status')
assertEqual(pendingReviewLog?.data?.rows?.[0]?.[2], 'Pending Review', 'pending-review application section uses normalized status')

const toggledOffReport = buildAgronomyProgressReport({
  sprays: [],
  nutritionApplications: [],
}, {
  startDate: '2026-08-01',
  endDate: '2026-08-03',
  include: {
    tasks: false,
    sprays: true,
    fertilizer: true,
    maintenance: false,
    irrigation: false,
    labor: false,
    hours: false,
  },
})
const toggledOwnerSummary = toggledOffReport.sections.find(section => section.title === 'Owner Summary')
const toggledSummaryJson = JSON.stringify(toggledOffReport.metadata.printExtras.summary)
const toggledOwnerJson = JSON.stringify(toggledOwnerSummary?.data ?? {})
assertEqual(toggledOffReport.metadata.printExtras.summary.some(([, value]) => value === 'Off'), false, 'PDF summary omits toggled-off tiles')
assertEqual(toggledSummaryJson.includes('Schedule Hours'), false, 'PDF summary hides toggled-off hours tile')
assertEqual(toggledSummaryJson.includes('Payroll'), false, 'PDF summary hides toggled-off payroll tile')
assertEqual(toggledOwnerJson.includes('Not included'), false, 'owner summary omits Not included values')
assertEqual(Object.hasOwn(toggledOwnerSummary?.data ?? {}, 'Estimated Payroll'), false, 'owner summary hides toggled-off payroll field')
assertEqual(Object.hasOwn(toggledOwnerSummary?.data ?? {}, 'Schedule Hours'), false, 'owner summary hides toggled-off hours field')

const taskStatusReport = buildAgronomyProgressReport({
  calendarEvents: [
    { id: 'evt-planned', startDate: '2026-08-01', title: 'Mow greens', location: 'Greens' },
    { id: 'evt-progress', startDate: '2026-08-01', title: 'Bunker cleanup', location: 'Bunkers' },
    { id: 'evt-complete', startDate: '2026-08-02', title: 'Roll greens', location: 'Greens' },
    { id: 'evt-legacy', startDate: '2026-08-02', title: 'Cup change', location: 'Greens' },
  ],
  crewAssignments: [
    { id: 'ca-planned', calendarEventId: 'evt-planned', employeeName: 'Brian', status: 'planned' },
    { id: 'ca-progress', calendarEventId: 'evt-progress', employeeName: 'Jose', status: 'in-progress' },
    { id: 'ca-complete', calendarEventId: 'evt-complete', employeeName: 'John', status: 'complete' },
    { id: 'ca-legacy', calendarEventId: 'evt-legacy', employeeName: 'Charlie', status: 'assigned' },
  ],
}, {
  startDate: '2026-08-01',
  endDate: '2026-08-02',
  include: { sprays: false, fertilizer: false, maintenance: false, irrigation: false, labor: false, hours: false },
})
const taskOwnerSummary = taskStatusReport.sections.find(section => section.title === 'Owner Summary')
assertEqual(taskOwnerSummary?.data?.['Task Assignments'], 4, 'owner summary counts all assignment tasks')
assertEqual(taskOwnerSummary?.data?.['Planned Tasks'], 2, 'owner summary counts planned tasks including legacy assigned')
assertEqual(taskOwnerSummary?.data?.['In Progress Tasks'], 1, 'owner summary counts in-progress tasks')
assertEqual(taskOwnerSummary?.data?.['Complete Tasks'], 1, 'owner summary counts complete tasks')
assertEqual(Boolean(taskStatusReport.sections.find(section => section.title === 'Planned Tasks')), true, 'planned task section exists')
assertEqual(Boolean(taskStatusReport.sections.find(section => section.title === 'In Progress Tasks')), true, 'in-progress task section exists')
assertEqual(Boolean(taskStatusReport.sections.find(section => section.title === 'Complete Tasks')), true, 'complete task section exists')
assertEqual(taskStatusReport.metadata?.totals?.plannedTaskCount, 2, 'metadata exposes planned task total')
assertEqual(taskStatusReport.metadata?.totals?.inProgressTaskCount, 1, 'metadata exposes in-progress task total')
assertEqual(taskStatusReport.metadata?.totals?.completeTaskCount, 1, 'metadata exposes complete task total')

const groupedTaskReport = buildAgronomyProgressReport({
  calendarEvents: [
    { id: 'evt-mow-1', startDate: '2026-08-01', title: 'Mow Greens', location: 'Greens' },
    { id: 'evt-mow-2', startDate: '2026-08-02', title: 'Mow Greens', location: 'Greens' },
    { id: 'evt-bunkers', startDate: '2026-08-02', title: 'Bunkers', location: 'Bunkers' },
  ],
  crewAssignments: [
    { id: 'ca-mow-1', calendarEventId: 'evt-mow-1', employeeName: 'John', status: 'complete' },
    { id: 'ca-mow-2', calendarEventId: 'evt-mow-2', employeeName: 'Jose', status: 'complete' },
    { id: 'ca-bunkers', calendarEventId: 'evt-bunkers', employeeName: 'Charlie', status: 'complete' },
  ],
}, {
  startDate: '2026-08-01',
  endDate: '2026-08-02',
  include: { plannedApplications: false, sprays: false, fertilizer: false, maintenance: false, irrigation: false, labor: false, hours: false },
})
const groupedComplete = groupedTaskReport.sections.find(section => section.title === 'Complete Tasks')
assertEqual(groupedComplete?.data?.columns?.[1], 'Times', 'task section uses grouped count column')
assertEqual(groupedComplete?.data?.rows?.find(row => row[0] === 'Mow Greens')?.[1], 2, 'repeated complete task is combined with count')

const plannedApplicationReport = buildAgronomyProgressReport({
  sprays: [
    {
      id: 'saved-plan-1',
      status: 'planned',
      applicationName: 'Liquid Spray - Fairways',
      date: '2026-08-06',
      area: 'Fairways',
      targetPest: 'Disease program',
      products: [
        { name: 'T-Nex', type: 'PGR' },
        { name: '46-0-0 Urea', type: 'Fertilizer' },
      ],
    },
  ],
  programs: [
    { id: 'program-1', name: 'August Greens Program', status: 'active' },
  ],
  itemsByProgramId: {
    'program-1': [
      {
        id: 'plan-resilia',
        programId: 'program-1',
        productName: 'Resilia',
        targetArea: 'Greens',
        plannedStartDate: '2026-08-05',
        plannedEndDate: '2026-08-05',
        applicationNotes: 'Disease program',
        status: 'planned',
      },
      {
        id: 'plan-excalibur',
        programId: 'program-1',
        productName: 'Excalibur',
        targetArea: 'Greens',
        plannedStartDate: '2026-08-05',
        plannedEndDate: '2026-08-05',
        applicationNotes: 'Disease program',
        status: 'planned',
      },
      {
        id: 'plan-done',
        programId: 'program-1',
        productName: 'Already Done',
        targetArea: 'Greens',
        plannedStartDate: '2026-08-05',
        status: 'completed',
      },
    ],
  },
}, {
  startDate: '2026-08-01',
  endDate: '2026-08-10',
  include: { tasks: false, sprays: false, fertilizer: false, maintenance: false, irrigation: false, labor: false, hours: false },
})
const plannedSummary = plannedApplicationReport.sections.find(section => section.title === 'Planned Applications')
const plannedSchedule = plannedApplicationReport.sections.find(section => section.title === 'Planned Application Schedule')
assertEqual(plannedSummary?.data?.['Applications'], 2, 'planned application section includes program plans and saved planned applications')
assertEqual(plannedSchedule?.data?.rows?.[0]?.[1], 'August Greens Program', 'planned application schedule shows program')
assertEqual(plannedSchedule?.data?.rows?.[0]?.[6], 2, 'planned application schedule shows grouped product count')
assertEqual(plannedSchedule?.data?.rows?.[1]?.[1], 'Saved Plan', 'planned application schedule includes saved planned application records')
assertEqual(plannedSchedule?.data?.rows?.[1]?.[2], 'Planned', 'saved planned application row lists normalized status')
assertEqual(plannedSchedule?.data?.rows?.[1]?.[5], 'T-Nex, 46-0-0 Urea', 'saved planned application row lists all products')
assertEqual(plannedApplicationReport.metadata?.totals?.plannedApplicationCount, 2, 'metadata exposes planned application count')

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
