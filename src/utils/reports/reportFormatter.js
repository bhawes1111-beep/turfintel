import { SECTION_TYPE } from './reportSchemas.js'

// ── CSV ────────────────────────────────────────────────────────────────────────

function esc(value) {
  return String(value ?? '').replace(/"/g, '""')
}

/**
 * Serialize a TurfReport to CSV.
 * Each section is preceded by its title row.
 * Fields sections → label,value pairs.
 * Table sections  → column headers + data rows.
 * Text sections   → single quoted cell.
 */
export function reportToCSV(report) {
  const lines = []

  lines.push(`"Report","${esc(report.title)}"`)
  lines.push(`"Generated","${esc(new Date(report.createdAt).toLocaleString())}"`)
  lines.push(`"Module","${esc(report.module)}"`)
  lines.push(`"Report ID","${esc(report.id)}"`)

  for (const section of report.sections) {
    lines.push('')
    lines.push(`"${esc(section.title)}"`)

    if (section.type === SECTION_TYPE.FIELDS) {
      for (const [label, value] of Object.entries(section.data)) {
        lines.push(`"${esc(label)}","${esc(value)}"`)
      }
    } else if (section.type === SECTION_TYPE.TABLE) {
      lines.push(section.data.columns.map(c => `"${esc(c)}"`).join(','))
      for (const row of section.data.rows) {
        lines.push(row.map(cell => `"${esc(cell)}"`).join(','))
      }
    } else if (section.type === SECTION_TYPE.TEXT) {
      lines.push(`"${esc(section.data)}"`)
    }
  }

  if (report.attachments?.length > 0) {
    lines.push('')
    lines.push('"Attachments"')
    lines.push('"Filename","Type","Size (bytes)"')
    for (const att of report.attachments) {
      lines.push(`"${esc(att.filename)}","${esc(att.type)}","${esc(att.size)}"`)
    }
  }

  return lines.join('\n')
}

// ── JSON ───────────────────────────────────────────────────────────────────────

/**
 * Serialize a TurfReport to a pretty-printed JSON string.
 *
 * - thumbnailUrl fields are stripped (session-ephemeral object URLs).
 * - Functions, symbols, undefined, and Map/Set values are dropped.
 * - DOM nodes and React elements are dropped.
 * - Circular references are broken with a "[Circular]" marker so a
 *   future builder bug can never produce a JSON file that crashes the
 *   browser instead of opening cleanly.
 *
 * Phase 7E (3/?) hardened against the export contract — every key the
 * spec lists (totals, notices, disclaimer, dateRange, generatedAt,
 * exportVersion, reportKind, generatedBy) is plain JSON-safe data in
 * the builder, so this sanitizer is a defense-in-depth pass only.
 */
export function reportToJSON(report) {
  const seen = new WeakSet()
  function sanitize(value) {
    if (value === null) return null
    const t = typeof value
    if (t === 'string' || t === 'number' || t === 'boolean') return value
    if (t === 'undefined' || t === 'function' || t === 'symbol' || t === 'bigint') return undefined
    if (value instanceof Date) return value.toISOString()
    // React elements expose a $$typeof symbol — drop them silently.
    if (value && typeof value === 'object' && value.$$typeof) return undefined
    // DOM nodes — drop.
    if (typeof Node !== 'undefined' && value instanceof Node) return undefined
    if (Array.isArray(value)) {
      if (seen.has(value)) return '[Circular]'
      seen.add(value)
      return value.map(sanitize).filter(v => v !== undefined)
    }
    if (t === 'object') {
      if (seen.has(value)) return '[Circular]'
      seen.add(value)
      const out = {}
      for (const [k, v] of Object.entries(value)) {
        if (k === 'thumbnailUrl') continue                      // session-ephemeral
        const sv = sanitize(v)
        if (sv === undefined) continue
        out[k] = sv
      }
      return out
    }
    return undefined
  }
  const clean = sanitize(report) ?? {}
  return JSON.stringify(clean, null, 2)
}

// ── Display helpers ────────────────────────────────────────────────────────────

export function formatReportTitle(report) {
  const date = new Date(report.createdAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
  return `${report.title} — ${date}`
}

// ── Print document ─────────────────────────────────────────────────────────────

function renderSectionHtml(section) {
  let bodyHtml = ''

  if (section.type === SECTION_TYPE.FIELDS) {
    const rows = Object.entries(section.data)
      .map(([label, value]) => `
        <div class="field">
          <div class="field-label">${escHtml(label)}</div>
          <div class="field-value">${escHtml(String(value ?? '—'))}</div>
        </div>`)
      .join('')
    bodyHtml = `<div class="field-grid">${rows}</div>`

  } else if (section.type === SECTION_TYPE.TABLE) {
    const heads = section.data.columns.map(c => `<th>${escHtml(c)}</th>`).join('')
    const rows  = section.data.rows.map(row =>
      `<tr>${row.map(cell => `<td>${escHtml(String(cell ?? '—'))}</td>`).join('')}</tr>`
    ).join('')
    bodyHtml = `<table><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`

  } else if (section.type === SECTION_TYPE.TEXT) {
    bodyHtml = `<p class="text-body">${escHtml(section.data)}</p>`
  }

  return `
    <div class="section">
      <div class="section-title">${escHtml(section.title)}</div>
      ${bodyHtml}
    </div>`
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
}

/**
 * Build a self-contained HTML document for printing in a new window.
 * @param {Object} report - TurfReport
 * @param {Object} [courseInfo] - { name, superintendent } optional branding
 * @returns {string} Full HTML document string
 */
export function buildPrintDocument(report, courseInfo = {}) {
  const dateStr       = new Date(report.createdAt).toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  })
  const sectionsHtml  = report.sections.map(renderSectionHtml).join('')
  const courseName    = courseInfo.name ?? ''
  const superintendent = courseInfo.superintendent ?? ''

  // Phase 7E (3/?) — optional print extras carried via
  // report.metadata.printExtras. Reports that don't populate this object
  // get the same output as before. We escape every field individually
  // so a future builder can't inject HTML into the print window.
  const px = report.metadata?.printExtras
  const subtitleHtml = px?.subtitle
    ? `<div class="report-subtitle">${escHtml(String(px.subtitle))}</div>`
    : ''
  const dateRange = report.metadata?.dateRange
  const dateRangeHtml = dateRange
    ? `<div class="report-meta-line">Date range: ${escHtml(String(dateRange))}</div>`
    : ''
  const summaryHtml = Array.isArray(px?.summary) && px.summary.length > 0
    ? `<div class="section summary-section">
        <div class="section-title">Summary</div>
        <div class="summary-tiles">
          ${px.summary.map(pair => {
            const [label, value] = Array.isArray(pair) ? pair : [pair?.label, pair?.value]
            return `<div class="summary-tile">
              <div class="summary-tile-value">${escHtml(String(value ?? '—'))}</div>
              <div class="summary-tile-label">${escHtml(String(label ?? ''))}</div>
            </div>`
          }).join('')}
        </div>
      </div>`
    : ''
  const noticesArray = Array.isArray(px?.notices) ? px.notices : null
  const noticesHtml  = noticesArray && noticesArray.length > 0
    ? `<div class="section notices-section">
        <div class="section-title">Notices</div>
        <ul class="notice-list">
          ${noticesArray.map(n => {
            const type   = typeof n?.type  === 'string' ? n.type  : 'info'
            const label  = typeof n?.label === 'string' ? n.label : ''
            const value  = typeof n?.value === 'string' ? n.value : String(n?.value ?? '')
            return `<li class="notice notice-${escHtml(type)}">
              <strong>${escHtml(label)}:</strong> ${escHtml(value)}
            </li>`
          }).join('')}
        </ul>
      </div>`
    : ''
  const disclaimerInline = typeof px?.disclaimer === 'string' && px.disclaimer.length > 0
    ? px.disclaimer
    : (typeof report.metadata?.disclaimer === 'string' ? report.metadata.disclaimer : '')
  const disclaimerHtml = disclaimerInline
    ? `<div class="section disclaimer-section">
        <div class="section-title">Disclaimer</div>
        <p class="disclaimer">${escHtml(disclaimerInline)}</p>
      </div>`
    : ''

  const footerLeft  = (typeof px?.footerLeft  === 'string' && px.footerLeft)  || 'TurfIntel Pro'
  const footerRight = (typeof px?.footerRight === 'string' && px.footerRight) || report.id

  const attachmentsHtml = (report.attachments?.length > 0)
    ? `<div class="section">
        <div class="section-title">Attachments (${report.attachments.length})</div>
        <ul class="att-list">
          ${report.attachments.map(a =>
            `<li>${escHtml(a.filename)} <span class="att-meta">${escHtml(a.type)} · ${escHtml(String(a.size ?? ''))} bytes</span></li>`
          ).join('')}
        </ul>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>${escHtml(report.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      padding: 32px 40px;
      max-width: 900px;
      margin: 0 auto;
    }
    .report-header   { margin-bottom: 28px; border-bottom: 2px solid #1a1a1a; padding-bottom: 14px; }
    .report-title    { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .report-meta     { font-size: 11px; color: #666; }
    .course-name     { font-size: 12px; font-weight: 600; color: #4a9e4a; margin-bottom: 2px; }
    .section         { margin-bottom: 24px; padding-top: 16px; border-top: 1px solid #ddd; }
    .section-title   { font-size: 10px; font-weight: 700; text-transform: uppercase;
                       letter-spacing: 0.07em; color: #888; margin-bottom: 10px; }
    .field-grid      { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 20px; }
    .field-label     { font-size: 10px; color: #888; text-transform: uppercase;
                       letter-spacing: 0.04em; margin-bottom: 2px; }
    .field-value     { font-size: 13px; font-weight: 600; color: #1a1a1a; }
    table            { width: 100%; border-collapse: collapse; font-size: 12px; }
    th               { text-align: left; padding: 6px 8px; font-size: 10px; font-weight: 700;
                       text-transform: uppercase; letter-spacing: 0.05em; color: #666;
                       border-bottom: 1.5px solid #1a1a1a; background: #f8f8f8; }
    td               { padding: 6px 8px; border-bottom: 1px solid #e8e8e8; color: #1a1a1a; }
    tr:nth-child(even) td { background: #fafafa; }
    .text-body       { font-size: 13px; line-height: 1.6; color: #333; }
    .att-list        { padding-left: 18px; }
    .att-list li     { margin-bottom: 4px; font-size: 12px; }
    .att-meta        { color: #888; font-size: 11px; }
    .report-subtitle { font-size: 11px; color: #666; text-transform: uppercase;
                       letter-spacing: 0.06em; margin-top: 2px; }
    .report-meta-line { font-size: 11px; color: #666; margin-top: 2px; }
    .summary-tiles   { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
                       gap: 8px; }
    .summary-tile    { padding: 8px 10px; border: 1px solid #ddd; border-left: 3px solid #4a9e4a;
                       border-radius: 6px; background: #fff; }
    .summary-tile-value { font-size: 18px; font-weight: 700; color: #1a1a1a; }
    .summary-tile-label { font-size: 10px; color: #666; text-transform: uppercase;
                          letter-spacing: 0.04em; margin-top: 1px; }
    .notice-list     { list-style: none; padding-left: 0; }
    .notice          { padding: 5px 8px; margin-bottom: 4px; border-radius: 5px;
                       border: 1px solid #e0e0e0; font-size: 12px; color: #1a1a1a; }
    .notice-warning  { background: #fff7e0; border-color: #d4a857; }
    .notice-caution  { background: #fffae0; border-color: #c7a64a; }
    .notice-info     { background: #fff; }
    .disclaimer-section { margin-top: 28px; padding-top: 14px; border-top: 1px solid #ddd; }
    .disclaimer      { font-size: 11px; color: #444; line-height: 1.55; }
    .report-footer   { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd;
                       font-size: 10px; color: #aaa; display: flex;
                       justify-content: space-between; }
    /* Phase 7E (3/?) — print-friendly hardening.
       - white background everywhere (browsers strip backgrounds by default,
         but we restate it so the colored tile/notice rules survive
         "Print backgrounds: on")
       - cards never split across pages
       - fixed footer at the bottom of every printed page
       - hide any interactive button accidentally captured into the
         document (defensive — print window currently has none) */
    @media print {
      body            { padding: 0; background: #fff; color: #000; }
      .section        { break-inside: avoid; page-break-inside: avoid;
                        background: #fff; }
      .summary-tile,
      .notice,
      .disclaimer-section { break-inside: avoid; page-break-inside: avoid; }
      .summary-tile   { background: #fff; }
      .notice         { background: #fff; }
      table tr        { break-inside: avoid; page-break-inside: avoid; }
      .report-footer  { position: fixed; bottom: 0; left: 0; right: 0;
                        padding: 8px 40px; background: #fff; }
      button, .rpActions { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    ${courseName ? `<div class="course-name">${escHtml(courseName)}${superintendent ? ` · ${escHtml(superintendent)}` : ''}</div>` : ''}
    <div class="report-title">${escHtml(report.title)}</div>
    ${subtitleHtml}
    <div class="report-meta">Generated ${escHtml(dateStr)} · ${escHtml(report.module)} · ${escHtml(report.id)}</div>
    ${dateRangeHtml}
  </div>
  ${summaryHtml}
  ${sectionsHtml}
  ${noticesHtml}
  ${disclaimerHtml}
  ${attachmentsHtml}
  <div class="report-footer">
    <span>${escHtml(footerLeft)}</span>
    <span>${escHtml(footerRight)}</span>
  </div>
</body>
</html>`
}
