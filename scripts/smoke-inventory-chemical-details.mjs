import fs from 'node:fs'

const tab = fs.readFileSync('src/pages/Inventory/tabs/InventoryChemicals.jsx', 'utf8')
const detail = fs.readFileSync('src/pages/Inventory/components/ChemicalDetailModal.jsx', 'utf8')

const checks = [
  [tab.includes('<th>Chemical name</th>'), 'chemical name column exists'],
  [tab.includes('<th>In stock</th>'), 'in-stock column exists'],
  [tab.includes('<th>Amount</th>'), 'amount column exists'],
  [tab.includes('setSelectedId(c.id)'), 'chemical rows open details'],
  [tab.includes('<ChemicalDetailModal'), 'chemical detail modal is mounted'],
  [detail.includes('Chemical information'), 'chemical identity details render'],
  [detail.includes('Agronomic information'), 'agronomic details render'],
  [detail.includes('Product label'), 'label details render'],
  [detail.includes('onClick={onClose}'), 'modal has explicit close controls'],
]

let failed = 0
for (const [ok, message] of checks) {
  if (!ok) {
    failed += 1
    console.error(`FAIL: ${message}`)
  }
}
console.log(`${checks.length - failed} passed, ${failed} failed`)
if (failed) process.exit(1)
