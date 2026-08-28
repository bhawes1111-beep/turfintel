import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const modal = read('src/pages/Spray/tabs/EditSprayRecordModal.jsx')
const sheet = read('src/pages/Spray/tabs/SprayApplicationSheetModal.jsx')
const builder = read('src/pages/Spray/tabs/BuildSpraySheet.jsx')
const api = read('worker/api/sprays.js')
const migration = read('worker/migrations/0076_spray_editable_setup.sql')

const checks = []
const check = (condition, label) => {
  checks.push([Boolean(condition), label])
  console.log(`${condition ? 'OK' : 'NO'} ${label}`)
}

for (const field of [
  'applicationName', 'applicationType', 'equipmentId', 'equipmentName', 'tankCapacity',
  'date', 'startTime', 'endTime', 'applicator', 'applicatorLicense', 'targetPest',
  'status', 'course', 'rei', 'phi', 'carrierVolume', 'totalVolume',
  'irrigationInches', 'irrigationMinutes', 'holes', 'notes', 'conditions', 'areas',
]) check(modal.includes(`${field}:`) || modal.includes(`${field}: `), `record editor saves ${field}`)

check(sheet.includes('Edit products'), 'calendar detail exposes product editor')
check(sheet.includes('quantityUsed'), 'product editor saves total used')
check(sheet.includes('rateUnit'), 'product editor saves rate units')
check(api.includes('replaceSprayProducts'), 'product edits reverse and reapply inventory')
check(api.includes('syncSprayCalendarEvent'), 'record edits synchronize linked calendar event')
check(builder.includes('equipmentName:   draft.sprayRig'), 'new applications snapshot selected equipment')
check(builder.includes('tankCapacity:'), 'new applications snapshot tank capacity')
check(migration.includes('application_type'), 'application type persistence migration exists')
check(migration.includes('equipment_name'), 'equipment persistence migration exists')

const failed = checks.filter(([passed]) => !passed)
console.log(`\n${failed.length ? 'FAIL' : 'PASS'} ${checks.length - failed.length} passed, ${failed.length} failed`)
if (failed.length) process.exit(1)
