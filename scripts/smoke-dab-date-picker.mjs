import { readFileSync } from 'node:fs'

const dab = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const css = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css', 'utf8')

const checks = [
  {
    name: 'assignment board date is a native date picker',
    ok: /<input\s+type="date"\s+className=\{styles\.dateNavPicker\}/.test(dab),
  },
  {
    name: 'date picker is bound to selectedDate',
    ok: /value=\{selectedDate\}/.test(dab) &&
      /if \(e\.target\.value\) setSelectedDate\(e\.target\.value\)/.test(dab),
  },
  {
    name: 'previous and next date controls remain',
    ok: /setSelectedDate\(shiftDate\(selectedDate, -1\)\)/.test(dab) &&
      /setSelectedDate\(shiftDate\(selectedDate, 1\)\)/.test(dab),
  },
  {
    name: 'date picker has board styling',
    ok: css.includes('.dateNavPicker') &&
      css.includes('.dateNavPicker::-webkit-calendar-picker-indicator'),
  },
]

let failed = 0
for (const check of checks) {
  if (check.ok) {
    console.log(`PASS ${check.name}`)
  } else {
    failed += 1
    console.error(`FAIL ${check.name}`)
  }
}

if (failed > 0) process.exit(1)
