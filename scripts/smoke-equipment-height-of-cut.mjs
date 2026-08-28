import assert from 'node:assert/strict'
import fs from 'node:fs'

const api = fs.readFileSync(new URL('../worker/api/equipment.js', import.meta.url), 'utf8')
const list = fs.readFileSync(new URL('../src/pages/Equipment/tabs/EquipmentList.jsx', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../worker/migrations/0083_equipment_height_of_cut.sql', import.meta.url), 'utf8')

assert.match(api, /heightOfCut:\s+row\.height_of_cut/)
assert.match(api, /heightOfCut:\s+'height_of_cut'/)
assert.match(api, /heightOfCut must be a positive decimal/)
assert.match(list, /function isMowerCategory\(category\)/)
assert.match(list, /label="Height of Cut \(in\)"/)
assert.match(list, /step="0\.001"/)
assert.match(list, /placeholder="\.125"/)
assert.match(list, /label="Height of Cut"/)
assert.match(migration, /ADD COLUMN height_of_cut REAL/)

console.log('equipment height of cut smoke: ok')
