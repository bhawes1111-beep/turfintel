import fs from 'node:fs'

const files = {
  equipmentList: 'src/pages/Equipment/tabs/EquipmentList.jsx',
  reportModal: 'src/components/reports/ReportPreviewModal.jsx',
  reportCss: 'src/components/reports/reports.module.css',
  ticketPdf: 'src/utils/equipment/maintenanceTicketPdf.js',
}

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label}: missing ${needle}`)
  }
}

const equipmentList = read(files.equipmentList)
const reportModal = read(files.reportModal)
const reportCss = read(files.reportCss)
const ticketPdf = read(files.ticketPdf)

assertIncludes(equipmentList, "import { openMaintenanceTicketPdf }", 'Fleet imports ticket PDF helper')
assertIncludes(equipmentList, 'const [activeReportActions, setActiveReportActions]', 'Fleet stores report row actions')
assertIncludes(equipmentList, 'function handleOpenHistoryTicketPdf', 'Fleet opens a ticket PDF from history')
assertIncludes(equipmentList, "'Maintenance Records': historyLogs.map", 'Fleet maps each history row to a View button')
assertIncludes(equipmentList, 'rowActions={activeReportActions}', 'Fleet passes row actions to report modal')

assertIncludes(reportModal, 'rowActions = {}', 'Report modal accepts row actions')
assertIncludes(reportModal, 'actionsForSection', 'Report modal resolves section actions')
assertIncludes(reportModal, 'rpRowActionBtn', 'Report modal renders row action button')
assertIncludes(reportModal, 'View', 'Report modal labels action column')

assertIncludes(reportCss, '.rpRowActionBtn', 'Report CSS styles row action button')
assertIncludes(reportCss, '.rpTableActionCell', 'Report CSS styles action column')

assertIncludes(ticketPdf, 'export function openMaintenanceTicketPdf', 'Ticket PDF helper exports opener')
assertIncludes(ticketPdf, "const ticketId = `${equipmentName} - ${date || 'No date'}`", 'Ticket ID uses equipment and date')
assertIncludes(ticketPdf, 'Save as PDF', 'Ticket PDF includes save-as-PDF action')
assertIncludes(ticketPdf, 'Parts Used', 'Ticket PDF includes parts section')
assertIncludes(ticketPdf, 'Labor / Other', 'Ticket PDF includes labor total')

console.log('Fleet history ticket PDF smoke passed')
