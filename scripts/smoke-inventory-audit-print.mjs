import assert from 'node:assert/strict'
import {
  inventoryAuditAmounts,
  printableInventoryAuditHtml,
} from '../src/utils/inventory/inventoryAuditPrint.js'

const liquid = inventoryAuditAmounts({
  kind: 'Chemical', quantity: 5, unit: 'gal', containerCount: 2, containerSize: 2.5, containerUnit: 'gal',
})
assert.equal(liquid.packageCount, 2)
assert.equal(liquid.gallons, 5)
assert.equal(liquid.ounces, 640)
assert.equal(liquid.pounds, null)

const smallLiquid = inventoryAuditAmounts({ kind: 'Chemical', quantity: 2.66, unit: 'oz' })
assert.equal(smallLiquid.ounces, 2.66)
assert.equal(smallLiquid.gallons, 0.0208)

const dry = inventoryAuditAmounts({ kind: 'Fertilizer', quantity: 50, unit: 'lb' })
assert.equal(dry.pounds, 50)
assert.equal(dry.ounces, 800)
assert.equal(dry.gallons, null)

const dryOunces = inventoryAuditAmounts({ category: 'Granular Fertilizer', quantity: 32, unit: 'oz' })
assert.equal(dryOunces.pounds, 2)

const fuel = inventoryAuditAmounts({ kind: 'fuel', quantity: null, currentLevel: 125, unit: 'gal' })
assert.equal(fuel.quantity, 125)
assert.equal(fuel.gallons, 125)
assert.equal(fuel.ounces, 16000)

const html = printableInventoryAuditHtml([
  { name: 'Test Product', kind: 'Chemical', quantity: 5, unit: 'gal', containerCount: 2, containerSize: 2.5, containerUnit: 'gal' },
], { courseName: 'Test Course' })
for (const text of ['Inventory Audit', 'Packages We Have', 'Ounces', 'Gallons', 'Pounds', 'Audit Count', 'Variance', 'Test Product']) {
  assert.ok(html.includes(text), `missing ${text}`)
}

console.log('inventory audit print smoke passed')
