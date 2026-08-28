import { extractText, getDocumentProxy } from 'unpdf'
import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

const MAX_PDF_BYTES = 8 * 1024 * 1024
const SAMPLE_TYPES = new Set(['soil', 'tissue'])
const NUTRIENTS = new Set(['N', 'P', 'K', 'Ca', 'Mg', 'S', 'Fe', 'Mn', 'Zn', 'Cu', 'B', 'Mo', 'Cl', 'Ni'])
const RESULT_ANALYTES = new Set([...NUTRIENTS, 'Na', 'Si', 'pH', 'CEC', 'OM', 'EC', 'SAR'])
const RESULT_UNITS = new Set(['ppm', '%', 'meq/100g', 'lb/acre', 'index', 'pH', 'dS/m'])
const RATINGS = new Set(['', 'low', 'adequate', 'high', 'excessive'])

const ANALYTE_ALIASES = [
  ['pH', [/\bsoil\s+ph\b/i, /^\s*ph\b/i]],
  ['CEC', [/\bcation\s+exchange\s+capacity\b/i, /^\s*cec\b/i]],
  ['OM', [/\borganic\s+matter\b/i, /^\s*om\b/i]],
  ['SAR', [/\bsodium\s+adsorption\s+ratio\b/i, /^\s*sar\b/i]],
  ['EC', [/\belectrical\s+conductivity\b/i, /^\s*ec\b/i]],
  ['N', [/\btotal\s+nitrogen\b/i, /\bnitrate[-\s]*n\b/i, /\bnitrogen\b/i, /^\s*n\s*(?:[:\-(]|\d)/i]],
  ['P', [/\bphosphorus\b/i, /\bphosphorous\b/i, /\bphosphate\b/i, /^\s*p\s*(?:[:\-(]|\d)/i]],
  ['K', [/\bpotassium\b/i, /\bpotash\b/i, /^\s*k\s*(?:[:\-(]|\d)/i]],
  ['Ca', [/\bcalcium\b/i, /^\s*ca\b/i]],
  ['Mg', [/\bmagnesium\b/i, /^\s*mg\b/i]],
  ['S', [/\bsulfur\b/i, /\bsulphur\b/i, /^\s*s\s*(?:[:\-(]|\d)/i]],
  ['Fe', [/\biron\b/i, /^\s*fe\b/i]],
  ['Mn', [/\bmanganese\b/i, /^\s*mn\b/i]],
  ['Zn', [/\bzinc\b/i, /^\s*zn\b/i]],
  ['Cu', [/\bcopper\b/i, /^\s*cu\b/i]],
  ['B', [/\bboron\b/i, /^\s*b\s*(?:[:\-(]|\d)/i]],
  ['Mo', [/\bmolybdenum\b/i, /^\s*mo\b/i]],
  ['Cl', [/\bchloride\b/i, /\bchlorine\b/i, /^\s*cl\b/i]],
  ['Ni', [/\bnickel\b/i, /^\s*ni\b/i]],
  ['Na', [/\bsodium\b/i, /^\s*na\b/i]],
  ['Si', [/\bsilicon\b/i, /^\s*si\b/i]],
]

function parseArray(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (!value) return {}
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {} } catch { return {} }
}

function finite(value) {
  if (value === '' || value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function cleanResults(value) {
  return parseArray(value).map(row => ({
    nutrient: RESULT_ANALYTES.has(row?.nutrient) ? row.nutrient : null,
    value: finite(row?.value),
    unit: RESULT_UNITS.has(row?.unit) ? row.unit : 'ppm',
    rating: RATINGS.has(row?.rating ?? '') ? (row.rating ?? '') : '',
  })).filter(row => row.nutrient && row.value != null)
}

function cleanRecommendations(value) {
  return parseArray(value).map(row => ({
    nutrient: NUTRIENTS.has(row?.nutrient) ? row.nutrient : null,
    rateLbPer1000: finite(row?.rateLbPer1000),
    note: typeof row?.note === 'string' ? row.note.trim() : '',
  })).filter(row => row.nutrient && row.rateLbPer1000 != null && row.rateLbPer1000 >= 0)
}

function toIsoDate(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const us = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (!us) return ''
  const year = us[3].length === 2 ? Number(`20${us[3]}`) : Number(us[3])
  const month = Number(us[1])
  const day = Number(us[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function fieldValue(lines, patterns) {
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern)
      if (match?.[1]?.trim()) return match[1].trim().replace(/\s{2,}.*/, '')
    }
  }
  return ''
}

function detectAnalyte(text) {
  for (const [value, patterns] of ANALYTE_ALIASES) {
    if (patterns.some(pattern => pattern.test(text))) return value
  }
  return null
}

function normalizeUnit(value) {
  const unit = String(value ?? '').toLowerCase().replace(/\s+/g, '')
  if (unit === '%') return '%'
  if (unit === 'ppm') return 'ppm'
  if (/^meq\/?100g$/.test(unit)) return 'meq/100g'
  if (/^lbs?\/?acre$/.test(unit)) return 'lb/acre'
  if (unit === 'ds/m') return 'dS/m'
  if (unit === 'index') return 'index'
  return 'ppm'
}

function ratingFromLine(line) {
  const normalized = line.toLowerCase()
  if (/\b(?:very\s+low|deficient|low)\b/.test(normalized)) return 'low'
  if (/\b(?:adequate|normal|optimum|optimal|sufficient)\b/.test(normalized)) return 'adequate'
  if (/\b(?:excessive|very\s+high)\b/.test(normalized)) return 'excessive'
  if (/\bhigh\b/.test(normalized)) return 'high'
  return ''
}

function parseResults(lines) {
  const results = []
  const seen = new Set()
  for (const line of lines) {
    let analyte = detectAnalyte(line)
    if (!analyte) continue

    let value = null
    let unit = null
    if (analyte === 'pH') {
      const match = line.match(/\bph\b\s*(?:\([^)]*\))?\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i)
      if (match) { value = finite(match[1]); unit = 'pH' }
    }
    if (value == null) {
      const match = line.match(/(-?\d+(?:\.\d+)?)\s*(ppm|%|meq\s*\/?\s*100g|lbs?\s*\/?\s*acre|dS\s*\/\s*m|index)(?=\s|$|[,;)])/i)
      if (match) { value = finite(match[1]); unit = normalizeUnit(match[2]) }
    }
    if (value == null || !unit) continue
    const key = `${analyte}:${unit}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ nutrient: analyte, value, unit, rating: ratingFromLine(line) })
    if (results.length >= 40) break
  }
  return results
}

function parseRecommendations(lines) {
  const recommendations = []
  const seen = new Set()
  for (const line of lines) {
    if (!/recommend|apply|application/i.test(line)) continue
    const nutrient = detectAnalyte(line)
    if (!NUTRIENTS.has(nutrient)) continue
    const match = line.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs)\s*(?:of\s+)?(?:actual\s+)?(?:[a-z]+\s+)?(?:\/|per)\s*1[,]?000\s*(?:sq(?:uare)?\s*ft|ft2)?/i)
    if (!match) continue
    const rate = finite(match[1])
    const key = `${nutrient}:${rate}`
    if (rate == null || seen.has(key)) continue
    seen.add(key)
    recommendations.push({ nutrient, rateLbPer1000: rate, note: line.slice(0, 240) })
  }
  return recommendations
}

function parseLabReportText(text, sampleType, fileName) {
  const compact = String(text ?? '').replaceAll(String.fromCharCode(0), '')
  const lines = compact.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const rawDate = fieldValue(lines, [
    /(?:sample|report|test|analysis|received)\s*date\s*[:#-]?\s*(\d{1,4}[/-]\d{1,2}[/-]\d{1,4})/i,
    /\bdate\s*[:#-]?\s*(\d{1,4}[/-]\d{1,2}[/-]\d{1,4})/i,
  ])
  const labName = lines.find(line => /\b(?:laborator(?:y|ies)|soil\s+testing|agronomic\s+services|analytical)\b/i.test(line) && line.length <= 100) ?? ''
  const location = fieldValue(lines, [
    /(?:sample\s+(?:name|description)|location|area|field|course)\s*[:#-]\s*(.{2,80})/i,
  ])
  const labSampleId = fieldValue(lines, [
    /(?:lab\s+)?sample\s*(?:id|number|no\.?|#)\s*[:#-]?\s*([A-Z0-9._/-]+)/i,
    /report\s*(?:id|number|no\.?|#)\s*[:#-]?\s*([A-Z0-9._/-]+)/i,
  ])
  const depth = compact.match(/(?:sample\s+)?depth\s*[:#-]?\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")/i)
  const results = parseResults(lines)
  const recommendations = parseRecommendations(lines)
  const readable = compact.trim().length >= 30
  return {
    sampleType,
    sampleDate: toIsoDate(rawDate),
    location,
    areaType: '',
    labName,
    labSampleId,
    depthInches: sampleType === 'soil' && depth ? Number(depth[1]) : '',
    results,
    recommendations,
    notes: fileName ? `Imported from ${fileName}` : '',
    extractionNote: readable
      ? `${results.length} lab result${results.length === 1 ? '' : 's'} extracted. Review every value and add any lab recommendations before approval.`
      : 'No readable PDF text was found. The original report is saved; enter the sample details manually before approval.',
  }
}

function rowToImport(row) {
  const draft = parseObject(row.draft_json)
  return {
    id: row.id,
    courseId: row.course_id,
    sampleType: row.sample_type,
    status: row.status,
    fileName: row.file_name,
    pdfAttachmentId: row.pdf_attachment_id,
    pdfUrl: `/api/attachments/${encodeURIComponent(row.pdf_attachment_id)}/file`,
    extractionNote: row.extraction_note,
    approvedSampleId: row.approved_sample_id,
    draft,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    updatedAt: row.updated_at,
  }
}

async function findImport(env, id, courseId) {
  return env.DB.prepare('SELECT * FROM turf_nutrient_report_imports WHERE id = ? AND course_id = ?')
    .bind(id, courseId).first()
}

export async function listNutrientReportImports(env, courseId) {
  const { where, binds } = buildCourseFilter(courseId)
  const { results } = await env.DB.prepare(
    `SELECT * FROM turf_nutrient_report_imports ${where} ORDER BY datetime(created_at) DESC`,
  ).bind(...binds).all()
  return json((results ?? []).map(rowToImport))
}

export async function uploadNutrientReportImport(env, request) {
  if (!env.DB || !env.PHOTOS) return json({ error: 'Lab report storage is not configured' }, 503)
  let form
  try { form = await request.formData() } catch { return badRequest('Expected multipart/form-data body') }
  const file = form.get('file')
  const sampleType = String(form.get('sampleType') || '')
  const courseId = resolveCourseId({ courseId: String(form.get('courseId') || '') })
  if (!SAMPLE_TYPES.has(sampleType)) return badRequest('sampleType must be soil or tissue')
  if (!file || typeof file === 'string') return badRequest('A PDF lab report is required')
  if (file.type !== 'application/pdf') return badRequest('Only PDF lab reports are supported')
  if (file.size > MAX_PDF_BYTES) return badRequest('Lab report exceeds the 8 MB limit')

  const importId = generateId('nutrient-report')
  const attachmentId = generateId('attach')
  const r2Key = `attachments/${courseId}/nutrient_sample_import/${importId}/${attachmentId}.pdf`
  const bytes = await file.arrayBuffer()
  let text = ''
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const result = await extractText(pdf, { mergePages: true })
    text = typeof result?.text === 'string' ? result.text : Array.isArray(result?.text) ? result.text.join('\n') : ''
  } catch (error) {
    console.warn('[Nutrient Report] PDF extraction failed:', error?.message)
  }
  const draft = parseLabReportText(text, sampleType, file.name)

  try {
    await env.PHOTOS.put(r2Key, bytes, { httpMetadata: { contentType: 'application/pdf' } })
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO operational_attachments
        (id, course_id, parent_type, parent_id, file_name, content_type, r2_key, file_size, caption, status)
        VALUES (?, ?, 'nutrient_sample_import', ?, ?, 'application/pdf', ?, ?, 'Nutrient lab report', 'active')`)
        .bind(attachmentId, courseId, importId, file.name || null, r2Key, file.size),
      env.DB.prepare(`INSERT INTO turf_nutrient_report_imports
        (id, course_id, sample_type, status, file_name, pdf_attachment_id, raw_text, draft_json, extraction_note)
        VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`)
        .bind(importId, courseId, sampleType, file.name || null, attachmentId,
          text.slice(0, 200000), JSON.stringify(draft), draft.extractionNote),
    ])
  } catch (error) {
    try { await env.PHOTOS.delete(r2Key) } catch { /* best effort cleanup */ }
    return json({ error: `Could not save lab report: ${error.message}` }, 500)
  }
  return json(rowToImport(await findImport(env, importId, courseId)), 201)
}

export async function approveNutrientReportImport(env, id, courseId, request) {
  const imported = await findImport(env, id, courseId)
  if (!imported) return notFound('Lab report not found')
  if (imported.status === 'approved') return badRequest('This lab report has already been approved')
  const body = await readJson(request)
  if (!SAMPLE_TYPES.has(body.sampleType)) return badRequest('sampleType must be soil or tissue')
  if (typeof body.sampleDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.sampleDate)) return badRequest('Sample date is required')
  if (typeof body.location !== 'string' || !body.location.trim()) return badRequest('Location is required')
  const results = cleanResults(body.results)
  if (!results.length) return badRequest('At least one measured result is required')
  const recommendations = cleanRecommendations(body.recommendations)
  const sampleId = generateId('ns')
  const finalDraft = {
    sampleType: body.sampleType,
    sampleDate: body.sampleDate,
    location: body.location.trim(),
    areaType: String(body.areaType || '').trim(),
    labName: String(body.labName || '').trim(),
    labSampleId: String(body.labSampleId || '').trim(),
    depthInches: finite(body.depthInches),
    results,
    recommendations,
    notes: String(body.notes || '').trim(),
  }
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO turf_nutrient_samples (
      id, course_id, sample_type, sample_date, location, area_type, lab_name,
      lab_sample_id, depth_inches, results_json, recommendations_json, notes, source_attachment_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(sampleId, imported.course_id, finalDraft.sampleType, finalDraft.sampleDate,
        finalDraft.location, finalDraft.areaType || null, finalDraft.labName || null,
        finalDraft.labSampleId || null, finalDraft.depthInches,
        JSON.stringify(results), JSON.stringify(recommendations), finalDraft.notes || null,
        imported.pdf_attachment_id),
    env.DB.prepare(`UPDATE turf_nutrient_report_imports SET
      sample_type = ?, status = 'approved', draft_json = ?, approved_sample_id = ?,
      approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND course_id = ?`)
      .bind(finalDraft.sampleType, JSON.stringify(finalDraft), sampleId, id, courseId),
  ])
  return json({ import: rowToImport(await findImport(env, id, courseId)), sampleId })
}

export async function deleteNutrientReportImport(env, id, courseId) {
  const imported = await findImport(env, id, courseId)
  if (!imported) return notFound('Lab report not found')
  if (imported.status === 'approved') return badRequest('Approved lab reports are retained with their nutrient sample')
  const attachment = await env.DB.prepare('SELECT r2_key FROM operational_attachments WHERE id = ?')
    .bind(imported.pdf_attachment_id).first()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM turf_nutrient_report_imports WHERE id = ? AND course_id = ?').bind(id, courseId),
    env.DB.prepare("UPDATE operational_attachments SET status = 'deleted' WHERE id = ?").bind(imported.pdf_attachment_id),
  ])
  if (attachment?.r2_key) try { await env.PHOTOS.delete(attachment.r2_key) } catch { /* best effort */ }
  return json({ ok: true, id })
}

export { parseLabReportText as parseNutrientLabReportText }
