import { extractText, getDocumentProxy } from 'unpdf'
import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter } from '../lib/scope.js'

const MAX_PDF_BYTES = 8 * 1024 * 1024
const VALID_KINDS = new Set(['product', 'chemical', 'fertilizer', 'part', 'irrigation', 'fuel'])

function money(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null
}

function normalizeName(value) {
  return String(value ?? '').trim().toUpperCase()
}

function rowToInvoice(row, lines = []) {
  return {
    id: row.id,
    courseId: row.course_id,
    vendor: row.vendor,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    status: row.status,
    subtotal: row.subtotal,
    tax: row.tax,
    total: row.total,
    pdfAttachmentId: row.pdf_attachment_id,
    pdfUrl: row.pdf_attachment_id
      ? `/api/attachments/${encodeURIComponent(row.pdf_attachment_id)}/file`
      : null,
    extractionNote: row.extraction_note,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    lines,
  }
}

function rowToLine(row) {
  return {
    id: row.id,
    description: row.description,
    sku: row.sku,
    quantity: row.quantity,
    unit: row.unit,
    unitPrice: row.unit_price,
    lineTotal: row.line_total,
    inventoryItemId: row.inventory_item_id,
    inventoryKind: row.inventory_kind,
    includeInInventory: row.include_in_inventory === 1,
  }
}

function findMoney(text, label) {
  const match = text.match(new RegExp(`\\b${label}\\b\\s*[:#]?\\s*\\$?([0-9,]+(?:\\.\\d{2})?)`, 'i'))
  return match ? money(match[1].replaceAll(',', '')) : null
}

function parseInvoiceText(text, fileName) {
  const compact = String(text ?? '').replaceAll(String.fromCharCode(0), '')
  const rows = compact.split(/\r?\n/).map(row => row.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const vendor = rows.find(row =>
    row.length >= 3 && row.length <= 80 && !/invoice|statement|page\s+\d|bill to|ship to/i.test(row)
  ) ?? null
  const invoiceNumber = compact.match(/invoice\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9-]+)/i)?.[1] ?? null
  const dateMatch = compact.match(/(?:invoice\s+date|date)\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i)
  let invoiceDate = null
  if (dateMatch) {
    const parsed = new Date(dateMatch[1])
    if (!Number.isNaN(parsed.getTime())) invoiceDate = parsed.toISOString().slice(0, 10)
  }

  const lines = []
  const linePattern = /^(.{3,}?)\s+(\d+(?:\.\d+)?)\s*(ea|each|bag|case|jug|box|gal|gallon|lb|lbs|oz|qt|pt|unit|units)?\s+\$?([0-9,]+\.\d{2})\s+\$?([0-9,]+\.\d{2})$/i
  for (const row of rows) {
    const match = row.match(linePattern)
    if (!match || /subtotal|sales tax|tax total|amount due|invoice total|balance/i.test(match[1])) continue
    const quantity = Number(match[2])
    const unitPrice = money(match[4].replaceAll(',', ''))
    const lineTotal = money(match[5].replaceAll(',', ''))
    if (!Number.isFinite(quantity) || quantity <= 0 || lineTotal == null) continue
    lines.push({
      description: match[1].trim(),
      sku: null,
      quantity,
      unit: match[3] || 'each',
      unitPrice,
      lineTotal,
      inventoryItemId: null,
      inventoryKind: 'part',
      includeInInventory: true,
    })
  }

  return {
    vendor,
    invoiceNumber,
    invoiceDate,
    subtotal: findMoney(compact, 'subtotal'),
    tax: findMoney(compact, '(?:sales\\s+)?tax'),
    total: findMoney(compact, '(?:invoice\\s+total|amount\\s+due|total)'),
    lines,
    extractionNote: lines.length
      ? `${lines.length} possible line item${lines.length === 1 ? '' : 's'} extracted. Verify every row before approval.`
      : `No reliable line items were found in ${fileName || 'this PDF'}. Add them manually before approval.`,
  }
}

async function getInvoiceRows(env, courseId, id = null) {
  const { where, binds } = buildCourseFilter(courseId)
  const conditions = where ? [where.replace('WHERE ', '')] : []
  if (id) { conditions.push('id = ?'); binds.push(id) }
  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { results: invoices } = await env.DB.prepare(
    `SELECT * FROM purchase_invoices ${clause} ORDER BY datetime(created_at) DESC`,
  ).bind(...binds).all()
  if (!invoices.length) return []
  const placeholders = invoices.map(() => '?').join(',')
  const { results: lines } = await env.DB.prepare(
    `SELECT * FROM purchase_invoice_lines WHERE invoice_id IN (${placeholders}) ORDER BY line_order ASC`,
  ).bind(...invoices.map(row => row.id)).all()
  const byInvoice = new Map()
  for (const line of lines) {
    if (!byInvoice.has(line.invoice_id)) byInvoice.set(line.invoice_id, [])
    byInvoice.get(line.invoice_id).push(rowToLine(line))
  }
  return invoices.map(row => rowToInvoice(row, byInvoice.get(row.id) ?? []))
}

export async function listPurchaseInvoices(env, courseId) {
  return json(await getInvoiceRows(env, courseId))
}

export async function uploadPurchaseInvoice(env, request) {
  if (!env.DB || !env.PHOTOS) return json({ error: 'Invoice storage is not configured' }, 503)
  let form
  try { form = await request.formData() } catch { return badRequest('Expected multipart/form-data body') }
  const file = form.get('file')
  const courseId = String(form.get('courseId') || 'crossroads-gc')
  if (!file || typeof file === 'string') return badRequest('A PDF invoice is required')
  if (file.type !== 'application/pdf') return badRequest('Only PDF invoices are supported')
  if (file.size > MAX_PDF_BYTES) return badRequest('Invoice exceeds the 8 MB limit')

  const invoiceId = generateId('invoice')
  const attachmentId = generateId('attach')
  const r2Key = `attachments/${courseId}/purchase_invoice/${invoiceId}/${attachmentId}.pdf`
  const bytes = await file.arrayBuffer()
  let text = ''
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const result = await extractText(pdf, { mergePages: true })
    text = typeof result?.text === 'string' ? result.text : Array.isArray(result?.text) ? result.text.join('\n') : ''
  } catch (error) {
    console.warn('[Purchase Invoice] PDF extraction failed:', error?.message)
  }
  const draft = parseInvoiceText(text, file.name)

  try {
    await env.PHOTOS.put(r2Key, bytes, { httpMetadata: { contentType: 'application/pdf' } })
    const statements = [
      env.DB.prepare(`INSERT INTO operational_attachments
        (id, course_id, parent_type, parent_id, file_name, content_type, r2_key, file_size, caption, status)
        VALUES (?, ?, 'purchase_invoice', ?, ?, 'application/pdf', ?, ?, 'Purchase invoice', 'active')`)
        .bind(attachmentId, courseId, invoiceId, file.name || null, r2Key, file.size),
      env.DB.prepare(`INSERT INTO purchase_invoices
        (id, course_id, vendor, invoice_number, invoice_date, status, subtotal, tax, total,
         pdf_attachment_id, raw_text, extraction_note)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`)
        .bind(invoiceId, courseId, draft.vendor, draft.invoiceNumber, draft.invoiceDate,
          draft.subtotal, draft.tax, draft.total, attachmentId, text.slice(0, 200000), draft.extractionNote),
    ]
    draft.lines.forEach((line, index) => statements.push(
      env.DB.prepare(`INSERT INTO purchase_invoice_lines
        (id, invoice_id, line_order, description, sku, quantity, unit, unit_price, line_total,
         inventory_item_id, inventory_kind, include_in_inventory)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(generateId('invoice-line'), invoiceId, index, line.description, line.sku, line.quantity,
          line.unit, line.unitPrice, line.lineTotal, null, line.inventoryKind, 1),
    ))
    await env.DB.batch(statements)
  } catch (error) {
    try { await env.PHOTOS.delete(r2Key) } catch { /* best effort */ }
    return json({ error: `Could not save invoice: ${error.message}` }, 500)
  }
  const rows = await getInvoiceRows(env, courseId, invoiceId)
  return json(rows[0], 201)
}

export async function approvePurchaseInvoice(env, id, request) {
  const body = await readJson(request)
  const invoice = await env.DB.prepare('SELECT * FROM purchase_invoices WHERE id = ?').bind(id).first()
  if (!invoice) return notFound('Purchase invoice not found')
  if (invoice.status === 'approved') return badRequest('This invoice has already been approved')
  const lines = Array.isArray(body?.lines) ? body.lines : []
  const included = lines.filter(line => line.includeInInventory !== false)
  if (!included.length) return badRequest('At least one inventory line is required')

  const statements = []
  for (let index = 0; index < included.length; index++) {
    const line = included[index]
    const description = normalizeName(line.description)
    const quantity = Number(line.quantity)
    const unitPrice = line.unitPrice === '' || line.unitPrice == null ? null : money(line.unitPrice)
    const lineTotal = line.lineTotal === '' || line.lineTotal == null
      ? (unitPrice == null ? null : money(quantity * unitPrice))
      : money(line.lineTotal)
    if (!description) return badRequest(`Line ${index + 1}: description is required`)
    if (!Number.isFinite(quantity) || quantity <= 0) return badRequest(`Line ${index + 1}: quantity must be greater than zero`)
    const unit = String(line.unit || 'each').trim()
    let inventoryItemId = line.inventoryItemId || null
    const kind = VALID_KINDS.has(line.inventoryKind) ? line.inventoryKind : 'part'
    if (inventoryItemId) {
      const existing = await env.DB.prepare('SELECT id FROM inventory_items WHERE id = ? AND course_id = ?')
        .bind(inventoryItemId, invoice.course_id).first()
      if (!existing) return badRequest(`Line ${index + 1}: selected inventory item was not found`)
      statements.push(env.DB.prepare(`UPDATE inventory_items
        SET quantity = COALESCE(quantity, 0) + ?,
            vendor = COALESCE(?, vendor),
            cost_per_unit = COALESCE(?, cost_per_unit),
            cost_unit = CASE WHEN ? IS NULL THEN cost_unit ELSE ? END,
            cost_source = CASE WHEN ? IS NULL THEN cost_source ELSE 'invoice' END,
            cost_updated_at = CASE WHEN ? IS NULL THEN cost_updated_at ELSE datetime('now') END,
            updated_at = datetime('now')
        WHERE id = ?`)
        .bind(quantity, body.vendor || invoice.vendor, unitPrice, unitPrice, unit, unitPrice, unitPrice, inventoryItemId))
    } else {
      inventoryItemId = generateId('inv')
      statements.push(env.DB.prepare(`INSERT INTO inventory_items
        (id, kind, name, category, unit, quantity, vendor, cost_per_unit, cost_unit, cost_source,
         cost_updated_at, notes, course_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'invoice', datetime('now'), ?, ?)`)
        .bind(inventoryItemId, kind, description, line.category || null, unit, quantity,
          body.vendor || invoice.vendor || null, unitPrice, unitPrice == null ? null : unit,
          `Created from purchase invoice ${body.invoiceNumber || invoice.invoice_number || id}`, invoice.course_id))
    }
    statements.push(env.DB.prepare(`INSERT INTO purchase_invoice_lines
      (id, invoice_id, line_order, description, sku, quantity, unit, unit_price, line_total,
       inventory_item_id, inventory_kind, include_in_inventory)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
      .bind(line.id || generateId('invoice-line'), id, index, description, line.sku || null,
        quantity, unit, unitPrice, lineTotal, inventoryItemId, kind))
  }

  statements.unshift(env.DB.prepare('DELETE FROM purchase_invoice_lines WHERE invoice_id = ?').bind(id))
  statements.push(env.DB.prepare(`UPDATE purchase_invoices SET
    vendor = ?, invoice_number = ?, invoice_date = ?, subtotal = ?, tax = ?, total = ?,
    status = 'approved', approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .bind(body.vendor || null, body.invoiceNumber || null, body.invoiceDate || null,
      money(body.subtotal), money(body.tax), money(body.total), id))
  await env.DB.batch(statements)
  const rows = await getInvoiceRows(env, invoice.course_id, id)
  return json(rows[0])
}

export async function deletePurchaseInvoice(env, id) {
  const invoice = await env.DB.prepare('SELECT * FROM purchase_invoices WHERE id = ?').bind(id).first()
  if (!invoice) return notFound('Purchase invoice not found')
  if (invoice.status === 'approved') return badRequest('Approved invoices cannot be deleted')
  const attachment = invoice.pdf_attachment_id
    ? await env.DB.prepare('SELECT r2_key FROM operational_attachments WHERE id = ?').bind(invoice.pdf_attachment_id).first()
    : null
  await env.DB.batch([
    env.DB.prepare('DELETE FROM purchase_invoice_lines WHERE invoice_id = ?').bind(id),
    env.DB.prepare('DELETE FROM purchase_invoices WHERE id = ?').bind(id),
    ...(invoice.pdf_attachment_id ? [env.DB.prepare("UPDATE operational_attachments SET status = 'deleted' WHERE id = ?").bind(invoice.pdf_attachment_id)] : []),
  ])
  if (attachment?.r2_key) try { await env.PHOTOS.delete(attachment.r2_key) } catch { /* best effort */ }
  return json({ ok: true, id })
}
