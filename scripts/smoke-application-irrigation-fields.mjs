// Smoke: application irrigation fields are captured, persisted, and printable.

import { readFileSync, readdirSync } from 'fs'

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    passed += 1
    console.log(`  ok - ${label}`)
  } else {
    failed += 1
    console.error(`  fail - ${label}`)
  }
}

const build = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
const api = readFileSync('worker/api/sprays.js', 'utf8')
const modal = readFileSync('src/pages/Spray/tabs/SprayApplicationSheetModal.jsx', 'utf8')
const migrations = readdirSync('worker/migrations')

console.log('\nApplication irrigation fields')

assert(/irrigationInches:\s*''/.test(build), 'draft includes irrigationInches')
assert(/irrigationMinutes:\s*''/.test(build), 'draft includes irrigationMinutes')
assert(/<Field label="Irrigation inches">/.test(build), 'Where & When shows irrigation inches')
assert(/<Field label="Irrigation minutes">/.test(build), 'Where & When shows irrigation minutes')
assert(/irrigationInches:\s*optionalPositiveNumber\(draft\.irrigationInches\)/.test(build), 'save payload includes irrigationInches')
assert(/irrigationMinutes:\s*optionalPositiveNumber\(draft\.irrigationMinutes\)/.test(build), 'save payload includes irrigationMinutes')
assert(/ReviewRow label="Irrigation inches"/.test(build), 'review summary shows irrigation inches')
assert(/ReviewRow label="Irrigation minutes"/.test(build), 'review summary shows irrigation minutes')

assert(/irrigationInches:\s*row\.irrigation_inches/.test(api), 'API maps irrigation_inches to irrigationInches')
assert(/irrigationMinutes:\s*row\.irrigation_minutes/.test(api), 'API maps irrigation_minutes to irrigationMinutes')
assert(/irrigation_inches,\s*irrigation_minutes/.test(api), 'API INSERT includes irrigation columns')
assert(/irrigationInches:\s*'irrigation_inches'/.test(api), 'PATCH allows irrigationInches')
assert(/irrigationMinutes:\s*'irrigation_minutes'/.test(api), 'PATCH allows irrigationMinutes')
assert(migrations.includes('0069_spray_application_irrigation.sql'), 'migration 0069 exists')

assert(/function fmtIrrigation\(record\)/.test(modal), 'detail modal has irrigation formatter')
assert(/<KV label="Irrigation"\s+value=\{fmtIrrigation\(record\)\}/.test(modal), 'detail modal shows irrigation')
assert(/<PrintField label="Irrigation After Application" value=\{fmtIrrigation\(record\)\}/.test(modal), 'print sheet shows saved irrigation')

if (failed > 0) {
  console.error(`\n${failed} irrigation smoke assertion(s) failed.`)
  process.exit(1)
}

console.log(`\n${passed} irrigation smoke assertions passed.`)
