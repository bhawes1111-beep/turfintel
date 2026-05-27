// Phase 7M (2/?) — Cost-basis audit trail UI polish smoke.
//
//   node scripts/smoke-inventory-cost-basis-audit-polish.mjs
//
// Locks:
//   - the inventoryStore wrapper preserves _costBasisAuditError on the
//     return value but strips it from the cached row so the inventory
//     cache never carries an out-of-band status string into other
//     consumers
//   - CostBasisEditor captures _costBasisAuditError on both the save
//     and the clear flows and surfaces a non-blocking auditWarning
//     banner with the spec'd copy
//   - the auditWarning clears on the next save attempt and when
//     switching drawers
//   - history loading state copy is "Loading history…"
//   - history error state copy is "Unable to load cost basis history."
//     and renders alongside the underlying error message
//   - empty state copy remains "No cost basis changes recorded yet."
//   - the Refresh history button still renders in the error state
//     (always inside historyActions, never gated on hasRows)
//   - a "Newest first." hint banner renders above the row list
//   - CHANGE_SOURCE_LABEL maps to Manual edit / Imported row /
//     Unknown source (per the Phase 7M.2 spec)
//   - no audit edit / delete buttons exist
//   - no new endpoint, no new mutation path, no PDF / invoice / AI
//     extraction / budget / invoice / ledger / bulk-apply additions
//   - Phase 7F.4 + Phase 7J.1 + Phase 7M.1 invariants still hold

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

const editor = readFileSync('src/pages/Inventory/components/CostBasisEditor.jsx', 'utf8')
const editorCss = readFileSync('src/pages/Inventory/components/CostBasisEditor.module.css', 'utf8')
const store  = readFileSync('src/utils/inventory/inventoryStore.js', 'utf8')
const review = readFileSync('src/pages/Inventory/components/CostBasisImportReview.jsx', 'utf8')

// ── 1. store strips _costBasisAuditError before caching ───────────────────
console.log('— inventoryStore.setInventoryCostBasis: cache strip + return passthrough')
{
  // Destructured strip lands in the wrapper.
  assert(/const\s+\{\s*_costBasisAuditError,\s*\.\.\.cachedRow\s*\}\s*=\s*saved/.test(store),
    'wrapper destructures _costBasisAuditError off the saved row into a cachedRow alias')
  // setState writes the stripped row, not the original.
  assert(/setState\(\{\s*items:\s*state\.items\.map\(i\s*=>\s*i\.id\s*===\s*id\s*\?\s*cachedRow\s*:\s*i\)\s*\}\)/.test(store),
    'cached items receive cachedRow (without the marker)')
  // The wrapper still returns the original `saved` reference so the
  // caller can read _costBasisAuditError.
  const fn = store.match(/export\s+async\s+function\s+setInventoryCostBasis[\s\S]*?\n\}\n/)
  assert(!!fn, 'setInventoryCostBasis body extractable')
  if (fn) {
    const body = fn[0]
    assert(/return\s+saved\b/.test(body),
      'wrapper still returns the original saved object (carries the marker)')
  }
}

// ── 2. Editor captures + surfaces _costBasisAuditError ────────────────────
console.log('— CostBasisEditor: audit warning state + banner copy')
{
  // State declared with a null default.
  assert(/const\s+\[auditWarning,\s*setAuditWarning\]\s*=\s*useState\(\s*null\s*\)/.test(editor),
    'auditWarning state declared (default null)')

  // Drawer-change effect clears the warning.
  const drawerEffect = editor.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?\}\,\s*\[item\?\.id\]\)/)
  assert(!!drawerEffect, 'item-id useEffect extractable')
  if (drawerEffect) {
    assert(/setAuditWarning\(\s*null\s*\)/.test(drawerEffect[0]),
      'cross-drawer reset clears auditWarning')
  }

  // submit + clearBasis both:
  //   * clear the warning before the call
  //   * capture saved?._costBasisAuditError into setAuditWarning
  const submit = editor.match(/async\s+function\s+submit[\s\S]*?\n  \}\n/)
  const clear  = editor.match(/async\s+function\s+clearBasis[\s\S]*?\n  \}\n/)
  assert(!!submit && !!clear, 'submit + clearBasis bodies extractable')
  for (const [name, m] of [['submit', submit], ['clearBasis', clear]]) {
    if (!m) continue
    const body = m[0]
    assert(/setAuditWarning\(\s*null\s*\)/.test(body),
      `${name} clears auditWarning before the request`)
    assert(/const\s+saved\s*=\s*await\s+setInventoryCostBasis/.test(body),
      `${name} now captures the wrapper's return value into \`saved\``)
    assert(/if\s*\(saved\?\._costBasisAuditError\)\s*\{\s*setAuditWarning\(saved\._costBasisAuditError\)/.test(body),
      `${name} sets auditWarning when saved._costBasisAuditError is present`)
  }

  // Banner JSX gated on auditWarning + uses role="alert" + the spec
  // copy.
  assert(/\{auditWarning\s*&&\s*\(\s*<div[\s\S]*?role=['"]alert['"]/.test(editor),
    'audit-warning banner renders with role="alert"')
  assert(editor.includes('Cost basis was updated, but audit history could not be recorded.'),
    'audit-warning banner copy verbatim')
  assert(/styles\.auditWarning\b/.test(editor) && /styles\.auditWarningDetail\b/.test(editor),
    'audit-warning banner references both auditWarning + auditWarningDetail classes')
}

// ── 3. History loading / error / empty / refresh copy + behavior ─────────
console.log('— history panel copy + states')
{
  // Loading copy.
  assert(/Loading history…/.test(editor),
    'history loading copy: "Loading history…"')
  // Error copy + detail.
  assert(/Unable to load cost basis history\./.test(editor),
    'history error copy: "Unable to load cost basis history."')
  assert(/styles\.historyErrorDetail\b/.test(editor),
    'history error renders a separate detail span')
  // Empty copy preserved.
  assert(/No cost basis changes recorded yet\./.test(editor),
    'history empty copy preserved: "No cost basis changes recorded yet."')
  // Newest-first hint.
  assert(/Newest first\./.test(editor) && /styles\.historyHint\b/.test(editor),
    'history shows a "Newest first." hint when rows render')

  // Refresh button stays mounted regardless of loading/error/rows.
  // Look at the historyActions block — it sits OUTSIDE the hasRows /
  // error / empty conditional branches (after the closing parens of
  // the rows render), and never gates on hasRows.
  const panelOpen = editor.match(/\{open\s*&&\s*\([\s\S]*?\<\/div>\s*\)\}/)
  assert(!!panelOpen, 'history-panel open branch extractable')
  if (panelOpen) {
    const body = panelOpen[0]
    // historyActions only depends on `loading` for the button disable,
    // not on `error`. So an error state still renders the button.
    const actions = body.match(/<div className=\{styles\.historyActions\}>[\s\S]*?<\/div>/)
    assert(!!actions, 'historyActions block extractable')
    if (actions) {
      assert(/Refresh history/.test(actions[0]),
        'Refresh history button label present')
      assert(/disabled=\{loading\}/.test(actions[0]),
        'Refresh button is disabled only while loading (NOT gated on error)')
      assert(!/\berror\b/.test(actions[0]),
        'Refresh button block never references the error flag (always visible)')
    }
  }
}

// ── 4. CHANGE_SOURCE_LABEL matches the spec ───────────────────────────────
console.log('— change-source labels match the Phase 7M.2 spec')
{
  // Strict literal lookup — the smoke pins the three lines so a
  // future refactor can't silently change the chip text.
  assert(/'manual':\s*'Manual edit'/.test(editor),
    "manual → 'Manual edit'")
  assert(/'import-single-row':\s*'Imported row'/.test(editor),
    "import-single-row → 'Imported row'")
  assert(/'unknown':\s*'Unknown source'/.test(editor),
    "unknown → 'Unknown source'")
  // Make sure the Phase 7M.1 placeholder "Imported (single row)"
  // didn't survive the rename.
  assert(!editor.includes('Imported (single row)'),
    'old "Imported (single row)" label fully removed')
}

// ── 5. No audit edit / delete affordances ─────────────────────────────────
console.log('— no audit edit / delete buttons')
{
  // Inside the history panel renderer, the only button is "Refresh
  // history". An Edit / Delete affordance on history rows would be
  // an apply / mutation path we're not adding in this commit.
  const panel = editor.match(/function\s+CostBasisHistoryPanel\s*\([\s\S]*?\n\}\n/)
  assert(!!panel, 'CostBasisHistoryPanel body extractable')
  if (panel) {
    const body = panel[0]
    for (const phrase of [
      'Edit entry', 'Edit history', 'Delete entry', 'Delete history',
      'Remove entry', 'Remove history',
    ]) {
      assert(!body.includes(phrase),
        `history panel never offers a "${phrase}" button`)
    }
    // The only button in the panel body is Refresh history + the
    // historyToggle disclosure.
    const buttonMatches = body.match(/<button\b/g) ?? []
    assert(buttonMatches.length === 2,
      `history panel renders exactly 2 buttons (toggle + refresh); found ${buttonMatches.length}`)
  }
}

// ── 6. CSS classes for the new pieces ─────────────────────────────────────
console.log('— CSS module gains audit-warning + history-polish classes')
{
  for (const cls of [
    'auditWarning', 'auditWarningDetail',
    'historyHint', 'historyErrorDetail',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(editorCss),
      `CSS defines .${cls}`)
  }
  // Phase 7M.1 surface preserved.
  for (const cls of [
    'history', 'historyToggle', 'historyToggleLabel', 'historyToggleChevron',
    'historyBody', 'historyEmpty',
    'historyList', 'historyRow', 'historyHeader',
    'historyTimestamp', 'historySourceChip',
    'historyKv', 'historyActions',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(editorCss),
      `Phase 7M.1 class .${cls} still defined`)
  }
}

// ── 7. No new endpoint / mutation path added in this commit ───────────────
console.log('— no new endpoint, no new write verb, no mutation path')
{
  // Editor still only writes via setInventoryCostBasis; reads via
  // listInventoryCostBasisAudit; no direct fetch / /api/ / method strings.
  const codeOnly = editor
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/\bfetch\(/.test(codeOnly),
    'editor still does not call fetch() directly')
  assert(!/\/api\//.test(codeOnly),
    'editor still references no /api/ endpoint')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'editor issues no direct POST/PATCH/DELETE')

  // No write verbs leaked into the editor.
  for (const verb of [
    'recordInventoryUsage',
    'createInventoryItem', 'updateInventoryItem', 'deleteInventoryItem',
    'createSpray',         'createCalendarEvent',
    'createBudgetEntry',   'createInvoice',     'createLedgerEntry',
    'patchInventoryCostBasis', 'patchInventoryCatalogLink',
    'deleteInventoryCostBasisAudit',
    'editInventoryCostBasisAudit',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(codeOnly),
      `editor never references ${verb}`)
  }

  // Stewardship vocabulary lock.
  for (const word of [
    'recommend','correct','incorrect','grade',
    'unsafe','apply now','do not apply','rotate to',
    'safe','pass','fail','score',
    'budget entry created','actual expense','spend authorization',
    'invoice processing','invoice parser','ledger entry',
    'pdf parser','ai extraction','OCR','tesseract','openai',
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    assert(!re.test(codeOnly), `editor code-only avoids "${word}"`)
  }

  // Worker side: surface count and routes unchanged.
  const worker = readFileSync('worker/index.js', 'utf8')
  for (const route of [
    '/cost-import', '/cost-import/commit', '/cost-import/apply',
    '/cost-basis/bulk', '/cost-basis/import', '/cost-basis/apply-all',
    '/cost-basis-audit/edit', '/cost-basis-audit/delete',
  ]) {
    assert(!worker.includes(route),
      `worker/index.js still never wires ${route}`)
  }
  assert(/patchInventoryCostBasis/.test(worker),
    'Phase 7J.1 patchInventoryCostBasis still wired')
  assert(/listInventoryCostBasisAudit/.test(worker),
    'Phase 7M.1 listInventoryCostBasisAudit still wired')

  // worker/api/inventory.js still avoids the forbidden surfaces.
  const api = readFileSync('worker/api/inventory.js', 'utf8')
  const apiCode = api
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'parsePdf', 'parseInvoice', 'extractWithAi', 'tesseract', 'openai',
    'createBudgetEntry', 'createInvoice', 'createLedgerEntry',
    'deleteInventoryCostBasisAudit', 'updateInventoryCostBasisAudit',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`, 'i').test(apiCode),
      `worker/api/inventory.js still never references ${verb}`)
  }
  assert(!/UPDATE\s+product_catalog|INSERT\s+INTO\s+product_catalog/i.test(apiCode),
    'worker/api/inventory.js never writes product_catalog')

  // inventoryStore exports unchanged.
  const storeCode = store
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const verb of [
    'bulkApplyCostBasis', 'applyCostImport', 'commitCostImport',
    'uploadCostImport',   'parseCostImport',
    'parseInvoice', 'parsePdf', 'extractWithAi',
    'deleteInventoryCostBasisAudit', 'updateInventoryCostBasisAudit',
  ]) {
    assert(!new RegExp(`\\b${verb}\\b`).test(storeCode),
      `inventoryStore still never references ${verb}`)
  }
  assert(/setInventoryCostBasis/.test(storeCode),
    'Phase 7J.1 setInventoryCostBasis wrapper still present')
  assert(/listInventoryCostBasisAudit/.test(storeCode),
    'Phase 7M.1 listInventoryCostBasisAudit wrapper still present')
}

// ── 8. Cost Basis Import Review still sends import-single-row ─────────────
console.log('— CostBasisImportReview attribution preserved')
{
  assert(/changeSource:\s*'import-single-row'/.test(review),
    "Phase 7L.1 import review apply still sends changeSource: 'import-single-row'")
  // No new changeSource label appeared.
  const allCs = review.match(/changeSource:\s*'[^']+'/g) ?? []
  assert(allCs.length === 1 && allCs[0] === "changeSource: 'import-single-row'",
    'no other changeSource label appears in CostBasisImportReview',
    allCs)
}

// ── 9. Phase 7F.4 regression guard ────────────────────────────────────────
console.log('— Phase 7F.4 /completed-link route still wired')
{
  const planner = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/\/completed-link\b/.test(planner),
    'Phase 7F.4 /completed-link route still present')
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
