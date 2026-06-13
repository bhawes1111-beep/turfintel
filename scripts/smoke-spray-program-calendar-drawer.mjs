// Phase 7H (2/?) — Spray Program Calendar item-detail drawer smoke.
//
//   node scripts/smoke-spray-program-calendar-drawer.mjs
//
// Locks the read-only detail-drawer invariants:
//   - drawer component exists + reuses Phase 7C.1/6 + 7F.5 helpers
//   - no edit/save/delete actions in the drawer
//   - no createSpray / recordInventoryUsage / createCalendarEvent /
//     setProgramItemCompletedLink / write calls
//   - no product_catalog mutation
//   - no recommendation / judgment vocabulary
//   - calendar tab tracks selectedItemId and renders the drawer
//   - DayCell items + AgendaRow are clickable via onSelect
//   - drawer mounts under the WorkspaceSection
//   - boundary copy + plan-vs-actual + linked-record states present
//   - spray save payload byte-identical

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Drawer component source contracts ──────────────────────────────────
console.log('— ProgramCalendarItemDrawer.jsx (source)')
{
  const src = readFileSync('src/pages/Spray/tabs/components/ProgramCalendarItemDrawer.jsx', 'utf8')

  assert(/export\s+default\s+function\s+ProgramCalendarItemDrawer\b/.test(src),
    'default exports ProgramCalendarItemDrawer')

  // Helper reuse: resolveProgramItemIntel + buildPlanActualComparison.
  assert(/from\s+['"][^'"]*sprayPrograms\/resolveProgramItemIntel(\.js)?['"]/.test(src),
    'imports resolveProgramItemIntel (no parallel intelligence logic)')
  assert(/from\s+['"][^'"]*sprayPrograms\/planActualComparison(\.js)?['"]/.test(src),
    'imports planActualComparison (no parallel comparison logic)')
  assert(/resolveProgramItemIntel\(/.test(src),
    'invokes resolveProgramItemIntel')
  assert(/buildPlanActualComparison\(/.test(src),
    'invokes buildPlanActualComparison')

  // Reuses SideDrawer primitive — no parallel modal pattern.
  assert(/from\s+['"][^'"]*primitives\/SideDrawer['"]/.test(src),
    'reuses the existing SideDrawer primitive')

  // Read-only: no edit/save buttons + no write call sites.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const pattern of [
    /createSpray\s*\(/,
    /recordInventoryUsage/,
    /createCalendarEvent\s*\(/,
    /setProgramItemCompletedLink/,
    /createSprayProgramItem|updateSprayProgramItem|deleteSprayProgramItem/,
    /createSprayProgram|updateSprayProgram|archiveSprayProgram/,
  ]) {
    assert(!pattern.test(codeOnly),
      `drawer code never matches ${pattern.source}`)
  }
  // No mutation verbs.
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'drawer issues no direct POST/PATCH/DELETE')
  // No /api/product-catalog mutation.
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(codeOnly),
    'drawer never POSTs/PATCHes/DELETEs /api/product-catalog')
  // No edit/save buttons.
  assert(!/>\s*Save\s*</.test(codeOnly) &&
         !/>\s*Edit\s*</.test(codeOnly) &&
         !/>\s*Delete\s*</.test(codeOnly) &&
         !/>\s*Remove\s*</.test(codeOnly),
    'no Save / Edit / Delete / Remove buttons in drawer')

  // No recommendation / judgment vocabulary.
  for (const word of [
    'recommend', 'correct', 'incorrect', 'pass', 'fail',
    'score', 'grade', 'safe', 'unsafe',
    'apply now', 'do not apply', 'rotate to',
  ]) {
    assert(!new RegExp(`\\b${word}\\b`, 'i').test(codeOnly),
      `no "${word}" wording in drawer code`)
  }

  // Boundary copy (3 spec lines verbatim).
  for (const phrase of [
    'Calendar details are read-only.',
    'This view does not create completed spray records.',
    'Inventory is not deducted from planned items.',
  ]) {
    assert(src.includes(phrase),
      `boundary copy present: "${phrase}"`)
  }

  // Linked record handling: cached + stale + no-link states all present.
  assert(/No completed spray linked/.test(src),
    'drawer renders "No completed spray linked" state when none')
  assert(/Linked spray record could not be resolved/.test(src),
    'drawer renders stale-link state when FK is unresolvable')
  assert(/Linked completed record/.test(src),
    'drawer renders "Linked completed record" header')

  // Plan vs Actual block — only when comparison resolved.
  assert(/comparison\?\.linked/.test(src) && /Plan vs Actual/.test(src),
    'drawer renders Plan vs Actual block gated on resolved comparison')
}

// ── 2. CSS contracts ──────────────────────────────────────────────────────
console.log('— ProgramCalendarItemDrawer.module.css')
{
  const css = readFileSync('src/pages/Spray/tabs/components/ProgramCalendarItemDrawer.module.css', 'utf8')
  for (const cls of [
    'boundaryNote', 'statusBadge',
    'status_planned', 'status_completed', 'status_skipped', 'status_canceled',
    'section', 'sectionTitle',
    'kv', 'kvRow', 'kvLabel', 'kvValue',
    'notes', 'empty',
    'linkedRecordCard', 'linkedRecordTitle', 'linkedRecordMeta',
    'linkedRecordBoundary', 'linkedRecordStale', 'staleFk', 'fkMono',
    'comparisonList', 'comparisonItem', 'comparisonLabel', 'comparisonValue',
    'tone_ok', 'tone_warn', 'tone_muted',
    'linkSummary', 'linkSummaryTitle', 'linkSummarySub',
    'chipRow', 'chip',
    'chipFrac', 'chipHrac', 'chipIrac', 'chipPgr',
    'chipRei', 'chipRup', 'chipSignal',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
}

// ── 3. Calendar tab wires the drawer + clickable items ────────────────────
console.log('— SprayProgramCalendar wires drawer + clickable chips/cards')
{
  const src = readFileSync('src/pages/Spray/tabs/SprayProgramCalendar.jsx', 'utf8')

  // Imports.
  assert(/import\s+ProgramCalendarItemDrawer\s+from\s+['"]\.\/components\/ProgramCalendarItemDrawer['"]/.test(src),
    'tab imports ProgramCalendarItemDrawer')
  for (const fn of ['useInventoryData', 'useProductCatalog', 'useImportedLabels', 'useSpraysData']) {
    assert(new RegExp(`\\b${fn}\\b`).test(src),
      `tab subscribes to ${fn}`)
  }

  // Selection state.
  assert(/selectedItemId/.test(src) && /setSelectedItemId/.test(src),
    'tab declares selectedItemId state')

  // intelContext built from store data (mirrors planner pattern).
  assert(/intelContext\s*=\s*useMemo\(/.test(src),
    'tab builds intelContext via useMemo')

  // selection resolution memo.
  assert(/const\s+selection\s*=\s*useMemo\(/.test(src),
    'tab resolves selected item + program + linkedSpray via useMemo')

  // Drawer mounted under WorkspaceSection with the right props.
  assert(/<ProgramCalendarItemDrawer\b/.test(src),
    'tab mounts <ProgramCalendarItemDrawer>')
  assert(/item=\{selection\?\.item\s*\?\?\s*null\}/.test(src),
    'drawer receives item={selection?.item ?? null}')
  assert(/program=\{selection\?\.program\s*\?\?\s*null\}/.test(src),
    'drawer receives program={selection?.program ?? null}')
  assert(/linkedSpray=\{selection\?\.linkedSpray\s*\?\?\s*null\}/.test(src),
    'drawer receives linkedSpray={selection?.linkedSpray ?? null}')
  assert(/intelContext=\{intelContext\}/.test(src),
    'drawer receives intelContext')
  assert(/onClose=\{\(\)\s*=>\s*setSelectedItemId\(null\)\}/.test(src),
    'drawer onClose clears selectedItemId')

  // Phase 7R.4 — chips now open the grouped *application* drawer; the
  // per-item drawer is reached by drilling into a product row inside it.
  assert(/className=\{`\$\{styles\.dayItem\}\s+\$\{styles\.dayItemBtn\}/.test(src),
    'day-item rendered as a button (.dayItem + .dayItemBtn)')
  assert(/onClick=\{\(\)\s*=>\s*onSelectEvent\?\.\(ev\.id\)\}/.test(src),
    'day-item button calls onSelectEvent(ev.id)')
  assert(/className=\{styles\.agendaItemBtn\}/.test(src),
    'agenda row wraps in an .agendaItemBtn button')

  // onSelectEvent is threaded to DayCell + both AgendaRow usages.
  assert(/<DayCell\b[^>]*onSelectEvent=\{setSelectedEventId\}/.test(src),
    'DayCell receives onSelectEvent={setSelectedEventId}')
  // Two AgendaRow usages (active month + unscheduled).
  const agendaOnSelectCount = (src.match(/<AgendaRow\b[^>]*onSelectEvent=\{setSelectedEventId\}/g) ?? []).length
  assert(agendaOnSelectCount === 2,
    `both AgendaRow usages receive onSelectEvent (found ${agendaOnSelectCount})`)

  // ── Tab body still has zero write paths ────────────────────────────
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const pattern of [
    /createSpray\s*\(/,
    /recordInventoryUsage/,
    /createCalendarEvent\s*\(/,
    /setProgramItemCompletedLink/,
    /createSprayProgramItem|updateSprayProgramItem|deleteSprayProgramItem/,
    /createSprayProgram|updateSprayProgram|archiveSprayProgram/,
  ]) {
    assert(!pattern.test(codeOnly),
      `tab code never matches ${pattern.source}`)
  }
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'tab issues no direct POST/PATCH/DELETE')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(codeOnly),
    'tab never POSTs/PATCHes/DELETEs /api/product-catalog')

  // No recommendation vocabulary anywhere.
  for (const word of [
    'recommend', 'correct', 'incorrect', 'pass', 'fail',
    'score', 'grade', 'safe', 'unsafe',
    'apply now', 'do not apply', 'rotate to',
  ]) {
    assert(!new RegExp(`\\b${word}\\b`, 'i').test(codeOnly),
      `no "${word}" wording in calendar tab code`)
  }
}

// ── 4. Calendar CSS gained the new affordances ────────────────────────────
console.log('— SprayProgramCalendar CSS adds clickable affordance classes')
{
  const css = readFileSync('src/pages/Spray/tabs/SprayProgramCalendar.module.css', 'utf8')
  for (const cls of ['dayItemBtn', 'agendaItemBtn']) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
}

// ── 5. Spray save payload + forbidden-write invariants re-verified ────────
console.log('— spray save payload + forbidden-write invariants')
{
  const sprayBuilder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
  const payload = sprayBuilder.match(/products:\s*enrichedRows\.map\([\s\S]*?\)\),/)?.[0] ?? ''
  assert(payload.length > 0, 'spray save payload block found')
  assert(!/intelligence|recommendation|rotation|interval|programId|program\b/i.test(payload),
    'spray save payload omits program/intel/catalog keys')

  const idx = readFileSync('worker/index.js', 'utf8')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(idx)
      && !/(POST|PATCH|DELETE)[^\n]{0,80}['"]\/api\/product-catalog['"]/.test(idx),
    'still no POST/PATCH/DELETE on /api/product-catalog')
  // Phase 7F.4 /completed-link route remains the only spray-program-items
  // mutation surface beyond the generic PATCH.
  assert(/patchSprayProgramItemCompletedLink/.test(idx),
    'Phase 7F.4 completed-link route still wired (regression guard)')
}

// ── Result ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
