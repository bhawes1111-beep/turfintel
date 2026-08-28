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
export function buildPrintDocument(report, courseInfo = {}, options = {}) {
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
  const dateRangeText = dateRange && typeof dateRange === 'object'
    ? (dateRange.label ?? [dateRange.startDate, dateRange.endDate].filter(Boolean).join(' to '))
    : dateRange
  const dateRangeHtml = dateRangeText
    ? `<div class="report-meta-line">Date range: ${escHtml(String(dateRangeText))}</div>`
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
  const toolbarHtml = options.showToolbar
    ? `<div class="pdf-toolbar">
        <div>
          <strong>PDF Preview</strong>
          <span>Use Print / Save PDF from this window.</span>
        </div>
        <button onclick="window.print()">Print / Save PDF</button>
      </div>`
    : ''

  const attachmentGroups = [
    ['improvement', 'Improvements'],
    ['concern', 'Concerns'],
  ].map(([key, label]) => ({
    key,
    label,
    items: (report.attachments ?? []).filter(att => att.category === key),
  })).filter(group => group.items.length > 0)
  const photoAttachmentsHtml = attachmentGroups.map(group => `
    <div class="section photo-section">
      <div class="section-title">${escHtml(group.label)} (${group.items.length})</div>
      <div class="photo-grid">${group.items.map(photo => `
        <figure class="report-photo">
          <img src="${escHtml(photo.thumbnailUrl || photo.url || '')}" alt="${escHtml(photo.caption || photo.filename || group.label)}" />
          <figcaption>${escHtml(photo.caption || photo.filename || '')}</figcaption>
        </figure>`).join('')}</div>
    </div>`).join('')

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
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(report.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: letter; margin: 0.35in; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #15251b;
      background: #f6f7f1;
      padding: ${options.showToolbar ? '86px 40px 36px' : '32px 40px'};
      max-width: 900px;
      margin: 0 auto;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .pdf-toolbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 12px 22px;
      background: #10351f;
      color: #fbf8ef;
      box-shadow: 0 10px 24px rgba(0,0,0,0.18);
    }
    .pdf-toolbar strong { display: block; font-size: 13px; }
    .pdf-toolbar span { display: block; color: #cfe3cf; font-size: 11px; margin-top: 2px; }
    .pdf-toolbar button {
      border: 1px solid #b99a43;
      border-radius: 6px;
      background: #23763b;
      color: #fff;
      font-weight: 700;
      padding: 8px 12px;
      cursor: pointer;
    }
    .report-header {
      margin-bottom: 24px;
      border-bottom: 7px solid #cfae5b;
      border-radius: 12px 12px 0 0;
      padding: 26px 30px 22px;
      background: #123b22;
      color: #fbf8ef;
    }
    .report-title    { font-size: 24px; font-weight: 850; margin-bottom: 6px; line-height: 1.2; color: #fbf8ef; }
    .report-meta     { font-size: 11px; color: #d8e8d3; }
    .course-name     { font-size: 12px; font-weight: 850; color: #f2d27a; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.07em; }
    .section         { margin-bottom: 18px; padding: 16px; border: 1px solid #ccd9c5; border-radius: 8px; background: #fffef9; }
    .section-title   { font-size: 10px; font-weight: 700; text-transform: uppercase;
                       letter-spacing: 0.09em; color: #286b38; margin-bottom: 12px; }
    .field-grid      { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 20px; }
    .field-label     { font-size: 10px; color: #667764; text-transform: uppercase;
                       letter-spacing: 0.04em; margin-bottom: 2px; }
    .field-value     { font-size: 13px; font-weight: 750; color: #15251b; }
    table            { width: 100%; border-collapse: collapse; font-size: 12px; }
    th               { text-align: left; padding: 6px 8px; font-size: 10px; font-weight: 700;
                       text-transform: uppercase; letter-spacing: 0.05em; color: #38503b;
                       border-bottom: 1.5px solid #7fa786; background: #eef5ea; }
    td               { padding: 7px 8px; border-bottom: 1px solid #dfe8d8; color: #15251b; vertical-align: top; }
    tr:nth-child(even) td { background: #f6f8ef; }
    .text-body       { font-size: 13px; line-height: 1.6; color: #2d352f; }
    .att-list        { padding-left: 18px; }
    .att-list li     { margin-bottom: 4px; font-size: 12px; }
    .att-meta        { color: #888; font-size: 11px; }
    .photo-grid      { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .report-photo    { margin: 0; min-width: 0; break-inside: avoid; page-break-inside: avoid; }
    .report-photo img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover;
                        border: 1px solid #ccd9c5; border-radius: 6px; }
    .report-photo figcaption { margin-top: 5px; color: #435443; font-size: 10.5px; line-height: 1.35; }
    .report-subtitle { font-size: 11px; color: #d8e8d3; text-transform: uppercase;
                       letter-spacing: 0.06em; margin-top: 2px; }
    .report-meta-line { font-size: 11px; color: #d8e8d3; margin-top: 2px; }
    .summary-tiles   { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
                       gap: 8px; }
    .summary-section { border-color: #bdd1b7; background: #f1f6ed; }
    .summary-tile    { padding: 10px 12px; border: 1px solid #ccd9c5; border-left: 4px solid #23763b;
                       border-radius: 7px; background: #fffef9; }
    .summary-tile-value { font-size: 20px; font-weight: 850; color: #11361f; }
    .summary-tile-label { font-size: 10px; color: #637361; text-transform: uppercase;
                          letter-spacing: 0.04em; margin-top: 1px; }
    .notice-list     { list-style: none; padding-left: 0; }
    .notice          { padding: 5px 8px; margin-bottom: 4px; border-radius: 5px;
                       border: 1px solid #ded8c6; font-size: 12px; color: #1f261f; }
    .notice-warning  { background: #fff5df; border-color: #cf9f45; }
    .notice-caution  { background: #fff9e8; border-color: #c3a554; }
    .notice-info     { background: #f7fbf3; border-color: #ccd9c5; }
    .disclaimer-section { margin-top: 28px; padding-top: 14px; border-top: 1px solid #d6dfd2; }
    .disclaimer      { font-size: 11px; color: #3f473f; line-height: 1.55; }
    .report-footer   { margin-top: 32px; padding-top: 12px; border-top: 1px solid #d6dfd2;
                       font-size: 10px; color: #7a8577; display: flex;
                       justify-content: space-between; }
    /* Phase 7E (3/?) — print-friendly hardening.
       - white background everywhere (browsers strip backgrounds by default,
         but we restate it so the colored tile/notice rules survive
         "Print backgrounds: on")
       - cards never split across pages
       - fixed footer at the bottom of every printed page
       - hide any interactive button accidentally captured into the
         document (defensive — print window currently has none) */
    @media screen and (max-width: 700px) {
      body {
        width: 100%;
        max-width: none;
        padding: ${options.showToolbar ? '88px 12px 24px' : '14px 12px 24px'};
        font-size: 14px;
        background: #f6f7f1;
      }
      .pdf-toolbar {
        align-items: stretch;
        gap: 10px;
        padding: 10px 12px;
      }
      .pdf-toolbar div { min-width: 0; }
      .pdf-toolbar span { display: none; }
      .pdf-toolbar button {
        flex: 0 0 auto;
        min-height: 38px;
        padding: 8px 12px;
      }
      .report-header {
        margin-bottom: 14px;
        padding: 18px 16px 16px;
        border-bottom-width: 4px;
        border-radius: 8px 8px 0 0;
      }
      .report-title {
        font-size: 20px;
        line-height: 1.18;
        overflow-wrap: anywhere;
      }
      .course-name,
      .report-subtitle,
      .report-meta,
      .report-meta-line {
        overflow-wrap: anywhere;
      }
      .section {
        margin-bottom: 14px;
        padding: 12px;
        border-radius: 8px;
      }
      .summary-tiles {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .summary-tile { padding: 9px 10px; }
      .summary-tile-value {
        font-size: 18px;
        line-height: 1.1;
        overflow-wrap: anywhere;
      }
      .summary-tile-label {
        font-size: 9px;
        line-height: 1.2;
      }
      .field-grid {
        grid-template-columns: 1fr;
        gap: 9px;
      }
      table,
      thead,
      tbody,
      tr,
      th,
      td {
        display: block;
      }
      table {
        border-collapse: separate;
        border-spacing: 0;
        font-size: 13px;
      }
      thead {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
      }
      tr {
        margin-bottom: 10px;
        border: 1px solid #d6dfd2;
        border-radius: 8px;
        background: #fffdf8;
        overflow: hidden;
      }
      tr:nth-child(even) td { background: transparent; }
      td {
        display: grid;
        grid-template-columns: minmax(90px, 34%) minmax(0, 1fr);
        gap: 10px;
        min-height: 34px;
        padding: 8px 10px;
        border-bottom: 1px solid #e8eddf;
        overflow-wrap: anywhere;
        line-height: 1.35;
      }
      td::before {
        content: attr(data-label);
        color: #667764;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      tr td:last-child { border-bottom: none; }
      .text-body { font-size: 13px; }
      .report-footer {
        display: block;
        text-align: center;
        line-height: 1.5;
      }
      .report-footer span {
        display: block;
        overflow-wrap: anywhere;
      }
    }
    @media print {
      body            { padding: 0; background: #f6f7f1; color: #15251b; max-width: 900px; }
      .pdf-toolbar    { display: none !important; }
      .report-header  { margin-bottom: 10px; border-radius: 12px 12px 0 0; padding: 18px 22px 16px;
                        border-bottom-width: 5px; }
      .report-title   { font-size: 20px; }
      .report-meta,
      .report-meta-line,
      .report-subtitle { font-size: 9.5px; }
      .section        { margin-bottom: 9px; padding: 10px 12px; background: #fffef9; break-inside: auto; }
      .section-title  { font-size: 8.5px; margin-bottom: 7px; }
      .field-grid     { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px 14px; }
      .field-label    { font-size: 8.5px; }
      .field-value    { font-size: 11px; line-height: 1.22; }
      .summary-tiles  { grid-template-columns: repeat(auto-fit, minmax(105px, 1fr)); gap: 5px; }
      .summary-tile   { padding: 7px 8px; border-radius: 6px; }
      .summary-tile-value { font-size: 16px; line-height: 1.08; }
      .summary-tile-label { font-size: 8px; }
      table           { font-size: 10px; }
      th              { padding: 4px 5px; font-size: 8px; }
      td              { padding: 4px 5px; line-height: 1.24; }
      .text-body      { font-size: 10.5px; line-height: 1.42; }
      .photo-grid     { gap: 8px; }
      .report-photo figcaption { font-size: 9px; }
      .notice         { padding: 4px 6px; margin-bottom: 3px; font-size: 10px; }
      .disclaimer-section { margin-top: 10px; padding-top: 8px; }
      .disclaimer     { font-size: 9px; line-height: 1.35; }
      .summary-tile,
      .notice,
      .disclaimer-section { break-inside: avoid; page-break-inside: avoid; }
      .summary-tile   { background: #fffef9; }
      .notice         { background: #fffef9; }
      table tr        { break-inside: avoid; page-break-inside: avoid; }
      .report-footer  { position: static; margin-top: 12px; padding-top: 7px;
                        background: transparent; color: #637361; font-size: 8.5px; }
      button, .rpActions { display: none !important; }
    }
  </style>
</head>
<body>
  ${toolbarHtml}
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
  ${photoAttachmentsHtml || attachmentsHtml}
  <div class="report-footer">
    <span>${escHtml(footerLeft)}</span>
    <span>${escHtml(footerRight)}</span>
  </div>
  <script>
    document.querySelectorAll('table').forEach(table => {
      const labels = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim())
      table.querySelectorAll('tbody tr').forEach(row => {
        Array.from(row.children).forEach((cell, index) => {
          if (!cell.getAttribute('data-label')) cell.setAttribute('data-label', labels[index] || '')
        })
      })
    })
  </script>
</body>
</html>`
}
