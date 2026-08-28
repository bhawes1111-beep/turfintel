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

const inventoryPage = read('src/pages/Inventory/Inventory.jsx')
const manualForm = read('src/pages/Inventory/components/ManualProductForm.jsx')
const editModal = read('src/pages/Inventory/components/EditInventoryQuantityModal.jsx')
const irrigationTab = read('src/pages/Inventory/tabs/InventoryIrrigation.jsx')
const repairs = read('src/pages/Irrigation/tabs/Repairs.jsx')
const reportsPage = read('src/pages/Reports/Reports.jsx')
const reportBuilder = read('src/utils/reports/reportBuilder.js')

console.log('\nIrrigation inventory section')
assertIncludes(inventoryPage, 'InventoryIrrigation', 'inventory page imports irrigation tab')
assertIncludes(inventoryPage, "'Irrigation'", 'inventory tab list includes Irrigation')
assertIncludes(irrigationTab, "i.kind === 'irrigation'", 'irrigation tab filters irrigation stock')
assertIncludes(manualForm, "value: 'irrigation'", 'manual inventory form offers irrigation type')
assertIncludes(editModal, "value: 'irrigation'", 'edit inventory modal offers irrigation type')
assertIncludes(manualForm, "['part', 'irrigation'].includes(form.kind)", 'manual form stores irrigation part fields')
assertIncludes(editModal, "['part', 'irrigation'].includes(form.kind)", 'edit modal stores irrigation part fields')

console.log('\nIrrigation repair tickets')
assertIncludes(repairs, 'createRepair', 'repairs tab can create repair tickets')
assertIncludes(repairs, '+ New Repair Ticket', 'repairs tab shows new ticket button')
assertIncludes(repairs, 'saveRepairTicket', 'repairs tab saves new tickets')
assertIncludes(repairs, "item.kind === 'irrigation' || item.kind === 'part'", 'ticket parts include irrigation inventory')
assertIncludes(repairs, 'New Irrigation Repair Ticket', 'ticket modal title renders')
assertIncludes(repairs, 'Edit Irrigation Repair Ticket', 'ticket modal supports edit mode')
assertIncludes(repairs, 'deleteRepair', 'repairs tab can delete tickets')
assertIncludes(repairs, 'inventoryPartUnitPrice', 'ticket parts read inventory prices')
assertIncludes(repairs, 'pricePatchForInventoryPart', 'ticket parts auto-fill prices')
assertIncludes(repairs, 'Parts total', 'ticket shows parts total')

console.log('\nOwner report irrigation repairs')
assertIncludes(reportsPage, 'useRepairsData', 'reports page loads irrigation repairs')
assertIncludes(reportsPage, 'irrigationRepairs', 'reports page passes irrigation repairs')
assertIncludes(reportBuilder, 'filteredIrrigationRepairs', 'owner report filters irrigation repairs')
assertIncludes(reportBuilder, 'Irrigation Repairs', 'owner report renders irrigation section')
assertIncludes(reportBuilder, 'Irrigation Repair Tickets', 'owner report renders repair ticket table')
assertIncludes(reportBuilder, 'payrollWeekStartKey', 'owner payroll groups hours by Sunday-start week')
assertIncludes(reportBuilder, 'overtimeHours', 'owner payroll tracks overtime hours')
assertIncludes(reportBuilder, 'rate * 1.5', 'owner payroll pays overtime at time and a half')

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
