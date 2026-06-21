// Phase E.10b — Display board date controls smoke.
//
//   node scripts/smoke-display-board-date-controls.mjs
//
// E.10 added mobile swipe navigation. E.10b finishes the desktop
// controls:
//
//   • Date title becomes a button that opens a native date picker
//     (via a hidden sibling <input type="date"> + showPicker()/focus()
//     /click() fallback chain).
//   • Arrow buttons gain polished circular pill styling via two new
//     classes — .boardDateNav (pill chrome) + .boardDateNavIcon
//     (chevron typography) — layered on top of the existing
//     .boardDateArrow class so the kiosk-date-nav smoke regression
//     couples still hold.
//   • Mobile swipe behavior from E.10 is preserved unchanged.
//
// Safety invariants preserved:
//   • Public kiosk stays no-login + view-only.
//   • Auto-refresh interval unchanged (KIOSK_REFRESH_MS = 60 * 1000).
//   • DAB, worker, schema, and spray untouched.

import { readFileSync, readdirSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const DB    = readFileSync('src/pages/DisplayBoard/DisplayBoard.jsx',         'utf8')
const CSS   = readFileSync('src/pages/DisplayBoard/DisplayBoard.module.css',  'utf8')
const DAB   = readFileSync('src/pages/Crew/tabs/DailyAssignmentBoard.jsx',    'utf8')

// Capture the boardMode early-return JSX (everything between the
// boardMode/!printMode guard and the matching closing `)` + brace).
const earlyMatch = DB.match(/if \(boardMode && !printMode\) \{[\s\S]*?return \(([\s\S]*?)\)\s*\n\s*\}/)
const earlyJsx   = earlyMatch ? earlyMatch[1] : ''

// ── No D1 migration ──────────────────────────────────────────────────
section('No D1 migration — 0054 ceiling held')

const migrationFiles = readdirSync('worker/migrations').filter(f => f.endsWith('.sql')).sort()
assert(migrationFiles.includes('0054_shift_templates.sql'),
  'regression: 0054_shift_templates.sql still in the ledger')
const past0055 = migrationFiles.filter(f => /^00(5[6-9]|[6-9]\d|\d{3,})/.test(f))
assert(past0055.length === 0,
  `no migration past 0055 (found: ${past0055.join(', ') || 'none'})`)

// ── Date title button + hidden native input ─────────────────────────
section('Date title — rendered as a button + hidden native date picker')

// The label is now a button, not a span.
assert(/<button[\s\S]{0,400}className=\{`\$\{styles\.boardDateLabel\}\s+\$\{styles\.boardDateTitleButton\}`\}[\s\S]{0,400}\{prettyDate\(selectedDate\)\}[\s\S]{0,100}<\/button>/.test(earlyJsx),
  'date title is a <button> using the composed `${boardDateLabel} ${boardDateTitleButton}` className')

// Button is wired to the date-title click handler.
assert(/onClick=\{handleDateTitleClick\}/.test(earlyJsx),
  'date title <button> onClick={handleDateTitleClick}')

// Accessibility — aria-label + title both reading "Choose display date".
assert(/aria-label="Choose display date"/.test(earlyJsx),
  'date title button has aria-label="Choose display date"')
assert(/title="Choose display date"/.test(earlyJsx),
  'date title button has title="Choose display date"')

// Hidden native input with type="date".
assert(/<input[\s\S]{0,400}ref=\{dateInputRef\}[\s\S]{0,400}type="date"/.test(earlyJsx),
  '<input type="date"> with ref={dateInputRef} present')
assert(/value=\{selectedDate\}/.test(earlyJsx),
  'native date input value={selectedDate} (connected to the shared state)')
assert(/onChange=\{handleDatePickerChange\}/.test(earlyJsx),
  'native date input onChange={handleDatePickerChange}')
assert(/className=\{styles\.boardDateNativeInput\}/.test(earlyJsx),
  'native date input uses styles.boardDateNativeInput (visually hidden)')

// CSS hides the native input visually but keeps it focusable.
assert(/\.boardDateNativeInput\s*\{/.test(CSS),
  '.boardDateNativeInput CSS rule defined')
const inputCssMatch = CSS.match(/\.boardDateNativeInput\s*\{[\s\S]*?\n\}/)
const inputCssSrc   = inputCssMatch ? inputCssMatch[0] : ''
assert(/position:\s*absolute/.test(inputCssSrc),
  '.boardDateNativeInput uses position: absolute (out of flow)')
assert(/opacity:\s*0/.test(inputCssSrc),
  '.boardDateNativeInput uses opacity: 0 (visually invisible without display: none, so showPicker() can still anchor)')

// ── Date title click → showPicker / focus / click fallback chain ────
section('handleDateTitleClick — showPicker → focus → click fallback')

const ctMatch = DB.match(/function handleDateTitleClick\([\s\S]*?\n\s{2}\}/)
const ctSrc   = ctMatch ? ctMatch[0] : ''
assert(ctSrc.length > 0, 'handleDateTitleClick body extracted')
assert(/const el = dateInputRef\.current/.test(ctSrc),
  'handleDateTitleClick reads dateInputRef.current')
assert(/if \(typeof el\.showPicker === 'function'\)\s*\{[\s\S]{0,200}el\.showPicker\(\)/.test(ctSrc),
  'handleDateTitleClick prefers el.showPicker() when available')
assert(/if \(typeof el\.focus === 'function'\) el\.focus\(\)/.test(ctSrc),
  'handleDateTitleClick falls back to el.focus()')
assert(/if \(typeof el\.click === 'function'\) el\.click\(\)/.test(ctSrc),
  'handleDateTitleClick falls back to el.click() (final path)')
assert(/try \{[\s\S]{0,300}\} catch \{/.test(ctSrc),
  'handleDateTitleClick wraps showPicker() in try/catch (browser quirks)')

// ── Date picker change → updates board date ─────────────────────────
section('handleDatePickerChange — validates + updates selectedDate')

const pcMatch = DB.match(/function handleDatePickerChange\([\s\S]*?\n\s{2}\}/)
const pcSrc   = pcMatch ? pcMatch[0] : ''
assert(pcSrc.length > 0, 'handleDatePickerChange body extracted')
assert(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//.test(pcSrc),
  'handleDatePickerChange validates YYYY-MM-DD shape')
assert(/setBoardDateTouched\(true\)/.test(pcSrc),
  'handleDatePickerChange flags boardDateTouched (midnight rollover stops snapping back to today)')
assert(/setSelectedDate\(next\)/.test(pcSrc),
  'handleDatePickerChange updates the shared selectedDate state')

// ── Arrow button polish — composed class + icon span ────────────────
section('Arrow buttons — polished .boardDateNav + .boardDateNavIcon classes')

// Two arrows, each using the composed `${boardDateArrow} ${boardDateNav}` className.
const navMatches = (earlyJsx.match(/className=\{`\$\{styles\.boardDateArrow\}\s+\$\{styles\.boardDateNav\}`\}/g) ?? []).length
assert(navMatches === 2,
  `composed arrow className applied exactly twice (one per arrow); found ${navMatches}`)

// Chevron lives inside a span using .boardDateNavIcon.
const iconMatches = (earlyJsx.match(/className=\{styles\.boardDateNavIcon\}/g) ?? []).length
assert(iconMatches === 2,
  `<span styles.boardDateNavIcon> appears exactly twice (one per arrow); found ${iconMatches}`)
// Glyphs still ‹ / ›.
assert(/‹/.test(earlyJsx), 'left arrow renders ‹ glyph')
assert(/›/.test(earlyJsx), 'right arrow renders › glyph')
// aria-hidden on the icon spans so screen readers read only the
// button's aria-label.
assert(/<span className=\{styles\.boardDateNavIcon\} aria-hidden="true">‹<\/span>/.test(earlyJsx),
  'left chevron span carries aria-hidden="true"')
assert(/<span className=\{styles\.boardDateNavIcon\} aria-hidden="true">›<\/span>/.test(earlyJsx),
  'right chevron span carries aria-hidden="true"')

// Prev/next handlers still wired to shiftBoardDate.
assert(/onClick=\{\(\) => shiftBoardDate\(-1\)\}[\s\S]{0,400}aria-label="Previous board date"/.test(earlyJsx),
  'prev arrow onClick calls shiftBoardDate(-1)')
assert(/onClick=\{\(\) => shiftBoardDate\(1\)\}[\s\S]{0,400}aria-label="Next board date"/.test(earlyJsx),
  'next arrow onClick calls shiftBoardDate(1)')

// ── CSS — new classes defined ───────────────────────────────────────
section('CSS — .boardDateNav, .boardDateNavIcon, .boardDateTitleButton defined')

assert(/^\.boardDateNav\s*\{/m.test(CSS),
  '.boardDateNav CSS rule defined (top-level)')
const navRule = CSS.match(/^\.boardDateNav\s*\{[\s\S]*?\n\}/m)
const navSrc  = navRule ? navRule[0] : ''
assert(/width:\s*clamp\(44px,/.test(navSrc),
  '.boardDateNav width uses clamp(44px, ...) (touch-friendly minimum)')
assert(/border-radius:\s*999px/.test(navSrc),
  '.boardDateNav border-radius: 999px (circular pill)')
assert(/radial-gradient/.test(navSrc),
  '.boardDateNav background uses a radial-gradient (subtle glow)')
assert(/box-shadow:[\s\S]{0,200}rgba\(0,\s*0,\s*0,\s*0\.22\)/.test(navSrc),
  '.boardDateNav has a soft drop shadow')

// Hover + focus-visible lift.
assert(/\.boardDateNav:hover,\s*\n\s*\.boardDateNav:focus-visible\s*\{[\s\S]{0,400}transform:\s*translateY\(-1px\)/.test(CSS),
  '.boardDateNav hover/focus lifts -1px (tactile feedback)')

// Active pushes back down.
assert(/\.boardDateNav:active\s*\{[\s\S]{0,200}transform:\s*translateY\(0\)/.test(CSS),
  '.boardDateNav active resets translateY (button press feedback)')

// Icon class with a clamp() font-size.
assert(/\.boardDateNavIcon\s*\{[\s\S]{0,300}font-size:\s*clamp\(26px,\s*2\.6vw,\s*34px\)/.test(CSS),
  '.boardDateNavIcon font-size uses clamp(26px, 2.6vw, 34px)')

// Title-button class strips the native button chrome.
assert(/\.boardDateTitleButton\s*\{[\s\S]{0,400}background:\s*transparent/.test(CSS),
  '.boardDateTitleButton background: transparent (resets button chrome)')
assert(/\.boardDateTitleButton\s*\{[\s\S]{0,400}border:\s*none/.test(CSS),
  '.boardDateTitleButton border: none (resets button chrome)')
assert(/\.boardDateTitleButton\s*\{[\s\S]{0,400}cursor:\s*pointer/.test(CSS),
  '.boardDateTitleButton cursor: pointer (discoverable as interactive)')
assert(/\.boardDateTitleButton:hover\s*\{[\s\S]{0,300}background:\s*rgba\(74,\s*222,\s*128/.test(CSS),
  '.boardDateTitleButton:hover gains a subtle green wash')
assert(/\.boardDateTitleButton:focus-visible\s*\{[\s\S]{0,300}outline:\s*2px solid/.test(CSS),
  '.boardDateTitleButton:focus-visible draws a focus ring (keyboard accessibility)')

// ── Mobile swipe preserved (E.10 regression couple) ─────────────────
section('Mobile swipe — E.10 behavior unchanged')

assert(/const SWIPE_MIN_DISTANCE\s*=\s*60/.test(DB),
  'SWIPE_MIN_DISTANCE = 60 still defined')
assert(/const SWIPE_VERTICAL_TOLERANCE_RATIO\s*=\s*1\.25/.test(DB),
  'SWIPE_VERTICAL_TOLERANCE_RATIO = 1.25 still defined')
assert(/const touchStartRef = useRef\(null\)/.test(DB),
  'touchStartRef still defined')
assert(/function handleBoardTouchStart\(/.test(DB),
  'handleBoardTouchStart still defined')
assert(/function handleBoardTouchEnd\(/.test(DB),
  'handleBoardTouchEnd still defined')

// Touch handlers still wired on the boardMode root <div>.
assert(/data-board-mode="true"\s*\n\s*onTouchStart=\{handleBoardTouchStart\}\s*\n\s*onTouchEnd=\{handleBoardTouchEnd\}/.test(DB),
  'boardMode root <div> still wires onTouchStart + onTouchEnd')

// E.10 thresholds + direction mapping still in place.
const teMatch = DB.match(/function handleBoardTouchEnd\([\s\S]*?\n\s{2}\}/)
const teSrc   = teMatch ? teMatch[0] : ''
assert(/if \(absDx < SWIPE_MIN_DISTANCE\) return/.test(teSrc),
  'short-swipe guard still in handleBoardTouchEnd')
assert(/if \(absDx < absDy \* SWIPE_VERTICAL_TOLERANCE_RATIO\) return/.test(teSrc),
  'vertical-dominant guard still in handleBoardTouchEnd')
assert(/shiftBoardDate\(dx > 0 \? -1 : 1\)/.test(teSrc),
  'swipe direction → date delta mapping unchanged (right = -1, left = +1)')

// No preventDefault — vertical scroll preserved.
assert(!/preventDefault\(\)/.test(teSrc),
  'handleBoardTouchEnd still does NOT call preventDefault')

// ── Public kiosk + auto-refresh preserved ───────────────────────────
section('Public kiosk + auto-refresh preserved')

// KIOSK_REFRESH_MS still 60 * 1000.
assert(/const KIOSK_REFRESH_MS = 60 \* 1000/.test(DB),
  'KIOSK_REFRESH_MS still = 60 * 1000')

// Public route stays no-login — no useSession / auth gate added in the
// boardMode return path. Pin the absence of a SessionGate-style import
// in the boardMode early return.
const boardModeFull = DB.match(/if \(boardMode && !printMode\) \{[\s\S]*?\n\s{2}\}/)
const bmSrc         = boardModeFull ? boardModeFull[0] : ''
assert(bmSrc.length > 0, 'boardMode early return extracted')
assert(!/useSession|SessionGate|requireAuth|RequireAuth/.test(bmSrc),
  'boardMode early return carries no session / auth guard (still public no-login)')

// ── No DAB / worker / spray edits ───────────────────────────────────
section('Scope guards — DAB / worker / spray untouched')

assert(!DAB.includes('Phase E.10b'),
  'DAB carries no Phase E.10b edits')

for (const path of [
  'src/pages/Spray/Spray.jsx',
  'src/pages/Spray/tabs/BuildSpraySheet.jsx',
  'src/pages/Spray/tabs/SprayRecords.jsx',
  'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  'worker/api/sprays.js',
  'worker/api/sprayPrograms.js',
  'worker/api/productCatalog.js',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase E.10b'),
    `${path} carries no Phase E.10b edits`)
}

for (const path of [
  'worker/index.js',
  'worker/api/schedules.js',
  'worker/api/shiftTemplates.js',
  'worker/lib/mutationPermissions.js',
  'wrangler.jsonc',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase E.10b'),
    `${path} carries no Phase E.10b edits`)
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
