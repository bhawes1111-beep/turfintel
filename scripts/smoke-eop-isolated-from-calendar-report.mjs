import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = path => readFileSync(join(root, path), 'utf8')
const fail = message => {
  console.error(`FAIL: ${message}`)
  process.exitCode = 1
}

const sprayTabs = read('src/pages/Spray/Spray.jsx')
const calendar = read('src/pages/Spray/tabs/SprayCalendarWorkspace.jsx')
const planner = read('src/pages/Spray/tabs/SprayProgramPlanner.jsx')
const reports = read('src/pages/Reports/Reports.jsx')
const reportBuilder = read('src/utils/reports/reportBuilder.js')

if (!sprayTabs.includes("'E.O.P'")) fail('Applications tab strip should include E.O.P.')
if (!sprayTabs.includes("activeTab === 'E.O.P'")) fail('E.O.P tab should render the program planner.')
if (!planner.includes('title="E.O.P"')) fail('Planner workspace should be titled E.O.P.')

for (const forbidden of [
  'useSprayPrograms',
  'refreshSprayPrograms',
  'listSprayProgramItems',
  'plannedByDate',
  'selectedProgramPlans',
]) {
  if (calendar.includes(forbidden)) fail(`Calendar should not use E.O.P program data: ${forbidden}`)
}

for (const forbidden of [
  'useSprayPrograms',
  'listSprayProgramItems',
  'itemsByProgramId',
]) {
  if (reports.includes(forbidden)) fail(`Owner report page should not preload E.O.P data: ${forbidden}`)
}

for (const forbidden of [
  'programCalendar',
  'plannedApplicationEvents',
  'buildProgramCalendarItems',
  'groupProgramItemsForCalendar',
]) {
  if (reportBuilder.includes(forbidden)) fail(`Owner report builder should not pull E.O.P calendar items: ${forbidden}`)
}

if (!reportBuilder.includes('const filteredPlannedApplications = plannedApplicationRecords')) {
  fail('Planned applications should come from saved application records only.')
}

if (!process.exitCode) {
  console.log('E.O.P isolation smoke passed.')
}
