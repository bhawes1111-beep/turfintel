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

const jsx = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
const css = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css', 'utf8')

section('Operator board equipment chips')

assert(/chips:\s+linkedChips\.length > 0 \? linkedChips : fallbackChips/.test(jsx),
  'operator assignment carries linked equipment chips with legacy fallback')

assert(/className=\{styles\.boardTaskLine\}[\s\S]{0,700}className=\{styles\.boardTaskText\}[\s\S]{0,700}a\.chips\.length > 0/.test(jsx),
  'employee task line renders equipment next to the task title')

assert(/className=\{styles\.boardTaskEquipmentChip\}[\s\S]{0,250}data-status=\{chip\.status\}/.test(jsx),
  'equipment chip carries reservation status for styling')

section('CSS sizing')

assert(/\.boardTaskLine\s*\{[\s\S]{0,300}flex-wrap:\s*wrap/.test(css),
  'task line wraps instead of stretching the employee card')

assert(/\.boardTaskEquipmentChip\s*\{[\s\S]{0,500}text-overflow:\s*ellipsis/.test(css),
  'equipment chip protects long equipment names with ellipsis')

assert(/\.boardTaskEquipmentChip\[data-status="in-use"\]/.test(css),
  'in-use equipment status styling is present')

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
