import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const assignments = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx', 'utf8')
const display = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
const reports = readFileSync('src/utils/reports/reportBuilder.js', 'utf8')
const assignmentStyles = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.module.css', 'utf8')
const displayStyles = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css', 'utf8')

assert.match(assignments, /'weather-delay': 'Weather Delay'/)
assert.match(assignments, /\['planned', 'in-progress', 'weather-delay', 'complete'\]/)
assert.match(display, /key: 'weather-delay', label: 'Weather Delay'/)
assert.match(display, /normalizeCrewProgressStatus\(a\.status\) !== 'weather-delay'/)
assert.match(display, /linkedAssignments\.some/)
assert.match(reports, /Weather Delayed Tasks/)
assert.match(reports, /weatherDelayedTasks/)
assert.match(reports, /\['Weather Delayed Tasks', weatherDelayedTasks\]/)
assert.match(assignmentStyles, /data-status='weather-delay'/)
assert.match(displayStyles, /data-progress="weather-delay"/)

console.log('assignment weather delay smoke passed')
