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

const page = readFileSync('src/pages/Equipment/tabs/MaintenanceLogs.jsx', 'utf8')
const css = readFileSync('src/pages/Equipment/Equipment.module.css', 'utf8')

console.log('\nMaintenance ticket PDF')
assert(/function printableTicketHtml/.test(page), 'printable ticket document exists')
assert(/window\.open\('', '_blank'/.test(page), 'ticket opens in a new printable window')
assert(/Save as PDF/.test(page), 'ticket has save-as-pdf print action')
assert(/window\.print\(\)/.test(page), 'ticket supports browser print')
assert(/@media print/.test(page), 'ticket has print styling')
assert(/const ticketId = `\$\{equipmentName\} - \$\{date \|\| 'No date'\}`/.test(page), 'ticket id uses equipment and date')
assert(/Ticket progress/.test(page), 'ticket prints progress section')
assert(/ticketStageLabel\(log\.ticketStage/.test(page), 'ticket resolves stage label')
assert(/id: 'ticket-pdf'/.test(page), 'history quick actions include View PDF')
assert(/className=\{styles\.mlPdfButton\}/.test(page), 'history card has visible View PDF button')
assert(/handleOpenTicketPdf\(safeSelected/.test(page), 'detail drawer has View PDF button')

console.log('\nTicket cost data')
assert(/function normalizePartUsed/.test(page), 'ticket normalizes saved parts')
assert(/part\?\.qty/.test(page), 'ticket supports resolution-ticket qty field')
assert(/part\?\.cost/.test(page), 'ticket supports resolution-ticket total cost field')
assert(/Labor \/ Other/.test(page), 'ticket prints labor cost summary')
assert(/Parts Used/.test(page), 'ticket prints parts table')

console.log('\nTicket styling')
assert(/\.mlPdfButton/.test(css), 'View PDF card button is styled')

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
