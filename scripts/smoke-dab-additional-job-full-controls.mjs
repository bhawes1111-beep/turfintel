import { readFileSync } from 'fs'

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.error(`  ✗ ${label}`)
  }
}

function section(name) {
  console.log(`\n— ${name} —`)
}

const dab = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const css = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css', 'utf8')

const additionalBlock = dab.match(/additionalJobs\.map\(\(aj, idx\) => \{[\s\S]*?\n\s*\}\)\}/)?.[0] ?? ''

section('Additional job rows use primary-row controls')

assert(/value=\{templateIdForAssignment\(aj\)\}/.test(additionalBlock),
  'additional job renders task dropdown with current task selected')

assert(/onChange=\{e => handleAdditionalTaskChange\(emp, aj, e\.target\.value\)\}/.test(additionalBlock),
  'additional job task dropdown updates that job row')

assert(/linkedAjRes = reservationsByAssignment\.get\(aj\.id\)/.test(additionalBlock),
  'additional job reads equipment linked to that assignment id')

assert(/onClick=\{\(\) => openEquipmentModalFor\(emp, aj\)\}/.test(additionalBlock),
  'additional job equipment button opens picker for that exact job')

assert(/value=\{notesDraft\[aj\.id\] \?\? aj\.notes \?\? ''\}/.test(additionalBlock),
  'additional job has editable English notes')

assert(/value=\{notesEsDraft\[aj\.id\] \?\? aj\.notesEs \?\? ''\}/.test(additionalBlock),
  'additional job has editable Spanish notes')

assert(/onClick=\{\(\) => handleRegenerateSpanish\(aj\)\}/.test(additionalBlock),
  'additional job can regenerate its own Spanish note')

assert(/onChange=\{e => handleStatusChange\(aj, e\.target\.value\)\}/.test(additionalBlock),
  'additional job status dropdown updates that job row')

assert(/onClick=\{\(\) => handleRemoveAdditionalJob\(emp, aj\)\}/.test(additionalBlock),
  'additional job keeps remove control')

section('Equipment modal targets specific jobs')

assert(/const \[modalAssignmentId, setModalAssignmentId\] = useState\(null\)/.test(dab),
  'equipment modal stores target assignment id')

assert(/setModalAssignmentId\(assignment\.id\)/.test(dab),
  'opening equipment modal pins selected assignment id')

assert(/crewAssignments\.find\(a => a\.id === modalAssignmentId\)/.test(dab),
  'modal resolves assignment by pinned id instead of always using primary job')

section('Layout classes')

assert(/\.dabAdditionalJobActionStack/.test(css),
  'additional job action stack CSS exists')

assert(/\.dabAdditionalJobStatusActions/.test(css),
  'additional job status/remove stack CSS exists')

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
