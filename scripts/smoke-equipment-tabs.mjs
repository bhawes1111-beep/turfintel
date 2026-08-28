// Simplified Equipment tab navigation smoke.
//
//   node scripts/smoke-equipment-tabs.mjs

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  PASS ${label}`) }
  else { failed++; console.error(`  FAIL ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n-- ${name} --`) }

const EQ = readFileSync('src/pages/Equipment/Equipment.jsx', 'utf8')
const EL = readFileSync('src/pages/Equipment/tabs/EquipmentList.jsx', 'utf8')

section('Crosswinds equipment tabs')
assert(/const\s+CROSSWINDS_TABS\s*=\s*\[\s*'Status',\s*'Fleet',\s*'Maintenance',?\s*\]/.test(EQ),
  "Crosswinds tabs are Status, Fleet, Maintenance")
assert(!/const\s+CROSSWINDS_MORE\b/.test(EQ), 'CROSSWINDS_MORE is removed')
assert(!/\bmoreTab\b/.test(EQ), 'moreTab state is removed')
assert(!/\bsetMoreTab\b/.test(EQ), 'setMoreTab is removed')
assert(!/activeTab === 'More'/.test(EQ), 'More render branch is removed')
assert(!/WorkspaceActions/.test(EQ), 'duplicate header actions are removed')
assert(!/actions=\{/.test(EQ), 'PageShell has no Equipment header action shortcuts')

section('Mappings')
for (const [oldKey, newKey] of [
  ['Overview', 'Status'],
  ['Equipment List', 'Fleet'],
  ['Service Schedule', 'Maintenance'],
  ['Maintenance Logs', 'Maintenance'],
  ['Repairs', 'Maintenance'],
]) {
  const re = new RegExp(`'${oldKey}'[^,}]*:\\s*'${newKey}'`)
  assert(re.test(EQ), `${oldKey} maps to ${newKey}`)
}
assert(/activeTab === 'Status'\s*&& <EquipmentOverview \/>/.test(EQ),
  'Status mounts EquipmentOverview')
assert(/activeTab === 'Fleet'\s*&& <EquipmentList \{\.\.\.equipmentListProps\} \/>/.test(EQ),
  'Fleet mounts EquipmentList')
assert(/activeTab === 'Maintenance'/.test(EQ) && /<ServiceSchedule \{\.\.\.serviceScheduleProps\} \/>/.test(EQ),
  'Maintenance includes ServiceSchedule')
assert(/activeTab === 'Maintenance'/.test(EQ) && /<MaintenanceLogs \{\.\.\.maintenanceLogsProps\} \/>/.test(EQ),
  'Maintenance includes MaintenanceLogs')

section('Legacy non-Crosswinds still available')
for (const t of ['Overview', 'Equipment List', 'Maintenance Logs', 'Repairs', 'Fuel Usage', 'Service Schedule', 'Parts Needed']) {
  assert(new RegExp(`'${t}'`).test(EQ), `legacy tab '${t}' remains in source`)
}
assert(/PLACEHOLDER_COPY\[activeTab\]/.test(EQ),
  'legacy placeholder surfaces remain non-Crosswinds only')

section('Deep links')
assert(/const\s+equipListLabel\s*=\s*isCrosswinds \? 'Fleet'\s*:\s*'Equipment List'/.test(EQ),
  "equipListLabel = Crosswinds Fleet, legacy Equipment List")
assert(/const\s+maintLabel\s*=\s*isCrosswinds \? 'Maintenance'\s*:\s*'Maintenance Logs'/.test(EQ),
  "maintLabel = Crosswinds Maintenance, legacy Maintenance Logs")
assert(/setActiveTab\(equipListLabel\)/.test(EQ),
  'jumpToUnit sets activeTab to equipListLabel')
assert(/setActiveTab\(maintLabel\)/.test(EQ),
  'jumpToMaintenance sets activeTab to maintLabel')

section('Manual fleet controls')
for (const fn of ['createEquipment', 'patchEquipment', 'deleteEquipment', 'createMaintenance']) {
  assert(new RegExp(`\\b${fn}\\b`).test(EL), `${fn} is wired in Fleet`)
}
for (const label of ['+ Add Equipment', 'Log Service', 'Edit', 'Delete']) {
  assert(EL.includes(label), `${label} control is present`)
}
assert(/Service interval not set/.test(EL), 'missing service hours have a clear fallback')

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
