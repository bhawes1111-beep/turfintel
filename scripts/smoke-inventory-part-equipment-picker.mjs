import fs from 'node:fs'

const addForm = fs.readFileSync('src/pages/Inventory/components/ManualProductForm.jsx', 'utf8')
const editForm = fs.readFileSync('src/pages/Inventory/components/EditInventoryQuantityModal.jsx', 'utf8')
const picker = fs.readFileSync('src/pages/Inventory/components/PartEquipmentPicker.jsx', 'utf8')
const worker = fs.readFileSync('worker/api/inventory.js', 'utf8')

const checks = [
  [addForm.includes('useEquipmentData()'), 'add form loads fleet equipment'],
  [editForm.includes('useEquipmentData()'), 'edit form loads fleet equipment'],
  [addForm.includes('<PartEquipmentPicker'), 'add form uses the multi-equipment picker'],
  [editForm.includes('<PartEquipmentPicker'), 'edit form uses the multi-equipment picker'],
  [picker.includes('type="checkbox"'), 'picker supports multiple checked equipment'],
  [picker.includes('Select every fleet unit this part fits.'), 'picker explains the multi-select behavior'],
  [worker.includes('equipmentList'), 'inventory API exposes the equipment list'],
  [worker.includes("JSON.stringify(body.equipmentList)"), 'inventory API persists the equipment list'],
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
