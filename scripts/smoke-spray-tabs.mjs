// Simplified Spray tab navigation smoke.
//
//   node scripts/smoke-spray-tabs.mjs

import { readFileSync, readdirSync, existsSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  PASS ${label}`) }
  else { failed++; console.error(`  FAIL ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n-- ${name} --`) }

const SP = readFileSync('src/pages/Spray/Spray.jsx', 'utf8')

section('Frontend-only')
const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles[migrationFiles.length - 1] === '0068_inventory_nematode_targets.sql',
  '0068 still the highest migration')

section('Flat spray tabs')
assert(/const\s+SPRAY_TABS\s*=\s*\[\s*'Calendar',\s*'New Application',\s*'Records',\s*'Resistance',\s*'Planning',\s*'Calculator',\s*'Reports',?\s*\]/.test(SP),
  "SPRAY_TABS is one flat row")
assert(!/SPRAY_MORE/.test(SP), 'SPRAY_MORE is removed')
assert(!/\bmoreTab\b/.test(SP), 'moreTab is removed')
assert(!/\bsetMoreTab\b/.test(SP), 'setMoreTab is removed')
assert(!/activeTab === 'More'/.test(SP), 'More render branch is removed')
assert(/useState\(\(\) => resolveInitialTab\('Calendar'\)\)/.test(SP),
  "activeTab default = resolveInitialTab('Calendar')")

section('Tab mappings')
assert(/activeTab === 'Calendar'\s*&&\s*\(\s*<SprayCalendarWorkspace onStartNewSpray=\{goToNewApplication\}\s*\/>/.test(SP),
  'Calendar tab mounts the spray calendar workspace')
assert(/activeTab === 'New Application'\s*&& <BuildSpraySheet \/>/.test(SP),
  'New Application mounts <BuildSpraySheet />')
assert(/activeTab === 'Records'\s*&& <SprayRecords \/>/.test(SP),
  'Records mounts <SprayRecords />')
assert(/activeTab === 'Resistance'\s*&& <ProgramIntelligence \/>/.test(SP),
  'Resistance mounts <ProgramIntelligence />')
assert(/activeTab === 'Planning'\s*&& <SprayProgramPlanner \/>/.test(SP),
  'Planning mounts <SprayProgramPlanner />')
assert(/activeTab === 'Calculator'\s*&& <MixCalculator \/>/.test(SP),
  'Calculator mounts <MixCalculator />')
assert(/activeTab === 'Reports'\s*&& <SprayReports \/>/.test(SP),
  'Reports mounts <SprayReports />')

section('Legacy keys')
for (const [oldKey, newKey] of [
  ['Workspace', 'Calendar'],
  ['Today', 'Calendar'],
  ['Build Spray', 'New Application'],
  ['Spray Records', 'Records'],
  ['Spray Calendar', 'Records'],
  ['Records Calendar', 'Records'],
  ['Planned Sprays', 'Planning'],
  ['Planned Spray Calendar', 'Planning'],
  ['Planning Calendar', 'Planning'],
  ['Mix Calculator', 'Calculator'],
  ['Spray Intelligence', 'Resistance'],
  ['Season Insights', 'Resistance'],
  ['Overview', 'Calendar'],
]) {
  const re = new RegExp(`'${oldKey}'[^,}]*:\\s*'${newKey}'`)
  assert(re.test(SP), `${oldKey} maps to ${newKey}`)
}
assert(/if \(!candidate\) return 'Calendar'/.test(SP),
  'empty candidate resolves to Calendar')
assert(/return 'Calendar'/.test(SP),
  'unknown candidate falls back to Calendar')

section('No course fork')
assert(!/const\s+CROSSWINDS_TABS/.test(SP), 'CROSSWINDS_TABS constant is not used')
assert(!/const\s+CROSSWINDS_MORE/.test(SP), 'CROSSWINDS_MORE constant is not used')
assert(!/const\s+LEGACY_TABS/.test(SP), 'LEGACY_TABS constant is not used')
assert(!/const\s+CROSSWINDS_COURSE_ID/.test(SP), 'CROSSWINDS_COURSE_ID constant is not used')
assert(!/import\s*\{\s*useSelectedCourseId/.test(SP), 'useSelectedCourseId is not imported')
assert(!/\bisCrosswinds\b\s*=/.test(SP), 'isCrosswinds branch is not used')

section('Single builder mount')
const buildSpraySheetMounts = (SP.match(/<BuildSpraySheet\s*\/>/g) ?? []).length
assert(buildSpraySheetMounts === 1,
  `exactly one <BuildSpraySheet /> in Spray.jsx (found ${buildSpraySheetMounts})`)

section('Legacy dead files')
assert(!existsSync('src/pages/Spray/tabs/SprayWorkspace.jsx'), 'SprayWorkspace.jsx removed')
assert(!existsSync('src/pages/Spray/tabs/SprayWorkspace.module.css'), 'SprayWorkspace.module.css removed')
assert(!existsSync('src/pages/Spray/tabs/PlannedPrograms.jsx'), 'PlannedPrograms.jsx removed')

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
