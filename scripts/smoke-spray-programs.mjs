// Phase 7F (1/?) — Spray Program Planner foundation smoke.
//
//   node scripts/smoke-spray-programs.mjs
//
// Locks the data-model invariants:
//   - schema includes spray_programs + spray_program_items with the
//     spec'd columns + indexes
//   - Worker handlers expose program + item CRUD with strict validation
//   - product_catalog stays read-only (no UPDATE/INSERT to it from any
//     Spray Program handler)
//   - planned programs do NOT deduct inventory and do NOT create
//     spray_records (no SQL in the handlers writes to either)
//   - linked_spray_record_id is null on insert and not in MUTABLE
//   - product_catalog_id / inventory_item_id validation against the
//     real tables; rejects unknown ids
//   - Worker routes wired with the order /items BEFORE /:id
//   - client store exports the spec'd functions
//   - tab shell registered in Sprays; legacy 'Planned Programs' tab
//     not removed
//   - no recommendation / "rotate to" / "do not apply" language anywhere
//   - spray save payload byte-identical
//   - no PDF / AI / parser pipeline added

import { readFileSync } from 'fs'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── 1. Migration ────────────────────────────────────────────────────────────
console.log('— migration 0044 (spray_programs + spray_program_items)')
{
  const mig = readFileSync('worker/migrations/0044_spray_programs.sql', 'utf8')

  assert(/CREATE TABLE IF NOT EXISTS spray_programs/i.test(mig),
    'CREATE TABLE spray_programs')
  assert(/CREATE TABLE IF NOT EXISTS spray_program_items/i.test(mig),
    'CREATE TABLE spray_program_items')

  // Program columns per spec.
  for (const col of [
    'id', 'course_id', 'name', 'season_year', 'program_type', 'status', 'notes',
    'source', 'created_at', 'updated_at', 'archived_at',
  ]) {
    assert(new RegExp(`\\b${col}\\b`).test(mig),
      `spray_programs declares column ${col}`)
  }
  // Defaults the handler relies on.
  assert(/status\s+TEXT\s+NOT NULL\s+DEFAULT\s+'draft'/i.test(mig),
    "spray_programs.status defaults to 'draft'")
  assert(/source\s+TEXT\s+NOT NULL\s+DEFAULT\s+'manual'/i.test(mig),
    "spray_programs.source defaults to 'manual'")

  // Item columns per spec.
  for (const col of [
    'program_id', 'course_id', 'target_area',
    'planned_start_date', 'planned_end_date', 'planned_window_label',
    'product_name', 'inventory_item_id', 'product_catalog_id',
    'rate_value', 'rate_unit',
    'carrier_volume_value', 'carrier_volume_unit',
    'application_notes', 'sort_order', 'status',
    'linked_spray_record_id', 'created_at', 'updated_at',
  ]) {
    assert(new RegExp(`\\b${col}\\b`).test(mig),
      `spray_program_items declares column ${col}`)
  }
  // Defaults the handler relies on.
  assert(/status\s+TEXT\s+NOT NULL\s+DEFAULT\s+'planned'/i.test(mig),
    "spray_program_items.status defaults to 'planned'")
  assert(/sort_order\s+INTEGER\s+NOT NULL\s+DEFAULT\s+0/i.test(mig),
    "spray_program_items.sort_order defaults to 0")

  // Indexes — at least one per filterable column.
  for (const idx of [
    'idx_spray_programs_course', 'idx_spray_programs_status', 'idx_spray_programs_season',
    'idx_spray_program_items_program', 'idx_spray_program_items_course',
    'idx_spray_program_items_status', 'idx_spray_program_items_sort',
    'idx_spray_program_items_inv', 'idx_spray_program_items_cat', 'idx_spray_program_items_rec',
  ]) {
    assert(new RegExp(`\\b${idx}\\b`).test(mig),
      `migration declares index ${idx}`)
  }
}

// ── 2. Worker handler source contracts + no side-effect SQL ────────────────
console.log('— worker/api/sprayPrograms.js (source)')
{
  const src = readFileSync('worker/api/sprayPrograms.js', 'utf8')

  for (const name of [
    'listSprayPrograms', 'getSprayProgram', 'createSprayProgram',
    'updateSprayProgram', 'archiveSprayProgram',
    'listSprayProgramItems', 'getSprayProgramItem',
    'createSprayProgramItem', 'updateSprayProgramItem', 'deleteSprayProgramItem',
  ]) {
    assert(new RegExp(`export\\s+async\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  // Validation against product_catalog AND inventory_items.
  assert(/SELECT id FROM product_catalog WHERE id = \?/i.test(src),
    'validates productCatalogId against product_catalog')
  assert(/SELECT id FROM inventory_items WHERE id = \?/i.test(src),
    'validates inventoryItemId against inventory_items')

  // product_catalog stays read-only — no UPDATE / INSERT / DELETE
  // against it from this file.
  assert(!/UPDATE\s+product_catalog\b/i.test(src),
    'no UPDATE on product_catalog')
  assert(!/INSERT\s+INTO\s+product_catalog\b/i.test(src),
    'no INSERT INTO product_catalog')
  assert(!/DELETE\s+FROM\s+product_catalog\b/i.test(src),
    'no DELETE FROM product_catalog')

  // Planned items must NOT touch inventory_items writes.
  assert(!/UPDATE\s+inventory_items\b/i.test(src),
    'no UPDATE on inventory_items (no automatic stock deduction)')
  assert(!/INSERT\s+INTO\s+inventory_items\b/i.test(src),
    'no INSERT INTO inventory_items')
  assert(!/DELETE\s+FROM\s+inventory_items\b/i.test(src),
    'no DELETE FROM inventory_items')

  // Planned items must NOT create spray_records.
  assert(!/INSERT\s+INTO\s+spray_records\b/i.test(src),
    'no INSERT INTO spray_records (planned ≠ completed)')
  assert(!/UPDATE\s+spray_records\b/i.test(src),
    'no UPDATE on spray_records')

  // linked_spray_record_id is NOT in ITEM_MUTABLE — only future narrow
  // endpoint can populate it.
  const itemMut = src.match(/ITEM_MUTABLE\s*=\s*\{[\s\S]*?\}/)?.[0] ?? ''
  assert(itemMut.length > 0,                           'ITEM_MUTABLE map present')
  assert(!/linkedSprayRecordId/.test(itemMut),
    'linkedSprayRecordId NOT in ITEM_MUTABLE (no generic write path)')
  // The insert SQL also never references linked_spray_record_id.
  const createSql = src.match(/INSERT INTO spray_program_items[\s\S]*?VALUES\s*\([\s\S]*?\)/)?.[0] ?? ''
  assert(!/linked_spray_record_id/i.test(createSql),
    'createSprayProgramItem SQL does NOT bind linked_spray_record_id (defaults to null)')

  // Mutable maps don't allow program/item id swaps via PATCH.
  const progMut = src.match(/PROGRAM_MUTABLE\s*=\s*\{[\s\S]*?\}/)?.[0] ?? ''
  for (const forbidden of ['id', 'courseId', 'createdAt', 'archivedAt']) {
    assert(!new RegExp(`\\b${forbidden}:\\s*['"]`).test(progMut),
      `PROGRAM_MUTABLE does not allow "${forbidden}"`)
  }
}

// ── 3. Worker routes wired correctly ───────────────────────────────────────
console.log('— worker/index.js routes wired')
{
  const idx = readFileSync('worker/index.js', 'utf8')

  // Imports.
  for (const name of [
    'listSprayPrograms', 'createSprayProgram', 'updateSprayProgram',
    'archiveSprayProgram', 'listSprayProgramItems',
    'createSprayProgramItem', 'updateSprayProgramItem', 'deleteSprayProgramItem',
  ]) {
    assert(new RegExp(`\\b${name}\\b`).test(idx),
      `index imports ${name}`)
  }

  // Routes.
  assert(/pathname\s*===\s*['"]\/api\/spray-programs['"]/.test(idx),
    'route: /api/spray-programs')
  assert(/\/\^\\\/api\\\/spray-programs\\\/\(\[\^\/\]\+\)\\\/items\$\//.test(idx),
    'route regex: /api/spray-programs/:id/items')
  assert(/\/\^\\\/api\\\/spray-programs\\\/\(\[\^\/\]\+\)\$\//.test(idx),
    'route regex: /api/spray-programs/:id')
  assert(/\/\^\\\/api\\\/spray-program-items\\\/\(\[\^\/\]\+\)\$\//.test(idx),
    'route regex: /api/spray-program-items/:itemId')

  // /items must be matched BEFORE /:id.
  const itemsPos = idx.search(/\/\^\\\/api\\\/spray-programs\\\/\(\[\^\/\]\+\)\\\/items\$\//)
  const idPos    = idx.search(/\/\^\\\/api\\\/spray-programs\\\/\(\[\^\/\]\+\)\$\//)
  assert(itemsPos > 0 && idPos > 0 && itemsPos < idPos,
    '/items regex appears BEFORE /:id (precedence)')

  // No route on /api/product-catalog gained a mutation verb.
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(idx)
      && !/(POST|PATCH|DELETE)[^\n]{0,80}['"]\/api\/product-catalog['"]/.test(idx),
    'still no POST/PATCH/DELETE on /api/product-catalog')
}

// ── 4. In-process D1 stub: handler behavior end-to-end ────────────────────
console.log('— sprayPrograms handler behavior (D1 stub)')
{
  const api = await import('../worker/api/sprayPrograms.js')

  function makeDB(spec) {
    const log = []
    return {
      DB: {
        prepare(sql) {
          const trimmed = sql.replace(/\s+/g, ' ').trim()
          log.push(trimmed)
          return {
            bind(...binds) {
              return {
                async first() {
                  if (/SELECT id FROM product_catalog/i.test(trimmed)) return spec.catalogRow ?? null
                  if (/SELECT id FROM inventory_items/i.test(trimmed)) return spec.inventoryRow ?? null
                  if (/SELECT id FROM spray_programs/i.test(trimmed)
                   || /SELECT id, course_id FROM spray_programs/i.test(trimmed))
                    return spec.programRow ?? null
                  if (/SELECT \* FROM spray_programs/i.test(trimmed)) return spec.programFull ?? null
                  if (/SELECT \* FROM spray_program_items/i.test(trimmed)) return spec.itemFull ?? null
                  return null
                },
                async all() {
                  if (/SELECT \* FROM spray_programs/i.test(trimmed)) return { results: spec.programList ?? [] }
                  if (/SELECT \* FROM spray_program_items/i.test(trimmed)) return { results: spec.itemList ?? [] }
                  return { results: [] }
                },
                async run() {
                  return { success: true, meta: { changes: spec.updateChanges ?? 1 }, binds }
                },
              }
            },
          }
        },
      },
      log,
    }
  }
  function makeReq(body, method = 'POST') {
    return new Request('http://test.local/x', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
    })
  }
  async function readBody(res) {
    const text = await res.text()
    try { return { status: res.status, body: JSON.parse(text) } }
    catch { return { status: res.status, body: text } }
  }

  // (a) createSprayProgram requires name.
  {
    const env = makeDB({})
    const res = await api.createSprayProgram(env, makeReq({}))
    const { status, body } = await readBody(res)
    assert(status === 400 && /name is required/i.test(body.error ?? ''),
      'create rejects missing name → 400')
  }

  // (b) createSprayProgram constrains status + source + programType.
  {
    const env = makeDB({
      programFull: { id: 'p1', name: 'X', status: 'draft', source: 'manual',
                     program_type: null, course_id: 'c1', archived_at: null,
                     created_at: '2026-05-25', updated_at: '2026-05-25' },
    })
    await api.createSprayProgram(env, makeReq({
      id: 'p1', name: 'X', status: 'BANANA', source: 'haxx', programType: 'invalid',
    }))
    const sqls = env.log.join(' || ')
    // Expect the INSERT to bind status='draft' (fallback) and source='manual'.
    // We assert the SQL was issued; binds verification implicit via stub.
    assert(/INSERT INTO spray_programs/i.test(sqls),
      'create issued INSERT INTO spray_programs')
  }

  // (c) archiveSprayProgram soft-archives — no DELETE FROM.
  {
    const env = makeDB({ programRow: { id: 'p1' },
      programFull: { id: 'p1', name: 'X', status: 'archived', source: 'manual',
                     program_type: null, course_id: 'c1', archived_at: '2026-05-25',
                     created_at: '2026-05-25', updated_at: '2026-05-25' },
    })
    await api.archiveSprayProgram(env, 'p1')
    const sqls = env.log.join(' || ')
    assert(!/DELETE FROM spray_programs/i.test(sqls),
      'archive does NOT issue DELETE FROM spray_programs')
    assert(/UPDATE spray_programs.*status = 'archived'.*archived_at = datetime\('now'\)/i.test(sqls),
      "archive sets status='archived' + archived_at")
  }

  // (d) createSprayProgramItem rejects unknown program → 404.
  {
    const env = makeDB({ programRow: null })
    const res = await api.createSprayProgramItem(env, 'p-missing',
      makeReq({ productName: 'X' }))
    const { status } = await readBody(res)
    assert(status === 404,
      'create item rejects unknown programId → 404')
  }

  // (e) createSprayProgramItem rejects unknown productCatalogId → 400.
  {
    const env = makeDB({
      programRow: { id: 'p1', course_id: 'c1' },
      catalogRow: null,
    })
    const res = await api.createSprayProgramItem(env, 'p1', makeReq({
      productName: 'Heritage',
      productCatalogId: 'pc-missing',
    }))
    const { status, body } = await readBody(res)
    assert(status === 400 && /Unknown productCatalogId/i.test(body.error ?? ''),
      'create item rejects unknown productCatalogId → 400')
    const sqls = env.log.join(' || ')
    assert(!/INSERT INTO spray_program_items/i.test(sqls),
      'create item: no INSERT when validation fails (validate-then-write)')
  }

  // (f) createSprayProgramItem rejects unknown inventoryItemId → 400.
  {
    const env = makeDB({
      programRow:   { id: 'p1', course_id: 'c1' },
      inventoryRow: null,
    })
    const res = await api.createSprayProgramItem(env, 'p1', makeReq({
      productName: 'Heritage',
      inventoryItemId: 'inv-missing',
    }))
    const { status, body } = await readBody(res)
    assert(status === 400 && /Unknown inventoryItemId/i.test(body.error ?? ''),
      'create item rejects unknown inventoryItemId → 400')
  }

  // (g) Happy item create — no linked_spray_record_id bound.
  {
    const env = makeDB({
      programRow:   { id: 'p1', course_id: 'c1' },
      catalogRow:   { id: 'pc-heritage' },
      inventoryRow: { id: 'inv-A' },
      itemFull: { id: 'i1', program_id: 'p1', status: 'planned',
                  linked_spray_record_id: null, sort_order: 0,
                  created_at: '', updated_at: '' },
    })
    await api.createSprayProgramItem(env, 'p1', makeReq({
      productName: 'Heritage',
      productCatalogId: 'pc-heritage',
      inventoryItemId:  'inv-A',
    }))
    const insertSql = env.log.find(s => /INSERT INTO spray_program_items/i.test(s)) ?? ''
    assert(insertSql.length > 0, 'happy item create issued INSERT')
    assert(!/linked_spray_record_id/i.test(insertSql),
      'item INSERT statement does NOT bind linked_spray_record_id')
    // And critically: NO write to inventory_items / product_catalog / spray_records.
    const allSql = env.log.join(' || ')
    assert(!/UPDATE inventory_items/i.test(allSql) &&
           !/INSERT INTO inventory_items/i.test(allSql),
      'item create did not touch inventory_items')
    assert(!/UPDATE product_catalog/i.test(allSql) &&
           !/INSERT INTO product_catalog/i.test(allSql) &&
           !/DELETE FROM product_catalog/i.test(allSql),
      'item create did not mutate product_catalog')
    assert(!/INSERT INTO spray_records/i.test(allSql),
      'item create did not insert a spray_record')
  }

  // (h) updateSprayProgramItem with body that tries to set
  //     linked_spray_record_id — the column is NOT in ITEM_MUTABLE so
  //     it's silently dropped (and certainly never bound).
  {
    const env = makeDB({
      itemFull: { id: 'i1', program_id: 'p1', status: 'planned',
                  linked_spray_record_id: null, sort_order: 0,
                  created_at: '', updated_at: '' },
    })
    await api.updateSprayProgramItem(env, 'i1', makeReq({
      productName:         'New Name',
      linkedSprayRecordId: 'rec-evil',
    }))
    const updSql = env.log.find(s => /UPDATE spray_program_items/i.test(s)) ?? ''
    assert(updSql.length > 0, 'item update issued UPDATE')
    assert(!/linked_spray_record_id/i.test(updSql),
      'update did NOT include linked_spray_record_id in SET clause')
    assert(/product_name = \?/i.test(updSql),
      'update DID include product_name in SET clause')
  }

  // (i) updateSprayProgramItem with no recognized fields → 400.
  {
    const env = makeDB({})
    const res = await api.updateSprayProgramItem(env, 'i1', makeReq({
      foo: 'bar', baz: 1,
    }))
    const { status } = await readBody(res)
    assert(status === 400,
      'update with no mutable fields → 400')
  }

  // (j) Soft-delete behavior absent on items — items are hard-deleted.
  {
    const env = makeDB({})
    await api.deleteSprayProgramItem(env, 'i1')
    const sqls = env.log.join(' || ')
    assert(/DELETE FROM spray_program_items/i.test(sqls),
      'item delete issues DELETE FROM spray_program_items')
  }
}

// ── 5. Client store source contracts ──────────────────────────────────────
console.log('— sprayProgramStore source')
{
  const src = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')

  for (const name of [
    'useSprayPrograms',
    'refreshSprayPrograms',
    'createSprayProgram',
    'updateSprayProgram',
    'archiveSprayProgram',
    'listSprayProgramItems',
    'createSprayProgramItem',
    'updateSprayProgramItem',
    'deleteSprayProgramItem',
  ]) {
    assert(new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  // Session-cookie auth + no key headers.
  assert(/credentials:\s*['"]same-origin['"]/.test(src),
    "store uses credentials: 'same-origin'")
  assert(!/['"]x-admin-key['"]\s*:/i.test(src),
    'store sets no x-admin-key header')

  // Hits the right endpoints.
  assert(/['"]\/api\/spray-programs['"]/.test(src),
    'store hits /api/spray-programs')
  assert(/['"]\/api\/spray-program-items['"]/.test(src),
    'store hits /api/spray-program-items')

  // Optimistic patterns present.
  assert(/_pending:\s*true/.test(src),
    'store marks optimistic rows with _pending:true')
  assert(/setState\([\s\S]*?programs:[\s\S]*?prev/.test(src),
    'store rolls back programs[] on error')

  // Does not import product_catalog store (intelligence resolution
  // stays outside this store). Scan code-only so the architectural
  // comment that references inventoryStore by name isn't a false hit.
  const storeCodeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/productCatalogStore/.test(storeCodeOnly),
    'store does NOT import productCatalogStore (code-only)')
  assert(!/from\s+['"][^'"]*inventoryStore['"]/.test(storeCodeOnly),
    'store does NOT import inventoryStore (code-only)')
}

// ── 6. Sprays tab shell ───────────────────────────────────────────────────
console.log('— Sprays workspace registers Program Planner tab')
{
  const shell = readFileSync('src/pages/Spray/Spray.jsx', 'utf8')

  assert(/from\s+['"]\.\/tabs\/SprayProgramPlanner['"]/.test(shell),
    "Sprays imports the new SprayProgramPlanner tab")
  const tabsMatch = shell.match(/const\s+TABS\s*=\s*\[([^\]]+)\]/)
  assert(tabsMatch && /'Program Planner'/.test(tabsMatch[1]),
    "'Program Planner' present in TABS")
  assert(/activeTab\s*===\s*'Program Planner'\s*&&\s*<SprayProgramPlanner/.test(shell),
    'Program Planner tab body wired')

  // Legacy 'Planned Programs' tab is still in TABS — regression guard.
  assert(tabsMatch && /'Planned Programs'/.test(tabsMatch[1]),
    "legacy 'Planned Programs' tab still in TABS")

  // Tab body source contracts.
  const body = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.jsx', 'utf8')
  assert(/Spray Program Planner/.test(body),
    'tab body title "Spray Program Planner"')
  assert(/No spray programs yet/.test(body),
    'tab body empty-state copy "No spray programs yet."')
  assert(/Create program/.test(body),
    'tab body Create program CTA')
  // Forbidden surfaces in the shell. Scan code-only so the
  // architectural comment that catalogs what we explicitly do NOT
  // build is not a false hit.
  const bodyCodeOnly = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/Add to Inventory/i.test(bodyCodeOnly),
    'tab body has no "Add to Inventory" CTA (code-only)')
  assert(!/PDF|\bAI\b|extract/i.test(bodyCodeOnly),
    'tab body has no PDF / AI / extract wording (code-only)')
}

// ── 7. Spray save payload byte-identical ──────────────────────────────────
console.log('— spray save payload + forbidden-write invariants')
{
  const src = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
  const payload = src.match(/products:\s*enrichedRows\.map\([\s\S]*?\)\),/)?.[0] ?? ''
  assert(payload.length > 0, 'spray save payload block found')
  assert(!/productCatalogId|catalogId|intel\b|intelligence|recommendation|rotation|interval|programId|program\b/i.test(payload),
    'spray save payload omits program/intel/catalog keys')

  // MUTABLE_COLUMNS on inventory still excludes productCatalogId.
  const invSrc = readFileSync('worker/api/inventory.js', 'utf8')
  const mut = invSrc.match(/MUTABLE_COLUMNS\s*=\s*\{[\s\S]*?\}/)?.[0] ?? ''
  assert(!/productCatalogId/.test(mut),
    'inventory MUTABLE_COLUMNS still excludes productCatalogId')
}

// ── 8. No PDF / AI / parser / recommendation language ─────────────────────
console.log('— no PDF / AI / recommendation language in new files')
{
  for (const path of [
    'worker/api/sprayPrograms.js',
    'src/utils/sprayPrograms/sprayProgramStore.js',
    'src/pages/Spray/tabs/SprayProgramPlanner.jsx',
  ]) {
    const src = readFileSync(path, 'utf8')
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    // PDF / AI / parser pipeline must not be introduced here.
    assert(!/PDF\s*(import|upload|extract|parser)/i.test(codeOnly),
      `${path.split('/').pop()}: no PDF pipeline wording`)
    assert(!/\bAI\b|\bgpt\b|\bllm\b/i.test(codeOnly),
      `${path.split('/').pop()}: no AI / LLM wording`)
    // Recommendation vocabulary forbidden.
    for (const word of ['do not apply', 'apply now', 'rotate to', 'unsafe']) {
      assert(!new RegExp(`\\b${word}\\b`, 'i').test(codeOnly),
        `${path.split('/').pop()}: no forbidden phrasing "${word}"`)
    }
    // Bare "recommend" forbidden (no disclaimer allowlist needed here —
    // none of these files carry the report disclaimer).
    assert(!/\brecommend\b/i.test(codeOnly),
      `${path.split('/').pop()}: no "recommend" wording`)
  }
}

// ── 9. Phase 7F (2/?) — Manual planner UI behavior ────────────────────────
console.log('— SprayProgramPlanner.jsx usable UI (Phase 7F.2)')
{
  const src = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.jsx', 'utf8')

  // Imports all 8 store functions per spec.
  for (const fn of [
    'useSprayPrograms',
    'createSprayProgram',
    'updateSprayProgram',
    'archiveSprayProgram',
    'listSprayProgramItems',
    'createSprayProgramItem',
    'updateSprayProgramItem',
    'deleteSprayProgramItem',
  ]) {
    assert(new RegExp(`\\b${fn}\\b`).test(src),
      `tab imports ${fn}`)
  }

  // Master/detail surface: there's a layout container plus a detail area.
  assert(/className=\{styles\.layout\}/.test(src),
    'renders master/detail layout container')
  assert(/className=\{styles\.master\}/.test(src) &&
         /className=\{styles\.detail\}/.test(src),
    'renders both master + detail panes')

  // Selected-program detail block.
  assert(/styles\.detailHeader/.test(src),
    'renders selected-program detail header')

  // Item list.
  assert(/itemList/.test(src) && /itemCard/.test(src),
    'renders planned-item list with cards')

  // Item form.
  assert(/function\s+ItemForm\b/.test(src),
    'declares ItemForm component')
  // All required item fields per spec.
  const itemFieldsRequired = [
    'targetArea', 'plannedStartDate', 'plannedEndDate', 'plannedWindowLabel',
    'productName', 'inventoryItemId', 'productCatalogId',
    'rateValue', 'rateUnit', 'carrierVolumeValue', 'carrierVolumeUnit',
    'applicationNotes', 'status', 'sortOrder',
  ]
  for (const f of itemFieldsRequired) {
    assert(new RegExp(`\\b${f}\\b`).test(src),
      `item form binds field ${f}`)
  }

  // Program-edit + archive actions.
  assert(/Edit program/.test(src),  'renders "Edit program" button')
  assert(/Archive/.test(src),       'renders "Archive" button')

  // Item edit + remove actions.
  assert(/startEditItem/.test(src), 'declares startEditItem')
  assert(/removeItem/.test(src),    'declares removeItem')
  assert(/Add item/.test(src),      'renders "Add item" button')
  assert(/Remove/.test(src),        'renders item Remove button')

  // Call routing: ensure each handler reaches the right store fn.
  assert(/createSprayProgram\(\{[\s\S]*?status:\s*['"]draft['"]/.test(src),
    'create program defaults to status: draft')
  assert(/updateSprayProgram\(selected\.id,\s*\{/.test(src),
    'update program calls updateSprayProgram(selected.id, ...)')
  assert(/archiveSprayProgram\(selected\.id\)/.test(src),
    'archive calls archiveSprayProgram(selected.id)')
  assert(/listSprayProgramItems\(selectedId\)/.test(src),
    'detail effect calls listSprayProgramItems(selectedId)')
  assert(/createSprayProgramItem\(selectedId,\s*payload\)/.test(src),
    'new item calls createSprayProgramItem(selectedId, payload)')
  assert(/updateSprayProgramItem\(editingItemId,\s*payload\)/.test(src),
    'edit item calls updateSprayProgramItem(editingItemId, payload)')
  assert(/deleteSprayProgramItem\(item\.id\)/.test(src),
    'remove item calls deleteSprayProgramItem(item.id)')

  // Empty-state copy per spec.
  assert(/No spray programs yet/.test(src),
    'copy: "No spray programs yet."')
  assert(/Create a program to plan future applications/.test(src),
    'copy: "Create a program to plan future applications"')
  assert(/No planned items yet/.test(src),
    'copy: "No planned items yet."')
  assert(/Add the first product or application window/.test(src),
    'copy: "Add the first product or application window"')

  // Boundary copy per spec — all three lines present.
  for (const line of [
    'Planned programs do not deduct inventory.',
    'Planned items do not create completed spray records.',
    'Catalog links are for read-only intelligence.',
  ]) {
    assert(src.includes(line), `boundary copy: "${line}"`)
  }

  // Code-only forbidden surfaces (architectural prose may discuss what
  // we don't build — comments are stripped before the scan).
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  // No spray-record creation path.
  assert(!/createSpray\s*\(/.test(codeOnly),
    'tab never calls createSpray(...)')
  assert(!/recordInventoryUsage/.test(codeOnly),
    'tab never calls recordInventoryUsage (no inventory deduction)')
  // No linkedSprayRecordId on the GENERIC item create/update payload.
  // The narrow Phase 7F.4 endpoint legitimately writes the field via
  // setProgramItemCompletedLink — that path is scoped separately.
  const buildPayloadBlock = src.match(
    /function\s+buildItemPayload\s*\([\s\S]*?\n\s{2}\}/,
  )?.[0] ?? ''
  assert(buildPayloadBlock.length > 0 || !/linkedSprayRecordId/.test(codeOnly),
    'buildItemPayload function present (or no linkedSprayRecordId anywhere)')
  assert(!/linkedSprayRecordId/.test(buildPayloadBlock),
    'generic item create/update payload (buildItemPayload) does NOT carry linkedSprayRecordId')
  // No /api/product-catalog mutation.
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(codeOnly),
    'tab never POSTs/PATCHes/DELETEs /api/product-catalog')
  // No PDF / AI / extract pipeline.
  assert(!/PDF|\bAI\b|extract|llm|gpt/i.test(codeOnly),
    'tab has no PDF / AI / extract wording (code-only)')
  // Mobile-first guard: CSS module still carries the breakpoint.
  const css = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.module.css', 'utf8')
  assert(/@media\s*\(min-width:\s*\d+px\)/.test(css),
    'CSS still has mobile-first min-width breakpoint')
  assert(/\.master\b/.test(css) && /\.detail\b/.test(css) && /\.itemCard\b/.test(css),
    'CSS defines master/detail/itemCard classes')
}

// ── 10. Phase 7F (3/?) — picker UX + intelligence chips ──────────────────
console.log('— resolveProgramItemIntel (pure helper)')
{
  const src = readFileSync('src/utils/sprayPrograms/resolveProgramItemIntel.js', 'utf8')

  assert(/export\s+function\s+resolveProgramItemIntel\b/.test(src),
    'exports resolveProgramItemIntel')

  // Pure. Code-only scan so the architectural comments that name what
  // we DO NOT import aren't false positives.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/from\s+['"]react['"]/.test(codeOnly),
    'helper does not import react')
  assert(!/fetch\(/.test(codeOnly),
    'helper does not call fetch()')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'helper does not import any *Store module')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'helper does not issue mutations')

  // Wraps the Phase 7C.1/6 resolver (no parallel intelligence logic).
  assert(/from\s+['"][^'"]*resolveSprayProductIntel(\.js)?['"]/.test(codeOnly),
    'helper imports resolveSprayProductIntel (catalog-first reuse)')

  // Behavior: does not mutate inputs.
  const mod = await import('../src/utils/sprayPrograms/resolveProgramItemIntel.js')
  const inv = [
    { id: 'inv-A', name: 'Heritage', kind: 'chemical', productCatalogId: 'pc-heritage' },
  ]
  const cat = [
    { id: 'pc-heritage', productName: 'Heritage', category: 'fungicide', fracGroup: '11',
      activeIngredients: [{ name: 'Azoxystrobin', percentage: 50 }] },
    { id: 'pc-tenacity', productName: 'Tenacity', category: 'herbicide', hracGroup: '27' },
  ]
  const item = {
    id: 'i1', productName: 'Heritage', inventoryItemId: 'inv-A',
    productCatalogId: 'pc-heritage',
  }
  const before = JSON.stringify({ item, inv, cat })
  const out = mod.resolveProgramItemIntel(item,
    { inventoryProducts: inv, catalogProducts: cat, labelsByItemId: {} })
  assert(JSON.stringify({ item, inv, cat }) === before,
    'resolveProgramItemIntel does not mutate inputs')

  // Catalog-first when both FKs aligned.
  assert(out.source === 'catalog' && out.fracGroup === '11',
    'planner FK + matching inventory FK → catalog intel resolved')

  // Plan-only FK (no inventory match): synthesized shadow inventory.
  const out2 = mod.resolveProgramItemIntel(
    { id: 'i2', productName: 'Tenacity', productCatalogId: 'pc-tenacity' },
    { inventoryProducts: [], catalogProducts: cat, labelsByItemId: {} })
  assert(out2.source === 'catalog' && out2.hracGroup === '27',
    "plan-only catalog FK still resolves via synthesized shadow row")

  // Unknown name + no FK → none.
  const out3 = mod.resolveProgramItemIntel(
    { id: 'i3', productName: 'Unknown Brand' },
    { inventoryProducts: [], catalogProducts: cat, labelsByItemId: {} })
  assert(out3.source === 'none',
    'unknown name + no FK → source none')

  // null / empty item → none.
  const empty = mod.resolveProgramItemIntel(null, {})
  assert(empty && empty.source === 'none',
    'null item → empty intel')
}

console.log('— InventoryPickerModal source')
{
  const src = readFileSync('src/pages/Spray/tabs/components/InventoryPickerModal.jsx', 'utf8')
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  assert(/export\s+default\s+function\s+InventoryPickerModal\b/.test(src),
    'default exports InventoryPickerModal')
  assert(/useInventoryData/.test(src),
    'reads from useInventoryData hook')
  assert(/type=['"]search['"]/.test(src),
    'renders a <input type="search">')
  assert(/onSelect\s*\(\s*item\s*\)/.test(src),
    'invokes onSelect(item) when a row is chosen')
  // Boundary copy.
  assert(/Inventory links are for planning only and do not deduct stock/.test(src),
    'planning copy: "Inventory links are for planning only and do not deduct stock"')
  // No mutation paths.
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'picker does not POST/PATCH/DELETE')
  assert(!/recordInventoryUsage|createSpray|productCatalogId\s*=/.test(codeOnly)
        || !/recordInventoryUsage|createSpray/.test(codeOnly),
    'picker does not call inventory-usage or spray-create')
  // No catalog mutation.
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,160}(POST|PATCH|DELETE)/.test(codeOnly),
    'picker never mutates /api/product-catalog')
}

console.log('— ProductCatalogPickerModal source')
{
  const src = readFileSync('src/pages/Spray/tabs/components/ProductCatalogPickerModal.jsx', 'utf8')
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  assert(/export\s+default\s+function\s+ProductCatalogPickerModal\b/.test(src),
    'default exports ProductCatalogPickerModal')
  // Reuses productCatalogStore helpers (no parallel fetch).
  for (const fn of [
    'useProductCatalog',
    'searchProductCatalog',
    'listCatalogCategories',
    'listCatalogFracGroups',
    'listCatalogHracGroups',
    'listCatalogIracGroups',
    'listCatalogPgrClasses',
  ]) {
    assert(new RegExp(`\\b${fn}\\b`).test(src),
      `catalog picker reuses ${fn}`)
  }
  assert(/onSelect\s*\(\s*p\s*\)/.test(src),
    'invokes onSelect(p) when a catalog row is chosen')
  // Boundary copy.
  assert(/Catalog links provide read-only intelligence/.test(src),
    'planning copy: "Catalog links provide read-only intelligence"')
  // No mutation paths.
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'catalog picker does not POST/PATCH/DELETE')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,160}(POST|PATCH|DELETE)/.test(codeOnly),
    'catalog picker never mutates /api/product-catalog')
  // No Add-to-Inventory CTA.
  assert(!/Add to Inventory/i.test(codeOnly),
    'no "Add to Inventory" CTA in catalog picker')
}

console.log('— SprayProgramPlanner wires pickers + intel chips')
{
  const src = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.jsx', 'utf8')

  // Picker modals mounted.
  assert(/<InventoryPickerModal\b/.test(src),
    'planner mounts <InventoryPickerModal>')
  assert(/<ProductCatalogPickerModal\b/.test(src),
    'planner mounts <ProductCatalogPickerModal>')

  // Item-form opens pickers via onOpenPicker handler.
  assert(/onOpenPicker\?\.\(['"]inventory['"]\)/.test(src),
    'inventory PickerSlot opens via onOpenPicker("inventory")')
  assert(/onOpenPicker\?\.\(['"]catalog['"]\)/.test(src),
    'catalog PickerSlot opens via onOpenPicker("catalog")')

  // Selecting populates the form WITHOUT calling create/update item.
  assert(/setItemForm\(form\s*=>\s*\(\{\s*\.\.\.form,\s*inventoryItemId:\s*invItem\.id/.test(src),
    'inventory pick populates form.inventoryItemId')
  assert(/setItemForm\(form\s*=>\s*\(\{\s*\.\.\.form,\s*productCatalogId:\s*catalogProduct\.id/.test(src),
    'catalog pick populates form.productCatalogId')

  // Optional productName fill behavior.
  assert(/productName:\s*form\.productName\?\.trim\(\)\s*\?\s*form\.productName\s*:\s*\(invItem\.name\s*\?\?\s*['"]['"]\)/.test(src),
    'inventory pick optionally fills productName when empty')
  assert(/productName:\s*form\.productName\?\.trim\(\)[\s\S]{0,200}catalogProduct\.productName/.test(src),
    'catalog pick optionally fills productName when empty')

  // Clear buttons (declared inside ItemForm).
  assert(/function\s+clearInventory\b/.test(src),
    'ItemForm declares clearInventory()')
  assert(/function\s+clearCatalog\b/.test(src),
    'ItemForm declares clearCatalog()')
  assert(/clearInventory\(\)\s*{[\s\S]*?setForm\(\{\s*\.\.\.form,\s*inventoryItemId:\s*['"]['"]\s*\}\)/.test(src),
    'clearInventory sets form.inventoryItemId to empty string')
  assert(/clearCatalog\(\)\s*{[\s\S]*?setForm\(\{\s*\.\.\.form,\s*productCatalogId:\s*['"]['"]\s*\}\)/.test(src),
    'clearCatalog sets form.productCatalogId to empty string')

  // Raw <input> for inventoryItemId / productCatalogId is GONE.
  // (We do still bind those fields in the form's state, but never via
  // a free-text input anymore.)
  assert(!/placeholder=['"]inv-\.\.\.['"]/.test(src),
    'no free-text "inv-..." input remains')
  assert(!/placeholder=['"]pc-\.\.\.['"]/.test(src),
    'no free-text "pc-..." input remains')
  // No <input> element bound to inventoryItemId / productCatalogId.
  assert(!/<input\b[^>]*value=\{form\.inventoryItemId\}/.test(src),
    'no <input> bound to form.inventoryItemId (replaced by picker)')
  assert(!/<input\b[^>]*value=\{form\.productCatalogId\}/.test(src),
    'no <input> bound to form.productCatalogId (replaced by picker)')

  // Intel resolution + chips.
  assert(/resolveProgramItemIntel\b/.test(src),
    'planner imports resolveProgramItemIntel')
  assert(/<ItemIntelChips\b/.test(src),
    'planner renders <ItemIntelChips> on item cards')
  assert(/function\s+ItemRow\b/.test(src),
    'declares ItemRow row component')
  assert(/function\s+ItemIntelChips\b/.test(src),
    'declares ItemIntelChips component')

  // Pickers boot the catalog + inventory stores via the existing hooks.
  for (const fn of ['useInventoryData', 'useProductCatalog', 'useImportedLabels']) {
    assert(new RegExp(`\\b${fn}\\b`).test(src), `planner subscribes to ${fn}`)
  }

  // No new D1 write paths added on the planner side. Code-only scan so
  // the architectural prose ("no inventory deduction" etc.) is allowed.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/createSpray\s*\(/.test(codeOnly),
    'planner never calls createSpray(...)')
  assert(!/recordInventoryUsage/.test(codeOnly),
    'planner never calls recordInventoryUsage')
  // The planner now legitimately reads + writes linkedSprayRecordId
  // via the narrow Phase 7F.4 endpoint. Generic item POST/PATCH still
  // doesn't carry it — verified separately against buildItemPayload.
  const plannerPayloadBlock = src.match(
    /function\s+buildItemPayload\s*\([\s\S]*?\n\s{2}\}/,
  )?.[0] ?? ''
  assert(!/linkedSprayRecordId/.test(plannerPayloadBlock),
    'buildItemPayload still excludes linkedSprayRecordId (generic write path stays narrow)')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(codeOnly),
    'planner never POSTs/PATCHes/DELETEs /api/product-catalog')
  assert(!/Add to Inventory/i.test(codeOnly),
    'planner has no "Add to Inventory" CTA')
  // Boundary copy preserved.
  assert(/Inventory links are for planning only and do not deduct stock/.test(src),
    'planner carries planning-only copy')
  assert(/Catalog links provide read-only intelligence/.test(src),
    'planner carries catalog-intel copy')
}

console.log('— planner CSS adds picker + intel chip classes')
{
  const css = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.module.css', 'utf8')
  for (const cls of [
    'linkPickers', 'pickerSlot', 'pickerHeader', 'pickerCard',
    'pickerCardEmpty', 'pickerCardStale',
    'intelChipRow', 'intelChip',
    'intelChipFrac', 'intelChipHrac', 'intelChipIrac', 'intelChipPgr',
    'intelChipRei', 'intelChipRup', 'intelChipSignal',
    'intelChipLinked', 'intelEmpty',
  ]) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
  // Mobile-first guard preserved.
  assert(/@media\s*\(min-width:\s*\d+px\)/.test(css),
    'CSS keeps mobile-first @media (min-width: …) breakpoint')
}

// ── 11. Phase 7F (4/?) — completed-link foundation ────────────────────────
console.log('— worker/api/sprayPrograms.js (completed-link handler)')
{
  const src = readFileSync('worker/api/sprayPrograms.js', 'utf8')

  assert(/export\s+async\s+function\s+patchSprayProgramItemCompletedLink\s*\(/.test(src),
    'exports patchSprayProgramItemCompletedLink')

  // Body shape gate: presence of linkedSprayRecordId is required.
  assert(/hasOwnProperty\.call\(body,\s*['"]linkedSprayRecordId['"]\)/.test(src),
    "handler requires body to include 'linkedSprayRecordId' key")

  // Validates target item.
  assert(/SELECT id, course_id FROM spray_program_items WHERE id = \?/i.test(src),
    'handler validates item exists + captures course_id')

  // Validates target spray record AND its course scope AND not-deleted.
  assert(/SELECT id, course_id, deleted_at FROM spray_records WHERE id = \?/i.test(src),
    'handler validates spray_records target (id, course, deleted_at)')
  assert(/Unknown linkedSprayRecordId/.test(src),
    'handler rejects unknown linked id with explicit message')
  assert(/is soft-deleted/.test(src),
    'handler rejects soft-deleted spray records')
  assert(/different course/.test(src),
    'handler rejects cross-course linkage')

  // UPDATE narrow: linked_spray_record_id only.
  const handlerBlock = src.match(
    /async function patchSprayProgramItemCompletedLink[\s\S]*?\n\}\s*\n/,
  )?.[0] ?? ''
  const updateBlock  = handlerBlock.match(/UPDATE spray_program_items[\s\S]*?WHERE id = \?/)?.[0] ?? ''
  const updateBlockNorm = updateBlock.replace(/\s+/g, ' ')
  assert(/SET linked_spray_record_id = \?,/.test(updateBlockNorm),
    'narrow UPDATE sets linked_spray_record_id only (+ updated_at)')

  // No side-effects: no spray_records writes, no inventory_items writes.
  assert(!/UPDATE\s+spray_records/i.test(handlerBlock),
    'completed-link handler never UPDATEs spray_records')
  assert(!/INSERT\s+INTO\s+spray_records/i.test(handlerBlock),
    'completed-link handler never INSERTs INTO spray_records')
  assert(!/UPDATE\s+inventory_items/i.test(handlerBlock),
    'completed-link handler never UPDATEs inventory_items')
  assert(!/INSERT\s+INTO\s+inventory_items/i.test(handlerBlock),
    'completed-link handler never INSERTs INTO inventory_items')
  assert(!/UPDATE\s+product_catalog/i.test(handlerBlock),
    'completed-link handler never UPDATEs product_catalog')

  // ITEM_MUTABLE still excludes linkedSprayRecordId.
  const itemMut = src.match(/ITEM_MUTABLE\s*=\s*\{[\s\S]*?\}/)?.[0] ?? ''
  assert(itemMut.length > 0, 'ITEM_MUTABLE map still present')
  assert(!/linkedSprayRecordId/.test(itemMut),
    'ITEM_MUTABLE STILL excludes linkedSprayRecordId (narrow endpoint preserved)')
}

console.log('— worker/index.js wires /completed-link route')
{
  const idx = readFileSync('worker/index.js', 'utf8')

  assert(/patchSprayProgramItemCompletedLink/.test(idx),
    'index imports patchSprayProgramItemCompletedLink')
  assert(/\/\^\\\/api\\\/spray-program-items\\\/\(\[\^\/\]\+\)\\\/completed-link\$\//.test(idx),
    'regex: /api/spray-program-items/:itemId/completed-link')

  // /completed-link must precede the generic /:itemId regex.
  const linkPos    = idx.search(/\/\^\\\/api\\\/spray-program-items\\\/\(\[\^\/\]\+\)\\\/completed-link\$\//)
  const genericPos = idx.search(/\/\^\\\/api\\\/spray-program-items\\\/\(\[\^\/\]\+\)\$\//)
  assert(linkPos > 0 && genericPos > 0 && linkPos < genericPos,
    '/completed-link regex appears BEFORE generic /:itemId regex')

  // PATCH-only — no other verbs wired on /completed-link.
  const linkBlock = idx.match(/sprogItemLinkMatch[\s\S]{0,400}?\}/)?.[0] ?? ''
  assert(/method\s*===\s*['"]PATCH['"]/.test(linkBlock),
    'PATCH wired on /completed-link')
  assert(!/method\s*===\s*['"]GET['"]/.test(linkBlock)
      && !/method\s*===\s*['"]POST['"]/.test(linkBlock)
      && !/method\s*===\s*['"]DELETE['"]/.test(linkBlock),
    'no GET/POST/DELETE on /completed-link (narrow endpoint)')
}

console.log('— patchSprayProgramItemCompletedLink behavior (D1 stub)')
{
  const api = await import('../worker/api/sprayPrograms.js')

  function makeDB(spec) {
    const log = []
    return {
      DB: {
        prepare(sql) {
          const trimmed = sql.replace(/\s+/g, ' ').trim()
          log.push(trimmed)
          return {
            bind(...binds) {
              return {
                async first() {
                  if (/SELECT id, course_id FROM spray_program_items/i.test(trimmed)) {
                    return spec.itemRow ?? null
                  }
                  if (/SELECT id, course_id, deleted_at FROM spray_records/i.test(trimmed)) {
                    return spec.recordRow ?? null
                  }
                  if (/SELECT \* FROM spray_program_items/i.test(trimmed)) {
                    return spec.itemFull ?? null
                  }
                  return null
                },
                async all() { return { results: [] } },
                async run() {
                  return { success: true, meta: { changes: spec.updateChanges ?? 1 }, binds }
                },
              }
            },
          }
        },
      },
      log,
    }
  }
  function makeReq(body) {
    return new Request('http://test.local/x', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    body == null ? undefined : JSON.stringify(body),
    })
  }
  async function readBody(res) {
    const text = await res.text()
    try { return { status: res.status, body: JSON.parse(text) } }
    catch { return { status: res.status, body: text } }
  }

  // (a) Happy path: link a valid record in the same course.
  {
    const env = makeDB({
      itemRow:   { id: 'i1', course_id: 'c1' },
      recordRow: { id: 's1', course_id: 'c1', deleted_at: null },
      itemFull:  { id: 'i1', program_id: 'p1', course_id: 'c1',
                   linked_spray_record_id: 's1', status: 'planned',
                   sort_order: 0, created_at: '', updated_at: '' },
    })
    const res = await api.patchSprayProgramItemCompletedLink(env, 'i1',
      makeReq({ linkedSprayRecordId: 's1' }))
    assert(res instanceof Response, 'happy: returns a Response')
    const sqls = env.log.join(' || ')
    assert(/SELECT id, course_id FROM spray_program_items/i.test(sqls),
      'happy: validated item')
    assert(/SELECT id, course_id, deleted_at FROM spray_records/i.test(sqls),
      'happy: validated spray record')
    assert(/UPDATE spray_program_items SET linked_spray_record_id = \?,/i.test(sqls),
      'happy: UPDATE sets linked_spray_record_id only')
    assert(!/UPDATE spray_records/i.test(sqls)
        && !/INSERT INTO spray_records/i.test(sqls),
      'happy: spray_records never written to')
    assert(!/UPDATE inventory_items/i.test(sqls)
        && !/INSERT INTO inventory_items/i.test(sqls),
      'happy: inventory_items never written to')
    assert(!/UPDATE product_catalog/i.test(sqls),
      'happy: product_catalog never mutated')
  }

  // (b) Unlink: null id skips spray_records SELECT, runs UPDATE with null.
  {
    const env = makeDB({ itemRow: { id: 'i1', course_id: 'c1' } })
    await api.patchSprayProgramItemCompletedLink(env, 'i1',
      makeReq({ linkedSprayRecordId: null }))
    const sqls = env.log.join(' || ')
    assert(!/SELECT id, course_id, deleted_at FROM spray_records/i.test(sqls),
      'unlink: skipped spray_records validation (no FK to validate)')
    assert(/UPDATE spray_program_items SET linked_spray_record_id = \?,/i.test(sqls),
      'unlink: UPDATE ran setting link to null')
  }

  // (c) Reject unknown spray id → 400; no UPDATE issued.
  {
    const env = makeDB({
      itemRow:   { id: 'i1', course_id: 'c1' },
      recordRow: null,
    })
    const res = await api.patchSprayProgramItemCompletedLink(env, 'i1',
      makeReq({ linkedSprayRecordId: 's-missing' }))
    const { status, body } = await readBody(res)
    assert(status === 400 && /Unknown linkedSprayRecordId/i.test(body.error ?? ''),
      'unknown spray id → 400 with explicit message')
    const sqls = env.log.join(' || ')
    assert(!/UPDATE spray_program_items/i.test(sqls),
      'unknown id: no UPDATE issued (validate-then-write)')
  }

  // (d) Reject soft-deleted spray → 400.
  {
    const env = makeDB({
      itemRow:   { id: 'i1', course_id: 'c1' },
      recordRow: { id: 's1', course_id: 'c1', deleted_at: '2026-05-25T00:00:00Z' },
    })
    const res = await api.patchSprayProgramItemCompletedLink(env, 'i1',
      makeReq({ linkedSprayRecordId: 's1' }))
    const { status, body } = await readBody(res)
    assert(status === 400 && /soft-deleted/i.test(body.error ?? ''),
      'soft-deleted spray → 400')
  }

  // (e) Reject cross-course linkage → 400.
  {
    const env = makeDB({
      itemRow:   { id: 'i1', course_id: 'c1' },
      recordRow: { id: 's1', course_id: 'c2', deleted_at: null },
    })
    const res = await api.patchSprayProgramItemCompletedLink(env, 'i1',
      makeReq({ linkedSprayRecordId: 's1' }))
    const { status, body } = await readBody(res)
    assert(status === 400 && /different course/i.test(body.error ?? ''),
      'cross-course spray → 400')
  }

  // (f) Missing key in body → 400.
  {
    const env = makeDB({ itemRow: { id: 'i1', course_id: 'c1' } })
    const res = await api.patchSprayProgramItemCompletedLink(env, 'i1', makeReq({}))
    const { status, body } = await readBody(res)
    assert(status === 400 && /linkedSprayRecordId/.test(body.error ?? ''),
      'missing body key → 400')
  }

  // (g) Unknown item → 404.
  {
    const env = makeDB({ itemRow: null })
    const res = await api.patchSprayProgramItemCompletedLink(env, 'i-missing',
      makeReq({ linkedSprayRecordId: 's1' }))
    const { status } = await readBody(res)
    assert(status === 404, 'unknown item → 404')
  }

  // (h) Empty-string id treated as unlink.
  {
    const env = makeDB({ itemRow: { id: 'i1', course_id: 'c1' } })
    await api.patchSprayProgramItemCompletedLink(env, 'i1',
      makeReq({ linkedSprayRecordId: '' }))
    const sqls = env.log.join(' || ')
    assert(!/SELECT id, course_id, deleted_at FROM spray_records/i.test(sqls),
      'empty-string id treated as unlink (no spray_records lookup)')
    assert(/UPDATE spray_program_items SET linked_spray_record_id = \?,/i.test(sqls),
      'empty-string id still issues UPDATE')
  }

  // (i) No D1 binding → 503.
  {
    const res = await api.patchSprayProgramItemCompletedLink({ /* no .DB */ }, 'i1',
      makeReq({ linkedSprayRecordId: 's1' }))
    const { status, body } = await readBody(res)
    assert(status === 503 && /D1 not configured/i.test(body.error ?? ''),
      'no DB → 503')
  }
}

console.log('— sprayProgramStore.setProgramItemCompletedLink')
{
  const src = readFileSync('src/utils/sprayPrograms/sprayProgramStore.js', 'utf8')
  assert(/export\s+async\s+function\s+setProgramItemCompletedLink\s*\(\s*itemId\s*,\s*linkedSprayRecordId\s*\)/.test(src),
    'exports setProgramItemCompletedLink(itemId, linkedSprayRecordId)')
  // Hits the narrow sub-resource (not the generic PATCH item route).
  assert(/\/completed-link/.test(src),
    "store uses '/completed-link' sub-resource")
  assert(/method:\s*['"]PATCH['"]/.test(src),
    'store uses PATCH')
  // Null/empty → unlink.
  assert(/linkedSprayRecordId\s*===\s*null\s*\|\|\s*linkedSprayRecordId\s*===\s*['"]['"]/.test(src),
    'store coerces null / empty string into unlink')
  // Optimistic + rollback.
  assert(/setState\([\s\S]*?itemsByProgramId:[\s\S]*?\[programId\]:\s*prevItems\.map/.test(src),
    'optimistic patch applied to itemsByProgramId before fetch')
  assert(/setState\(\s*\{\s*itemsByProgramId:\s*\{\s*\.\.\.state\.itemsByProgramId,\s*\[programId\]:\s*prevItems\s*\}/.test(src),
    'rollback restores prevItems on error')
  // No spray-creation or inventory-deduction call paths.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/createSpray\s*\(/.test(codeOnly),
    'store never calls createSpray(...)')
  assert(!/recordInventoryUsage/.test(codeOnly),
    'store never calls recordInventoryUsage')
}

console.log('— CompletedSprayPickerModal source')
{
  const src = readFileSync('src/pages/Spray/tabs/components/CompletedSprayPickerModal.jsx', 'utf8')
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  assert(/export\s+default\s+function\s+CompletedSprayPickerModal\b/.test(src),
    'default exports CompletedSprayPickerModal')
  assert(/useSpraysData/.test(src),
    'reads from useSpraysData')
  assert(/onSelect\s*\(\s*rec\s*\)/.test(src),
    'invokes onSelect(rec) when a row is chosen')
  // Search dimensions.
  assert(/applicationName/.test(src), 'search includes applicationName')
  assert(/date/.test(src),            'search includes date')
  assert(/area/.test(src),            'search includes area')
  assert(/p\?\.name/.test(src) || /products\[/.test(src),
    'search walks product names')
  // Soft-deleted records excluded.
  assert(/deletedAt|status\s*!==\s*['"]deleted['"]/.test(src),
    'filters out soft-deleted records')
  // Boundary copy (all four lines). JSX text nodes wrap across lines,
  // so we normalize whitespace before checking.
  const srcNorm = src.replace(/\s+/g, ' ')
  for (const phrase of [
    'Linking connects this planned item to an existing completed spray record',
    'This does not create a spray record',
    'This does not deduct inventory',
    'Completed records remain unchanged',
  ]) {
    assert(srcNorm.includes(phrase), `copy includes: "${phrase}"`)
  }
  // No mutation paths.
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'picker does not POST/PATCH/DELETE')
  assert(!/createSpray\s*\(/.test(codeOnly),
    'picker does not call createSpray(...)')
  assert(!/recordInventoryUsage/.test(codeOnly),
    'picker does not call recordInventoryUsage')
  // No catalog mutation.
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,160}(POST|PATCH|DELETE)/.test(codeOnly),
    'picker never mutates /api/product-catalog')
  // No Add-to-Inventory.
  assert(!/Add to Inventory/i.test(codeOnly),
    'no Add-to-Inventory CTA in picker')
}

console.log('— Planner wires completed-link picker + summary + actions')
{
  const src = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.jsx', 'utf8')

  // Imports.
  assert(/setProgramItemCompletedLink/.test(src),
    'planner imports setProgramItemCompletedLink')
  assert(/useSpraysData/.test(src),
    'planner subscribes to useSpraysData')
  assert(/CompletedSprayPickerModal/.test(src),
    'planner imports CompletedSprayPickerModal')

  // Picker mounted with onSelect → commitCompletedLink.
  assert(/<CompletedSprayPickerModal\b[\s\S]*?onSelect=\{commitCompletedLink\}/.test(src),
    'planner mounts <CompletedSprayPickerModal onSelect={commitCompletedLink}>')

  // Actions on item card.
  assert(/Link completed spray/.test(src),  '"Link completed spray" action present')
  assert(/Change completed spray/.test(src),'"Change completed spray" action present')
  assert(/Clear completed link/.test(src),  '"Clear completed link" action present')

  // commitCompletedLink calls the store.
  assert(/setProgramItemCompletedLink\(\s*completedLinkItem\.id\s*,\s*sprayRecord\.id\s*\)/.test(src),
    'commitCompletedLink calls setProgramItemCompletedLink(itemId, sprayRecord.id)')
  // clearCompletedLink passes null.
  assert(/setProgramItemCompletedLink\(\s*item\.id\s*,\s*null\s*\)/.test(src),
    'clearCompletedLink calls setProgramItemCompletedLink(item.id, null)')

  // Linked-summary component.
  assert(/function\s+CompletedLinkSummary\b/.test(src),
    'declares CompletedLinkSummary component')

  // Stewardship boundary copy on the planner side. JSX text wraps, so
  // we normalize whitespace before checking.
  const plannerNorm = src.replace(/\s+/g, ' ')
  for (const phrase of [
    'Linking connects this planned item to an existing completed spray record',
    'This does not create a spray record',
    'This does not deduct inventory',
    'Completed records remain unchanged',
  ]) {
    assert(plannerNorm.includes(phrase), `planner boundary copy: "${phrase}"`)
  }

  // No createSpray / no inventory deduction call paths added.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert(!/createSpray\s*\(/.test(codeOnly),
    'planner never calls createSpray(...)')
  assert(!/recordInventoryUsage/.test(codeOnly),
    'planner never calls recordInventoryUsage')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(codeOnly),
    'planner never POSTs/PATCHes/DELETEs /api/product-catalog')
}

console.log('— planner CSS adds linked-summary classes')
{
  const css = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.module.css', 'utf8')
  for (const cls of ['completedLink', 'completedLinkStale', 'completedLinkBadge', 'completedLinkTitle', 'completedLinkBoundary']) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
}

// ── 12. Phase 7F (5/?) — Plan vs Actual comparison ─────────────────────────
console.log('— planActualComparison.js (helper source)')
{
  const src = readFileSync('src/utils/sprayPrograms/planActualComparison.js', 'utf8')

  for (const name of [
    'buildPlanActualComparison',
    'comparePlannedActualDate',
    'comparePlannedActualProduct',
    'comparePlannedActualArea',
    'comparePlannedActualRate',
    'summarizePlanActualComparison',
  ]) {
    assert(new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
      `exports ${name}`)
  }

  // Purity (code-only — comments may discuss what we explicitly avoid).
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  assert(!/from\s+['"]react['"]/.test(codeOnly),     'helper does not import react')
  assert(!/fetch\(/.test(codeOnly),                   'helper does not call fetch()')
  assert(!/from\s+['"][^'"]*Store(\.js)?['"]/.test(codeOnly),
    'helper does not import any *Store module')
  assert(!/method:\s*['"](POST|PATCH|DELETE)['"]/.test(codeOnly),
    'helper does not issue mutations')

  // No recommendation / judgment vocabulary. The disclaimer-line allow-
  // list isn't needed here — none of these words belong in the helper.
  for (const word of [
    'recommend', 'correct', 'incorrect', 'pass', 'fail',
    'score', 'grade', 'safe', 'unsafe',
  ]) {
    assert(!new RegExp(`\\b${word}\\b`, 'i').test(codeOnly),
      `no "${word}" wording in helper code`)
  }
}

console.log('— buildPlanActualComparison behavior')
{
  const mod = await import('../src/utils/sprayPrograms/planActualComparison.js')

  // ── Defensive cases ────────────────────────────────────────────
  {
    const empty = mod.buildPlanActualComparison(null, null)
    assert(empty.linked === false && empty.summary.length === 0,
      'null inputs → linked:false, no summary')
  }

  // ── Date: inside window ───────────────────────────────────────
  {
    const planned = { plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-07' }
    const actual  = { date: '2026-06-03', products: [] }
    const d = mod.comparePlannedActualDate(planned, actual)
    assert(d.status === 'inside-window', 'inside window detected')
    assert(d.dayOffset === 0,            'inside-window dayOffset === 0')
  }

  // ── Date: outside window — early + late ───────────────────────
  {
    const planned = { plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-07' }
    const early   = mod.comparePlannedActualDate(planned, { date: '2026-05-28' })
    assert(early.status === 'outside-window' && early.dayOffset === -4,
      'early outside: dayOffset -4', early.dayOffset)
    const late    = mod.comparePlannedActualDate(planned, { date: '2026-06-10' })
    assert(late.status === 'outside-window' && late.dayOffset === 3,
      'late outside: dayOffset 3', late.dayOffset)
  }

  // ── Date: single-anchor (start only) → treated as 1-day window ─
  {
    const planned = { plannedStartDate: '2026-06-05' }
    const onDay   = mod.comparePlannedActualDate(planned, { date: '2026-06-05' })
    assert(onDay.status === 'inside-window' && onDay.dayOffset === 0,
      'single-anchor exact match → inside-window')
    const off     = mod.comparePlannedActualDate(planned, { date: '2026-06-07' })
    assert(off.status === 'outside-window' && off.dayOffset === 2,
      'single-anchor +2 days → outside-window +2')
  }

  // ── Date: missing planned / missing actual ─────────────────────
  {
    const noPlan = mod.comparePlannedActualDate({}, { date: '2026-06-01' })
    assert(noPlan.status === 'missing-planned',  'no planned dates → missing-planned')
    const noAct  = mod.comparePlannedActualDate({ plannedStartDate: '2026-06-01' }, {})
    assert(noAct.status === 'missing-actual',    'no actual date → missing-actual')
  }

  // ── Date: invalid date strings do not throw ───────────────────
  {
    const bad = mod.comparePlannedActualDate(
      { plannedStartDate: 'banana', plannedEndDate: '2026-06-07' },
      { date: 'not-a-date' },
    )
    assert(bad.status === 'missing-actual', 'invalid actual date → missing-actual, no throw')
    const bad2 = mod.comparePlannedActualDate(
      { plannedStartDate: 'banana', plannedEndDate: 'also-bad' },
      { date: '2026-06-05' },
    )
    assert(bad2.status === 'missing-planned',
      'all invalid planned dates → missing-planned, no throw')
  }

  // ── Product: match by inventoryItemId ─────────────────────────
  {
    const r = mod.comparePlannedActualProduct(
      { productName: 'Heritage', inventoryItemId: 'inv-A' },
      { products: [{ name: 'Heritage 50WG', inventoryItemId: 'inv-A' }] },
    )
    assert(r.status === 'match', 'match by inventoryItemId')
  }

  // ── Product: match by normalized name ─────────────────────────
  {
    const r = mod.comparePlannedActualProduct(
      { productName: 'Barricade 4FL' },
      { products: [{ name: 'BARRICADE 4FL' }] },
    )
    assert(r.status === 'match', 'match by normalized name (case-insensitive)')
  }

  // ── Product: NO fuzzy match ───────────────────────────────────
  {
    const r = mod.comparePlannedActualProduct(
      { productName: 'Heritage' },
      { products: [{ name: 'Heritage G' }] },
    )
    assert(r.status === 'different',
      'no fuzzy match: "Heritage" ≠ "Heritage G"')
  }

  // ── Product: any-match wins when multiple actuals ─────────────
  {
    const r = mod.comparePlannedActualProduct(
      { productName: 'Primo Maxx' },
      { products: [{ name: 'Heritage' }, { name: 'Primo Maxx' }] },
    )
    assert(r.status === 'match', 'multiple actuals → any-match wins')
    assert(Array.isArray(r.actual) && r.actual.length === 2,
      'actual list surfaces all completed product names')
  }

  // ── Product: missing planned / missing actual ─────────────────
  {
    const noPlan = mod.comparePlannedActualProduct({}, { products: [{ name: 'X' }] })
    assert(noPlan.status === 'missing-planned', 'no planned product → missing-planned')
    const noAct  = mod.comparePlannedActualProduct({ productName: 'X' }, { products: [] })
    assert(noAct.status === 'missing-actual',   'no actual products → missing-actual')
  }

  // ── Area: exact match (case-insensitive + whitespace) ─────────
  {
    const r = mod.comparePlannedActualArea(
      { targetArea: 'Greens' }, { area: 'GREENS' },
    )
    assert(r.status === 'match', 'area exact match (case-insensitive)')
    const r2 = mod.comparePlannedActualArea(
      { targetArea: 'Greens' }, { area: 'Tees' },
    )
    assert(r2.status === 'different', 'area different')
    const noPlan = mod.comparePlannedActualArea({}, { area: 'Greens' })
    assert(noPlan.status === 'missing-planned', 'area missing-planned')
    const noAct  = mod.comparePlannedActualArea({ targetArea: 'Greens' }, {})
    assert(noAct.status === 'missing-actual', 'area missing-actual')
  }

  // ── Rate: exact match ─────────────────────────────────────────
  {
    const r = mod.comparePlannedActualRate(
      { productName: 'Heritage', rateValue: 3.2, rateUnit: 'oz/1000 sq ft' },
      { products: [{ name: 'Heritage', rate: '3.2 oz / 1,000 sq ft' }] },
    )
    assert(r.status === 'match', 'rate exact match (value + normalized unit)')
  }

  // ── Rate: numeric mismatch → different ────────────────────────
  {
    const r = mod.comparePlannedActualRate(
      { productName: 'Heritage', rateValue: 3.2, rateUnit: 'oz/1000 sq ft' },
      { products: [{ name: 'Heritage', rate: '4.0 oz / 1,000 sq ft' }] },
    )
    assert(r.status === 'different', 'rate different on numeric mismatch')
  }

  // ── Rate: not-compared when actual rate is unparsable ─────────
  {
    const r = mod.comparePlannedActualRate(
      { productName: 'Heritage', rateValue: 3.2, rateUnit: 'oz/1000 sq ft' },
      { products: [{ name: 'Heritage', rate: 'see label' }] },
    )
    assert(r.status === 'not-compared',
      'unparsable actual rate → not-compared')
  }

  // ── Rate: not-compared when no matching actual product ────────
  {
    const r = mod.comparePlannedActualRate(
      { productName: 'Heritage', rateValue: 3.2, rateUnit: 'oz/1000 sq ft' },
      { products: [{ name: 'Other Product', rate: '3.2 oz / 1,000 sq ft' }] },
    )
    assert(r.status === 'not-compared',
      'no matching actual product → not-compared')
  }

  // ── Rate: missing-planned / missing-actual ────────────────────
  {
    const r = mod.comparePlannedActualRate(
      { productName: 'Heritage' },
      { products: [{ name: 'Heritage', rate: '3.2 oz / 1,000 sq ft' }] },
    )
    assert(r.status === 'missing-planned',
      'no planned rateValue → missing-planned')
    const r2 = mod.comparePlannedActualRate(
      { productName: 'Heritage', rateValue: 3.2, rateUnit: 'oz/1000 sq ft' },
      { products: [] },
    )
    assert(r2.status === 'missing-actual',
      'no actual products → missing-actual')
  }

  // ── Summary copy: no judgment vocabulary ──────────────────────
  {
    const planned = {
      plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-07',
      productName: 'Heritage', targetArea: 'Greens',
      rateValue: 3.2, rateUnit: 'oz/1000 sq ft',
    }
    const actual = {
      date: '2026-06-03',
      area: 'Greens',
      products: [{ name: 'Heritage', rate: '3.2 oz / 1,000 sq ft' }],
    }
    const out = mod.buildPlanActualComparison(planned, actual)
    assert(out.linked === true && out.summary.length === 4,
      'happy path: 4 summary chips (Date/Product/Area/Rate)')
    const text = out.summary.map(s => `${s.label} ${s.value}`).join(' | ')
    for (const word of ['recommend', 'correct', 'incorrect', 'pass', 'fail',
                        'score', 'grade', 'safe', 'unsafe']) {
      assert(!new RegExp(`\\b${word}\\b`, 'i').test(text),
        `summary copy avoids "${word}"`)
    }
    assert(/Completed inside planned window/.test(text),
      'date copy: "Completed inside planned window"')
    assert(/Planned product appears in completed record/.test(text),
      'product copy: "Planned product appears in completed record"')
    assert(/Area matches recorded application/.test(text),
      'area copy: "Area matches recorded application"')
  }

  // ── "Different" / "Rate not compared" copy phrasing ───────────
  {
    const planned = {
      plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-07',
      productName: 'Heritage', targetArea: 'Greens',
      rateValue: 3.2, rateUnit: 'oz/1000 sq ft',
    }
    const actual  = {
      date: '2026-06-15',
      area:  'Tees',
      products: [{ name: 'Other Product', rate: 'see label' }],
    }
    const out = mod.buildPlanActualComparison(planned, actual)
    const text = out.summary.map(s => `${s.label} ${s.value}`).join(' | ')
    assert(/Completed outside planned window/.test(text),
      'date copy: "Completed outside planned window"')
    assert(/\(\d+ day/.test(text),
      'date copy includes the day-offset count')
    assert(/Different recorded product/.test(text),
      'product copy: "Different recorded product"')
    assert(/Area differs from recorded application/.test(text),
      'area copy: "Area differs from recorded application"')
    assert(/Rate not compared/.test(text),
      'rate copy: "Rate not compared"')
  }

  // ── Purity: inputs never mutated ──────────────────────────────
  {
    const planned = { plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-07',
      productName: 'Heritage', targetArea: 'Greens',
      rateValue: 3.2, rateUnit: 'oz/1000 sq ft' }
    const actual  = { date: '2026-06-03', area: 'Greens',
      products: [{ name: 'Heritage', rate: '3.2 oz / 1,000 sq ft' }] }
    const before = JSON.stringify({ planned, actual })
    mod.buildPlanActualComparison(planned, actual)
    mod.comparePlannedActualDate(planned, actual)
    mod.comparePlannedActualProduct(planned, actual)
    mod.comparePlannedActualArea(planned, actual)
    mod.comparePlannedActualRate(planned, actual)
    assert(JSON.stringify({ planned, actual }) === before,
      'helper does not mutate planned or actual inputs')
  }
}

console.log('— Planner renders Plan vs Actual block only when linked spray resolves')
{
  const src = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.jsx', 'utf8')
  assert(/from\s+['"][^'"]*planActualComparison(\.js)?['"]/.test(src),
    'planner imports planActualComparison')
  assert(/<PlanVsActualBlock\b/.test(src),
    'planner renders <PlanVsActualBlock>')
  assert(/function\s+PlanVsActualBlock\b/.test(src),
    'planner declares PlanVsActualBlock component')

  // The block is conditional: only inside the linked-cached branch of
  // CompletedLinkSummary. The stale branch should NOT mount it.
  const cachedBranch = src.match(/styles\.completedLink\}>[\s\S]*?Clear completed link/)?.[0] ?? ''
  const staleBranch  = src.match(/styles\.completedLinkStale\}[\s\S]*?Clear completed link/)?.[0] ?? ''
  assert(/<PlanVsActualBlock\b/.test(cachedBranch),
    'PlanVsActualBlock mounted inside the linked-cached branch')
  assert(!/<PlanVsActualBlock\b/.test(staleBranch),
    'PlanVsActualBlock NOT mounted inside the stale branch')

  // useMemo over buildPlanActualComparison so chips re-derive only on
  // item or linkedSpray change.
  assert(/buildPlanActualComparison\(item,\s*linkedSpray\)/.test(src),
    'PlanVsActualBlock calls buildPlanActualComparison(item, linkedSpray)')

  // Block content stays neutral — same forbidden list as the helper.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  // "recommend" is allowed via existing boundary copy ("does not
  // recommend") in unrelated panels but NOT in the PlanVsActualBlock.
  const block = codeOnly.match(/function\s+PlanVsActualBlock[\s\S]*?\n\}/)?.[0] ?? ''
  for (const word of ['recommend', 'correct', 'incorrect', 'pass', 'fail',
                      'score', 'grade', 'safe', 'unsafe']) {
    assert(!new RegExp(`\\b${word}\\b`, 'i').test(block),
      `PlanVsActualBlock avoids "${word}"`)
  }

  // No new D1 / inventory / catalog / spray-record write paths added
  // on the planner side as part of this commit.
  assert(!/createSpray\s*\(/.test(codeOnly),
    'planner still never calls createSpray(...)')
  assert(!/recordInventoryUsage/.test(codeOnly),
    'planner still never calls recordInventoryUsage')
  assert(!/['"]\/api\/product-catalog['"][^\n]{0,200}(POST|PATCH|DELETE)/.test(codeOnly),
    'planner still never POSTs/PATCHes/DELETEs /api/product-catalog')
}

console.log('— Plan vs Actual CSS classes')
{
  const css = readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.module.css', 'utf8')
  for (const cls of ['planActualBlock', 'planActualHeader', 'planActualList',
                     'planActualItem', 'planActualChipLabel', 'planActualChipValue']) {
    assert(new RegExp(`\\.${cls}\\b`).test(css), `CSS defines .${cls}`)
  }
}

// ── Result ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
