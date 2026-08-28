import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const styles = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css', 'utf8')

assert.match(source, /function startOfAssignmentWeek/)
assert.match(source, /Array\.from\(\{ length: 7 \}/)
assert.match(source, /className=\{styles\.weekCalendar\}/)
assert.match(source, /onClick=\{\(\) => setSelectedDate\(day\.date\)\}/)
assert.match(source, /day\.tasks\.map/)
assert.match(styles, /grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\)/)
assert.match(styles, /\.weekTask\[data-status="in-progress"\]/)

console.log('assignment week calendar smoke passed')
