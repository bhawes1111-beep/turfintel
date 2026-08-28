// Simplified Irrigation tab navigation smoke.
//
//   node scripts/smoke-irrigation-tabs.mjs

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  PASS ${label}`) }
  else { failed++; console.error(`  FAIL ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n-- ${name} --`) }

const IR = readFileSync('src/pages/Irrigation/Irrigation.jsx', 'utf8')

section('Crosswinds irrigation tabs')
assert(/const\s+CROSSWINDS_TABS\s*=\s*\[\s*'Today',\s*'Water Balance',\s*'Moisture',\s*'Repairs',?\s*\]/.test(IR),
  "Crosswinds tabs are Today, Water Balance, Moisture, Repairs")
assert(!/const\s+CROSSWINDS_MORE\b/.test(IR), 'CROSSWINDS_MORE is removed')
assert(!/\bmoreTab\b/.test(IR), 'moreTab state is removed')
assert(!/\bsetMoreTab\b/.test(IR), 'setMoreTab is removed')
assert(!/activeTab === 'More'/.test(IR), 'More render branch is removed')
assert(!/Irrigation\.module\.css/.test(IR), 'More row CSS import is removed')

section('Mappings')
assert(/activeTab === 'Today'\s*&& <IrrigationDashboard \/>/.test(IR),
  'Today mounts IrrigationDashboard')
assert(/activeTab === 'Water Balance'\s*&& <WaterBalanceOverview \/>/.test(IR),
  'Water Balance mounts WaterBalanceOverview')
assert(/activeTab === 'Moisture'\s*&& <MoistureOverview \/>/.test(IR),
  'Moisture mounts MoistureOverview')
assert(/activeTab === 'Repairs'\s*&& <Repairs \/>/.test(IR),
  'Repairs mounts Repairs')

section('Legacy non-Crosswinds still available')
for (const t of ['Overview', 'Moisture', 'Dashboard', 'Repairs', 'Head Map', 'Wet / Dry Reports', 'Pump Station', 'Zones', 'Reports']) {
  assert(new RegExp(`'${t}'`).test(IR), `legacy tab '${t}' remains in source`)
}
assert(/activeTab === 'Dashboard'\s*&& <IrrigationDashboard \/>/.test(IR),
  'legacy Dashboard mounts IrrigationDashboard')
assert(/coming soon/.test(IR),
  'legacy placeholder copy remains for non-Crosswinds')

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
