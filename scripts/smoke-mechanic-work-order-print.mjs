import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { printableMechanicWorkOrderHtml } from '../src/utils/equipment/maintenanceTicketPdf.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const html = printableMechanicWorkOrderHtml(
  {
    equipmentName: 'Greens Mower <3>',
    equipmentStatus: 'out-of-service',
    serviceType: 'Replace roller bearing',
    ticketStage: 'parts_ordered',
    priority: 'high',
    date: '2026-08-05',
    technician: 'Shop Mechanic',
    notes: 'Inspect & replace.',
    parts: [{ part: 'Roller Bearing', qty: 2 }],
  },
  { name: 'Greens Mower <3>', model: 'GM-1000', serialNumber: 'ABC-123', currentHours: 450 },
  [
    { id: 'part-1', kind: 'part', name: 'Roller Bearing', partNumber: 'RB-10', quantity: 6, unit: 'ea', location: 'Bin A', equipmentList: ['Greens Mower <3>'] },
    { id: 'part-2', kind: 'part', name: 'Universal Belt', partNumber: 'B-20', quantity: 3, unit: 'ea', location: 'Bin B', equipmentList: [] },
    { id: 'part-3', kind: 'part', name: 'Empty Part', quantity: 0, unit: 'ea' },
    { id: 'chem-1', kind: 'chemical', name: 'Not a Part', quantity: 50, unit: 'gal' },
  ],
)

assert.match(html, /Mechanic Work Order/)
assert.match(html, /Greens Mower &lt;3&gt; - 2026-08-05/)
assert.match(html, /Parts ordered/)
assert.match(html, /Available Parts Inventory/)
assert.match(html, /Roller Bearing/)
assert.match(html, /6 ea/)
assert.doesNotMatch(html, /Universal Belt/)
assert.match(html, /Qty Used/)
assert.doesNotMatch(html, /Empty Part/)
assert.doesNotMatch(html, /Not a Part/)
assert.doesNotMatch(html, /pay rate/i)

const issuesSource = fs.readFileSync(path.join(root, 'src/pages/Equipment/tabs/EquipmentIssuesReview.jsx'), 'utf8')
const maintenanceSource = fs.readFileSync(path.join(root, 'src/pages/Equipment/tabs/MaintenanceLogs.jsx'), 'utf8')

assert.match(issuesSource, /Print Work Order/)
assert.match(issuesSource, /openMechanicWorkOrder/)
assert.match(maintenanceSource, /Print Work Order/)
assert.match(maintenanceSource, /openMechanicWorkOrder/)

console.log('Mechanic work-order print smoke checks passed.')
