import { readFileSync } from 'fs'

let passed = 0
let failed = 0

function assert(cond, label) {
  if (cond) {
    passed += 1
    console.log(`  OK ${label}`)
  } else {
    failed += 1
    console.error(`  NO ${label}`)
  }
}

const review = readFileSync('src/pages/Equipment/tabs/EquipmentIssuesReview.jsx', 'utf8')
const css = readFileSync('src/pages/Equipment/tabs/EquipmentIssuesReview.module.css', 'utf8')
const maintenance = readFileSync('worker/api/maintenance.js', 'utf8')
const migration = readFileSync('worker/migrations/0061_equipment_resolution_tickets.sql', 'utf8')

console.log('\nEquipment resolution ticket')
assert(/Resolution Ticket/.test(review), 'resolve opens a resolution ticket modal')
assert(/Resolve Ticket/.test(review), 'approved issues use Resolve Ticket action')
assert(/setTicket\(ticketForIssue/.test(review), 'issue resolve action opens ticket state')
assert(!/onClick=\{\(\) => setStatus\(issue, 'resolved'\)\}/.test(review), 'issue resolve is not one-click status change')
assert(/Employee assigned/.test(review), 'ticket assigns employee')
assert(/Labor hours/.test(review), 'ticket captures labor hours')
assert(/function laborTotal/.test(review), 'ticket calculates labor from hours and pay rate')
assert(/ticketEmployee\?\.payRate/.test(review), 'ticket reads selected employee pay rate')
assert(/Labor total/.test(review), 'ticket shows labor total above parts')
assert(/Ticket total/.test(review), 'ticket shows combined ticket total')
assert(/partsTotal\(partsUsed\) \+ \(laborTotal\(laborHours, ticketEmployee\?\.payRate\) \?\? 0\)/.test(review), 'saved ticket cost includes labor plus parts')
assert(/Parts used/.test(review), 'ticket captures parts used')
assert(/function inventoryPartUnitPrice/.test(review), 'ticket reads part price from inventory')
assert(/function calculateInventoryPartCost/.test(review), 'ticket calculates part line cost')
assert(/function normalizePartLookup/.test(review), 'part lookup normalizes typed names')
assert(/part\.partNumber/.test(review), 'part lookup can match inventory part numbers')
assert(/function chooseTicketPart/.test(review), 'part selection auto-fills pricing')
assert(/function reconcileTicketPart/.test(review), 'part blur reconciles browser picker values')
assert(/function changeTicketPartQty/.test(review), 'quantity changes recalculate part cost')
assert(/onInput=\{event => chooseTicketPart/.test(review), 'browser input event triggers part pricing')
assert(/onBlur=\{event => reconcileTicketPart/.test(review), 'leaving part field triggers part pricing')
assert(/Total cost/.test(review), 'part row labels total cost')
assert(/patchEquipmentIssue\(ticket\.sourceId/.test(review), 'ticket resolves the source issue after save')
assert(/createMaintenance\(payload\)/.test(review), 'ticket creates maintenance archive record')
assert(/patchMaintenance\(ticket\.maintenanceId/.test(review), 'service items resolve through same ticket')
assert(/role="button"/.test(review), 'service tickets are clickable rows')
assert(/onClick=\{\(\) => setTicket\(ticketForService\(item\)\)\}/.test(review), 'clicking a service ticket opens editor')
assert(/Edit Ticket/.test(review), 'existing service tickets open as edit tickets')
assert(/Save Ticket/.test(review), 'open tickets can be saved without resolving')
assert(/Ticket date/.test(review), 'ticket editor includes editable ticket date')
assert(/Progress/.test(review), 'ticket editor includes editable progress stage')
assert(/statusForTicketStage\(ticketStage\)/.test(review), 'ticket save preserves open/progress/resolved status')
assert(/ticketStage === 'resolved'/.test(review), 'resolve-only behavior is gated by resolved stage')
assert(/function reopenService/.test(review), 'resolved service tickets can reopen')
assert(/status:\s*'open'/.test(review), 'reopened tickets return to open status')
assert(/completedDate:\s*null/.test(review), 'reopened tickets clear completed date')
assert(/useCrewData/.test(review), 'ticket uses employee roster')
assert(/useInventoryData/.test(review), 'ticket offers inventory parts')

console.log('\nMaintenance persistence')
assert(/laborHours:\s*row\.labor_hours/.test(maintenance), 'maintenance maps labor hours')
assert(/technicianEmployeeId:\s*row\.technician_employee_id/.test(maintenance), 'maintenance maps assigned employee id')
assert(/laborHours:\s*'labor_hours'/.test(maintenance), 'maintenance patch accepts labor hours')
assert(/technicianEmployeeId:\s*'technician_employee_id'/.test(maintenance), 'maintenance patch accepts employee id')
assert(/body\.laborHours/.test(maintenance), 'maintenance create stores labor hours')
assert(/body\.technicianEmployeeId/.test(maintenance), 'maintenance create stores employee id')
assert(/labor_hours REAL/.test(migration), 'migration adds labor hours')
assert(/technician_employee_id TEXT/.test(migration), 'migration adds employee id')

console.log('\nTicket styling')
assert(/\.ticketBackdrop/.test(css), 'ticket modal backdrop styled')
assert(/\.ticketModal/.test(css), 'ticket modal panel styled')
assert(/\.ticketLaborSummary/.test(css), 'labor total summary styled')
assert(/\.partRow/.test(css), 'parts rows styled')
assert(/\.serviceItem:hover/.test(css), 'clickable service tickets have hover affordance')
assert(/\.serviceItem:focus-visible/.test(css), 'clickable service tickets have keyboard focus affordance')

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
