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

const review = read('src/pages/Equipment/tabs/EquipmentIssuesReview.jsx')
const reviewCss = read('src/pages/Equipment/tabs/EquipmentIssuesReview.module.css')
const workerApi = read('worker/api/maintenance.js')
const migration = read('worker/migrations/0062_maintenance_ticket_stage.sql')
const pdfHelper = read('src/utils/equipment/maintenanceTicketPdf.js')
const maintenance = read('src/pages/Equipment/tabs/MaintenanceLogs.jsx')
const fleet = read('src/pages/Equipment/tabs/EquipmentList.jsx')
const mechanicBoard = read('src/pages/Equipment/EquipmentMechanicBoard.jsx')
const reportBuilder = read('src/utils/reports/reportBuilder.js')

console.log('\nMaintenance ticket stage')
assertIncludes(review, 'const TICKET_STAGE_OPTIONS', 'supervisor UI defines ticket stages')
assertIncludes(review, 'ticketStage:', 'service form and tickets carry ticket stage')
assertIncludes(review, 'updateServiceStage', 'open service tickets can update stage')
assertIncludes(review, 'Ticket progress', 'resolution ticket shows progress section')
assertIncludes(review, 'Parts ordered', 'parts ordered stage is available')
assertIncludes(review, 'Being repaired', 'being repaired stage is available')
assertIncludes(reviewCss, '.stageSelect', 'service list stage dropdown is styled')
assertIncludes(reviewCss, '.ticketProgressSummary', 'resolution ticket progress section is styled')

console.log('\nMaintenance persistence')
assertIncludes(workerApi, 'ticketStage:', 'maintenance API returns ticket stage')
assertIncludes(workerApi, "ticketStage:     'ticket_stage'", 'maintenance API patches ticket stage')
assertIncludes(workerApi, 'ticket_stage', 'maintenance API inserts ticket stage')
assertIncludes(migration, 'ADD COLUMN ticket_stage', 'migration adds ticket stage column')

console.log('\nTicket output')
assertIncludes(pdfHelper, 'Ticket progress', 'printable ticket includes progress section')
assertIncludes(pdfHelper, 'ticketStageLabel(log.ticketStage', 'printable ticket resolves stage label')
assertIncludes(maintenance, 'mlStageBadge', 'maintenance history displays stage badge')
assertIncludes(fleet, 'stage: ticketStageLabel', 'fleet history report includes stage data')
assertIncludes(reportBuilder, "'Stage'", 'maintenance history report has Stage column')
assertIncludes(mechanicBoard, 'ticketStageLabel(log.ticketStage', 'mechanic board shows service ticket stage')

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
