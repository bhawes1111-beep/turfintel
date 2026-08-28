import fs from 'node:fs'

const worker = fs.readFileSync('worker/api/sprays.js', 'utf8')
const builder = fs.readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
const editor = fs.readFileSync('src/pages/Spray/tabs/EditSprayRecordModal.jsx', 'utf8')
const store = fs.readFileSync('src/utils/sprays/spraysStore.js', 'utf8')

function check(condition, message) {
  if (!condition) throw new Error(message)
}

check(worker.includes('syncSprayInventoryForStatus'), 'status-driven inventory sync is missing')
check(worker.includes('isCompletedStatus(status) && deductInventory'), 'completion gate is missing')
check(worker.includes('await restoreSprayInventoryUsage(env, sprayId)'), 'open statuses do not restore inventory')
check(!builder.includes('recordInventoryUsage({'), 'builder still deducts inventory directly')
check(builder.includes('deductInventory: !draft.skipInventoryDeduction'), 'builder does not persist deduction preference')
check(editor.includes('Deduct products when completed'), 'editor lacks completion deduction control')
check(store.includes('await refreshInventoryData()'), 'application mutations do not refresh inventory state')

console.log('7 passed, 0 failed')
