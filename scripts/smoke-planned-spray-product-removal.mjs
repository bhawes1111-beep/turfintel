import assert from 'node:assert/strict'
import fs from 'node:fs'

const worker = fs.readFileSync(new URL('../worker/api/sprays.js', import.meta.url), 'utf8')
const sheet = fs.readFileSync(
  new URL('../src/pages/Spray/tabs/SprayApplicationSheetModal.jsx', import.meta.url),
  'utf8',
)

assert.match(worker, /function isValidProductRate\(rate\)/)
assert.match(worker, /if \(!isValidProductRate\(p\.rate\)\)/)
assert.match(worker, /completingApplication && body\.products\.length === 0/)
assert.match(worker, /completingApplication\s*&& p\.inventoryItemId/)
assert.match(sheet, /completedApplication && draftRows\.length === 0/)
assert.match(sheet, /completedApplication && !editReason\.trim\(\)/)

console.log('planned spray product removal smoke: ok')
