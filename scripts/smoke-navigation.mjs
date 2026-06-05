// Phase 9A.1 — Sidebar navigation smoke.
//
//   node scripts/smoke-navigation.mjs
//
// Source-only checks against src/components/layout/Sidebar.jsx +
// src/App.jsx. Crosswinds (courseId 'crossroads-gc') gets a
// simplified 8-item top-level nav with a collapsible "More" group;
// every other course keeps the legacy flat NAV_TREE. Route mounts
// in App.jsx are NOT changed by this phase — items just live under
// More instead of the top level. Permission-gating (Admin uses
// `requires: 'canManageUsers'`) is preserved via a recursive
// permission filter so the gate still fires for children inside
// the new More group.

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}
function section(name) { console.log(`\n— ${name} —`) }

const SB  = readFileSync('src/components/layout/Sidebar.jsx', 'utf8')
const APP = readFileSync('src/App.jsx', 'utf8')

// ── Crosswinds gate ─────────────────────────────────────────────────────
section('Phase 9A.1 — Crosswinds gate wiring')

assert(/import\s*\{\s*useSelectedCourseId\s*\}\s*from\s*['"]\.\.\/\.\.\/utils\/courses\/courseStore['"]/.test(SB),
  'Sidebar imports useSelectedCourseId from courseStore')

assert(/CROSSWINDS_COURSE_ID\s*=\s*'crossroads-gc'/.test(SB),
  "Sidebar declares CROSSWINDS_COURSE_ID = 'crossroads-gc'")

assert(/courseId === CROSSWINDS_COURSE_ID[\s\S]{0,60}NAV_TREE_CROSSWINDS[\s\S]{0,40}NAV_TREE/.test(SB),
  'sourceTree branches: Crosswinds → NAV_TREE_CROSSWINDS, else → NAV_TREE')

// ── Legacy NAV_TREE preserved ───────────────────────────────────────────
section('Legacy NAV_TREE preservation (non-Crosswinds)')

assert(/const\s+NAV_TREE\s*=\s*\[/.test(SB),
  'legacy NAV_TREE constant still exists')

// Legacy labels still in source — non-Crosswinds courses see them.
for (const label of ['Operations', 'Sprays', 'Employee Management', 'Agronomy']) {
  assert(new RegExp(`label:\\s*'${label.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}'`).test(SB),
    `legacy label "${label}" still present in NAV_TREE`)
}

// ── NAV_TREE_CROSSWINDS structure ───────────────────────────────────────
section('NAV_TREE_CROSSWINDS — simplified top level')

assert(/const\s+NAV_TREE_CROSSWINDS\s*=\s*\[/.test(SB),
  'NAV_TREE_CROSSWINDS constant exists')

// 8 top-level routes for Crosswinds (Dashboard, Assignments, Display
// Board, Spray, Inventory, Equipment, Irrigation, Settings) — checked
// via id + to pairs to keep the order/label decoupled from the assertion.
const CROSSWINDS_TOP = [
  ['dashboard',     '/dashboard'],
  ['assignments',   '/crew'],
  ['display-board', '/display-board'],
  ['spray',         '/spray'],
  ['inventory',     '/inventory'],
  ['equipment',     '/equipment'],
  ['irrigation',    '/irrigation'],
  ['settings',      '/settings'],
]
for (const [id, to] of CROSSWINDS_TOP) {
  assert(new RegExp(`id:\\s*'${id}'[\\s\\S]{0,200}to:\\s*'${to.replace(/\//g, '\\/')}'`).test(SB),
    `NAV_TREE_CROSSWINDS top-level item id='${id}' → to='${to}'`)
}

// Crosswinds renames Operations → Assignments at the /crew route.
assert(/id:\s*'assignments'[\s\S]{0,80}label:\s*'Assignments'[\s\S]{0,80}to:\s*'\/crew'/.test(SB),
  "Crosswinds /crew is labeled 'Assignments' (renamed from 'Operations')")

// Crosswinds renames Sprays → Spray.
assert(/id:\s*'spray'[\s\S]{0,60}label:\s*'Spray'[\s\S]{0,60}to:\s*'\/spray'/.test(SB),
  "Crosswinds /spray is labeled 'Spray' (renamed from 'Sprays')")

// ── More group ──────────────────────────────────────────────────────────
section('More collapsible group + children')

assert(/id:\s*'more'[\s\S]{0,80}label:\s*'More'[\s\S]{0,80}children:\s*\[/.test(SB),
  "'More' group entry exists with children: [...]")

const MORE_CHILDREN = [
  ['morning-brief', '/morning-brief'],
  ['weather',       '/weather'],
  ['activity',      '/activity'],
  ['turf-health',   '/turf-health'],
  ['reports',       '/reports'],
  ['disease',       '/disease'],
  ['employees',     '/employees'],
  ['admin',         '/admin'],
]
for (const [id, to] of MORE_CHILDREN) {
  assert(new RegExp(`id:\\s*'${id}'[\\s\\S]{0,200}to:\\s*'${to.replace(/\//g, '\\/')}'`).test(SB),
    `More child id='${id}' → to='${to}'`)
}

// Admin still permission-gated, now inside More.
assert(/id:\s*'admin'[\s\S]{0,200}requires:\s*'canManageUsers'/.test(SB),
  "Admin keeps requires: 'canManageUsers' inside the More group")

// Renamed under More: Employee Management → Employees, Agronomy → Disease.
assert(/id:\s*'employees'[\s\S]{0,60}label:\s*'Employees'[\s\S]{0,60}to:\s*'\/employees'/.test(SB),
  "More 'Employees' (renamed from 'Employee Management')")
assert(/id:\s*'disease'[\s\S]{0,60}label:\s*'Disease'[\s\S]{0,60}to:\s*'\/disease'/.test(SB),
  "More 'Disease' (renamed from 'Agronomy')")

// ── Recursive permission filter ─────────────────────────────────────────
section('Permission gating preserved (recursive into More)')

assert(/function\s+filterByPermissions\s*\(/.test(SB),
  'filterByPermissions helper is defined')
assert(/!node\.requires \|\| can\(node\.requires\)/.test(SB)
    || /node\.requires && !can\(node\.requires\)/.test(SB),
  'filter still keys off node.requires + can(node.requires)')
assert(/filterByPermissions\(node\.children,\s*can\)/.test(SB),
  'filter recurses into node.children (so Admin inside More stays gated)')
assert(/const\s+navTree\s*=\s*filterByPermissions\(sourceTree,\s*can\)/.test(SB),
  'render-time navTree is the filtered sourceTree')

// ── Persistence key unchanged ───────────────────────────────────────────
section('localStorage persistence key unchanged')

assert(/PREFS_KEY\s*=\s*'turfintel-sidebar-prefs'/.test(SB),
  "'turfintel-sidebar-prefs' key is unchanged")

// defaultExpanded walks both trees so new groups (e.g. More) get a
// default-closed slot in the saved state shape.
assert(/walk\(NAV_TREE\)[\s\S]{0,60}walk\(NAV_TREE_CROSSWINDS\)/.test(SB),
  'defaultExpanded walks both NAV_TREE and NAV_TREE_CROSSWINDS')

// ── Existing NavGroup / NavLeaf renderers reused ───────────────────────
section('Existing NavGroup / NavLeaf renderers still in use')

assert(/function\s+NavGroup\s*\(/.test(SB),
  'NavGroup renderer still defined (drives the More disclosure)')
assert(/function\s+NavLeaf\s*\(/.test(SB),
  'NavLeaf renderer still defined')

// ── App.jsx route mounts unchanged ──────────────────────────────────────
section('App.jsx routes preserved (every nav target still mounted)')

// Every Crosswinds top-level + More child route must still resolve in
// App.jsx. Empty-string path patterns get a leading slash; trailing
// /* is allowed (e.g. /crew/* mounts OperationsBoard).
const ALL_NAV_PATHS = [
  ...CROSSWINDS_TOP.map(([, p]) => p),
  ...MORE_CHILDREN.map(([, p]) => p),
]
for (const path of ALL_NAV_PATHS) {
  // path="dashboard" or path="crew/*" in <Route path="...">
  const bare = path.replace(/^\//, '')
  const re   = new RegExp(`path=["']${bare.replace(/\//g, '\\/')}(/\\*)?["']`)
  assert(re.test(APP),
    `App.jsx still mounts route for ${path}`)
}

// Headline regressions: every previously-mounted route is still present.
for (const path of [
  'dashboard', 'morning-brief', 'crew/\\*', 'employees/\\*',
  'display-board', 'spray/\\*', 'disease/\\*', 'inventory/\\*',
  'equipment/\\*', 'irrigation/\\*', 'turf-health/\\*', 'weather',
  'activity/\\*', 'reports', 'admin',
]) {
  assert(new RegExp(`path=["']${path}["']`).test(APP),
    `App.jsx route path="${path.replace(/\\\*/g, '*')}" still present`)
}

// Permission-gated routes still wrap their RequireAuth permission attr.
assert(/<RequireAuth\s+permission=["']canViewReports["']>/.test(APP),
  "'/reports' route still gated with canViewReports")
assert(/<RequireAuth\s+permission=["']canManageUsers["']>/.test(APP),
  "'/admin' route still gated with canManageUsers")

// ── Cross-file: no page-component edits in this phase ──────────────────
section('Cross-file guards — page components untouched')

for (const path of [
  'src/pages/Dashboard/Dashboard.jsx',
  'src/pages/Operations/OperationsBoard.jsx',
  'src/pages/DisplayBoard/DisplayBoard.jsx',
  'src/pages/Crew/tabs/DailyAssignmentBoard.jsx',
]) {
  const src = readFileSync(path, 'utf8')
  assert(!src.includes('Phase 9A.1'),
    `${path} carries no Phase 9A.1 edits`)
}

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
