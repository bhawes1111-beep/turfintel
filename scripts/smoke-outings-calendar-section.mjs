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

const crew = readFileSync('src/pages/Crew/tabs/CrewAssignments.jsx', 'utf8')
const panel = readFileSync('src/pages/Operations/OutingsCalendarPanel.jsx', 'utf8')
const panelCss = readFileSync('src/pages/Operations/OutingsCalendarPanel.module.css', 'utf8')
const board = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')

section('Assignments section')

assert(/import OutingsCalendarPanel from '\.\.\/\.\.\/Operations\/OutingsCalendarPanel'/.test(crew),
  'Assignments imports the Outings Calendar panel')

assert(/id: 'briefing'[\s\S]*id: 'outings'[\s\S]*label: 'Outings Calendar'[\s\S]*id: 'board'/.test(crew),
  'Outings Calendar bubble sits between Briefing and Daily Assignment Board')

assert(/activeSurface === 'outings'[\s\S]*<OutingsCalendarPanel \/>/.test(crew),
  'Outings Calendar renders from the Assignments surface switch')

section('Outings calendar CRUD')

assert(/useCalendarData/.test(panel)
  && /createCalendarEvent/.test(panel)
  && /patchCalendarEvent/.test(panel)
  && /deleteCalendarEvent/.test(panel),
  'Outings Calendar uses calendar store create/edit/delete')

assert(/eventType:\s+'outing'/.test(panel) && /category:\s+'outing'/.test(panel),
  'saved outings are marked as outing calendar events')

assert(/sourceModule:\s+'golf-outings-calendar'/.test(panel),
  'new outings are marked with the golf outings source module')

assert(/tags:\s+\['golf-outing'\]/.test(panel),
  'new outings carry the golf-outing tag for display-board filtering')

assert(/function startEdit\(event\)/.test(panel) && /async function handleDelete\(event\)/.test(panel),
  'Outings Calendar exposes edit and delete flows')

assert(/Display Board/.test(panel),
  'Outings Calendar tells users entries display on the Display Board')

section('Outings month calendar')

assert(/const MONTH_DAYS = \['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'\]/.test(panel),
  'Outings Calendar defines weekday headers')

assert(/function buildMonthCells\(monthKey\)/.test(panel)
  && /const \[calendarMonth, setCalendarMonth\]/.test(panel)
  && /const monthCells = useMemo/.test(panel),
  'Outings Calendar builds a month grid from calendarMonth state')

assert(/<section className=\{styles\.monthCalendar\}/.test(panel)
  && /className=\{styles\.calendarGrid\}/.test(panel),
  'month calendar renders above the editor')

assert(/setCalendarMonth\(prev => shiftMonth\(prev, -1\)\)/.test(panel)
  && /setCalendarMonth\(monthKeyFromIso\(TODAY\(\)\)\)/.test(panel)
  && /setCalendarMonth\(prev => shiftMonth\(prev, 1\)\)/.test(panel),
  'month calendar has previous, today, and next controls')

assert(/onClick=\{\(\) => startNewForDate\(cell\.iso\)\}/.test(panel),
  'clicking a day starts a new outing on that date')

assert(/className=\{styles\.calendarOutingTitle\}[\s\S]*onClick=\{\(\) => startEdit\(event\)\}/.test(panel)
  && /data-danger="true" onClick=\{\(\) => handleDelete\(event\)\}/.test(panel),
  'outing entries in the calendar can be edited and deleted')

section('Display board connection')

assert(/const dayOutings = useMemo\(\(\) => \(\s*dayEvents\.filter\(isGolfOutingEvent\)\s*\), \[dayEvents\]\)/.test(board),
  'Display Board filters day events into dayOutings')

assert(/<BoardModeGolfOutings outings=\{dayOutings\} \/>/.test(board),
  'Display Board renders the golf outings strip')

section('Styles')

assert(/\.wrap/.test(panelCss) && /\.editor/.test(panelCss) && /\.card/.test(panelCss),
  'Outings Calendar styles exist')

assert(/\.monthCalendar/.test(panelCss)
  && /\.calendarGrid/.test(panelCss)
  && /\.calendarOutingActions/.test(panelCss),
  'month calendar styles exist')

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
