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

const briefing = readFileSync('src/pages/Operations/DailyBriefingPanel.jsx', 'utf8')
const briefingCss = readFileSync('src/pages/Operations/DailyBriefingPanel.module.css', 'utf8')
const board = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx', 'utf8')
const boardCss = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css', 'utf8')
const operations = readFileSync('src/pages/Operations/OperationsBoard.jsx', 'utf8')

section('Briefing edit/delete controls')

assert(/function startEdit\(note\)[\s\S]*setDraft\(\{[\s\S]*id:\s+note\.id/.test(briefing),
  'briefings can load into the editor for changes')

assert(/await patchOperationsNote\(draft\.id/.test(briefing),
  'saving an edited briefing patches the existing row')

assert(/await deleteOperationsNote\(note\.id\)/.test(briefing),
  'briefings can be deleted')

assert(/if \(draft\.id === note\.id\) setDraft\(emptyDraft\(\)\)/.test(briefing),
  'deleting the currently edited briefing clears the editor')

assert(/Edit briefing/.test(briefing) && /Delete briefing/.test(briefing),
  'edit and delete labels are explicit in the UI')

assert(/\.manageBtnPrimary/.test(briefingCss) && /\.manageBtnDanger/.test(briefingCss) && /\.btnDanger/.test(briefingCss),
  'briefing edit/delete button styles exist')

section('Display board golf outings calendar')

assert(/const dayOutings = useMemo\(\(\) => \(\s*dayEvents\.filter\(isGolfOutingEvent\)\s*\), \[dayEvents\]\)/.test(board),
  'display board derives a golf-outings-only list')

assert(/<BoardModeDailyNotes notes=\{dayNotes\} \/>\s*<BoardModeGolfOutings outings=\{dayOutings\} \/>/.test(board),
  'golf outings render at the top of board mode after briefing notes')

assert(/function isGolfOutingEvent\(event\)/.test(board)
  && /GOLF_OUTING_KEYWORDS/.test(board)
  && /haystack\.includes\(keyword\)/.test(board),
  'outing filter checks type, tags, title, notes, and description text')

assert(/function BoardModeGolfOutings\(\{ outings \}\)/.test(board),
  'golf outings component exists')

assert(/Golf Outings/.test(board) && /event\.startTime \? fmtTime\(event\.startTime\) : 'All day'/.test(board),
  'golf outings strip shows label and time/all-day fallback')

assert(/\.boardGolfOutings/.test(boardCss)
  && /\.boardGolfOutingsList/.test(boardCss)
  && /\.boardGolfOutingItem/.test(boardCss),
  'golf outings styles exist')

section('Golf outing authoring path')

assert(/'Golf Outing', 'Tournament'/.test(operations),
  'Operations Add Task includes Golf Outing and Tournament options')

assert(/const GOLF_OUTING_TASK_RE =/.test(operations),
  'Operations has an outing classifier for saved calendar events')

assert(/category:\s+isOuting \? 'outing' : 'crew'/.test(operations),
  'outing tasks save as outing calendar events')

assert(/sourceModule:\s+isOuting \? 'golf-outings-calendar' : 'operations-board'/.test(operations),
  'outing tasks are marked with the golf outings source module')

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
