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

const crewAssignments = readFileSync('src/pages/Crew/tabs/CrewAssignments.jsx', 'utf8')
const crewCss = readFileSync('src/pages/Crew/tabs/CrewAssignments.module.css', 'utf8')
const operationsBoard = readFileSync('src/pages/Operations/OperationsBoard.jsx', 'utf8')

section('Assignments briefing surface')

assert(/import DailyBriefingPanel from '\.\.\/\.\.\/Operations\/DailyBriefingPanel'/.test(crewAssignments),
  'Assignments imports the briefing editor')

assert(/const ASSIGNMENT_SURFACES = \[[\s\S]*id: 'briefing'[\s\S]*label: 'Briefing'[\s\S]*id: 'board'[\s\S]*label: 'Daily Assignment Board'/.test(crewAssignments),
  'Assignments sub-nav lists Briefing before Daily Assignment Board')

assert(/const \[activeSurface, setActiveSurface\]\s+= useState\('board'\)/.test(crewAssignments),
  'Daily Assignment Board remains the default Assignments view')

assert(/activeSurface === 'briefing'[\s\S]*<DailyBriefingPanel \/>/.test(crewAssignments),
  'Briefing renders inside Assignments')

assert(/activeSurface === 'board'[\s\S]*<DailyAssignmentBoard/.test(crewAssignments),
  'Daily Assignment Board remains inside Assignments')

section('Crosswinds top tabs')

assert(/const CROSSWINDS_TAB_IDS = \['assignments', 'board', 'condition', 'more'\]/.test(operationsBoard),
  'Crosswinds top Operations row no longer has a separate Briefing bubble')

assert(!/notes:\s+CROSSWINDS_LABEL_REMAP/.test(operationsBoard),
  'Crosswinds label map no longer exposes Briefing as a primary bubble')

section('Styles')

assert(/\.assignmentSurfaceNav/.test(crewCss),
  'Assignments sub-nav styles exist')

assert(/\.assignmentSurfaceBtn\[data-active="true"\]/.test(crewCss),
  'Assignments active bubble style exists')

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
